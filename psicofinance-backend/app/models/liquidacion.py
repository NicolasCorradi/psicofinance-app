# Modelo ORM para la tabla 'liquidaciones'.
# Registra el pago efectivo recibido de una prepaga para uno o más turnos.
# Cuando se crea una liquidacion, el turno asociado pasa a estado COBRADO.

import uuid
from datetime import date, datetime
from sqlalchemy import String, Date, DateTime, Numeric, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Liquidacion(Base):
    __tablename__ = "liquidaciones"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4
    )
    turno_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("turnos.id", ondelete="RESTRICT"), nullable=False
    )
    # Fecha en que la prepaga transfirió el dinero
    fecha_liquidacion: Mapped[date] = mapped_column(Date, nullable=False)
    # Monto efectivamente recibido (puede diferir del monto original por descuentos)
    monto_recibido: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    # Nombre de la prepaga que liquidó
    prepaga: Mapped[str] = mapped_column(String(100), nullable=False)
    # Número de comprobante o referencia interna de la prepaga (opcional)
    referencia: Mapped[str | None] = mapped_column(String(255), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relación al turno que cubre esta liquidación
    turno: Mapped["Turno"] = relationship("Turno", back_populates="liquidaciones")

    def __repr__(self) -> str:
        return f"<Liquidacion {self.prepaga} | ${self.monto_recibido} | {self.fecha_liquidacion}>"
