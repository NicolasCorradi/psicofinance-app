# Servicio de la Doble Caja.
# Usa Supabase REST API via SupabaseClient (sin SQLAlchemy).

from datetime import date
from app.supabase_client import SupabaseClient
from app.crud.turno import listar_turnos, listar_turnos_diferidos
from app.services.finanzas import calcular_perdida_caja_diferida
from app.schemas.caja import ResumenCaja
from app.config import config


def obtener_resumen_caja(sb: SupabaseClient) -> ResumenCaja:
    hoy = date.today()

    # --- Caja Líquida ---
    turnos_cobrados = listar_turnos(sb, estado="COBRADO", limit=10000)
    caja_liquida = sum(float(t.get("monto") or 0) for t in turnos_cobrados)

    # --- Caja Diferida ---
    turnos_diferidos = listar_turnos_diferidos(sb)
    cantidad_diferidos = len(turnos_diferidos)

    turnos_para_calculo = []
    for turno in turnos_diferidos:
        fecha_turno_str = turno.get("fecha_turno")
        fecha_est_str = turno.get("fecha_cobro_estimada")
        if not fecha_turno_str:
            continue
        fecha_turno = date.fromisoformat(str(fecha_turno_str)[:10])
        fecha_cobro = (
            date.fromisoformat(str(fecha_est_str)[:10]) if fecha_est_str else hoy
        )
        turnos_para_calculo.append({
            "monto": float(turno.get("monto") or 0),
            "fecha_turno": fecha_turno,
            "fecha_cobro_estimada": fecha_cobro,
        })

    if turnos_para_calculo:
        resultado_diferida = calcular_perdida_caja_diferida(
            turnos=turnos_para_calculo,
            tasa_inflacion_mensual=config.inflacion_mensual,
        )
        caja_diferida_nominal = resultado_diferida.total_nominal
        caja_diferida_real = resultado_diferida.total_real
        perdida_total = resultado_diferida.perdida_total_absoluta
        porcentaje_licuado = resultado_diferida.porcentaje_licuado_promedio
    else:
        caja_diferida_nominal = 0.0
        caja_diferida_real = 0.0
        perdida_total = 0.0
        porcentaje_licuado = 0.0

    turnos_incobrables = listar_turnos(sb, estado="INCOBRABLE", limit=10000)

    return ResumenCaja(
        caja_liquida_total=round(caja_liquida, 2),
        caja_diferida_nominal=caja_diferida_nominal,
        caja_diferida_real=caja_diferida_real,
        perdida_estimada_total=perdida_total,
        porcentaje_licuado_promedio=porcentaje_licuado,
        cantidad_turnos_cobrados=len(turnos_cobrados),
        cantidad_turnos_diferidos=cantidad_diferidos,
        cantidad_turnos_incobrables=len(turnos_incobrables),
    )
