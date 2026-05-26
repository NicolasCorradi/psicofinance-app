# Schemas Pydantic para el Copiloto NLP.

from datetime import date
from pydantic import BaseModel, Field
from app.schemas.turno import TurnoRead


class MensajeHistorial(BaseModel):
    rol: str   # "user" | "assistant"
    texto: str


class ChatRequest(BaseModel):
    """Body del POST /copilot/chat."""
    mensaje: str = Field(
        min_length=3,
        description="Mensaje de voz/texto del psicólogo (ej: 'Vino Martín, pagó 10k con OSDE')",
    )
    historial: list[MensajeHistorial] = []


class DatosExtraidos(BaseModel):
    """Datos estructurados que el NLP extrae del texto libre."""
    paciente:    str
    monto:       float
    es_prepaga:  bool
    obra_social: str | None
    fecha:       date
    confianza:   str        # "alta" | "media" | "baja"
    medio_pago:  str | None = None
    tipo_sesion: str        = "SESION"
    moneda:      str        = "ARS"


class ChatResponse(BaseModel):
    """Respuesta del Copiloto al psicólogo."""
    confirmacion: str
    accion: str  # "turno_registrado" | "datos_insuficientes" | "error_nlp" | "respuesta"
    datos_extraidos: DatosExtraidos | None = None
    turno_creado: TurnoRead | None = None
    paciente_nuevo: bool = False
    transcripcion: str | None = None  # Texto transcripto cuando el input fue audio
