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
_IPC_CACHE_TTL = 21600  # 6 horas para datos reales
_FALLBACK_TTL  = 300    # 5 minutos cuando falla — reintenta pronto

# IPC Nacional Nivel General base dic 2016 (serie oficial INDEC)
_IPC_SERIES_ID = "148.3_INIVELNAL_DICI_M_26"


def fetch_ipc_indec() -> dict:
    """Trae los últimos 13 meses de IPC Nacional (INDEC) desde datos.gob.ar.
    Si el mes actual aún no está publicado, lo completa con config.inflacion_mensual.
    Cachea 6 horas para datos reales, 5 minutos para fallback."""
    ahora = time.time()
    if _ipc_cache.get("ts") and ahora - _ipc_cache["ts"] < _IPC_CACHE_TTL:
        return _ipc_cache

    try:
        url = (
            "https://apis.datos.gob.ar/series/api/series/"
            f"?ids={_IPC_SERIES_ID}&limit=14&sort=desc&format=json"
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

            # INDEC publica el mes N alrededor del día 12-15 del mes N+1.
            # datos.gob.ar puede tardar unos días más en actualizar.
            # Si el mes anterior no está en la API, lo completamos con config
            # hasta que datos.gob.ar lo suba. El mes actual nunca existe.
            hoy = date.today()
            mes_anterior = (hoy - relativedelta(months=1)).strftime("%Y-%m")
            if mes_anterior not in tasas:
                tasas[mes_anterior] = config.inflacion_mensual
                ultimo_periodo = mes_anterior
                ultimo_valor   = config.inflacion_mensual * 100
                logger.info("IPC %s no publicado en API aún — usando config: %.2f%%",
                            mes_anterior, ultimo_valor)

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
            # TTL corto: reintenta en 5 min en vez de bloquear 6 horas
            _ipc_cache.update({
                "tasas":            tasas_fb,
                "ultimo_periodo":   "config",
                "ultimo_valor_pct": round(tasa_fb * 100, 2),
                "ts":               ahora - _IPC_CACHE_TTL + _FALLBACK_TTL,
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
