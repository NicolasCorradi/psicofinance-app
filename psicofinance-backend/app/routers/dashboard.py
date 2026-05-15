# Router del Dashboard.
# Usa Supabase REST API via SupabaseClient (sin SQLAlchemy).

import logging
import time
from datetime import date
from decimal import Decimal
from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Depends
import httpx

from app.supabase_client import SupabaseClient, get_supabase
from app.services.finanzas import calcular_valor_real
from app.services.dolar_service import get_dolar_blue
from app.services.inflacion_service import fetch_ipc_indec, inflacion_acumulada as _inflacion_acumulada_svc
from app.config import config

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

# ── INDEC IPC — histórico mensual ─────────────────────────────────────────────
#
# Estructura del caché:
#   {
#     "tasas": { "2026-03": 0.037, "2026-02": 0.024, ... },   # decimal (no %)
#     "ultimo_periodo": "2026-03",
#     "ultimo_valor_pct": 3.7,                                 # % para mostrar en UI
#     "ts": 1234567890.0
#   }
#
# Guardamos los últimos 13 meses para poder componer la inflación acumulada
# desde cualquier fecha dentro del último año.

def _fetch_ipc_indec() -> dict:
    """Delegado al servicio compartido."""
    return fetch_ipc_indec()


def _inflacion_acumulada(desde: date, hasta: date, tasas: dict[str, float]) -> float:
    """Delegado al servicio compartido."""
    return _inflacion_acumulada_svc(desde, hasta, tasas)

MESES_ES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"]


def _parse_date(val):
    if val is None:
        return None
    if isinstance(val, date):
        return val
    return date.fromisoformat(str(val)[:10])


def _monto_ars(t: dict) -> float:
    """Convierte monto del turno a ARS usando el tipo_cambio guardado."""
    monto = float(t.get("monto") or 0)
    if t.get("moneda") == "USD":
        tc = float(t.get("tipo_cambio") or 1)
        return monto * tc
    return monto


