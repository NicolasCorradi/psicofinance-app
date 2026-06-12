# Router de Egresos.
# Usa Supabase REST API via SupabaseClient (sin SQLAlchemy).

import uuid
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Query
from app.supabase_client import SupabaseClient, get_supabase
from app.models.enums import TipoEgreso, CategoriaEgreso
from app.schemas.egreso import (
    EgresoCreate, EgresoRead, EgresoUpdate,
    ResumenEgresos, MesEgresos, CategoriaTotal,
)
from app.crud.egreso import (
    crear_egreso, obtener_egreso, listar_egresos,
    actualizar_egreso, eliminar_egreso,
)

router = APIRouter(prefix="/egresos", tags=["Egresos"])


def _parse_date(val) -> date | None:
    if val is None:
        return None
    if isinstance(val, date):
        return val
    return date.fromisoformat(str(val)[:10])


def _rango_mes(mes: str) -> tuple[date, date]:
    """Convierte 'YYYY-MM' en (primer día, último día) del mes."""
    try:
        anio, num_mes = int(mes[:4]), int(mes[5:7])
        desde = date(anio, num_mes, 1)
    except (ValueError, IndexError):
        raise HTTPException(status_code=422, detail=f"Mes inválido: '{mes}' (formato esperado YYYY-MM)")
    if num_mes == 12:
        hasta = date(anio, 12, 31)
    else:
        hasta = date(anio, num_mes + 1, 1) - timedelta(days=1)
    return desde, hasta


@router.post("/", response_model=EgresoRead, status_code=status.HTTP_201_CREATED)
def registrar_egreso(datos: EgresoCreate, sb: SupabaseClient = Depends(get_supabase)):
    """Registra un egreso nuevo."""
    return crear_egreso(sb, datos)


@router.get("/", response_model=list[EgresoRead])
def listar(
    mes: str | None = Query(default=None, description="Mes a filtrar, formato YYYY-MM"),
    tipo: TipoEgreso | None = Query(default=None),
    categoria: CategoriaEgreso | None = Query(default=None),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    sb: SupabaseClient = Depends(get_supabase),
):
    """Lista egresos con filtros opcionales por mes, tipo y categoría."""
    desde = hasta = None
    if mes:
        desde, hasta = _rango_mes(mes)
    return listar_egresos(sb, desde=desde, hasta=hasta, tipo=tipo, categoria=categoria, offset=offset, limit=limit)


# ⚠ IMPORTANTE: /resumen debe ir ANTES de /{egreso_id} para que FastAPI no
#   intente parsear "resumen" como UUID (mismo gotcha que /turnos/agenda).
@router.get("/resumen", response_model=ResumenEgresos)
def resumen(
    mes: str | None = Query(default=None, description="Mes a consultar, formato YYYY-MM. Default: mes actual"),
    sb: SupabaseClient = Depends(get_supabase),
):
    """Totales fijos vs variables del mes + breakdown por categoría + últimos 6 meses.
    Las agregaciones se hacen en Python sobre un solo select (PostgREST no agrupa)."""
    hoy = date.today()
    mes_str = mes or f"{hoy.year:04d}-{hoy.month:02d}"
    desde_mes, hasta_mes = _rango_mes(mes_str)

    # Un solo select que cubre el mes consultado y los 5 meses anteriores
    inicio_serie = _retroceder_meses(desde_mes, 5)
    rows = sb.select("egresos", {
        "fecha": f"gte.{inicio_serie.isoformat()}",
        "select": "monto,tipo,categoria,fecha",
        "limit": "2000",
    })
    rows = [r for r in rows if (_parse_date(r.get("fecha")) or date.min) <= hasta_mes]

    # Totales del mes consultado
    del_mes = [r for r in rows if desde_mes <= _parse_date(r["fecha"]) <= hasta_mes]
    total_fijos = sum(float(r["monto"] or 0) for r in del_mes if r.get("tipo") == "FIJO")
    total_variables = sum(float(r["monto"] or 0) for r in del_mes if r.get("tipo") == "VARIABLE")

    # Breakdown por categoría del mes
    por_cat: dict[str, float] = {}
    for r in del_mes:
        cat = r.get("categoria") or "OTRO"
        por_cat[cat] = por_cat.get(cat, 0.0) + float(r["monto"] or 0)

    # Serie últimos 6 meses (incluye el consultado)
    serie: list[MesEgresos] = []
    for i in range(5, -1, -1):
        ini = _retroceder_meses(desde_mes, i)
        clave = f"{ini.year:04d}-{ini.month:02d}"
        del_periodo = [r for r in rows if _parse_date(r["fecha"]).strftime("%Y-%m") == clave]
        fijos = sum(float(r["monto"] or 0) for r in del_periodo if r.get("tipo") == "FIJO")
        variables = sum(float(r["monto"] or 0) for r in del_periodo if r.get("tipo") == "VARIABLE")
        cats: dict[str, float] = {}
        for r in del_periodo:
            cat = r.get("categoria") or "OTRO"
            cats[cat] = cats.get(cat, 0.0) + float(r["monto"] or 0)
        serie.append(MesEgresos(mes=clave, fijos=fijos, variables=variables, total=fijos + variables, categorias=cats))

    return ResumenEgresos(
        mes=mes_str,
        total_fijos=total_fijos,
        total_variables=total_variables,
        total=total_fijos + total_variables,
        por_categoria=[
            CategoriaTotal(categoria=c, total=t)
            for c, t in sorted(por_cat.items(), key=lambda x: -x[1])
        ],
        ultimos_6_meses=serie,
    )


def _retroceder_meses(d: date, n: int) -> date:
    """Primer día del mes que está n meses antes de d."""
    total = d.year * 12 + (d.month - 1) - n
    return date(total // 12, total % 12 + 1, 1)


@router.get("/{egreso_id}", response_model=EgresoRead)
def obtener(egreso_id: uuid.UUID, sb: SupabaseClient = Depends(get_supabase)):
    """Devuelve un egreso por su ID."""
    egreso = obtener_egreso(sb, egreso_id)
    if egreso is None:
        raise HTTPException(status_code=404, detail="Egreso no encontrado")
    return egreso


@router.patch("/{egreso_id}", response_model=EgresoRead)
def actualizar(egreso_id: uuid.UUID, datos: EgresoUpdate, sb: SupabaseClient = Depends(get_supabase)):
    """Actualización parcial de un egreso."""
    egreso = actualizar_egreso(sb, egreso_id, datos)
    if egreso is None:
        raise HTTPException(status_code=404, detail="Egreso no encontrado")
    return egreso


@router.delete("/{egreso_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar(egreso_id: uuid.UUID, sb: SupabaseClient = Depends(get_supabase)):
    """Elimina un egreso permanentemente."""
    ok = eliminar_egreso(sb, egreso_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Egreso no encontrado")
