# CRUD de Egresos usando Supabase REST API.
# Mismo patrón que crud/turno.py: sin SQLAlchemy, agregaciones en Python.

import uuid
from datetime import date
from app.supabase_client import SupabaseClient
from app.schemas.egreso import EgresoCreate, EgresoUpdate


def _parse_date(val) -> date | None:
    if val is None:
        return None
    if isinstance(val, date):
        return val
    return date.fromisoformat(str(val)[:10])


def _serializar(valores: dict) -> dict:
    data = {}
    for k, v in valores.items():
        if isinstance(v, date):
            data[k] = v.isoformat()
        elif isinstance(v, uuid.UUID):
            data[k] = str(v)
        elif hasattr(v, "value"):  # Enum
            data[k] = v.value
        else:
            data[k] = v
    return data


def crear_egreso(sb: SupabaseClient, datos: EgresoCreate) -> dict:
    data = _serializar({k: v for k, v in datos.model_dump().items() if v is not None})
    data["id"] = str(uuid.uuid4())
    return sb.insert("egresos", data)


def obtener_egreso(sb: SupabaseClient, egreso_id: uuid.UUID) -> dict | None:
    rows = sb.select("egresos", {"id": f"eq.{egreso_id}"})
    return rows[0] if rows else None


def listar_egresos(
    sb: SupabaseClient,
    desde: date | None = None,
    hasta: date | None = None,
    tipo: str | None = None,
    categoria: str | None = None,
    offset: int = 0,
    limit: int = 100,
) -> list[dict]:
    params: dict = {"order": "fecha.desc", "offset": str(offset), "limit": str(limit)}
    if tipo:
        params["tipo"] = f"eq.{tipo.value if hasattr(tipo, 'value') else tipo}"
    if categoria:
        params["categoria"] = f"eq.{categoria.value if hasattr(categoria, 'value') else categoria}"
    if desde:
        params["fecha"] = f"gte.{desde.isoformat()}"
    rows = sb.select("egresos", params)
    # PostgREST del cliente custom no admite dos condiciones del mismo campo:
    # el límite superior se filtra en Python (igual que turnos/agenda)
    if hasta:
        rows = [r for r in rows if (_parse_date(r.get("fecha")) or date.min) <= hasta]
    return rows


def actualizar_egreso(sb: SupabaseClient, egreso_id: uuid.UUID, datos: EgresoUpdate) -> dict | None:
    cambios = _serializar(datos.model_dump(exclude_none=True))
    if not cambios:
        return obtener_egreso(sb, egreso_id)
    return sb.update("egresos", {"id": f"eq.{egreso_id}"}, cambios)


def eliminar_egreso(sb: SupabaseClient, egreso_id: uuid.UUID) -> bool:
    egreso = obtener_egreso(sb, egreso_id)
    if egreso is None:
        return False
    sb.delete("egresos", {"id": f"eq.{egreso_id}"})
    return True
