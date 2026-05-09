# Servicio del Semáforo Monotributo.
# Usa Supabase REST API via SupabaseClient (sin SQLAlchemy).

import enum
from dataclasses import dataclass
from datetime import date
from app.supabase_client import SupabaseClient
from app.crud.turno import sumar_facturado_ultimos_12_meses
from app.config import config


class EstadoSemaforo(str, enum.Enum):
    VERDE = "VERDE"
    AMARILLO = "AMARILLO"
    ROJO = "ROJO"


@dataclass
class ResultadoSemaforo:
    categoria_actual: str
    facturado_12m: float
    tope_anual: float
    porcentaje_consumido: float
    margen_disponible: float
    estado: EstadoSemaforo
    mensaje: str


def obtener_semaforo(sb: SupabaseClient) -> ResultadoSemaforo:
    hoy = date.today()

    facturado = sumar_facturado_ultimos_12_meses(sb, hasta=hoy)
    tope = config.monotributo_tope_anual
    categoria = config.monotributo_categoria
    umbral_amarillo = config.monotributo_umbral_amarillo

    porcentaje = (facturado / tope * 100) if tope > 0 else 0.0
    margen = max(tope - facturado, 0.0)

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
