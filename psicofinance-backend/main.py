# Punto de entrada de la aplicación PsicoFinance Backend.
# Inicializa FastAPI, registra todos los routers y configura middlewares.
# Usa Supabase REST API — sin SQLAlchemy ni conexión directa PostgreSQL.

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

PREFIJO = "/api/v1"

app.include_router(turnos.router,           prefix=PREFIJO)
app.include_router(caja.router,             prefix=PREFIJO)
app.include_router(inflacion.router,        prefix=PREFIJO)
app.include_router(monotributo.router,      prefix=PREFIJO)
app.include_router(copilot.router,          prefix=PREFIJO)
app.include_router(dashboard.router,        prefix=PREFIJO)
app.include_router(pacientes_router.router, prefix=PREFIJO)
app.include_router(agenda.router,           prefix=PREFIJO)
app.include_router(egresos.router,          prefix=PREFIJO)


@app.get("/", tags=["Health"])
def health_check():
    return {"status": "ok", "app": "PsicoFinance API", "version": "0.1.0"}


@app.get("/api/v1/keepalive", tags=["Health"])
def keepalive():
    """Hace un query liviano a Supabase para evitar que el proyecto se pause por inactividad."""
    sb = get_supabase()
    result = sb.select("pacientes", {"select": "id", "limit": "1"})
    return {"status": "ok", "supabase": "alive", "rows": len(result)}
