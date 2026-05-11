# CRUD de Turnos usando Supabase REST API.
# Reemplaza SQLAlchemy para evitar problemas de conectividad PostgreSQL en Render free.

import uuid
from datetime import date
from app.supabase_client import SupabaseClient
from app.schemas.turno import TurnoCreate, TurnoUpdate


def _parse_date(val) -> date | None:
    if val is None:
        return None
    if isinstance(val, date):
        return val
    return date.fromisoformat(str(val)[:10])


def crear_turno(sb: SupabaseClient, datos: TurnoCreate) -> dict:
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
    return sb.insert("turnos", data)


def obtener_turno(sb: SupabaseClient, turno_id: uuid.UUID) -> dict | None:
    rows = sb.select("turnos", {"id": f"eq.{turno_id}"})
    return rows[0] if rows else None


def listar_turnos(
    sb: SupabaseClient,
    estado: str | None = None,
    desde: date | None = None,
    hasta: date | None = None,
    offset: int = 0,
    limit: int = 100,
) -> list[dict]:
    params: dict = {"order": "fecha_turno.desc", "offset": str(offset), "limit": str(limit)}
    if estado:
        params["estado"] = f"eq.{estado.value if hasattr(estado, 'value') else estado}"
    if desde:
        params["fecha_turno"] = f"gte.{desde.isoformat()}"
    if hasta:
        params["fecha_turno"] = f"lte.{hasta.isoformat()}"
    return sb.select("turnos", params)


def actualizar_turno(sb: SupabaseClient, turno_id: uuid.UUID, datos: TurnoUpdate) -> dict | None:
    cambios = {}
    for k, v in datos.model_dump(exclude_none=True).items():
        if isinstance(v, date):
            cambios[k] = v.isoformat()
        elif isinstance(v, uuid.UUID):
            cambios[k] = str(v)
        elif hasattr(v, "value"):
            cambios[k] = v.value
        else:
            cambios[k] = v
    if not cambios:
        return obtener_turno(sb, turno_id)
    return sb.update("turnos", {"id": f"eq.{turno_id}"}, cambios)


def eliminar_turno(sb: SupabaseClient, turno_id: uuid.UUID) -> bool:
    turno = obtener_turno(sb, turno_id)
    if turno is None:
        return False
    sb.delete("turnos", {"id": f"eq.{turno_id}"})
    return True


def listar_turnos_diferidos(sb: SupabaseClient) -> list[dict]:
    return sb.select("turnos", {"estado": "eq.DIFERIDO"})


def sumar_facturado_ultimos_12_meses(sb: SupabaseClient, hasta: date) -> float:
    desde = date(hasta.year - 1, hasta.month, hasta.day)
    turnos = sb.select("turnos", {
        "estado": "eq.COBRADO",
        "fecha_cobro_efectivo": f"gte.{desde.isoformat()}",
        "select": "monto,fecha_cobro_efectivo",
    })
    total = sum(
        float(t["monto"] or 0) for t in turnos
        if t.get("fecha_cobro_efectivo") and _parse_date(t["fecha_cobro_efectivo"]) <= hasta
    )
    return total
