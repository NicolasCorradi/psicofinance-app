# Servicio del Semáforo Monotributo.
# Calcula la facturación de los últimos 12 meses rodantes y la compara
# contra el tope de la categoría actual del psicólogo (definido en .env).
# NO contiene topes hardcodeados: el PM los configura en el archivo .env.

import enum
from dataclasses import dataclass
from datetime import date
from sqlalchemy.orm import Session
from app.crud.turno import sumar_facturado_ultimos_12_meses
from app.config import config


class EstadoSemaforo(str, enum.Enum):
    """Estado visual del semáforo para el frontend."""
    VERDE = "VERDE"       # Por debajo del umbral de alerta
    AMARILLO = "AMARILLO" # Superó el umbral_amarillo del tope (ej: 80%)
    ROJO = "ROJO"         # Superó el tope: riesgo inminente de recategorización


@dataclass
class ResultadoSemaforo:
    """Resultado completo del análisis de Monotributo."""
    categoria_actual: str        # Letra de la categoría (ej: "D")
    facturado_12m: float         # Suma de facturación en los últimos 12 meses
    tope_anual: float            # Tope de la categoría actual
    porcentaje_consumido: float  # % del tope ya utilizado
    margen_disponible: float     # Cuánto le queda antes de superar el tope (en pesos)
    estado: EstadoSemaforo       # VERDE / AMARILLO / ROJO
    mensaje: str                 # Mensaje explicativo para mostrar al usuario


def obtener_semaforo(db: Session) -> ResultadoSemaforo:
    """
    Calcula el estado del Semáforo Monotributo para la fecha actual.
    Lee los parámetros de configuración del .env (via config).
    """
    hoy = date.today()

    facturado = sumar_facturado_ultimos_12_meses(db, hasta=hoy)
    tope = config.monotributo_tope_anual
    categoria = config.monotributo_categoria
    umbral_amarillo = config.monotributo_umbral_amarillo

    porcentaje = (facturado / tope * 100) if tope > 0 else 0.0
    margen = max(tope - facturado, 0.0)

    # Determinar estado del semáforo
    if facturado >= tope:
        estado = EstadoSemaforo.ROJO
        mensaje = (
            f"¡Atención! Superaste el tope de la categoría {categoria}. "
            f"Consultá con tu contador sobre la recategorización."
        )
    elif facturado >= tope * umbral_amarillo:
        estado = EstadoSemaforo.AMARILLO
        mensaje = (
            f"Estás al {porcentaje:.1f}% del tope de la categoría {categoria}. "
            f"Te quedan ${margen:,.0f} de margen. Empezá a revisar tu situación."
        )
    else:
        estado = EstadoSemaforo.VERDE
        mensaje = (
            f"Estás tranquilo/a. Llevas el {porcentaje:.1f}% del tope de "
            f"la categoría {categoria}. Margen disponible: ${margen:,.0f}."
        )

    return ResultadoSemaforo(
        categoria_actual=categoria,
        facturado_12m=round(facturado, 2),
        tope_anual=round(tope, 2),
        porcentaje_consumido=round(porcentaje, 2),
        margen_disponible=round(margen, 2),
        estado=estado,
        mensaje=mensaje,
    )
