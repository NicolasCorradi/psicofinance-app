# Router de Agenda — semana real + semana modelo.
# La semana modelo se persiste en la tabla `configuracion` de Supabase como JSON.

import json
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.supabase_client import SupabaseClient, get_supabase
from app.auth import usuario_id

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/agenda", tags=["Agenda"])

CLAVE_MODELO = "semana_modelo"


# ── Schemas ───────────────────────────────────────────────────────────────────

class SlotModelo(BaseModel):
    dia:             int          # 1=Lun … 7=Dom
    hora:            str          # "09:00"
    paciente_id:     str
    paciente_nombre: str


class SemanaModeloPayload(BaseModel):
    slots: list[SlotModelo]


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
