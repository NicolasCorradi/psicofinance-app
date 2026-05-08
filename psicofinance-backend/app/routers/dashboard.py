# Router del Dashboard.
# Provee métricas agregadas de cash flow para la pantalla principal del frontend.
# Devuelve en una sola llamada: cobrado, en camino, deudores, inflación y últimos turnos.

import logging
from datetime import date
from dateutil.relativedelta import relativedelta
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func as sa_func
from fastapi import APIRouter, Depends

from app.database import get_db
from app.models.turno import Turno, EstadoTurno
from app.models.paciente import Paciente
from app.services.finanzas import calcular_valor_real
from app.config import config

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/metricas", response_model=dict)
def get_metricas(db: Session = Depends(get_db)):
    """
    Devuelve las métricas de cash flow para el dashboard principal.

    Incluye:
    - cobrado_mes: suma de turnos COBRADO cuya fecha efectiva es este mes
    - en_camino_mes: suma de DIFERIDO con fecha estimada de cobro en este mes
    - deudores: suma de DIFERIDO con fecha estimada vencida (antes de este mes)
    - total_turnos_mes: cantidad de turnos con fecha_turno este mes
    - perdida_inflacion: pérdida acumulada por inflación en los DIFERIDO pendientes
    - sesiones_perdidas_equivalente: perdida_inflacion / honorario_promedio
    - honorario_promedio: monto promedio de sesiones cobradas este mes
    - ultimos_turnos: lista de los últimos 20 turnos con nombre de paciente
    """
    hoy = date.today()
    primer_dia_mes = hoy.replace(day=1)

    # Primer día del mes siguiente (para el límite superior del rango)
    primer_dia_mes_sig = (hoy + relativedelta(months=1)).replace(day=1)

    # ── Cobrado este mes ──────────────────────────────────────────────────
    cobrado_mes = (
        db.query(sa_func.coalesce(sa_func.sum(Turno.monto), 0))
        .filter(
            Turno.estado == EstadoTurno.COBRADO,
            Turno.fecha_cobro_efectivo >= primer_dia_mes,
            Turno.fecha_cobro_efectivo < primer_dia_mes_sig,
        )
        .scalar()
    )

    # ── En camino: diferido con fecha estimada en este mes ───────────────
    en_camino_mes = (
        db.query(sa_func.coalesce(sa_func.sum(Turno.monto), 0))
        .filter(
            Turno.estado == EstadoTurno.DIFERIDO,
            Turno.fecha_cobro_estimada >= primer_dia_mes,
            Turno.fecha_cobro_estimada < primer_dia_mes_sig,
        )
        .scalar()
    )

    # ── Deudores: diferido con fecha estimada vencida ────────────────────
    deudores = (
        db.query(sa_func.coalesce(sa_func.sum(Turno.monto), 0))
        .filter(
            Turno.estado == EstadoTurno.DIFERIDO,
            Turno.fecha_cobro_estimada < primer_dia_mes,
        )
        .scalar()
    )

    # ── Total sesiones este mes ───────────────────────────────────────────
    total_turnos_mes = (
        db.query(sa_func.count(Turno.id))
        .filter(
            Turno.fecha_turno >= primer_dia_mes,
            Turno.fecha_turno < primer_dia_mes_sig,
        )
        .scalar()
        or 0
    )

    # ── Honorario promedio (base para el cálculo de sesiones perdidas) ───
    honorario_promedio = (
        db.query(sa_func.coalesce(sa_func.avg(Turno.monto), 0))
        .filter(
            Turno.estado == EstadoTurno.COBRADO,
            Turno.fecha_turno >= primer_dia_mes,
        )
        .scalar()
    )
    honorario_promedio = float(honorario_promedio or 0.0)

    # ── Pérdida por inflación en turnos DIFERIDO pendientes ──────────────
    # Para cada turno diferido sin cobrar, calculamos cuánto valor real
    # perdió desde la fecha del turno hasta hoy.
    turnos_diferidos = (
        db.query(Turno)
        .filter(Turno.estado == EstadoTurno.DIFERIDO)
        .all()
    )

    perdida_inflacion_total = 0.0
    tasa = config.inflacion_mensual

    for turno in turnos_diferidos:
        # Meses transcurridos desde la sesión hasta hoy
        delta = relativedelta(hoy, turno.fecha_turno)
        meses_retraso = delta.years * 12 + delta.months
        if meses_retraso <= 0:
            continue
        resultado = calcular_valor_real(
            monto=float(turno.monto),
            tasa_inflacion_mensual=tasa,
            meses_retraso=meses_retraso,
        )
        perdida_inflacion_total += resultado.perdida_absoluta

    # Sesiones equivalentes perdidas por inflación
    sesiones_perdidas = (
        round(perdida_inflacion_total / honorario_promedio)
        if honorario_promedio > 0
        else 0
    )

    # ── Últimos 20 turnos con nombre de paciente (JOIN) ──────────────────
    ultimos_turnos_raw = (
        db.query(Turno)
        .options(joinedload(Turno.paciente))
        .order_by(Turno.fecha_turno.desc())
        .limit(20)
        .all()
    )

    ultimos_turnos = [
        {
            "id": str(t.id),
            "paciente_nombre": f"{t.paciente.nombre} {t.paciente.apellido}".strip()
            if t.paciente
            else "Sin nombre",
            "fecha_turno": t.fecha_turno.isoformat(),
            "monto": float(t.monto),
            "estado": t.estado.value,
            "origen_pago": t.origen_pago.value,
            "prepaga": t.prepaga,
            "fecha_cobro_estimada": t.fecha_cobro_estimada.isoformat()
            if t.fecha_cobro_estimada
            else None,
            "fecha_cobro_efectivo": t.fecha_cobro_efectivo.isoformat()
            if t.fecha_cobro_efectivo
            else None,
        }
        for t in ultimos_turnos_raw
    ]

    # ── Ventas de los últimos 6 meses (para el gráfico de barras) ───────
    ventas_mensuales = []
    for i in range(5, -1, -1):
        inicio_mes = (hoy - relativedelta(months=i)).replace(day=1)
        fin_mes    = inicio_mes + relativedelta(months=1)
        cobrado_i  = (
            db.query(sa_func.coalesce(sa_func.sum(Turno.monto), 0))
            .filter(
                Turno.estado == EstadoTurno.COBRADO,
                Turno.fecha_cobro_efectivo >= inicio_mes,
                Turno.fecha_cobro_efectivo <  fin_mes,
            )
            .scalar()
        )
        # Nombre del mes en español abreviado (ene, feb, …)
        MESES_ES = ["Ene","Feb","Mar","Abr","May","Jun",
                    "Jul","Ago","Sep","Oct","Nov","Dic"]
        ventas_mensuales.append({
            "mes":     MESES_ES[inicio_mes.month - 1],
            "cobrado": float(cobrado_i),
        })

    return {
        "cobrado_mes":                  float(cobrado_mes),
        "en_camino_mes":                float(en_camino_mes),
        "deudores":                     float(deudores),
        "total_turnos_mes":             int(total_turnos_mes),
        "perdida_inflacion":            round(perdida_inflacion_total, 2),
        "sesiones_perdidas_equivalente":int(sesiones_perdidas),
        "honorario_promedio":           round(honorario_promedio, 2),
        "ultimos_turnos":               ultimos_turnos,
        "ventas_mensuales":             ventas_mensuales,
    }
