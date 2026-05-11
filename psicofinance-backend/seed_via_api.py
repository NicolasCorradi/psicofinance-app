"""
Seed via API REST — no requiere acceso directo a la BD.
Crea pacientes y turnos llamando al backend deployado en Render.
Uso: python seed_via_api.py
"""

import requests
from datetime import date

BASE = "https://psicofinance-backend.onrender.com/api/v1"

def post(path, data):
    r = requests.post(f"{BASE}{path}", json=data, timeout=60)
    r.raise_for_status()
    return r.json()

# ── 1. Pacientes ──────────────────────────────────────────────────────────────
print("Creando pacientes...")

PACIENTES_DEF = [
    {"nombre": "Valentina", "apellido": "Herrera",    "honorario_actual": 22000, "fecha_ultimo_ajuste_honorario": "2026-03-01"},
    {"nombre": "Martín",    "apellido": "Gutiérrez",  "honorario_actual": 18000, "fecha_ultimo_ajuste_honorario": "2025-08-01"},
    {"nombre": "Ana",       "apellido": "López",      "honorario_actual": 16000, "fecha_ultimo_ajuste_honorario": "2025-10-01"},
    {"nombre": "Diego",     "apellido": "Fernández",  "honorario_actual": 20000, "fecha_ultimo_ajuste_honorario": "2026-01-01"},
    {"nombre": "Laura",     "apellido": "Méndez",     "honorario_actual": 15000, "fecha_ultimo_ajuste_honorario": "2025-12-01"},
    {"nombre": "Tomás",     "apellido": "Ríos",       "honorario_actual": 24000, "fecha_ultimo_ajuste_honorario": "2026-04-01"},
    {"nombre": "Sofía",     "apellido": "Rodríguez",  "honorario_actual": 9000,  "fecha_ultimo_ajuste_honorario": "2026-02-01"},
    {"nombre": "Cecilia",   "apellido": "Vargas",     "honorario_actual": 18000, "fecha_ultimo_ajuste_honorario": "2026-05-01"},
    {"nombre": "Federico",  "apellido": "Morales",    "honorario_actual": 25000, "fecha_ultimo_ajuste_honorario": "2026-04-01"},
    {"nombre": "Camila",    "apellido": "Suárez",     "honorario_actual": 21000, "fecha_ultimo_ajuste_honorario": "2025-11-01"},
]

pac = {}
for p in PACIENTES_DEF:
    try:
        r = post("/pacientes/", p)
        pac[p["nombre"]] = r["id"]
        print(f"  ✓ {p['nombre']} {p['apellido']}")
    except Exception as e:
        print(f"  ✗ {p['nombre']}: {e}")

# ── 2. Turnos ─────────────────────────────────────────────────────────────────
print("\nCreando turnos...")

