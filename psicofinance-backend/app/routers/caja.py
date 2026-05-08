# Router de la Doble Caja.
# Expone el panel financiero principal: Caja Líquida vs Caja Diferida
# con el cálculo de pérdida real por inflación ya incluido.

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.schemas.caja import ResumenCaja
from app.services.caja_service import obtener_resumen_caja

router = APIRouter(prefix="/caja", tags=["Doble Caja"])


@router.get("/resumen", response_model=ResumenCaja)
def resumen_caja(db: Session = Depends(get_db)):
    """
    Devuelve el resumen completo de la Doble Caja del psicólogo.

    Incluye:
    - Caja Líquida: dinero efectivamente cobrado.
    - Caja Diferida nominal: lo que le deben las prepagas (sin ajustar).
    - Caja Diferida real: valor real ajustado por inflación.
    - Pérdida estimada: cuánto poder adquisitivo se está perdiendo hoy.
    """
    return obtener_resumen_caja(db)
