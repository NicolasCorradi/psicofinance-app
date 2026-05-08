# Schemas Pydantic para el flujo de Conciliación de Comprobantes.
# El psicólogo sube una imagen/PDF → Gemini la analiza → genera un borrador
# → el psicólogo lo aprueba → se crea el turno en la BD.

from datetime import date
from pydantic import BaseModel, Field


class DatosBorrador(BaseModel):
    """Datos que Gemini extrae de un comprobante de pago."""
    nombre_emisor: str                     # Nombre del que transfirió
    monto: float = Field(ge=0)             # Monto de la transferencia
    fecha: date                            # Fecha de la operación
    confianza: str                         # "alta" | "media" | "baja"
    advertencia_monto: str | None = None   # Se llena si hay diferencia con honorario esperado


class AprobarBorradorRequest(BaseModel):
    """Body para aprobar un borrador y crear el turno correspondiente."""
    nombre_emisor: str = Field(description="Nombre tal como lo extrajo Gemini o lo editó el psicólogo")
    monto: float = Field(gt=0)
    fecha: date
