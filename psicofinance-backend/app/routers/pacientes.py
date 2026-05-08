# Router de Pacientes — CRUD completo + alertas de honorarios.
# Sprint 5A: lista con stats, detalle con historial, crear, editar, eliminar.

import uuid
from datetime import date
from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.paciente import Paciente
from app.config import config
from app.schemas.paciente import (
    PacienteCreate, PacienteRead, PacienteUpdate,
    PacienteConStats, PacienteDetalle, TurnoEnDetalle,
)
from app.crud.paciente import (
    crear_paciente_completo,
    obtener_paciente,
    actualizar_paciente,
    eliminar_paciente,
    listar_pacientes_con_stats,
    obtener_paciente_con_turnos,
)

router = APIRouter(prefix="/pacientes", tags=["Pacientes"])

UMBRAL_MESES = 3


# ── Helpers ──────────────────────────────────────────────────────────────────

def _build_con_stats(row: dict) -> PacienteConStats:
    p: Paciente = row["paciente"]
    return PacienteConStats(
        id=p.id, nombre=p.nombre, apellido=p.apellido, email=p.email,
        honorario_actual=p.honorario_actual,
        fecha_ultimo_ajuste_honorario=p.fecha_ultimo_ajuste_honorario,
        created_at=p.created_at,
        total_sesiones=row["total_sesiones"],
        ultima_sesion=row["ultima_sesion"],
        dias_inactivo=row["dias_inactivo"],
        cobrado_total=row["cobrado_total"],
        pendiente=row["pendiente"],
        sesiones_mes=row["sesiones_mes"],
    )


def _build_detalle(row: dict) -> PacienteDetalle:
    p: Paciente = row["paciente"]
    return PacienteDetalle(
        id=p.id, nombre=p.nombre, apellido=p.apellido, email=p.email,
        honorario_actual=p.honorario_actual,
        fecha_ultimo_ajuste_honorario=p.fecha_ultimo_ajuste_honorario,
        created_at=p.created_at,
        total_sesiones=row["total_sesiones"],
        ultima_sesion=row["ultima_sesion"],
        dias_inactivo=row["dias_inactivo"],
        cobrado_total=row["cobrado_total"],
        pendiente=row["pendiente"],
        sesiones_mes=row["sesiones_mes"],
        turnos=[TurnoEnDetalle.model_validate(t) for t in row["turnos"]],
    )


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/", response_model=list[PacienteConStats])
def listar(db: Session = Depends(get_db)):
    """Lista todos los pacientes con estadísticas agregadas."""
    return [_build_con_stats(row) for row in listar_pacientes_con_stats(db)]


@router.post("/", response_model=PacienteRead, status_code=status.HTTP_201_CREATED)
def crear(datos: PacienteCreate, db: Session = Depends(get_db)):
    """Crea un paciente nuevo."""
    return crear_paciente_completo(db, datos)


@router.get("/alertas-honorarios", response_model=list[dict])
def get_alertas_honorarios(db: Session = Depends(get_db)):
    """
    Devuelve la lista de pacientes cuyo honorario lleva ≥ UMBRAL_MESES
    sin actualizarse, con el porcentaje de inflación acumulado y honorario sugerido.
    """
    hoy  = date.today()
    tasa = config.inflacion_mensual

    pacientes = (
        db.query(Paciente)
        .filter(
            Paciente.honorario_actual.isnot(None),
            Paciente.fecha_ultimo_ajuste_honorario.isnot(None),
        )
        .all()
    )

    alertas = []
    for p in pacientes:
        delta = relativedelta(hoy, p.fecha_ultimo_ajuste_honorario)
        meses = delta.years * 12 + delta.months
        if meses < UMBRAL_MESES:
            continue
        inflacion_acumulada = (1 + tasa) ** meses - 1
        pct = round(inflacion_acumulada * 100)
        honorario_sugerido = round(p.honorario_actual * (1 + inflacion_acumulada))
        alertas.append({
            "paciente_id":        str(p.id),
            "nombre":             f"{p.nombre} {p.apellido[0]}.",
            "meses":              meses,
            "pct":                pct,
            "honorario_actual":   p.honorario_actual,
            "honorario_sugerido": honorario_sugerido,
            "alto":               meses >= 6,
        })

    alertas.sort(key=lambda x: x["meses"], reverse=True)
    return alertas


@router.get("/{paciente_id}", response_model=PacienteDetalle)
def detalle(paciente_id: uuid.UUID, db: Session = Depends(get_db)):
    """Devuelve el detalle de un paciente con historial completo de turnos."""
    row = obtener_paciente_con_turnos(db, paciente_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    return _build_detalle(row)


@router.patch("/{paciente_id}", response_model=PacienteRead)
def actualizar(paciente_id: uuid.UUID, datos: PacienteUpdate, db: Session = Depends(get_db)):
    """Actualización parcial de un paciente."""
    paciente = actualizar_paciente(db, paciente_id, datos)
    if paciente is None:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    return paciente


@router.delete("/{paciente_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar(paciente_id: uuid.UUID, db: Session = Depends(get_db)):
    """
    Elimina un paciente. Solo funciona si no tiene turnos registrados.
    """
    ok, motivo = eliminar_paciente(db, paciente_id)
    if not ok:
        if motivo == "no_encontrado":
            raise HTTPException(status_code=404, detail="Paciente no encontrado")
        raise HTTPException(
            status_code=409,
            detail="No se puede eliminar: el paciente tiene turnos registrados."
        )
