# Router del Semáforo Monotributo.
# Expone el estado fiscal del psicólogo respecto a los topes de AFIP/ARCA.
# Los topes se configuran en el .env (no hardcodeados).

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from dataclasses import asdict
from app.database import get_db
from app.services.monotributo_service import obtener_semaforo, ResultadoSemaforo

router = APIRouter(prefix="/monotributo", tags=["Semáforo Monotributo"])


@router.get("/semaforo", response_model=dict)
def semaforo_monotributo(db: Session = Depends(get_db)):
    """
    Devuelve el estado fiscal de los últimos 12 meses rodantes.

    Estados posibles:
    - VERDE: sin riesgo de recategorización.
    - AMARILLO: superó el umbral de alerta (configurable en .env).
    - ROJO: superó el tope de la categoría actual.
    """
    resultado: ResultadoSemaforo = obtener_semaforo(db)
    return asdict(resultado)
