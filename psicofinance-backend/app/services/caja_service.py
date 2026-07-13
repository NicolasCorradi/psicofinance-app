# Servicio de la Doble Caja.
# Usa Supabase REST API via SupabaseClient (sin SQLAlchemy).
# La licuación usa el IPC real del INDEC (misma metodología que el dashboard):
# antes caja usaba la tasa fija del .env y los números no cerraban entre pantallas.

from app.supabase_client import SupabaseClient
from app.crud.turno import listar_turnos, listar_turnos_diferidos
from app.services.inflacion_service import fetch_ipc_indec, inflacion_acumulada
from app.schemas.caja import ResumenCaja
from app.utils import hoy_argentina, monto_ars, parse_fecha


def obtener_resumen_caja(sb: SupabaseClient, user_id: str) -> ResumenCaja:
    hoy = hoy_argentina()

    # --- Caja Líquida ---
    turnos_cobrados = listar_turnos(sb, user_id, estado="COBRADO", limit=0)
    caja_liquida = sum(monto_ars(t) for t in turnos_cobrados)

    # --- Caja Diferida ---
    turnos_diferidos = listar_turnos_diferidos(sb, user_id)
    cantidad_diferidos = len(turnos_diferidos)

    tasas = fetch_ipc_indec().get("tasas", {})

    caja_diferida_nominal = 0.0
    caja_diferida_real = 0.0
    for turno in turnos_diferidos:
        fecha_turno = parse_fecha(turno.get("fecha_turno"))
        if fecha_turno is None:
            continue
        fecha_est = parse_fecha(turno.get("fecha_cobro_estimada"))
        # Licuación hasta la fecha estimada de cobro; si ya venció, sigue
        # corriendo hasta hoy (el cobro vencido se sigue licuando)
        fecha_fin = max(fecha_est or hoy, hoy)
        monto = monto_ars(turno)
        tasa_acum = inflacion_acumulada(fecha_turno, fecha_fin, tasas)
        caja_diferida_nominal += monto
        caja_diferida_real += monto / (1 + tasa_acum) if tasa_acum > 0 else monto

    perdida_total = caja_diferida_nominal - caja_diferida_real
    porcentaje_licuado = (
        perdida_total / caja_diferida_nominal * 100 if caja_diferida_nominal > 0 else 0.0
    )
    caja_diferida_nominal = round(caja_diferida_nominal, 2)
    caja_diferida_real = round(caja_diferida_real, 2)
    perdida_total = round(perdida_total, 2)
    porcentaje_licuado = round(porcentaje_licuado, 2)

    turnos_incobrables = listar_turnos(sb, user_id, estado="INCOBRABLE", limit=0)

    return ResumenCaja(
        caja_liquida_total=round(caja_liquida, 2),
        caja_diferida_nominal=caja_diferida_nominal,
        caja_diferida_real=caja_diferida_real,
        perdida_estimada_total=perdida_total,
        porcentaje_licuado_promedio=porcentaje_licuado,
        cantidad_turnos_cobrados=len(turnos_cobrados),
        cantidad_turnos_diferidos=cantidad_diferidos,
        cantidad_turnos_incobrables=len(turnos_incobrables),
    )
