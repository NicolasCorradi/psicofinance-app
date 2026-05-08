# Punto de entrada de la aplicación PsicoFinance Backend.
# Inicializa FastAPI, registra todos los routers y configura middlewares.

import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.routers import turnos, caja, inflacion, monotributo, copilot, dashboard
from app.routers import pacientes as pacientes_router
from app.database import engine, Base
import app.models  # noqa: F401 — registra todos los modelos antes del create_all


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        # Crea tablas nuevas si no existen
        Base.metadata.create_all(bind=engine)

        # En Postgres: migración segura para columnas nuevas
        # En SQLite: create_all ya incluye las columnas del modelo actualizado
        if not engine.url.get_backend_name().startswith("sqlite"):
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS honorario_actual FLOAT"))
                conn.execute(text("ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS fecha_ultimo_ajuste_honorario DATE"))
                conn.commit()

        print("TABLAS OK: Sincronizadas con Supabase")
    except Exception as e:
        print(f"AVISO BD: {e.__class__.__name__} al arrancar. "
              "Endpoints de cálculo funcionan igual.")
    yield


app = FastAPI(
    lifespan=lifespan,
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

app.include_router(turnos.router,          prefix=PREFIJO)
app.include_router(caja.router,            prefix=PREFIJO)
app.include_router(inflacion.router,       prefix=PREFIJO)
app.include_router(monotributo.router,     prefix=PREFIJO)
app.include_router(copilot.router,         prefix=PREFIJO)
app.include_router(dashboard.router,       prefix=PREFIJO)
app.include_router(pacientes_router.router, prefix=PREFIJO)


@app.get("/", tags=["Health"])
def health_check():
    return {"status": "ok", "app": "PsicoFinance API", "version": "0.1.0"}
