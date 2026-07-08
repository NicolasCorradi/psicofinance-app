# Router de Turnos.
# Usa Supabase REST API via SupabaseClient (sin SQLAlchemy).

import uuid
from fastapi import APIRouter, Depends, HTTPException, status, Query
from datetime import date
from app.supabase_client import SupabaseClient, get_supabase
from app.models.enums import EstadoTurno
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


# ⚠ IMPORTANTE: /agenda debe ir ANTES de /{turno_id} para que FastAPI no
#   intente parsear "agenda" como UUID.
@router.get("/agenda", response_model=list[dict])
def agenda(
    desde: date = Query(...),
    hasta: date = Query(...),
    sb: SupabaseClient = Depends(get_supabase),
):
    """Turnos en un rango de fechas (para la vista de agenda/calendario).
    Devuelve cada turno enriquecido con el nombre del paciente."""
    # and=() permite ambos límites del rango en un solo query
    turnos_raw = sb.select("turnos", {
        "and": f"(fecha_turno.gte.{desde.isoformat()},fecha_turno.lte.{hasta.isoformat()})",
        "select": "id,paciente_id,fecha_turno,monto,estado,tipo_sesion,origen_pago,prepaga,medio_pago,moneda,tipo_cambio,fecha_cobro_efectivo",
        "order": "fecha_turno.asc",
    })

    # Join con pacientes
    pacientes = sb.select("pacientes", {"select": "id,nombre,apellido"})
    pac_map = {
        p["id"]: f"{p.get('nombre', '')} {p.get('apellido', '')}".strip()
        for p in pacientes
    }

    return [
        {
            "id":               str(t["id"]),
            "paciente_id":      str(t.get("paciente_id", "")),
            "paciente_nombre":  pac_map.get(t.get("paciente_id"), "Sin nombre"),
            "fecha_turno":      t.get("fecha_turno"),
            "monto":            float(t.get("monto") or 0),
            "estado":           t.get("estado"),
            "tipo_sesion":      t.get("tipo_sesion") or "SESION",
            "origen_pago":      t.get("origen_pago"),
            "prepaga":          t.get("prepaga"),
            "medio_pago":       t.get("medio_pago"),
            "moneda":           t.get("moneda") or "ARS",
            "tipo_cambio":      float(t.get("tipo_cambio") or 0) or None,
            "fecha_cobro_efectivo": t.get("fecha_cobro_efectivo"),
        }
        for t in turnos_raw
    ]


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
