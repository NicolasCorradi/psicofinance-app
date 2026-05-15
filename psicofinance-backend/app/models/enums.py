"""Enums compartidos — sin dependencia de SQLAlchemy ni database.py."""
import enum


class EstadoTurno(str, enum.Enum):
    COBRADO = "COBRADO"
    DIFERIDO = "DIFERIDO"
    INCOBRABLE = "INCOBRABLE"


class OrigenPago(str, enum.Enum):
    DIRECTO = "DIRECTO"
    PREPAGA = "PREPAGA"


class MedioPago(str, enum.Enum):
    EFECTIVO       = "EFECTIVO"
    TRANSFERENCIA  = "TRANSFERENCIA"
    MERCADO_PAGO   = "MERCADO_PAGO"
    TARJETA        = "TARJETA"
    OTRO           = "OTRO"


class Moneda(str, enum.Enum):
    ARS = "ARS"
    USD = "USD"


class TipoSesion(str, enum.Enum):
    SESION                   = "SESION"               # sesión normal
    INASISTENCIA_JUSTIFICADA = "INASISTENCIA_JUSTIFICADA"   # paciente avisó → no se cobra
    INASISTENCIA_INJUSTIFICADA = "INASISTENCIA_INJUSTIFICADA" # paciente no avisó → se cobra
    CANCELACION_PROFESIONAL  = "CANCELACION_PROFESIONAL"    # el psicólogo canceló → no se cobra
