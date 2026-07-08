# Router de Inflación.
# Expone el motor de cálculo de licuación por inflación.
# Permite calcular el valor real de cualquier monto con demora,
# usando la tasa del .env o una tasa personalizada para simulaciones.

from fastapi import APIRouter
from app.schemas.inflacion import InflacionRequest, InflacionResponse
from app.services.finanzas import calcular_valor_real
from app.config import config

router = APIRouter(prefix="/inflacion", tags=["Motor de Inflación"])


@router.post("/calcular", response_model=InflacionResponse)
def calcular_licuacion(datos: InflacionRequest):
    """
    Calcula la pérdida de poder adquisitivo de un monto cobrado con retraso.

    Si no se envía tasa_inflacion_mensual en el body, se usa la del .env.
    Esto permite al psicólogo simular distintos escenarios inflacionarios.
    """
    # "is not None" y no "or": una tasa de 0 (simular inflación nula) es válida
    tasa = (
        datos.tasa_inflacion_mensual
        if datos.tasa_inflacion_mensual is not None
        else config.inflacion_mensual
    )

    resultado = calcular_valor_real(
        monto=datos.monto,
        tasa_inflacion_mensual=tasa,
        meses_retraso=datos.meses_retraso,
    )

    return InflacionResponse(
        monto_original=resultado.monto_original,
        valor_real=resultado.valor_real,
        perdida_absoluta=resultado.perdida_absoluta,
        porcentaje_licuado=resultado.porcentaje_licuado,
        meses_retraso=resultado.meses_retraso,
        tasa_mensual_aplicada=resultado.tasa_mensual_aplicada,
    )
