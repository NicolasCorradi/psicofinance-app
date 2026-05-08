# Modelo ORM para la tabla 'pacientes'.
# Representa al paciente del psicólogo (no almacena datos clínicos, solo administrativos).

import uuid
from datetime import datetime, date
from sqlalchemy import String, DateTime, Float, Date, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Paciente(Base):
    __tablename__ = "pacientes"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4
    )
    nombre:   Mapped[str] = mapped_column(String(100), nullable=False)
    apellido: Mapped[str] = mapped_column(String(100), nullable=False)

    # Email opcional: se usa para notificaciones futuras
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Honorarios — base para el widget de alertas
    honorario_actual: Mapped[float | None] = mapped_column(Float, nullable=True)
    fecha_ultimo_ajuste_honorario: Mapped[date | None] = mapped_column(Date, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relación inversa: lista de turnos del paciente
    turnos: Mapped[list["Turno"]] = relationship("Turno", back_populates="paciente")

    def __repr__(self) -> str:
        return f"<Paciente {self.apellido}, {self.nombre}>"
