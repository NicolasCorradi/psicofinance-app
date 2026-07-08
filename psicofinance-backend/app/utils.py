# Utilidades compartidas del backend.
# Centraliza helpers que estaban duplicados en routers, crud y services.

from datetime import date, datetime
from zoneinfo import ZoneInfo

TZ_ARGENTINA = ZoneInfo("America/Argentina/Buenos_Aires")


def hoy_argentina() -> date:
    """Fecha actual en hora argentina.

    El servidor en Render corre en UTC: entre las 21:00 y medianoche (hora
    argentina) date.today() devuelve el día siguiente, corriendo turnos y
    cortes de mes. Usar siempre este helper en lugar de date.today().
    """
    return datetime.now(TZ_ARGENTINA).date()


def parse_fecha(val) -> date | None:
    """Parsea fechas ISO que vienen de Supabase (o ya son date). None si es inválida."""
    if val is None:
        return None
    if isinstance(val, date):
        return val
    try:
        return date.fromisoformat(str(val)[:10])
    except ValueError:
        return None


def monto_ars(t: dict) -> float:
    """Monto de un turno expresado en ARS.

    Los turnos en USD guardan tipo_cambio al momento del registro; si falta
    (dato viejo), se usa el dólar blue actual como aproximación en lugar de
    sumar el nominal USD como si fueran pesos.
    """
    monto = float(t.get("monto") or 0)
    if t.get("moneda") == "USD":
        tc = float(t.get("tipo_cambio") or 0)
        if tc <= 0:
            from app.services.dolar_service import get_dolar_blue
            tc = get_dolar_blue()
        return monto * tc
    return monto
