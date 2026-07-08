# Servicio de tipo de cambio — dólar blue via dolarapi.com
# Cachea el resultado 30 minutos para no saturar la API.

import time
import logging
import httpx

from app.config import config

logger = logging.getLogger(__name__)

_cache: dict = {}   # { "valor": float, "ts": float }
_CACHE_TTL = 1800   # 30 minutos


def get_dolar_blue() -> float:
    """
    Devuelve el precio de venta del dólar blue (referencia).
    Cachea 30 minutos. En caso de error devuelve el último valor conocido
    o un fallback razonable.
    """
    ahora = time.time()
    if _cache.get("ts") and ahora - _cache["ts"] < _CACHE_TTL:
        return _cache["valor"]

    try:
        r = httpx.get(
            "https://dolarapi.com/v1/dolares/blue",
            timeout=6,
            headers={"User-Agent": "psicofinance-app/1.0"},
        )
        r.raise_for_status()
        data = r.json()
        # Usamos el precio de venta como referencia ("el dólar blue está a X")
        valor = float(data.get("venta") or data.get("compra") or config.dolar_fallback)
        _cache.update({"valor": valor, "ts": ahora})
        logger.info("Dólar blue actualizado: %.2f", valor)
        return valor
    except Exception as exc:
        logger.warning("No se pudo obtener tipo de cambio: %s", exc)
        # Último valor conocido, o el fallback de config (DOLAR_FALLBACK en .env)
        return _cache.get("valor", config.dolar_fallback)
