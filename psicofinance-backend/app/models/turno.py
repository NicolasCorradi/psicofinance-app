# Modelo ORM para la tabla 'turnos'.
# Es la entidad central del sistema: representa cada sesión del psicólogo.
# El estado y origen_pago determinan si el turno alimenta la Caja Líquida o la Diferida.

import uuid
import enum
from datetime import date, datetime
from sqlalchemy import String, Date, DateTime, Numeric, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import Enum as SAEnum
from app.database import Base


class EstadoTurno(str, enum.Enum):
    """Estado de cobro del turno."""
    COBRADO = "COBRADO"         # El psicólogo ya recibió el dinero
    DIFERIDO = "DIFERIDO"       # Pendiente de cobro (ej: en proceso con prepaga)
    INCOBRABLE = "INCOBRABLE"   # El psicólogo da el monto por perdido


class OrigenPago(str, enum.Enum):
    """Canal de pago del turno."""
    DIRECTO = "DIRECTO"   # El paciente paga de su bolsillo (efectivo/transferencia)
    PREPAGA = "PREPAGA"   # La obra social liquida al psicólogo con demora


class Turno(Base):
    __tablename__ = "turnos"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4
    )
    paciente_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("pacientes.id", ondelete="RESTRICT"), nullable=False
    )
    fecha_turno: Mapped[date] = mapped_column(Date, nullable=False)
    monto: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)

    estado: Mapped[EstadoTurno] = mapped_column(
        SAEnum(EstadoTurno), nullable=False, default=EstadoTurno.DIFERIDO
    )
    origen_pago: Mapped[OrigenPago] = mapped_column(
        SAEnum(OrigenPago), nullable=False, default=OrigenPago.DIRECTO
    )

    # Fecha en que la prepaga estima pagar (se carga al registrar el turno)
    fecha_cobro_estimada: Mapped[date | None] = mapped_column(Date, nullable=True)
    # Fecha en que el psicólogo confirmó que cobró (se actualiza cuando llega el pago)
    fecha_cobro_efectivo: Mapped[date | None] = mapped_column(Date, nullable=True)

    # Nombre de la prepaga (solo si origen_pago = PREPAGA)
    prepaga: Mapped[str | None] = mapped_column(String(100), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relaciones
    paciente: Mapped["Paciente"] = relationship("Paciente", back_populates="turnos")
    liquidaciones: Mapped[list["Liquidacion"]] = relationship(
        "Liquidacion", back_populates="turno"
    )

    def __repr__(self) -> str:
        return f"<Turno {self.fecha_turno} | ${self.monto} | {self.estado}>"
