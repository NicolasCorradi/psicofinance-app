# Schemas Pydantic para la entidad Turno.
# Validan y tipan los datos que entran y salen de los endpoints HTTP.
# Separados del modelo ORM para no acoplar la API a la estructura de la BD.

import uuid
from datetime import date, datetime
from pydantic import BaseModel, Field, model_validator
from app.models.enums import EstadoTurno, OrigenPago, MedioPago, TipoSesion, Moneda


class TurnoBase(BaseModel):
    """Campos comunes a todas las operaciones sobre turnos."""
    paciente_id: uuid.UUID
    fecha_turno: date
    monto: float = Field(ge=0, description="Monto en la moneda indicada (0 para inasistencias no cobradas)")
    estado: EstadoTurno = EstadoTurno.DIFERIDO
    origen_pago: OrigenPago = OrigenPago.DIRECTO
    fecha_cobro_estimada: date | None = None
    prepaga: str | None = None
    medio_pago: MedioPago | None = None
    tipo_sesion: TipoSesion = TipoSesion.SESION
    moneda: Moneda = Moneda.ARS
    tipo_cambio: float | None = None  # ARS/USD al momento del registro


class TurnoCreate(TurnoBase):
    """Schema para crear un turno nuevo (POST /turnos)."""
    fecha_cobro_efectivo: date | None = None

    @model_validator(mode="after")
    def validar_prepaga(self) -> "TurnoCreate":
        # Si el pago es via prepaga, la fecha estimada de cobro es obligatoria
        if self.origen_pago == OrigenPago.PREPAGA and self.fecha_cobro_estimada is None:
            raise ValueError(
                "fecha_cobro_estimada es obligatoria cuando origen_pago es PREPAGA"
            )
        return self


class TurnoUpdate(BaseModel):
    """Schema para actualizar un turno (PATCH /turnos/{id}).
    Todos los campos son opcionales: solo se actualizan los que se envían."""
    estado: EstadoTurno | None = None
    fecha_cobro_efectivo: date | None = None
    fecha_cobro_estimada: date | None = None
    monto: float | None = Field(default=None, ge=0)
    prepaga: str | None = None
    medio_pago: MedioPago | None = None
    tipo_sesion: TipoSesion | None = None
    moneda: Moneda | None = None
    tipo_cambio: float | None = None


class TurnoRead(TurnoBase):
    """Schema de respuesta al leer un turno (incluye campos generados por la BD)."""
    id: uuid.UUID
    fecha_cobro_efectivo: date | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