TURNOS = [
    # Noviembre 2025
    ("Valentina", "2025-11-04", 18000, "COBRADO",    "DIRECTO",  None,            "2025-11-04"),
    ("Martín",    "2025-11-06", 18000, "COBRADO",    "DIRECTO",  None,            "2025-11-06"),
    ("Ana",       "2025-11-10",  9500, "COBRADO",    "PREPAGA",  "OSDE",          "2025-11-28"),
    ("Diego",     "2025-11-13", 17000, "COBRADO",    "DIRECTO",  None,            "2025-11-13"),
    ("Laura",     "2025-11-18",  8500, "INCOBRABLE", "PREPAGA",  "Galeno",        None),
    ("Camila",    "2025-11-20", 19000, "COBRADO",    "DIRECTO",  None,            "2025-11-20"),
    # Diciembre 2025
    ("Valentina", "2025-12-02", 18000, "COBRADO",    "DIRECTO",  None,            "2025-12-02"),
    ("Martín",    "2025-12-04", 18000, "COBRADO",    "DIRECTO",  None,            "2025-12-04"),
    ("Tomás",     "2025-12-09", 22000, "COBRADO",    "DIRECTO",  None,            "2025-12-09"),
    ("Sofía",     "2025-12-11",  8500, "COBRADO",    "PREPAGA",  "Swiss Medical", "2025-12-30"),
    ("Ana",       "2025-12-16",  9500, "COBRADO",    "PREPAGA",  "OSDE",          "2025-12-30"),
    ("Diego",     "2025-12-18", 17000, "COBRADO",    "DIRECTO",  None,            "2025-12-18"),
    ("Laura",     "2025-12-20", 14000, "COBRADO",    "DIRECTO",  None,            "2025-12-20"),
    ("Federico",  "2025-12-23", 23000, "COBRADO",    "DIRECTO",  None,            "2025-12-23"),
    ("Camila",    "2025-12-26", 19000, "COBRADO",    "DIRECTO",  None,            "2025-12-26"),
    # Enero 2026
    ("Valentina", "2026-01-06", 20000, "COBRADO",    "DIRECTO",  None,            "2026-01-06"),
    ("Martín",    "2026-01-08", 18000, "COBRADO",    "DIRECTO",  None,            "2026-01-08"),
    ("Tomás",     "2026-01-13", 22000, "COBRADO",    "DIRECTO",  None,            "2026-01-13"),
    ("Cecilia",   "2026-01-15", 17000, "COBRADO",    "DIRECTO",  None,            "2026-01-15"),
    ("Sofía",     "2026-01-20",  8500, "COBRADO",    "PREPAGA",  "Swiss Medical", "2026-01-31"),
    ("Ana",       "2026-01-22",  9500, "DIFERIDO",   "PREPAGA",  "OSDE",          None),
    ("Laura",     "2026-01-27", 14000, "COBRADO",    "DIRECTO",  None,            "2026-01-27"),
    ("Federico",  "2026-01-29", 23000, "COBRADO",    "DIRECTO",  None,            "2026-01-29"),
    ("Camila",    "2026-01-31", 19000, "COBRADO",    "DIRECTO",  None,            "2026-01-31"),
    # Febrero 2026
    ("Valentina", "2026-02-03", 20000, "COBRADO",    "DIRECTO",  None,            "2026-02-03"),
    ("Martín",    "2026-02-05", 18000, "COBRADO",    "DIRECTO",  None,            "2026-02-05"),
    ("Diego",     "2026-02-10", 20000, "COBRADO",    "DIRECTO",  None,            "2026-02-10"),
    ("Tomás",     "2026-02-12", 22000, "COBRADO",    "DIRECTO",  None,            "2026-02-12"),
    ("Cecilia",   "2026-02-17", 17000, "COBRADO",    "DIRECTO",  None,            "2026-02-17"),
    ("Laura",     "2026-02-19", 14000, "COBRADO",    "DIRECTO",  None,            "2026-02-19"),
    ("Ana",       "2026-02-24",  9500, "DIFERIDO",   "PREPAGA",  "OSDE",          None),
    ("Sofía",     "2026-02-26",  9000, "COBRADO",    "PREPAGA",  "Swiss Medical", "2026-02-28"),
    ("Federico",  "2026-02-27", 25000, "COBRADO",    "DIRECTO",  None,            "2026-02-27"),
    # Marzo 2026
    ("Valentina", "2026-03-03", 22000, "COBRADO",    "DIRECTO",  None,            "2026-03-03"),
    ("Martín",    "2026-03-05", 18000, "COBRADO",    "DIRECTO",  None,            "2026-03-05"),
    ("Diego",     "2026-03-07", 20000, "COBRADO",    "DIRECTO",  None,            "2026-03-07"),
    ("Tomás",     "2026-03-10", 24000, "COBRADO",    "DIRECTO",  None,            "2026-03-10"),
    ("Cecilia",   "2026-03-12", 18000, "COBRADO",    "DIRECTO",  None,            "2026-03-12"),
    ("Laura",     "2026-03-14", 15000, "COBRADO",    "DIRECTO",  None,            "2026-03-14"),
    ("Sofía",     "2026-03-18",  9000, "COBRADO",    "PREPAGA",  "Swiss Medical", "2026-03-31"),
    ("Ana",       "2026-03-19", 10000, "COBRADO",    "PREPAGA",  "Medifé",        "2026-03-31"),
    ("Valentina", "2026-03-24", 22000, "COBRADO",    "DIRECTO",  None,            "2026-03-24"),
    ("Diego",     "2026-03-26", 20000, "COBRADO",    "DIRECTO",  None,            "2026-03-26"),
    ("Federico",  "2026-03-28", 25000, "COBRADO",    "DIRECTO",  None,            "2026-03-28"),
    ("Camila",    "2026-03-31", 21000, "COBRADO",    "DIRECTO",  None,            "2026-03-31"),
    # Abril 2026
    ("Valentina", "2026-04-01", 22000, "COBRADO",    "DIRECTO",  None,            "2026-04-01"),
    ("Martín",    "2026-04-03", 18000, "COBRADO",    "DIRECTO",  None,            "2026-04-03"),
    ("Tomás",     "2026-04-07", 24000, "COBRADO",    "DIRECTO",  None,            "2026-04-07"),
    ("Cecilia",   "2026-04-09", 18000, "COBRADO",    "DIRECTO",  None,            "2026-04-09"),
    ("Diego",     "2026-04-11", 20000, "COBRADO",    "DIRECTO",  None,            "2026-04-11"),
    ("Laura",     "2026-04-14", 15000, "COBRADO",    "DIRECTO",  None,            "2026-04-14"),
    ("Sofía",     "2026-04-16",  9000, "COBRADO",    "PREPAGA",  "Swiss Medical", "2026-04-30"),
    ("Ana",       "2026-04-17", 10000, "COBRADO",    "PREPAGA",  "Medifé",        "2026-04-30"),
    ("Valentina", "2026-04-22", 22000, "COBRADO",    "DIRECTO",  None,            "2026-04-22"),
    ("Martín",    "2026-04-24", 18000, "COBRADO",    "DIRECTO",  None,            "2026-04-24"),
    ("Diego",     "2026-04-25", 20000, "COBRADO",    "DIRECTO",  None,            "2026-04-25"),
    ("Federico",  "2026-04-28", 25000, "COBRADO",    "DIRECTO",  None,            "2026-04-28"),
    ("Camila",    "2026-04-29", 21000, "COBRADO",    "DIRECTO",  None,            "2026-04-29"),
    # Mayo 2026
    ("Valentina", "2026-05-02", 22000, "COBRADO",    "DIRECTO",  None,            "2026-05-02"),
    ("Tomás",     "2026-05-05", 24000, "COBRADO",    "DIRECTO",  None,            "2026-05-05"),
    ("Martín",    "2026-05-06", 18000, "COBRADO",    "DIRECTO",  None,            "2026-05-06"),
    ("Diego",     "2026-05-07", 20000, "DIFERIDO",   "DIRECTO",  None,            None),
    ("Ana",       "2026-05-08", 10000, "DIFERIDO",   "PREPAGA",  "Medifé",        None),
    ("Cecilia",   "2026-05-08", 18000, "COBRADO",    "DIRECTO",  None,            "2026-05-08"),
    ("Laura",     "2026-05-09", 15000, "DIFERIDO",   "DIRECTO",  None,            None),
    ("Sofía",     "2026-05-09",  9000, "DIFERIDO",   "PREPAGA",  "Swiss Medical", None),
]

ok = 0
for nombre, fecha, monto, estado, origen, prepaga, fecha_ef in TURNOS:
    pid = pac.get(nombre)
    if not pid:
        print(f"  ✗ {nombre} no encontrado")
        continue
    body = {
        "paciente_id": pid,
        "fecha_turno": fecha,
        "monto": monto,
        "estado": estado,
        "origen_pago": origen,
    }
    if prepaga:
        body["prepaga"] = prepaga
    if estado == "DIFERIDO" and origen == "PREPAGA":
        # fecha_cobro_estimada requerida
        yr, mo, dy = fecha.split("-")
        import calendar
        last = calendar.monthrange(int(yr), int(mo))[1]
        body["fecha_cobro_estimada"] = f"{yr}-{mo}-{last:02d}"
    if fecha_ef:
        body["fecha_cobro_efectivo"] = fecha_ef

    try:
        post("/turnos/", body)
        ok += 1
        print(f"  ✓ {nombre} {fecha} ${monto:,}")
    except Exception as e:
        print(f"  ✗ {nombre} {fecha}: {e}")

print(f"\n✅ Seed completo: {len(PACIENTES_DEF)} pacientes, {ok}/{len(TURNOS)} turnos.")
