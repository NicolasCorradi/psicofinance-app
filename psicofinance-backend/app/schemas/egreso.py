# Schemas Pydantic para la entidad Egreso.
# Validan y tipan los datos que entran y salen de los endpoints HTTP.

import uuid
from datetime import date, datetime
from pydantic import BaseModel, Field
from app.models.enums import TipoEgreso, CategoriaEgreso, MedioPago


class EgresoBase(BaseModel):
    """Campos comunes a todas las operaciones sobre egresos."""
    descripcion: str = Field(min_length=1, max_length=200)
    monto: float = Field(gt=0, description="Monto en ARS, siempre positivo")
    tipo: TipoEgreso
    categoria: CategoriaEgreso = CategoriaEgreso.OTRO
    fecha: date
    medio_pago: MedioPago | None = None
    recurrente: bool = False
    notas: str | None = None


class EgresoCreate(EgresoBase):
    """Schema para crear un egreso nuevo (POST /egresos)."""
    pass


class EgresoUpdate(BaseModel):
    """Schema para actualizar un egreso (PATCH /egresos/{id}).
    Todos los campos son opcionales: solo se actualizan los que se envían."""
    descripcion: str | None = Field(default=None, min_length=1, max_length=200)
    monto: float | None = Field(default=None, gt=0)
    tipo: TipoEgreso | None = None
    categoria: CategoriaEgreso | None = None
    fecha: date | None = None
    medio_pago: MedioPago | None = None
    recurrente: bool | None = None
    notas: str | None = None


class EgresoRead(EgresoBase):
    """Schema de respuesta al leer un egreso."""
    id: uuid.UUID
    user_id: uuid.UUID | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class MesEgresos(BaseModel):
    """Totales de un mes para la serie histórica."""
    mes: str  # "YYYY-MM"
    fijos: float
    variables: float
    total: float
    categorias: dict[str, float] = Field(default_factory=dict)


class CategoriaTotal(BaseModel):
    categoria: CategoriaEgreso
    total: float


class ResumenEgresos(BaseModel):
    """Respuesta de GET /egresos/resumen."""
    mes: str  # "YYYY-MM" del mes consultado
    total_fijos: float
    total_variables: float
    total: float
    por_categoria: list[CategoriaTotal]
    ultimos_6_meses: list[MesEgresos]
