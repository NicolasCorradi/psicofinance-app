# CRUD de Egresos usando Supabase REST API.
# Mismo patrón que crud/turno.py: sin SQLAlchemy, agregaciones en Python.

import uuid
from datetime import date
from app.supabase_client import SupabaseClient
from app.schemas.egreso import EgresoCreate, EgresoUpdate
from app.utils import parse_fecha as _parse_date


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
    # Rango completo server-side con and=(...): filtrar después de paginar
    # perdería filas cuando el mes supera el limit
    if desde and hasta:
        params["and"] = f"(fecha.gte.{desde.isoformat()},fecha.lte.{hasta.isoformat()})"
    elif desde:
        params["fecha"] = f"gte.{desde.isoformat()}"
    elif hasta:
        params["fecha"] = f"lte.{hasta.isoformat()}"
    return sb.select("egresos", params)


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
