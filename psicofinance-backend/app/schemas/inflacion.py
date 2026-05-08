# Schemas Pydantic para el endpoint de cálculo de inflación.

from pydantic import BaseModel, Field


class InflacionRequest(BaseModel):
    """Body del POST /inflacion/calcular."""
    monto: float = Field(gt=0, description="Monto nominal en pesos a analizar")
    meses_retraso: int = Field(ge=0, description="Meses entre el turno y el cobro efectivo")
    # Permite sobreescribir la tasa del .env para simulaciones (opcional)
    tasa_inflacion_mensual: float | None = Field(
        default=None,
        ge=0,
        description="Si no se envía, se usa la tasa configurada en el servidor (.env)",
    )


class InflacionResponse(BaseModel):
    """Respuesta del cálculo de licuación por inflación."""
    monto_original: float
    valor_real: float
    perdida_absoluta: float
    porcentaje_licuado: float
    meses_retraso: int
    tasa_mensual_aplicada: float
