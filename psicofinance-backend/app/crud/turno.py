# CRUD de Turnos usando Supabase REST API.
# Reemplaza SQLAlchemy para evitar problemas de conectividad PostgreSQL en Render free.
#
# Multi-tenant: toda función recibe user_id y filtra por él.

import uuid
from datetime import date

from dateutil.relativedelta import relativedelta

from app.supabase_client import SupabaseClient
from app.schemas.turno import TurnoCreate, TurnoUpdate
from app.utils import monto_ars, parse_fecha as _parse_date


def _fila_turno(datos: TurnoCreate, user_id: str) -> dict:
    """Convierte un TurnoCreate en la fila que espera PostgREST."""
    data = {}
    for k, v in datos.model_dump().items():
        if v is None:
            continue
        if isinstance(v, (date,)):
            data[k] = v.isoformat()
        elif isinstance(v, uuid.UUID):
            data[k] = str(v)
        elif hasattr(v, "value"):  # Enum
            data[k] = v.value
        else:
            data[k] = v
    data["id"] = str(uuid.uuid4())
    data["user_id"] = user_id
    return data


def crear_turno(sb: SupabaseClient, datos: TurnoCreate, user_id: str) -> dict:
    return sb.insert("turnos", _fila_turno(datos, user_id))


def crear_turnos_lote(sb: SupabaseClient, turnos: list[TurnoCreate], user_id: str) -> list[dict]:
    """Crea varios turnos en un solo INSERT (cierre de jornada).

    Va por insert_many y no por N crear_turno() para que sea atómico: si el
    psicólogo cierra 7 turnos de una, no puede quedar la jornada a medias con
    3 cargados y 4 no."""
    filas = [_fila_turno(d, user_id) for d in turnos]

    # PostgREST rechaza el lote con "All object keys must match" (PGRST102) si
    # las filas no tienen exactamente las mismas claves, y _fila_turno omite
    # los None. En un cierre de jornada real las filas SIEMPRE difieren: la que
    # se cobró lleva medio_pago y fecha_cobro_efectivo, la que quedó debiendo
    # no. Se completan las faltantes con null explícito.
    # Es seguro: los campos que varían son justo los nullable (medio_pago,
    # prepaga, fechas de cobro, tipo_cambio); los que tienen default en
    # TurnoCreate (estado, origen_pago, tipo_sesion, moneda) nunca son None y
    # por lo tanto viajan siempre.
    claves = {k for f in filas for k in f}
    filas = [{k: f.get(k) for k in claves} for f in filas]

    return sb.insert_many("turnos", filas)


def obtener_turno(sb: SupabaseClient, turno_id: uuid.UUID, user_id: str) -> dict | None:
    rows = sb.select("turnos", {"id": f"eq.{turno_id}", "user_id": f"eq.{user_id}"})
    return rows[0] if rows else None


def listar_turnos(
    sb: SupabaseClient,
    user_id: str,
    estado: str | None = None,
    desde: date | None = None,
    hasta: date | None = None,
    offset: int = 0,
    limit: int = 100,
) -> list[dict]:
    params: dict = {
        "user_id": f"eq.{user_id}",
        "order": "fecha_turno.desc",
        "offset": str(offset),
        "limit": str(limit),
    }
    if estado:
        params["estado"] = f"eq.{estado.value if hasattr(estado, 'value') else estado}"
    # Con ambos límites hay que usar and=(): dos claves "fecha_turno" se pisarían
    if desde and hasta:
        params["and"] = f"(fecha_turno.gte.{desde.isoformat()},fecha_turno.lte.{hasta.isoformat()})"
    elif desde:
        params["fecha_turno"] = f"gte.{desde.isoformat()}"
    elif hasta:
        params["fecha_turno"] = f"lte.{hasta.isoformat()}"
    return sb.select("turnos", params)


def actualizar_turno(sb: SupabaseClient, turno_id: uuid.UUID, datos: TurnoUpdate, user_id: str) -> dict | None:
    # exclude_unset (no exclude_none): un null explícito debe llegar a la BD
    # para poder limpiar campos como fecha_cobro_efectivo al volver a DIFERIDO
    cambios = {}
    for k, v in datos.model_dump(exclude_unset=True).items():
        if isinstance(v, date):
            cambios[k] = v.isoformat()
        elif isinstance(v, uuid.UUID):
            cambios[k] = str(v)
        elif hasattr(v, "value"):
            cambios[k] = v.value
        else:
            cambios[k] = v
    if not cambios:
        return obtener_turno(sb, turno_id, user_id)
    return sb.update("turnos", {"id": f"eq.{turno_id}", "user_id": f"eq.{user_id}"}, cambios)


def eliminar_turno(sb: SupabaseClient, turno_id: uuid.UUID, user_id: str) -> bool:
    turno = obtener_turno(sb, turno_id, user_id)
    if turno is None:
        return False
    sb.delete("turnos", {"id": f"eq.{turno_id}", "user_id": f"eq.{user_id}"})
    return True


def listar_turnos_diferidos(sb: SupabaseClient, user_id: str) -> list[dict]:
    return sb.select("turnos", {"estado": "eq.DIFERIDO", "user_id": f"eq.{user_id}"})


def sumar_facturado_ultimos_12_meses(
    sb: SupabaseClient, hasta: date, user_id: str, criterio: str = "DEVENGADO",
) -> float:
    """Facturación de los últimos 12 meses rodantes para el semáforo Monotributo.

    DEVENGADO: por fecha de sesión, COBRADO + DIFERIDO (proxy de facturación
    emitida — ARCA computa por emisión, no por cobro).
    PERCIBIDO: por fecha de cobro efectivo, solo COBRADO.
    """
    # relativedelta maneja el 29 de febrero (date() directo lanza ValueError)
    desde = hasta - relativedelta(years=1)
    if criterio.upper() == "PERCIBIDO":
        params = {
            "estado": "eq.COBRADO",
            "user_id": f"eq.{user_id}",
            "and": f"(fecha_cobro_efectivo.gte.{desde.isoformat()},fecha_cobro_efectivo.lte.{hasta.isoformat()})",
            "select": "monto,moneda,tipo_cambio",
        }
    else:
        params = {
            "estado": "neq.INCOBRABLE",
            "user_id": f"eq.{user_id}",
            "and": f"(fecha_turno.gte.{desde.isoformat()},fecha_turno.lte.{hasta.isoformat()})",
            "select": "monto,moneda,tipo_cambio",
        }
    turnos = sb.select("turnos", params)
    # monto_ars convierte los turnos USD a pesos — sumarlos nominales
    # subestimaría la facturación y el semáforo daría VERDE estando en ROJO
    return sum(monto_ars(t) for t in turnos)
