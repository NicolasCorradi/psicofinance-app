# PsicoFinance

> Asistente financiero para consultorios psicológicos en Argentina.

App full-stack que combina gestión de turnos, monitoreo de Monotributo y un copiloto de IA (Gemini) para registrar sesiones por chat o fotografía de comprobantes. Proyecto académico — Trabajo Práctico de Tópicos en Economía Digital.

## Stack

| Capa     | Tech                                                          |
|----------|---------------------------------------------------------------|
| Frontend | Next.js 16 (App Router) · React 19 · TypeScript · Tailwind 4  |
| Backend  | FastAPI · Pydantic v2 · httpx (Supabase REST API, sin ORM)    |
| BD       | PostgreSQL (Supabase) con Row Level Security                  |
| Auth     | Supabase Auth — el backend valida JWT ES256 contra el JWKS    |
| IA       | Google Gemini 2.5 Flash (chat + visión OCR)                   |
| Deploy   | Frontend → Vercel · Backend → Render · CI/CD → GitHub Actions |

## Features

- **Dashboard** — Cash flow del mes, gráfico de ventas, semáforo Monotributo, alertas de honorarios desactualizados, pérdida acumulada por inflación (IPC real del INDEC).
- **Copiloto IA** — Registro de turnos por lenguaje natural (`"Atendí a Valentina hoy, $22.000"`), por audio, y por foto de comprobante de transferencia (Gemini Vision extrae monto/emisor/fecha).
- **Pacientes** — CRUD completo con historial de turnos, edición inline de honorarios y stats agregadas. Tabla en desktop, tarjetas en mobile.
- **Agenda** — Semana real + semana modelo con drag & drop (desktop) o tap-para-asignar (mobile).
- **Egresos** — Gastos fijos/variables por categoría, con resumen mensual y serie de 6 meses.
- **Reportes** — KPIs anuales, top 5 pacientes, estado de resultados, export a CSV, estado fiscal con selector de categoría.
- **Monotributo** — Facturado de los últimos 12 meses rodantes (criterio devengado, configurable) contra el tope de la categoría, con semáforo y alerta de vigencia de la escala ARCA.

## Arquitectura

```
psicofinance-app/
├── psicofinance-backend/       # FastAPI
│   ├── app/
│   │   ├── auth.py             # Validación JWT (JWKS ES256, fallback HS256)
│   │   ├── config.py           # Settings desde .env (pydantic-settings)
│   │   ├── supabase_client.py  # Cliente PostgREST con paginación y upsert
│   │   ├── utils.py            # hoy_argentina(), parse_fecha(), monto_ars()
│   │   ├── routers/            # Endpoints (turnos, pacientes, egresos, dashboard…)
│   │   ├── services/           # Lógica de negocio (finanzas, semáforo, inflación, NLP)
│   │   ├── crud/               # Acceso a datos via Supabase REST
│   │   ├── schemas/            # Pydantic (validación de entrada/salida)
│   │   └── models/enums.py     # Enums compartidos
│   ├── tests/                  # pytest — 58 tests (finanzas, monotributo, caja, inflación)
│   ├── requirements.txt
│   └── render.yaml             # Blueprint de deploy (env vars incluidas)
│
├── psicofinance-frontend/      # Next.js
│   ├── app/                    # App Router: login + (protected)/dashboard|agenda|pacientes|egresos|reportes
│   ├── components/             # UI (layout, dashboard, pacientes, egresos)
│   ├── lib/                    # api.ts (client HTTP c/ token), format.ts, types.ts, supabase/
│   └── proxy.ts                # Protege las rutas con la sesión de Supabase
│
├── .github/workflows/
│   ├── ci.yml                  # Tests + typecheck en cada push
│   ├── keepalive.yml           # Ping 2×/día — evita la pausa del free tier
│   └── backup.yml              # Export semanal de las tablas como artifact
│
├── runtime.txt                 # ⚠ Python version para Render (DEBE estar en el root)
└── render.yaml → psicofinance-backend/render.yaml
```

