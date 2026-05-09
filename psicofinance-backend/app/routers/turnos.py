# Router de Turnos.
# Usa Supabase REST API via SupabaseClient (sin SQLAlchemy).

import uuid
from fastapi import APIRouter, Depends, HTTPException, status, Query
from datetime import date
from app.supabase_client import SupabaseClient, get_supabase
from app.models.turno import EstadoTurno
from app.schemas.turno import TurnoCreate, TurnoRead, TurnoUpdate
from app.crud.turno import crear_turno, obtener_turno, listar_turnos, actualizar_turno, eliminar_turno

router = APIRouter(prefix="/turnos", tags=["Turnos"])


@router.post("/", response_model=TurnoRead, status_code=status.HTTP_201_CREATED)
def registrar_turno(datos: TurnoCreate, sb: SupabaseClient = Depends(get_supabase)):
    """Registra un turno nuevo."""
    return crear_turno(sb, datos)


@router.get("/", response_model=list[TurnoRead])
def listar(
    estado: EstadoTurno | None = Query(default=None),
    desde: date | None = Query(default=None),
    hasta: date | None = Query(default=None),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    sb: SupabaseClient = Depends(get_supabase),
):
    """Lista turnos con filtros opcionales por estado y rango de fechas."""
    return listar_turnos(sb, estado=estado, desde=desde, hasta=hasta, offset=offset, limit=limit)


@router.get("/{turno_id}", response_model=TurnoRead)
def obtener(turno_id: uuid.UUID, sb: SupabaseClient = Depends(get_supabase)):
    """Devuelve un turno por su ID."""
    turno = obtener_turno(sb, turno_id)
    if turno is None:
        raise HTTPException(status_code=404, detail="Turno no encontrado")
    return turno


@router.patch("/{turno_id}", response_model=TurnoRead)
def actualizar(turno_id: uuid.UUID, datos: TurnoUpdate, sb: SupabaseClient = Depends(get_supabase)):
    """Actualización parcial de un turno."""
    turno = actualizar_turno(sb, turno_id, datos)
    if turno is None:
        raise HTTPException(status_code=404, detail="Turno no encontrado")
    return turno


@router.delete("/{turno_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar(turno_id: uuid.UUID, sb: SupabaseClient = Depends(get_supabase)):
    """Elimina un turno permanentemente."""
    ok = eliminar_turno(sb, turno_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Turno no encontrado")
