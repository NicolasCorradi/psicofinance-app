# Router de la Doble Caja.
# Usa Supabase REST API via SupabaseClient (sin SQLAlchemy).

from fastapi import APIRouter, Depends
from app.supabase_client import SupabaseClient, get_supabase
from app.auth import usuario_id
from app.schemas.caja import ResumenCaja
from app.services.caja_service import obtener_resumen_caja

router = APIRouter(prefix="/caja", tags=["Doble Caja"])


@router.get("/resumen", response_model=ResumenCaja)
def resumen_caja(sb: SupabaseClient = Depends(get_supabase), usuario_id: str = Depends(usuario_id)):
    return obtener_resumen_caja(sb, usuario_id)