**Decisiones clave:**
- **Sin ORM**: el backend habla con Supabase por su REST API (PostgREST) vía `httpx`. El cliente pagina con el header `Range` (PostgREST corta en 1000 filas en silencio) y hace upserts atómicos con `on_conflict`.
- **Seguridad en capas**: (1) el frontend manda el token de sesión de Supabase en cada request; (2) el backend valida el JWT contra el JWKS público del proyecto; (3) las tablas tienen RLS activo — la clave publishable no puede leer datos, solo la secret key del backend.
- **Fechas en hora argentina** (`ZoneInfo`): el servidor en Render corre en UTC; sin esto los turnos nocturnos caían en el día siguiente.
- **Montos multi-moneda**: los turnos en USD guardan el tipo de cambio del día y todos los agregados convierten a ARS con `monto_ars()`.

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

Variables requeridas en `.env` (ver `.env.example` para la lista completa):
- `SUPABASE_URL` — URL del proyecto
- `SUPABASE_KEY` — **secret key** (`sb_secret_...`) desde Settings → API Keys
- `AUTH_ENABLED` — `true` en prod; `false` para desarrollo sin login
- `GEMINI_API_KEY` — desde [Google AI Studio](https://aistudio.google.com)
- `SECRET_KEY`, `DATABASE_URL`, `INFLACION_MENSUAL`, `MONOTRIBUTO_TOPE_ANUAL`
- Opcionales: `MONOTRIBUTO_CRITERIO` (`DEVENGADO`/`PERCIBIDO`), `DOLAR_FALLBACK`

### Frontend
```bash
cd psicofinance-frontend
npm install
copy .env.example .env.local     # completar URL del backend y claves de Supabase
npm run dev                      # http://localhost:3000
```

### Tests
```bash
cd psicofinance-backend
python -m pytest tests/          # 58 tests; los de integración se saltean sin BD
```

## Deploy

### Backend → Render (Free tier)
El `render.yaml` (Blueprint) ya define el servicio y las env vars no-secretas. Las secretas se cargan en el dashboard: `SUPABASE_KEY` (la `sb_secret_...`), `DATABASE_URL`, `SECRET_KEY`, `GEMINI_API_KEY`.

**Importante**: Render lee `runtime.txt` del **root del repo**, no del `rootDir`. Por eso vive en la raíz con `python-3.12.0`.

### Frontend → Vercel
Root directory `psicofinance-frontend`. Env vars: `NEXT_PUBLIC_API_URL` (URL de Render), `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` (la **publishable key** `sb_publishable_...`). Deploy automático en cada push.

### Mantenimiento automático (GitHub Actions)
- **Keepalive**: Supabase Free pausa el proyecto tras ~7 días sin actividad y no se despierta solo; el workflow lo pinguea 2×/día a través del backend (mantiene despiertos a ambos).
- **Backup**: export semanal de todas las tablas como artifact (90 días de retención). Requiere los secrets `SUPABASE_URL` y `SUPABASE_SECRET_KEY` en el repo.
- **CI**: pytest + `tsc --noEmit` en cada push a `master`.

## URLs

- Backend (prod): https://psicofinance-backend.onrender.com
- Frontend (prod): https://psicofinance-app.vercel.app

## Notas técnicas

- **Render free tier**: el servicio se duerme tras 15 min sin tráfico → primer request post-sleep tarda 30-60s. El keepalive lo mitiga parcialmente; para eliminarlo del todo, un monitor externo (UptimeRobot) cada 10 min.
- **Python 3.14 incompat**: `psycopg2-binary < 2.9.12` no compila en 3.14. El proyecto está fijado a Python 3.12 vía `runtime.txt`.
- **CORS**: con `ALLOWED_ORIGINS=*` el backend no permite credenciales (reflejar cualquier Origin con credentials es inseguro). En prod se setea el dominio de Vercel explícito.
- **Escala Monotributo**: los topes ARCA tienen fecha de vigencia; al vencer, el semáforo lo advierte. La escala nueva se carga en la tabla `configuracion` de Supabase (clave `monotributo_topes`) sin necesidad de deploy.

## Contexto

Trabajo práctico para Tópicos en Economía Digital · año 2026 · Universidad de Buenos Aires.

Diseño y desarrollo: Nicolás Corradi.
