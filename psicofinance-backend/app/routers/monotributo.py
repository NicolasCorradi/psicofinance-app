# Router del Semáforo Monotributo.
# Usa Supabase REST API via SupabaseClient (sin SQLAlchemy).

from fastapi import APIRouter, Depends
from dataclasses import asdict
from app.supabase_client import SupabaseClient, get_supabase
from app.services.monotributo_service import obtener_semaforo, ResultadoSemaforo

router = APIRouter(prefix="/monotributo", tags=["Semáforo Monotributo"])


@router.get("/semaforo", response_model=dict)
def semaforo_monotributo(sb: SupabaseClient = Depends(get_supabase)):
    resultado: ResultadoSemaforo = obtener_semaforo(sb)
    return asdict(resultado)
