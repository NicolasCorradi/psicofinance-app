"""Enums compartidos — sin dependencia de SQLAlchemy ni database.py."""
import enum


class EstadoTurno(str, enum.Enum):
    COBRADO = "COBRADO"
    DIFERIDO = "DIFERIDO"
    INCOBRABLE = "INCOBRABLE"


class OrigenPago(str, enum.Enum):
    DIRECTO = "DIRECTO"
    PREPAGA = "PREPAGA"
