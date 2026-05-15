# Servicio de inflación — IPC INDEC mensual real.
# Centraliza la lógica de fetch + cálculo acumulado para que
# tanto dashboard.py como pacientes.py usen los mismos datos.

import time
import logging
from datetime import date
from decimal import Decimal

import httpx
from dateutil.relativedelta import relativedelta
from app.config import config

logger = logging.getLogger(__name__)

_ipc_cache: dict = {}
_IPC_CACHE_TTL = 21600  # 6 horas


def fetch_ipc_indec() -> dict:
    """Trae los últimos 13 meses de IPC General (INDEC) desde datos.gob.ar.
    Construye un dict {YYYY-MM: tasa_decimal}. Cachea 6 horas."""
    ahora = time.time()
    if _ipc_cache.get("ts") and ahora - _ipc_cache["ts"] < _IPC_CACHE_TTL:
        return _ipc_cache

    try:
        url = (
            "https://apis.datos.gob.ar/series/api/series/"
            "?ids=103.1_I2N_2016_M_19&limit=14&sort=desc&format=json"
        )
        r = httpx.get(url, timeout=8)
        r.raise_for_status()
        data = r.json().get("data", [])

        tasas: dict[str, float] = {}
        if len(data) >= 2:
            for i in range(len(data) - 1):
                periodo_iso = data[i][0]
                idx_nuevo   = float(data[i][1])
                idx_ant     = float(data[i + 1][1])
                variacion   = (idx_nuevo - idx_ant) / idx_ant
                mes_key     = periodo_iso[:7]
                tasas[mes_key] = variacion
                logger.debug("IPC %s: %.4f%%", mes_key, variacion * 100)

            ultimo_periodo = data[0][0][:7]
            ultimo_valor   = tasas[ultimo_periodo] * 100
            _ipc_cache.update({
                "tasas":            tasas,
                "ultimo_periodo":   ultimo_periodo,
                "ultimo_valor_pct": round(ultimo_valor, 2),
                "ts":               ahora,
            })
            logger.info("IPC INDEC: %d meses. Último: %s → %.2f%%",
                        len(tasas), ultimo_periodo, ultimo_valor)
    except Exception as exc:
        logger.warning("No se pudo obtener IPC de INDEC: %s", exc)
        if not _ipc_cache.get("tasas"):
            tasa_fb = config.inflacion_mensual
            tasas_fb: dict[str, float] = {}
            hoy = date.today()
            for i in range(13):
                mes = (hoy - relativedelta(months=i)).strftime("%Y-%m")
                tasas_fb[mes] = tasa_fb
            _ipc_cache.update({
                "tasas":            tasas_fb,
                "ultimo_periodo":   "config",
                "ultimo_valor_pct": round(tasa_fb * 100, 2),
                "ts":               ahora,
            })

    return _ipc_cache


def inflacion_acumulada(desde: date, hasta: date, tasas: dict[str, float]) -> float:
    """Compone tasas mensuales reales de `desde` a `hasta`.
    Devuelve la tasa acumulada decimal (ej: 0.38 = 38% acumulado)."""
    if not tasas:
        return config.inflacion_mensual

    tasa_fb = tasas.get(sorted(tasas.keys())[-1], config.inflacion_mensual)

    factor = Decimal("1")
    cursor = desde.replace(day=1)
    fin    = hasta.replace(day=1)
    while cursor < fin:
        mes_key = cursor.strftime("%Y-%m")
        t = Decimal(str(tasas.get(mes_key, tasa_fb)))
        factor *= (Decimal("1") + t)
        cursor = cursor + relativedelta(months=1)

    return max(float(factor - Decimal("1")), 0.0)
