# PsicoFinance

> Asistente financiero para consultorios psicológicos en Argentina.

App full-stack que combina gestión de turnos, monitoreo de Monotributo y un copiloto de IA (Gemini) para registrar sesiones por chat o fotografía de comprobantes. Proyecto académico — Trabajo Práctico de Tópicos en Economía Digital.

## Stack

| Capa     | Tech                                                         |
|----------|--------------------------------------------------------------|
| Frontend | Next.js 16 (App Router) · React 19 · TypeScript · Tailwind 4 |
| Backend  | FastAPI · SQLAlchemy 2.0 · Pydantic v2 · Alembic             |
| BD       | PostgreSQL (Supabase) en prod · SQLite en dev                |
| IA       | Google Gemini 2.5 Flash (chat + visión OCR)                  |
| Deploy   | Frontend → Vercel · Backend → Render                         |

## Features

- **Dashboard** — Cash flow del mes, gráfico de ventas 12m, semáforo Monotributo, alertas de honorarios desactualizados, pérdida acumulada por inflación.
- **Copiloto IA** — Registro de turnos por lenguaje natural (`"Atendí a Valentina hoy, $22.000"`) y por foto de comprobante de transferencia (Gemini Vision extrae monto/emisor/fecha).
- **Pacientes** — CRUD completo con historial de turnos, edición inline de honorarios y stats agregadas.
- **Reportes** — KPIs anuales, top 5 pacientes, distribución de actividad, estado fiscal con margen disponible.
- **Monotributo** — Cálculo del facturado en los últimos 12 meses rodantes contra el tope de la categoría con semáforo verde/amarillo/rojo.

## Estructura

```
psicofinance-app/
├── psicofinance-backend/     # FastAPI
│   ├── app/
│   │   ├── routes/           # Endpoints
│   │   ├── services/         # Lógica de negocio (NLP, semáforo, inflación)
│   │   ├── models.py         # SQLAlchemy
│   │   └── schemas.py        # Pydantic
│   ├── alembic/              # Migraciones
│   ├── requirements.txt
│   └── runtime.txt           # Python 3.12 (Render lee del root, ver abajo)
│
├── psicofinance-frontend/    # Next.js
│   ├── app/                  # App Router (dashboard, pacientes, reportes)
│   ├── components/           # UI (layout, dashboard, pacientes)
│   ├── lib/                  # API client + types
│   └── public/
│
├── runtime.txt               # ⚠ Python version para Render (DEBE estar en el root)
└── render.yaml               # Config de deploy del backend
```

## Setup local

### Backend
```bash
cd psicofinance-backend
python -m venv venv
.\venv\Scripts\activate          # Windows  (o source venv/bin/activate en Mac/Linux)
pip install -r requirements.txt
copy .env.example .env           # editar con tus claves
uvicorn main:app --reload --port 8001
```

Variables requeridas en `.env`:
- `DATABASE_URL` — `sqlite:///./psicofinance.db` para dev, Postgres para prod
- `SUPABASE_KEY` — service role key (solo si usás Supabase)
- `SECRET_KEY` — string random
- `GEMINI_API_KEY` — desde [Google AI Studio](https://aistudio.google.com)
- `INFLACION_MENSUAL` — `0.05` (5% mensual estimado)
- `MONOTRIBUTO_TOPE_ANUAL` — `16450000` (categoría D 2026)

### Frontend
```bash
cd psicofinance-frontend
npm install
copy .env.example .env.local     # apunta a localhost:8001 por defecto
npm run dev                      # http://localhost:3000
```

## Deploy

### Backend → Render (Free tier)
1. Conectar el repo en Render → New Web Service
2. Root directory: `psicofinance-backend`
3. Build: `pip install -r requirements.txt`
4. Start: `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. Cargar todas las env vars del `.env` en la UI de Render
6. **Importante**: Render lee `runtime.txt` del **root del repo**, no del `rootDir`. Por eso vive en la raíz con `python-3.12.0`.

### Frontend → Vercel
1. Importar repo en Vercel
2. Root directory: `psicofinance-frontend`
3. Env var: `NEXT_PUBLIC_API_URL=https://psicofinance-backend.onrender.com`
4. Deploy automático en cada push a `main`

Una vez deployado el frontend, actualizar `ALLOWED_ORIGINS` en Render con el dominio de Vercel para CORS.

## URLs

- Backend (prod): https://psicofinance-backend.onrender.com
- Frontend (prod): _pendiente — deploy manual en Vercel_

## Notas técnicas

- **Python 3.14 incompat**: `psycopg2-binary < 2.9.12` no compila en Python 3.14. El proyecto está fijado a Python 3.12 vía `runtime.txt` para evitar el problema en Render. Versión `>= 2.9.9` queda flexible para que pip elija la 2.9.12 en caso de upgrade.
- **SQLAlchemy 2.0.30 incompat**: tampoco soporta Python 3.14 (`__firstlineno__`). Usar `>= 2.0.36`.
- **Render free tier**: el servicio se duerme tras 15 min sin tráfico → primer request post-sleep tarda 30-60s en responder.
- **CORS**: el backend acepta `ALLOWED_ORIGINS=*` en dev. En prod, restringir al dominio de Vercel.

## Contexto

Trabajo práctico para Tópicos en Economía Digital · año 2026 · Universidad de Buenos Aires.

Diseño y desarrollo: Nicolás Corradi.
