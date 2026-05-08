# Importar todos los modelos para que SQLAlchemy y Alembic los descubran
# automáticamente al crear las tablas o generar migraciones.
from app.models.paciente import Paciente
from app.models.turno import Turno, EstadoTurno, OrigenPago
from app.models.liquidacion import Liquidacion

__all__ = ["Paciente", "Turno", "EstadoTurno", "OrigenPago", "Liquidacion"]
