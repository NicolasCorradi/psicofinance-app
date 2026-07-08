# Punto de entrada de la aplicación PsicoFinance Backend.
# Inicializa FastAPI, registra todos los routers y configura middlewares.
# Usa Supabase REST API — sin SQLAlchemy ni conexión directa PostgreSQL.

import logging
import os

import httpx
from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.auth import requerir_usuario
from app.routers import turnos, caja, inflacion, monotributo, copilot, dashboard, agenda, egresos
from app.routers import pacientes as pacientes_router
from app.supabase_client import get_supabase


app = FastAPI(
    title="PsicoFinance API",
    description=(
        "Motor financiero para psicólogos independientes en Argentina. "
        "Gestión de caja, cálculo de licuación por inflación y semáforo Monotributo."
    ),
    version="0.1.0",
)

_cors_raw = os.getenv("ALLOWED_ORIGINS", "*")
_origins = [o.strip() for o in _cors_raw.split(",")] if _cors_raw != "*" else ["*"]

# Con "*" no se permiten credenciales: la combinación wildcard + credentials
# hace que Starlette refleje cualquier Origin, habilitando requests
# credencializados desde sitios arbitrarios.
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=_origins != ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logger = logging.getLogger("psicofinance")


# Los errores de Supabase (timeouts, 5xx de PostgREST) se propagaban como 500
# sin control desde casi todos los CRUD — acá se convierten en un 503 claro.
@app.exception_handler(httpx.HTTPError)
async def supabase_no_disponible(request: Request, exc: httpx.HTTPError):
    logger.error("Error HTTP contra Supabase en %s: %s", request.url.path, exc)
    return JSONResponse(
        status_code=503,
        content={"detail": "Base de datos no disponible. Intentá de nuevo en unos segundos."},
    )


PREFIJO = "/api/v1"
AUTH = [Depends(requerir_usuario)]

app.include_router(turnos.router,           prefix=PREFIJO, dependencies=AUTH)
app.include_router(caja.router,             prefix=PREFIJO, dependencies=AUTH)
app.include_router(inflacion.router,        prefix=PREFIJO, dependencies=AUTH)
app.include_router(monotributo.router,      prefix=PREFIJO, dependencies=AUTH)
app.include_router(copilot.router,          prefix=PREFIJO, dependencies=AUTH)
app.include_router(dashboard.router,        prefix=PREFIJO, dependencies=AUTH)
app.include_router(pacientes_router.router, prefix=PREFIJO, dependencies=AUTH)
app.include_router(agenda.router,           prefix=PREFIJO, dependencies=AUTH)
app.include_router(egresos.router,          prefix=PREFIJO, dependencies=AUTH)


@app.get("/", tags=["Health"])
def health_check():
    return {"status": "ok", "app": "PsicoFinance API", "version": "0.1.0"}


@app.get("/api/v1/keepalive", tags=["Health"])
def keepalive():
    """Hace un query liviano a Supabase para evitar que el proyecto se pause por inactividad."""
    sb = get_supabase()
    sb.select("pacientes", {"select": "id", "limit": "1"})
    return {"status": "ok", "supabase": "alive"}
