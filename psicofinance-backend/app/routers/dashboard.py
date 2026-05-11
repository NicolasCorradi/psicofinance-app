# Router del Dashboard.
# Usa Supabase REST API via SupabaseClient (sin SQLAlchemy).

import logging
from datetime import date
from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Depends

from app.supabase_client import SupabaseClient, get_supabase
from app.services.finanzas import calcular_valor_real
from app.config import config

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

# ── INDEC IPC ────────────────────────────────────────────────────────────────

_ipc_cache: dict = {}   # { "valor": float, "periodo": str, "ts": float }

def _fetch_ipc_indec() -> dict:
    """Trae la última variación mensual del IPC General desde datos.gob.ar.
    Cachea el resultado 6 horas para no saturar la API."""
    import time
    ahora = time.time()
    if _ipc_cache.get("ts") and ahora - _ipc_cache["ts"] < 21600:
        return _ipc_cache

    try:
        url = (
            "https://apis.datos.gob.ar/series/api/series/"
            "?ids=148.3_INIVELGEN_DICI_M_26&limit=2&sort=desc&format=json"
        )
        r = httpx.get(url, timeout=8)
        r.raise_for_status()
        data = r.json().get("data", [])
        if data:
            periodo, valor = data[0][0], data[0][1]   # e.g. ["2026-03-01", 3.7]
            _ipc_cache.update({"valor": float(valor), "periodo": periodo[:7], "ts": ahora})
    except Exception as exc:
        logger.warning("No se pudo obtener IPC de INDEC: %s", exc)
        # Fallback al valor del .env
        if not _ipc_cache.get("valor"):
            _ipc_cache.update({
                "valor": config.inflacion_mensual * 100,
                "periodo": "config",
                "ts": ahora,
            })

    return _ipc_cache

MESES_ES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"]


def _parse_date(val):
    if val is None:
        return None
    if isinstance(val, date):
        return val
    return date.fromisoformat(str(val)[:10])


@router.get("/metricas", response_model=dict)
def get_metricas(sb: SupabaseClient = Depends(get_supabase)):
    hoy = date.today()
    primer_dia_mes = hoy.replace(day=1)
    primer_dia_mes_sig = (hoy + relativedelta(months=1)).replace(day=1)

    # Traer todos los turnos de una sola llamada
    turnos = sb.select("turnos", {
        "select": "id,paciente_id,fecha_turno,monto,estado,origen_pago,prepaga,fecha_cobro_estimada,fecha_cobro_efectivo",
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
        monto = float(t.get("monto") or 0)
        fecha_turno = _parse_date(t.get("fecha_turno"))
        fecha_cobro_ef = _parse_date(t.get("fecha_cobro_efectivo"))
        fecha_cobro_est = _parse_date(t.get("fecha_cobro_estimada"))

        if estado == "COBRADO":
            if fecha_cobro_ef and primer_dia_mes <= fecha_cobro_ef < primer_dia_mes_sig:
                cobrado_mes += monto
            if fecha_turno and fecha_turno >= primer_dia_mes:
                honorario_sum += monto
                honorario_count += 1

        if estado == "DIFERIDO":
            if fecha_cobro_est:
                if primer_dia_mes <= fecha_cobro_est < primer_dia_mes_sig:
                    en_camino_mes += monto
                elif fecha_cobro_est < primer_dia_mes:
                    deudores += monto
            else:
                # Sin fecha estimada: si la sesión es de un mes anterior → deudor
                if fecha_turno and fecha_turno < primer_dia_mes:
                    deudores += monto
            turnos_diferidos.append(t)

        if fecha_turno and primer_dia_mes <= fecha_turno < primer_dia_mes_sig:
            total_turnos_mes += 1

        ultimos_turnos_raw.append(t)

    honorario_promedio = (honorario_sum / honorario_count) if honorario_count > 0 else 0.0

    # Pérdida por inflación en turnos DIFERIDO pendientes
    perdida_inflacion_total = 0.0
    ipc = _fetch_ipc_indec()
    tasa = ipc["valor"] / 100   # INDEC devuelve porcentaje, e.g. 3.7 → 0.037
    for turno in turnos_diferidos:
        ft = _parse_date(turno.get("fecha_turno"))
        if not ft:
            continue
        delta = relativedelta(hoy, ft)
        meses_retraso = delta.years * 12 + delta.months
        if meses_retraso <= 0:
            continue
        resultado = calcular_valor_real(
            monto=float(turno.get("monto") or 0),
            tasa_inflacion_mensual=tasa,
            meses_retraso=meses_retraso,
        )
        perdida_inflacion_total += resultado.perdida_absoluta

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
        })

    # Ventas de los últimos 6 meses
    ventas_mensuales = []
    for i in range(5, -1, -1):
        inicio_mes = (hoy - relativedelta(months=i)).replace(day=1)
        fin_mes = inicio_mes + relativedelta(months=1)
        cobrado_i = sum(
            float(t.get("monto") or 0) for t in turnos
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
        })

    return result


@router.get("/inflacion", response_model=dict)
def get_inflacion():
    """Último dato de inflación mensual IPC General — fuente INDEC via datos.gob.ar.
    Cachea 6 horas. Devuelve { valor: float (%), periodo: str 'YYYY-MM', fuente: str }."""
    ipc = _fetch_ipc_indec()
    return {
        "valor":   round(ipc.get("valor", config.inflacion_mensual * 100), 2),
        "periodo": ipc.get("periodo", "—"),
        "fuente":  "INDEC — IPC Nacional Nivel General" if ipc.get("periodo") != "config" else "Valor de configuración",
    }
