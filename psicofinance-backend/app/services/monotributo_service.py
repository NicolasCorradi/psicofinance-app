# Servicio del Semáforo Monotributo.
# Usa Supabase REST API via SupabaseClient (sin SQLAlchemy).

import enum
import json
import logging
from dataclasses import dataclass
from datetime import date
from app.supabase_client import SupabaseClient
from app.crud.turno import sumar_facturado_ultimos_12_meses
from app.config import config
from app.utils import hoy_argentina

logger = logging.getLogger(__name__)


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
    criterio: str = "DEVENGADO"
    vigencia: str = ""
    advertencia: str | None = None


# ── Tabla de topes ARCA — Servicios (fallback si no hay datos en BD) ─────────
# Vigente desde febrero 2026. Fuente: afip.gob.ar/monotributo/categorias.asp
# La escala actualizada se carga en Supabase (configuracion.monotributo_topes)
# sin necesidad de deploy — ver _topes_vigentes().
TOPES_SERVICIOS: dict[str, float] = {
    "A":  10_277_988.13,
    "B":  15_058_447.71,
    "C":  21_113_696.52,
    "D":  26_212_853.42,
    "E":  30_833_964.37,
    "F":  38_642_048.36,
    "G":  46_211_109.37,
    "H":  70_113_407.33,
    "I":  78_479_211.62,
    "J":  89_872_640.30,
    "K": 108_357_084.05,
}

CATEGORIAS_VALIDAS = list(TOPES_SERVICIOS.keys())
VIGENCIA_TOPES = "Feb 2026 – Jul 2026"
# Último día de vigencia de la escala hardcodeada de arriba
VIGENCIA_HASTA = date(2026, 7, 31)


def _topes_vigentes(sb: SupabaseClient) -> tuple[dict[str, float], str, date]:
    """Escala de topes con su vigencia: BD primero, fallback a la hardcodeada.

    En Supabase se guarda como configuracion.monotributo_topes con formato:
      {"vigencia": "Ago 2026 – Ene 2027", "vigencia_hasta": "2027-01-31",
       "topes": {"A": 12345.0, ...}}
    Así el PM actualiza la escala semestral de ARCA sin deploy.
    """
    try:
        rows = sb.select("configuracion", {"clave": "eq.monotributo_topes", "select": "valor"})
        if rows:
            data = json.loads(rows[0]["valor"])
            topes = {str(k).upper(): float(v) for k, v in data["topes"].items()}
            vigencia = str(data.get("vigencia", ""))
            hasta = date.fromisoformat(data["vigencia_hasta"])
            return topes, vigencia, hasta
    except Exception as exc:
        logger.warning("No se pudo leer monotributo_topes de BD, uso escala hardcodeada: %s", exc)
    return TOPES_SERVICIOS, VIGENCIA_TOPES, VIGENCIA_HASTA


def _tope_categoria(categoria: str, topes: dict[str, float]) -> float:
    cat = categoria.strip().upper()
    if cat in topes:
        return topes[cat]
    logger.warning("Categoría Monotributo '%s' fuera de escala — uso tope de config", cat)
    return config.monotributo_tope_anual


def _leer_categoria_bd(sb: SupabaseClient) -> str | None:
    """Lee la categoría guardada en la tabla `configuracion` de Supabase.
    Devuelve None si la tabla no existe o no tiene el registro."""
    try:
        rows = sb.select("configuracion", {"clave": "eq.monotributo_categoria", "select": "valor"})
        if rows:
            return rows[0]["valor"].strip().upper()
    except Exception:
        pass
    return None


def guardar_categoria_bd(sb: SupabaseClient, categoria: str) -> None:
    """Guarda o actualiza la categoría en la tabla `configuracion`."""
    cat = categoria.strip().upper()
    sb.upsert("configuracion", {"clave": "monotributo_categoria", "valor": cat}, on_conflict="clave")


def obtener_semaforo(sb: SupabaseClient) -> ResultadoSemaforo:
    hoy = hoy_argentina()
    criterio = config.monotributo_criterio.strip().upper()

    facturado = sumar_facturado_ultimos_12_meses(sb, hasta=hoy, criterio=criterio)

    # Prioridad: BD → .env
    categoria = _leer_categoria_bd(sb) or config.monotributo_categoria.strip().upper()
    topes, vigencia, vigencia_hasta = _topes_vigentes(sb)
    tope = _tope_categoria(categoria, topes)
    umbral_amarillo = config.monotributo_umbral_amarillo

    advertencia = None
    if hoy > vigencia_hasta:
        advertencia = (
            f"La escala de topes ({vigencia}) está vencida. "
            "Cargá la escala nueva de ARCA para que el semáforo sea confiable."
        )

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
        criterio=criterio,
        vigencia=vigencia,
        advertencia=advertencia,
    )