@router.get("/metricas", response_model=dict)
def get_metricas(sb: SupabaseClient = Depends(get_supabase)):
    hoy = date.today()
    primer_dia_mes = hoy.replace(day=1)
    primer_dia_mes_sig = (hoy + relativedelta(months=1)).replace(day=1)

    # Traer todos los turnos de una sola llamada
    turnos = sb.select("turnos", {
        "select": "id,paciente_id,fecha_turno,monto,estado,origen_pago,prepaga,fecha_cobro_estimada,fecha_cobro_efectivo,medio_pago,tipo_sesion,moneda,tipo_cambio",
    })

    # Traer pacientes para join en Python
    pacientes_raw = sb.select("pacientes", {"select": "id,nombre,apellido"})
    pac_map = {p["id"]: p for p in pacientes_raw}

    cobrado_mes = 0.0
    en_camino_mes = 0.0
    deudores = 0.0
    total_turnos_mes = 0
    honorario_sum = 0.0
    honorario_count = 0
    turnos_diferidos = []
    ultimos_turnos_raw = []

    for t in turnos:
        estado = t.get("estado", "")
        monto = _monto_ars(t)  # siempre en ARS (convierte USD si aplica)
        fecha_turno = _parse_date(t.get("fecha_turno"))
        fecha_cobro_ef = _parse_date(t.get("fecha_cobro_efectivo"))

        if estado == "COBRADO":
            if fecha_cobro_ef and primer_dia_mes <= fecha_cobro_ef < primer_dia_mes_sig:
                cobrado_mes += monto
            if fecha_turno and fecha_turno >= primer_dia_mes:
                honorario_sum += monto
                honorario_count += 1

        if estado == "DIFERIDO":
            # "En camino": sesión de este mes, todavía puede pagar
            # "Sin cobrar": sesión de meses anteriores, vencida
            if fecha_turno:
                if primer_dia_mes <= fecha_turno < primer_dia_mes_sig:
                    en_camino_mes += monto
                elif fecha_turno < primer_dia_mes:
                    deudores += monto
            turnos_diferidos.append(t)

        # Sesiones del mes (excluye INCOBRABLE — no fue sesión real)
        if estado != "INCOBRABLE" and fecha_turno and primer_dia_mes <= fecha_turno < primer_dia_mes_sig:
            total_turnos_mes += 1

        ultimos_turnos_raw.append(t)

    honorario_promedio = (honorario_sum / honorario_count) if honorario_count > 0 else 0.0

    # Pérdida por inflación en turnos DIFERIDO pendientes
    # Usamos las tasas reales de cada mes (no una tasa fija para todos).
    perdida_inflacion_total = 0.0
    ipc = _fetch_ipc_indec()
    tasas_hist = ipc.get("tasas", {})
    for turno in turnos_diferidos:
        ft = _parse_date(turno.get("fecha_turno"))
        if not ft:
            continue
        if ft >= hoy:
            continue
        # Acumular la inflación real mes a mes desde la fecha del turno hasta hoy
        tasa_acum = _inflacion_acumulada(ft, hoy, tasas_hist)
        if tasa_acum <= 0:
            continue
        monto = _monto_ars(turno)
        # pérdida = monto - monto / (1 + tasa_acumulada)
        valor_real = monto / (1 + tasa_acum)
        perdida_inflacion_total += monto - valor_real

    sesiones_perdidas = (
        round(perdida_inflacion_total / honorario_promedio)
        if honorario_promedio > 0
        else 0
    )

    # Últimos 20 turnos ordenados por fecha
    ultimos_turnos_raw.sort(key=lambda t: t.get("fecha_turno") or "", reverse=True)
    ultimos_turnos = []
    for t in ultimos_turnos_raw[:20]:
        pac = pac_map.get(t.get("paciente_id"), {})
        nombre = f"{pac.get('nombre','')} {pac.get('apellido','')}".strip() or "Sin nombre"
        ft = _parse_date(t.get("fecha_turno"))
        fe = _parse_date(t.get("fecha_cobro_efectivo"))
        fest = _parse_date(t.get("fecha_cobro_estimada"))
        ultimos_turnos.append({
            "id": str(t["id"]),
            "paciente_nombre": nombre,
            "fecha_turno": ft.isoformat() if ft else None,
            "monto": float(t.get("monto") or 0),
            "estado": t.get("estado"),
            "origen_pago": t.get("origen_pago"),
            "prepaga": t.get("prepaga"),
            "fecha_cobro_estimada": fest.isoformat() if fest else None,
            "fecha_cobro_efectivo": fe.isoformat() if fe else None,
            "medio_pago": t.get("medio_pago"),
            "tipo_sesion": t.get("tipo_sesion") or "SESION",
            "moneda": t.get("moneda") or "ARS",
            "tipo_cambio": float(t.get("tipo_cambio") or 0) or None,
        })

    # Ventas de los últimos 6 meses
    ventas_mensuales = []
    for i in range(5, -1, -1):
        inicio_mes = (hoy - relativedelta(months=i)).replace(day=1)
        fin_mes = inicio_mes + relativedelta(months=1)
        cobrado_i = sum(
            _monto_ars(t) for t in turnos
            if t.get("estado") == "COBRADO"
            and _parse_date(t.get("fecha_cobro_efectivo")) is not None
            and inicio_mes <= _parse_date(t["fecha_cobro_efectivo"]) < fin_mes
        )
        ventas_mensuales.append({
            "mes": MESES_ES[inicio_mes.month - 1],
            "cobrado": float(cobrado_i),
        })

    return {
        "cobrado_mes":                   round(cobrado_mes, 2),
        "en_camino_mes":                 round(en_camino_mes, 2),
        "deudores":                      round(deudores, 2),
        "total_turnos_mes":              int(total_turnos_mes),
        "perdida_inflacion":             round(perdida_inflacion_total, 2),
        "sesiones_perdidas_equivalente": int(sesiones_perdidas),
        "honorario_promedio":            round(honorario_promedio, 2),
        "ultimos_turnos":                ultimos_turnos,
        "ventas_mensuales":              ventas_mensuales,
    }


