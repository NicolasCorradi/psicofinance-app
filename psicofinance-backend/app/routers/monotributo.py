# Router del Semáforo Monotributo.
# Usa Supabase REST API via SupabaseClient (sin SQLAlchemy).

from fastapi import APIRouter, Depends, HTTPException, status
from dataclasses import asdict
from pydantic import BaseModel
from app.supabase_client import SupabaseClient, get_supabase
from app.auth import usuario_id
from app.services.monotributo_service import (
    obtener_semaforo,
    guardar_categoria_bd,
    ResultadoSemaforo,
    TOPES_SERVICIOS,
    VIGENCIA_TOPES,
)

router = APIRouter(prefix="/monotributo", tags=["Semáforo Monotributo"])


class CategoriaPayload(BaseModel):
    categoria: str   # "A" … "K"


@router.get("/semaforo", response_model=dict)
def semaforo_monotributo(sb: SupabaseClient = Depends(get_supabase), usuario_id: str = Depends(usuario_id)):
    resultado: ResultadoSemaforo = obtener_semaforo(sb, usuario_id)
    return asdict(resultado)


@router.patch("/categoria", response_model=dict)
def actualizar_categoria(body: CategoriaPayload, sb: SupabaseClient = Depends(get_supabase), usuario_id: str = Depends(usuario_id)):
    """Cambia la categoría del Monotributo y actualiza el semáforo."""
    cat = body.categoria.strip().upper()
    if cat not in TOPES_SERVICIOS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Categoría inválida. Válidas: {list(TOPES_SERVICIOS.keys())}",
        )
    guardar_categoria_bd(sb, cat, usuario_id)
    resultado: ResultadoSemaforo = obtener_semaforo(sb, usuario_id)
    return {
        **asdict(resultado),
        "categorias_disponibles": list(TOPES_SERVICIOS.keys()),
        "vigencia": VIGENCIA_TOPES,
    }


@router.get("/categorias", response_model=dict)
def listar_categorias():
    """Devuelve todas las categorías con sus topes (para el selector de UI)."""
    return {
        "categorias": [
            {"letra": k, "tope_anual": v}
            for k, v in TOPES_SERVICIOS.items()
        ],
        "vigencia": VIGENCIA_TOPES,
    }
