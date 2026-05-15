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


# ── Tabla de topes ARCA — Servicios ──────────────────────────────────────────
# Vigente desde febrero 2026. Fuente: ARCA (arca.gob.ar)
# Próxima actualización estimada: julio 2026.
# Solo aplica a PRESTADORES DE SERVICIOS (no incluye comercio/industria).
TOPES_SERVICIOS: dict[str, float] = {
    "A":  10_277_988,
    "B":  15_058_448,
    "C":  21_113_697,
    "D":  26_212_853,
    "E":  30_833_964,
    "F":  38_642_048,
    "G":  46_211_109,
    "H":  70_113_407,
    "I":  78_479_212,
    "J":  89_872_640,
    "K": 108_357_084,
}

VIGENCIA_TOPES = "Feb 2026 – Jul 2026"


def _tope_categoria(categoria: str) -> float:
    """Devuelve el tope anual de ingresos para la categoría dada.
    Primero intenta la tabla ARCA; si no está, usa el .env como override manual."""
    cat = categoria.strip().upper()
    if cat in TOPES_SERVICIOS:
        return TOPES_SERVICIOS[cat]
    # Fallback: valor manual del .env (para categorías no estándar o actualizaciones urgentes)
    return config.monotributo_tope_anual


def obtener_semaforo(sb: SupabaseClient) -> ResultadoSemaforo:
    hoy = date.today()

    facturado = sumar_facturado_ultimos_12_meses(sb, hasta=hoy)
    categoria = config.monotributo_categoria.strip().upper()
    tope = _tope_categoria(categoria)
    umbral_amarillo = config.monotributo_umbral_amarillo

    porcentaje = (facturado / tope * 100) if tope > 0 else 0.0
    margen = max(tope - facturado, 0.0)

    if facturado >= tope:
        estado = EstadoSemaforo.ROJO
        mensaje = (
            f"¡Atención! Superaste el tope de la categoría {categoria} "
            f"(${tope:,.0f}/año). Consultá con tu contador sobre la recategorización."
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