@router.get("/turnos-cobrado-mes", response_model=list[dict])
def get_turnos_cobrado_mes(sb: SupabaseClient = Depends(get_supabase)):
    """Turnos COBRADO con fecha_cobro_efectivo en el mes actual.
    Usado por el sheet de desglose del dashboard."""
    hoy = date.today()
    primer_dia = hoy.replace(day=1)
    primer_sig  = (hoy + relativedelta(months=1)).replace(day=1)

    turnos = sb.select("turnos", {
        "estado":                "eq.COBRADO",
        "fecha_cobro_efectivo":  f"gte.{primer_dia.isoformat()}",
        "order":                 "fecha_cobro_efectivo.desc",
        "limit":                 "200",
    })

    # Filtrar también el límite superior en Python (PostgREST no acepta dos filtros del mismo campo)
    turnos = [
        t for t in turnos
        if _parse_date(t.get("fecha_cobro_efectivo")) is not None
        and _parse_date(t["fecha_cobro_efectivo"]) < primer_sig
    ]

    # Traer nombres de pacientes
    pac_ids = list({t["paciente_id"] for t in turnos})
    pac_map = {}
    if pac_ids:
        pacs = sb.select("pacientes", {"select": "id,nombre,apellido"})
        pac_map = {p["id"]: p for p in pacs}

    result = []
    for t in turnos:
        pac = pac_map.get(t.get("paciente_id"), {})
        ft  = _parse_date(t.get("fecha_turno"))
        fe  = _parse_date(t.get("fecha_cobro_efectivo"))
        fest = _parse_date(t.get("fecha_cobro_estimada"))
        result.append({
            "id":                   str(t["id"]),
            "paciente_id":          str(t.get("paciente_id", "")),
            "paciente_nombre":      f"{pac.get('nombre','')} {pac.get('apellido','')}".strip(),
            "fecha_turno":          ft.isoformat() if ft else None,
            "monto":                float(t.get("monto") or 0),
            "estado":               t.get("estado"),
            "origen_pago":          t.get("origen_pago"),
            "prepaga":              t.get("prepaga"),
            "fecha_cobro_estimada": fest.isoformat() if fest else None,
            "fecha_cobro_efectivo": fe.isoformat() if fe else None,
            "moneda":               t.get("moneda") or "ARS",
            "tipo_cambio":          float(t.get("tipo_cambio") or 0) or None,
        })

    return result


@router.get("/turnos-diferidos", response_model=list[dict])
def get_turnos_diferidos(sb: SupabaseClient = Depends(get_supabase)):
    """Turnos DIFERIDO con join de nombre de paciente. Usado por el sheet de desglose."""
    turnos = sb.select("turnos", {
        "estado": "eq.DIFERIDO",
        "order":  "fecha_turno.desc",
        "limit":  "200",
    })
    pacs = sb.select("pacientes", {"select": "id,nombre,apellido"})
    pac_map = {p["id"]: p for p in pacs}
    result = []
    for t in turnos:
        pac  = pac_map.get(t.get("paciente_id"), {})
        ft   = _parse_date(t.get("fecha_turno"))
        fe   = _parse_date(t.get("fecha_cobro_efectivo"))
        fest = _parse_date(t.get("fecha_cobro_estimada"))
        result.append({
            "id":                   str(t["id"]),
            "paciente_id":          str(t.get("paciente_id", "")),
            "paciente_nombre":      f"{pac.get('nombre','')} {pac.get('apellido','')}".strip(),
            "fecha_turno":          ft.isoformat() if ft else None,
            "monto":                float(t.get("monto") or 0),
            "estado":               t.get("estado"),
            "origen_pago":          t.get("origen_pago"),
            "prepaga":              t.get("prepaga"),
            "fecha_cobro_estimada": fest.isoformat() if fest else None,
            "fecha_cobro_efectivo": fe.isoformat() if fe else None,
            "moneda":               t.get("moneda") or "ARS",
            "tipo_cambio":          float(t.get("tipo_cambio") or 0) or None,
        })
    return result


@router.get("/dolar", response_model=dict)
def get_dolar():
    """Tipo de cambio dólar blue actual — fuente dolarapi.com. Cachea 30 min."""
    valor = get_dolar_blue()
    return {"valor": round(valor, 2), "fuente": "dolarapi.com · Blue"}


@router.get("/inflacion", response_model=dict)
def get_inflacion():
    """Último dato de inflación mensual IPC General — fuente INDEC via datos.gob.ar.
    Cachea 6 horas. Devuelve { valor: float (%), periodo: str 'YYYY-MM', fuente: str }."""
    ipc = _fetch_ipc_indec()
    periodo = ipc.get("ultimo_periodo", "—")
    return {
        "valor":   round(ipc.get("ultimo_valor_pct", config.inflacion_mensual * 100), 2),
        "periodo": periodo,
        "fuente":  "INDEC — IPC Nacional Nivel General" if periodo != "config" else "Valor de configuración",
    }
