# Schemas Pydantic para el resumen de la Doble Caja.

from pydantic import BaseModel


class ResumenCaja(BaseModel):
    """Respuesta del GET /caja/resumen — panel principal del psicólogo."""
    # Dinero efectivamente en mano (turnos COBRADO con origen DIRECTO o liquidados)
    caja_liquida_total: float

    # Suma nominal de lo que le deben las prepagas (sin ajuste por inflación)
    caja_diferida_nominal: float

    # Valor real de la caja diferida ajustado por inflación
    caja_diferida_real: float

    # Cuánto poder adquisitivo está perdiendo mientras espera el cobro de prepagas
    perdida_estimada_total: float

    # % del total diferido que ya está licuado
    porcentaje_licuado_promedio: float

    # Cantidad de turnos en cada estado
    cantidad_turnos_cobrados: int
    cantidad_turnos_diferidos: int
    cantidad_turnos_incobrables: int
