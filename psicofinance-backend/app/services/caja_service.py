# Servicio de la Doble Caja.
# Orquesta la clasificación de turnos en Caja Líquida y Caja Diferida,
# y calcula la pérdida real por inflación sobre los montos pendientes.

from datetime import date
from sqlalchemy.orm import Session
from app.models.turno import EstadoTurno, OrigenPago
from app.crud.turno import listar_turnos, listar_turnos_diferidos
from app.services.finanzas import calcular_perdida_caja_diferida
from app.schemas.caja import ResumenCaja
from app.config import config


def obtener_resumen_caja(db: Session) -> ResumenCaja:
    """
    Calcula el resumen completo de la Doble Caja del psicólogo.

    Caja Líquida = suma de turnos en estado COBRADO.
    Caja Diferida = suma nominal de turnos en estado DIFERIDO +
                    cálculo de valor real ajustado por inflación.
    """
    hoy = date.today()

    # --- Caja Líquida ---
    turnos_cobrados = listar_turnos(db, estado=EstadoTurno.COBRADO)
    caja_liquida = sum(float(t.monto) for t in turnos_cobrados)

    # --- Caja Diferida ---
    turnos_diferidos = listar_turnos_diferidos(db)
    cantidad_diferidos = len(turnos_diferidos)

    # Construimos la lista que espera la función financiera
    turnos_para_calculo = []
    for turno in turnos_diferidos:
        # Si tiene fecha estimada de cobro la usamos; si no, asumimos hoy (sin retraso)
        fecha_cobro = turno.fecha_cobro_estimada or hoy
        turnos_para_calculo.append({
            "monto": float(turno.monto),
            "fecha_turno": turno.fecha_turno,
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

    turnos_incobrables = listar_turnos(db, estado=EstadoTurno.INCOBRABLE)

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
