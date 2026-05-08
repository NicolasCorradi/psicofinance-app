# Motor financiero de PsicoFinance.
# Contiene TODAS las fórmulas económicas de la aplicación.
# Este archivo no tiene dependencias de HTTP ni de base de datos: es lógica pura.
# IMPORTANTE: Toda modificación a las fórmulas debe ser validada por el PM (Economista).
#
# DECISIÓN DE PRECISIÓN (auditada Sprint 1):
# Usamos Decimal internamente para evitar errores de representación IEEE 754 en
# cálculos de dinero (ej: 0.03 no es exacto en float). Los inputs/outputs siguen
# siendo float para compatibilidad con JSON y Pydantic, pero la aritmética es exacta.

from dataclasses import dataclass
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from dateutil.relativedelta import relativedelta


# Constante de redondeo: dos decimales (centavos)
CENTAVO = Decimal("0.01")


# ---------------------------------------------------------------------------
# Tipos de retorno
# ---------------------------------------------------------------------------

@dataclass
class ResultadoInflacion:
    """Resultado del cálculo de pérdida por inflación sobre un monto diferido."""
    monto_original: float
    valor_real: float
    perdida_absoluta: float
    porcentaje_licuado: float
    meses_retraso: int
    tasa_mensual_aplicada: float


@dataclass
class ResultadoCajaDiferida:
    """Resumen agregado de la pérdida total en la Caja Diferida."""
    total_nominal: float
    total_real: float
    perdida_total_absoluta: float
    porcentaje_licuado_promedio: float
    detalle: list[ResultadoInflacion]


# ---------------------------------------------------------------------------
# Funciones auxiliares
# ---------------------------------------------------------------------------

def calcular_meses_retraso(fecha_turno: date, fecha_cobro_estimada: date) -> int:
    """
    Calcula la diferencia en meses enteros entre la fecha del turno
    y la fecha estimada de cobro.
    Devuelve 0 como mínimo: un retraso negativo no tiene sentido financiero.
    """
    diferencia = relativedelta(fecha_cobro_estimada, fecha_turno)
    meses = diferencia.years * 12 + diferencia.months
    return max(meses, 0)


# ---------------------------------------------------------------------------
# Fórmula principal: Descuento Compuesto por Inflación
# ---------------------------------------------------------------------------

def calcular_valor_real(
    monto: float,
    tasa_inflacion_mensual: float,
    meses_retraso: int,
) -> ResultadoInflacion:
    """
    Calcula el valor real de un monto cobrado con retraso, aplicando
    descuento compuesto por inflación.

    Fórmula (validada por el PM):
        Valor Real = Monto / (1 + tasa_inflacion_mensual) ^ meses_retraso

    Usa aritmética Decimal internamente para evitar errores de punto flotante
    en cálculos de dinero. Los resultados se devuelven como float redondeados
    a dos decimales (centavos) usando ROUND_HALF_UP.
    """
    if monto < 0:
        raise ValueError("El monto no puede ser negativo.")
    if tasa_inflacion_mensual < 0:
        raise ValueError("La tasa de inflación no puede ser negativa.")
    if meses_retraso < 0:
        raise ValueError("Los meses de retraso no pueden ser negativos.")

    # Convertir inputs a Decimal usando str() para preservar la representación
    # decimal exacta (Decimal(0.05) hereda el error IEEE 754; Decimal("0.05") no)
    m = Decimal(str(monto))
    t = Decimal(str(tasa_inflacion_mensual))

    # Sin retraso o monto cero: no hay licuación posible
    if meses_retraso == 0 or m == Decimal("0"):
        return ResultadoInflacion(
            monto_original=float(m),
            valor_real=float(m),
            perdida_absoluta=0.0,
            porcentaje_licuado=0.0,
            meses_retraso=meses_retraso,
            tasa_mensual_aplicada=tasa_inflacion_mensual,
        )

    # Fórmula de descuento compuesto con Decimal
    # meses_retraso es int, Decimal soporta potencia entera directamente
    divisor = (Decimal("1") + t) ** meses_retraso
    valor_real_d = m / divisor

    perdida_d = m - valor_real_d
    porcentaje_d = (perdida_d / m) * Decimal("100")

    # Redondear a centavos con ROUND_HALF_UP (comportamiento financiero estándar)
    vr = float(valor_real_d.quantize(CENTAVO, rounding=ROUND_HALF_UP))
    pa = float(perdida_d.quantize(CENTAVO, rounding=ROUND_HALF_UP))
    pl = float(porcentaje_d.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))

    return ResultadoInflacion(
        monto_original=float(m),
        valor_real=vr,
        perdida_absoluta=pa,
        porcentaje_licuado=pl,
        meses_retraso=meses_retraso,
        tasa_mensual_aplicada=tasa_inflacion_mensual,
    )


# ---------------------------------------------------------------------------
# Función de agregación: pérdida total de la Caja Diferida
# ---------------------------------------------------------------------------

def calcular_perdida_caja_diferida(
    turnos: list[dict],
    tasa_inflacion_mensual: float,
) -> ResultadoCajaDiferida:
    """
    Recibe una lista de turnos diferidos y calcula la pérdida total por inflación.

    Cada elemento de la lista debe tener:
        { "monto": float, "fecha_turno": date, "fecha_cobro_estimada": date }
    """
    if not turnos:
        return ResultadoCajaDiferida(
            total_nominal=0.0,
            total_real=0.0,
            perdida_total_absoluta=0.0,
            porcentaje_licuado_promedio=0.0,
            detalle=[],
        )

    detalle: list[ResultadoInflacion] = []
    for turno in turnos:
        meses = calcular_meses_retraso(
            turno["fecha_turno"],
            turno["fecha_cobro_estimada"],
        )
        resultado = calcular_valor_real(
            monto=turno["monto"],
            tasa_inflacion_mensual=tasa_inflacion_mensual,
            meses_retraso=meses,
        )
        detalle.append(resultado)

    # Sumar usando Decimal para evitar acumulación de error en listas largas
    total_nominal_d = sum(Decimal(str(r.monto_original)) for r in detalle)
    total_real_d    = sum(Decimal(str(r.valor_real))     for r in detalle)
    perdida_total_d = sum(Decimal(str(r.perdida_absoluta)) for r in detalle)

    if total_nominal_d > 0:
        porcentaje_d = (perdida_total_d / total_nominal_d) * Decimal("100")
    else:
        porcentaje_d = Decimal("0")

    return ResultadoCajaDiferida(
        total_nominal=float(total_nominal_d.quantize(CENTAVO, rounding=ROUND_HALF_UP)),
        total_real=float(total_real_d.quantize(CENTAVO, rounding=ROUND_HALF_UP)),
        perdida_total_absoluta=float(perdida_total_d.quantize(CENTAVO, rounding=ROUND_HALF_UP)),
        porcentaje_licuado_promedio=float(porcentaje_d.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)),
        detalle=detalle,
    )
