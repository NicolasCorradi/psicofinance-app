# Schemas Pydantic para la entidad Paciente.
# PacienteConStats es el DTO principal para la pantalla de lista.
# PacienteDetalle agrega el historial completo de turnos.

import uuid
from datetime import date, datetime
from pydantic import BaseModel, Field
from app.models.enums import EstadoTurno, OrigenPago, MedioPago, TipoSesion


# ── Sub-schema de turno (para el historial dentro del detalle de paciente) ───

class TurnoEnDetalle(BaseModel):
    id:                   uuid.UUID
    fecha_turno:          date
    monto:                float
    estado:               EstadoTurno
    origen_pago:          OrigenPago
    prepaga:              str | None
    fecha_cobro_estimada: date | None
    fecha_cobro_efectivo: date | None
    medio_pago:           MedioPago | None = None
    tipo_sesion:          TipoSesion = TipoSesion.SESION
    moneda:               str | None = "ARS"  # nullable: turnos viejos pueden tener NULL en BD
    tipo_cambio:          float | None = None
    created_at:           datetime

    model_config = {"from_attributes": True}


# ── Paciente base ─────────────────────────────────────────────────────────────

class PacienteBase(BaseModel):
    nombre:   str = Field(min_length=1, max_length=100)
    apellido: str = Field(min_length=1, max_length=100)
    email:    str | None = None
    honorario_actual:              float | None = Field(default=None, gt=0)
    fecha_ultimo_ajuste_honorario: date  | None = None


class PacienteCreate(PacienteBase):
    pass


class PacienteUpdate(BaseModel):
    """Todos los campos opcionales — solo se actualizan los enviados."""
    nombre:   str | None = Field(default=None, min_length=1, max_length=100)
    apellido: str | None = Field(default=None, min_length=1, max_length=100)
    email:    str | None = None
    honorario_actual:              float | None = Field(default=None, gt=0)
    fecha_ultimo_ajuste_honorario: date  | None = None


class PacienteRead(PacienteBase):
    id:         uuid.UUID
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Paciente con estadísticas agregadas (para la lista) ─────────────────────

class PacienteConStats(PacienteRead):
    total_sesiones:    int
    ultima_sesion:     date | None
    dias_inactivo:     int  | None   # días desde la última sesión
    cobrado_total:     float
    pendiente:         float          # DIFERIDO
    sesiones_mes:      int            # turnos en el mes calendario actual


# ── Detalle completo de paciente (para el panel lateral) ────────────────────

class PacienteDetalle(PacienteConStats):
    turnos: list[TurnoEnDetalle]
