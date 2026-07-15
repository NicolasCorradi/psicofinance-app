# Router de Agenda — semana real + semana modelo.
# La semana modelo se persiste en la tabla `configuracion` de Supabase como JSON.

import json
import logging
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.supabase_client import SupabaseClient, get_supabase
from app.auth import usuario_id
from app.utils import hoy_argentina

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/agenda", tags=["Agenda"])

CLAVE_MODELO = "semana_modelo"
CLAVE_EXCEPCIONES = "excepciones_semanales"
# Cuántas semanas viejas se conservan al guardar (para no crecer sin límite)
_SEMANAS_RETENCION = 8


# ── Schemas ───────────────────────────────────────────────────────────────────

class SlotModelo(BaseModel):
    dia:             int          # 1=Lun … 7=Dom
    hora:            str          # "09:00"
    paciente_id:     str
    paciente_nombre: str


class SemanaModeloPayload(BaseModel):
    slots: list[SlotModelo]


class ExcepcionSemanal(BaseModel):
    """Un cambio puntual sobre la semana modelo, válido SOLO para una semana.
    No toca la plantilla ni los turnos: solo altera cómo se dibuja esa semana."""
    paciente_id: str
    dia_orig:    int              # día del slot en la plantilla (1=Lun … 7=Dom)
    hora_orig:   str              # hora del slot en la plantilla
    accion:      str              # "mover" | "cancelar"
    dia_nuevo:   int | None = None   # solo si accion == "mover"
    hora_nueva:  str | None = None   # solo si accion == "mover"


class ExcepcionesPayload(BaseModel):
    semana:      str                       # lunes de la semana, ISO "YYYY-MM-DD"
    excepciones: list[ExcepcionSemanal]


# ── Helpers BD ────────────────────────────────────────────────────────────────

def _leer_modelo(sb: SupabaseClient, user_id: str) -> list[dict]:
    try:
        rows = sb.select("configuracion", {
            "clave": f"eq.{CLAVE_MODELO}", "user_id": f"eq.{user_id}", "select": "valor",
        })
        if rows:
            return json.loads(rows[0]["valor"])
    except Exception as exc:
        logger.warning("No se pudo leer semana modelo: %s", exc)
    return []


def _guardar_modelo(sb: SupabaseClient, slots: list[dict], user_id: str) -> None:
    valor = json.dumps(slots, ensure_ascii=False)
    sb.upsert(
        "configuracion",
        {"clave": CLAVE_MODELO, "valor": valor, "user_id": user_id},
        on_conflict="clave,user_id",
    )


def _leer_excepciones(sb: SupabaseClient, user_id: str) -> dict:
    """Devuelve el dict completo { '<lunes_iso>': [excepciones...] }."""
    try:
        rows = sb.select("configuracion", {
            "clave": f"eq.{CLAVE_EXCEPCIONES}", "user_id": f"eq.{user_id}", "select": "valor",
        })
        if rows:
            return json.loads(rows[0]["valor"])
    except Exception as exc:
        logger.warning("No se pudo leer excepciones semanales: %s", exc)
    return {}


def _guardar_excepciones(sb: SupabaseClient, data: dict, user_id: str) -> None:
    valor = json.dumps(data, ensure_ascii=False)
    sb.upsert(
        "configuracion",
        {"clave": CLAVE_EXCEPCIONES, "valor": valor, "user_id": user_id},
        on_conflict="clave,user_id",
    )


def _podar_semanas_viejas(data: dict) -> dict:
    """Descarta semanas anteriores a la ventana de retención, para que el JSON
    no crezca indefinidamente. Las claves son lunes en ISO (comparables como texto)."""
    corte = (hoy_argentina() - timedelta(weeks=_SEMANAS_RETENCION)).isoformat()
    return {k: v for k, v in data.items() if k >= corte and v}


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/semana-modelo", response_model=dict)
def get_semana_modelo(sb: SupabaseClient = Depends(get_supabase), usuario_id: str = Depends(usuario_id)):
    """Devuelve la semana modelo guardada."""
    slots = _leer_modelo(sb, usuario_id)
    return {"slots": slots}


@router.patch("/semana-modelo", response_model=dict, status_code=status.HTTP_200_OK)
def patch_semana_modelo(body: SemanaModeloPayload, sb: SupabaseClient = Depends(get_supabase), usuario_id: str = Depends(usuario_id)):
    """Guarda la semana modelo completa (reemplaza la anterior)."""
    slots = [s.model_dump() for s in body.slots]
    _guardar_modelo(sb, slots, usuario_id)
    return {"slots": slots}


@router.get("/excepciones", response_model=dict)
def get_excepciones(semana: str, sb: SupabaseClient = Depends(get_supabase), usuario_id: str = Depends(usuario_id)):
    """Excepciones (movidos/cancelados) de una semana puntual.
    `semana` es el lunes en ISO 'YYYY-MM-DD'."""
    data = _leer_excepciones(sb, usuario_id)
    return {"semana": semana, "excepciones": data.get(semana, [])}


@router.patch("/excepciones", response_model=dict, status_code=status.HTTP_200_OK)
def patch_excepciones(body: ExcepcionesPayload, sb: SupabaseClient = Depends(get_supabase), usuario_id: str = Depends(usuario_id)):
    """Reemplaza las excepciones de UNA semana (deja intactas las demás).
    Si la lista viene vacía, esa semana se borra del registro."""
    data = _leer_excepciones(sb, usuario_id)
    excepciones = [e.model_dump() for e in body.excepciones]
    if excepciones:
        data[body.semana] = excepciones
    else:
        data.pop(body.semana, None)
    data = _podar_semanas_viejas(data)
    _guardar_excepciones(sb, data, usuario_id)
    return {"semana": body.semana, "excepciones": excepciones}
