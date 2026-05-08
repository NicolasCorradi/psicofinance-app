# Router de Turnos.
# Expone el CRUD de turnos. Es el endpoint más usado de la aplicación:
# el psicólogo registra y actualiza sus sesiones desde aquí.

import uuid
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from datetime import date
from app.database import get_db
from app.models.turno import EstadoTurno
from app.schemas.turno import TurnoCreate, TurnoRead, TurnoUpdate
from app.crud.turno import crear_turno, obtener_turno, listar_turnos, actualizar_turno, eliminar_turno

router = APIRouter(prefix="/turnos", tags=["Turnos"])


@router.post("/", response_model=TurnoRead, status_code=status.HTTP_201_CREATED)
def registrar_turno(datos: TurnoCreate, db: Session = Depends(get_db)):
    """Registra un turno nuevo. Si el origen es PREPAGA, fecha_cobro_estimada es obligatoria."""
    return crear_turno(db, datos)


@router.get("/", response_model=list[TurnoRead])
def listar(
    estado: EstadoTurno | None = Query(default=None),
    desde: date | None = Query(default=None),
    hasta: date | None = Query(default=None),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """Lista turnos con filtros opcionales por estado y rango de fechas."""
    return listar_turnos(db, estado=estado, desde=desde, hasta=hasta, offset=offset, limit=limit)


@router.get("/{turno_id}", response_model=TurnoRead)
def obtener(turno_id: uuid.UUID, db: Session = Depends(get_db)):
    """Devuelve un turno por su ID."""
    turno = obtener_turno(db, turno_id)
    if turno is None:
        raise HTTPException(status_code=404, detail="Turno no encontrado")
    return turno


@router.patch("/{turno_id}", response_model=TurnoRead)
def actualizar(turno_id: uuid.UUID, datos: TurnoUpdate, db: Session = Depends(get_db)):
    """
    Actualización parcial de un turno (ej: marcar como cobrado con su fecha efectiva).
    Solo se modifican los campos enviados en el body.
    """
    turno = actualizar_turno(db, turno_id, datos)
    if turno is None:
        raise HTTPException(status_code=404, detail="Turno no encontrado")
    return turno


@router.delete("/{turno_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar(turno_id: uuid.UUID, db: Session = Depends(get_db)):
    """Elimina un turno permanentemente."""
    ok = eliminar_turno(db, turno_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Turno no encontrado")
