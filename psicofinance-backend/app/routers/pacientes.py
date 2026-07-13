# Router de Pacientes — CRUD completo + alertas de honorarios.
# Usa Supabase REST API via SupabaseClient (sin SQLAlchemy).

import uuid
from datetime import date
from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Depends, HTTPException, status

from app.supabase_client import SupabaseClient, get_supabase
from app.auth import usuario_id
from app.config import config
from app.services.inflacion_service import fetch_ipc_indec, inflacion_acumulada
from app.utils import hoy_argentina
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
    p: dict = row["paciente"]
    return PacienteConStats(
        id=p["id"], nombre=p["nombre"], apellido=p["apellido"],
        email=p.get("email"),
        telefono=p.get("telefono"),
        honorario_actual=p.get("honorario_actual"),
        fecha_ultimo_ajuste_honorario=p.get("fecha_ultimo_ajuste_honorario"),
        created_at=p.get("created_at"),
        total_sesiones=row["total_sesiones"],
        ultima_sesion=row["ultima_sesion"],
        dias_inactivo=row["dias_inactivo"],
        cobrado_total=row["cobrado_total"],
        pendiente=row["pendiente"],
        sesiones_mes=row["sesiones_mes"],
    )


def _build_detalle(row: dict) -> PacienteDetalle:
    p: dict = row["paciente"]
    return PacienteDetalle(
        id=p["id"], nombre=p["nombre"], apellido=p["apellido"],
        email=p.get("email"),
        telefono=p.get("telefono"),
        honorario_actual=p.get("honorario_actual"),
        fecha_ultimo_ajuste_honorario=p.get("fecha_ultimo_ajuste_honorario"),
        created_at=p.get("created_at"),
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
def listar(sb: SupabaseClient = Depends(get_supabase), usuario_id: str = Depends(usuario_id)):
    """Lista todos los pacientes con estadísticas agregadas."""
    return [_build_con_stats(row) for row in listar_pacientes_con_stats(sb, usuario_id)]


@router.post("/", response_model=PacienteRead, status_code=status.HTTP_201_CREATED)
def crear(datos: PacienteCreate, sb: SupabaseClient = Depends(get_supabase), usuario_id: str = Depends(usuario_id)):
    """Crea un paciente nuevo."""
    return crear_paciente_completo(sb, datos, usuario_id)


@router.get("/alertas-honorarios", response_model=list[dict])
def get_alertas_honorarios(sb: SupabaseClient = Depends(get_supabase), usuario_id: str = Depends(usuario_id)):
    """
    Devuelve la lista de pacientes cuyo honorario lleva >= UMBRAL_MESES
    sin actualizarse, con el porcentaje de inflación acumulado y honorario sugerido.
    """
    hoy = hoy_argentina()

    # Tasas reales del INDEC mes a mes (con fallback al config si no hay red)
    ipc = fetch_ipc_indec()
    tasas_hist = ipc.get("tasas", {})

    pacientes = sb.select("pacientes", {
        "user_id": f"eq.{usuario_id}",
        "honorario_actual": "not.is.null",
        "fecha_ultimo_ajuste_honorario": "not.is.null",
    })

    alertas = []
    for p in pacientes:
        fecha_ajuste_str = p.get("fecha_ultimo_ajuste_honorario")
        if not fecha_ajuste_str:
            continue
        fecha_ajuste = date.fromisoformat(str(fecha_ajuste_str)[:10])
        delta = relativedelta(hoy, fecha_ajuste)
        meses = delta.years * 12 + delta.months
        if meses < UMBRAL_MESES:
            continue
        honorario = float(p.get("honorario_actual") or 0)
        # Inflación acumulada real usando tasas mensuales del INDEC
        inflacion_acum = inflacion_acumulada(fecha_ajuste, hoy, tasas_hist)
        pct = round(inflacion_acum * 100)
        honorario_sugerido = round(honorario * (1 + inflacion_acum))
        alertas.append({
            "paciente_id":        str(p["id"]),
            "nombre":             f"{p['nombre']} {p['apellido'][0]}.",
            "meses":              meses,
            "pct":                pct,
            "honorario_actual":   honorario,
            "honorario_sugerido": honorario_sugerido,
            "alto":               meses >= 6,
        })

    alertas.sort(key=lambda x: x["meses"], reverse=True)
    return alertas


@router.get("/{paciente_id}", response_model=PacienteDetalle)
def detalle(paciente_id: uuid.UUID, sb: SupabaseClient = Depends(get_supabase), usuario_id: str = Depends(usuario_id)):
    """Devuelve el detalle de un paciente con historial completo de turnos."""
    row = obtener_paciente_con_turnos(sb, paciente_id, usuario_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    return _build_detalle(row)


@router.patch("/{paciente_id}", response_model=PacienteRead)
def actualizar(paciente_id: uuid.UUID, datos: PacienteUpdate, sb: SupabaseClient = Depends(get_supabase), usuario_id: str = Depends(usuario_id)):
    """Actualización parcial de un paciente."""
    paciente = actualizar_paciente(sb, paciente_id, datos, usuario_id)
    if paciente is None:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    return paciente


@router.delete("/{paciente_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar(paciente_id: uuid.UUID, sb: SupabaseClient = Depends(get_supabase), usuario_id: str = Depends(usuario_id)):
    """
    Elimina un paciente. Solo funciona si no tiene turnos registrados.
    """
    ok, motivo = eliminar_paciente(sb, paciente_id, usuario_id)
    if not ok:
        if motivo == "no_encontrado":
            raise HTTPException(status_code=404, detail="Paciente no encontrado")
        raise HTTPException(
            status_code=409,
            detail="No se puede eliminar: el paciente tiene turnos registrados."
        )
