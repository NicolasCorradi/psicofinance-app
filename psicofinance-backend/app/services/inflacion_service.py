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
from app.utils import hoy_argentina

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
        # Un reintento con timeout tolerante: en el cold start de Render (tier
        # gratis) la primera salida a internet suele ser lenta y un timeout
        # corto mandaba todo al fallback ("N/D") sin necesidad.
        ultimo_error = None
        r = None
        for intento in range(2):
            try:
                r = httpx.get(url, timeout=15)
                r.raise_for_status()
                break
            except Exception as e:
                ultimo_error = e
                logger.warning("IPC intento %d falló: %s", intento + 1, e)
        if r is None:
            raise ultimo_error or RuntimeError("IPC: sin respuesta de datos.gob.ar")
        data = r.json().get("data", [])

        # Con menos de 2 puntos no se puede calcular variación: caer al fallback
        # en vez de devolver un caché posiblemente vacío
        if len(data) < 2:
            raise ValueError(f"API IPC devolvió {len(data)} puntos (se necesitan >= 2)")

        tasas: dict[str, float] = {}
        for i in range(len(data) - 1):
            periodo_iso = data[i][0]
            idx_nuevo   = float(data[i][1])
            idx_ant     = float(data[i + 1][1])
            variacion   = (idx_nuevo - idx_ant) / idx_ant
            mes_key     = periodo_iso[:7]
            tasas[mes_key] = variacion
            logger.debug("IPC %s: %.4f%%", mes_key, variacion * 100)

        # INDEC publica mes N alrededor del día 12-15 de mes N+1.
        # datos.gob.ar a veces etiqueta el dato con la fecha de publicación
        # (mes N+1) en vez del mes al que corresponde (mes N).
        # Regla: el mes actual y el futuro NUNCA pueden estar publicados.
        hoy = hoy_argentina()
        mes_actual   = hoy.strftime("%Y-%m")
        mes_anterior = (hoy - relativedelta(months=1)).strftime("%Y-%m")

        # Eliminar períodos >= mes actual (no pueden existir aún)
        for k in list(tasas.keys()):
            if k >= mes_actual:
                logger.info("IPC: descartando período futuro/actual %s de la API", k)
                del tasas[k]

        if not tasas:
            raise ValueError("Sin tasas válidas tras filtrar períodos futuros")

        # El dato que se MUESTRA es siempre el último realmente publicado por
        # INDEC. Mostrar "N/D" mientras no salga el dato del mes en curso no le
        # sirve a nadie: el número del mes anterior ya está y es el útil para
        # comparar contra la facturación.
        ultimo_real_periodo = sorted(tasas.keys())[-1]
        ultimo_periodo = ultimo_real_periodo
        ultimo_valor   = tasas[ultimo_periodo] * 100

        # Para la licuación (caja diferida) sí hace falta una tasa del mes en
        # curso; si INDEC no la publicó, la completamos con la proyección de
        # config — pero SOLO en `tasas` (uso interno), sin tocar el valor visible.
        proyeccion_periodo = None
        if mes_anterior not in tasas:
            tasas[mes_anterior] = config.inflacion_mensual
            proyeccion_periodo = mes_anterior
            logger.info("IPC %s no publicado aún — proyectado con config %.2f%% (solo para licuación)",
                        mes_anterior, config.inflacion_mensual * 100)

        _ipc_cache.update({
            "tasas":               tasas,
            "ultimo_periodo":      ultimo_periodo,
            "ultimo_valor_pct":    round(ultimo_valor, 2),
            "estimado":            False,  # el valor visible es un dato real de INDEC
            "ultimo_real_periodo": ultimo_real_periodo,
            "proyeccion_periodo":  proyeccion_periodo,
            "ts":                  ahora,
        })
        logger.info("IPC INDEC: %d meses. Último real: %s → %.2f%%",
                    len(tasas), ultimo_periodo, ultimo_valor)
    except Exception as exc:
        logger.warning("No se pudo obtener IPC de INDEC: %s", exc)
        if not _ipc_cache.get("tasas"):
            tasa_fb = config.inflacion_mensual
            tasas_fb: dict[str, float] = {}
            hoy = hoy_argentina()
            for i in range(13):
                mes = (hoy - relativedelta(months=i)).strftime("%Y-%m")
                tasas_fb[mes] = tasa_fb
            # TTL corto: reintenta en 5 min en vez de bloquear 6 horas
            _ipc_cache.update({
                "tasas":               tasas_fb,
                "ultimo_periodo":      "config",
                "ultimo_valor_pct":    round(tasa_fb * 100, 2),
                "estimado":            True,
                "ultimo_real_periodo": None,
                "proyeccion_periodo":  None,
                "ts":                  ahora - _IPC_CACHE_TTL + _FALLBACK_TTL,
            })

    return _ipc_cache


def inflacion_acumulada(desde: date, hasta: date, tasas: dict[str, float]) -> float:
    """Compone tasas mensuales reales de `desde` a `hasta`.
    Devuelve la tasa acumulada decimal (ej: 0.38 = 38% acumulado)."""
    if not tasas:
        # Componer la tasa mensual de config por la cantidad de meses del rango:
        # devolverla sin componer subestimaba ~10x la licuación de turnos viejos
        meses = max((hasta.year - desde.year) * 12 + (hasta.month - desde.month), 0)
        factor_fb = (Decimal("1") + Decimal(str(config.inflacion_mensual))) ** meses
        return max(float(factor_fb - Decimal("1")), 0.0)

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
