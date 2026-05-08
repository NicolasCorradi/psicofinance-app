# Operaciones de base de datos para la entidad Turno.
# Solo contiene queries SQLAlchemy, sin lógica de negocio.

import uuid
from datetime import date
from sqlalchemy.orm import Session
from app.models.turno import Turno, EstadoTurno
from app.schemas.turno import TurnoCreate, TurnoUpdate


def crear_turno(db: Session, datos: TurnoCreate) -> Turno:
    """Inserta un turno nuevo en la base de datos."""
    turno = Turno(**datos.model_dump())
    db.add(turno)
    db.commit()
    db.refresh(turno)
    return turno


def obtener_turno(db: Session, turno_id: uuid.UUID) -> Turno | None:
    """Busca un turno por su ID. Retorna None si no existe."""
    return db.get(Turno, turno_id)


def listar_turnos(
    db: Session,
    estado: EstadoTurno | None = None,
    desde: date | None = None,
    hasta: date | None = None,
    offset: int = 0,
    limit: int = 100,
) -> list[Turno]:
    """
    Lista turnos con filtros opcionales por estado y rango de fechas.
    Usado por los servicios de Caja y Monotributo.
    """
    query = db.query(Turno)
    if estado:
        query = query.filter(Turno.estado == estado)
    if desde:
        query = query.filter(Turno.fecha_turno >= desde)
    if hasta:
        query = query.filter(Turno.fecha_turno <= hasta)
    return query.order_by(Turno.fecha_turno.desc()).offset(offset).limit(limit).all()


def actualizar_turno(db: Session, turno_id: uuid.UUID, datos: TurnoUpdate) -> Turno | None:
    """Actualiza solo los campos enviados en el PATCH (partial update)."""
    turno = db.get(Turno, turno_id)
    if turno is None:
        return None

    # Solo actualiza los campos que fueron explícitamente enviados (no None)
    cambios = datos.model_dump(exclude_none=True)
    for campo, valor in cambios.items():
        setattr(turno, campo, valor)

    db.commit()
    db.refresh(turno)
    return turno


def eliminar_turno(db: Session, turno_id: uuid.UUID) -> bool:
    """Elimina un turno. Retorna True si existía, False si no se encontró."""
    turno = db.get(Turno, turno_id)
    if turno is None:
        return False
    db.delete(turno)
    db.commit()
    return True


def listar_turnos_diferidos(db: Session) -> list[Turno]:
    """Shortcut: retorna todos los turnos en estado DIFERIDO (Caja Diferida)."""
    return db.query(Turno).filter(Turno.estado == EstadoTurno.DIFERIDO).all()


def sumar_facturado_ultimos_12_meses(db: Session, hasta: date) -> float:
    """
    Suma el monto de todos los turnos COBRADOS en los últimos 12 meses rodantes.
    Usado por el Semáforo Monotributo.
    """
    from datetime import timedelta
    from sqlalchemy import func as sa_func

    desde = date(hasta.year - 1, hasta.month, hasta.day)
    resultado = (
        db.query(sa_func.sum(Turno.monto))
        .filter(
            Turno.estado == EstadoTurno.COBRADO,
            Turno.fecha_cobro_efectivo >= desde,
            Turno.fecha_cobro_efectivo <= hasta,
        )
        .scalar()
    )
    return float(resultado or 0.0)
