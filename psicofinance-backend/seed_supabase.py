import os
import requests
import uuid
from datetime import datetime

from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://dhtlxsodjpbiuvfhkxhx.supabase.co")
# Requiere la service_role key (Supabase → Settings → API) en la variable de entorno.
# NUNCA hardcodearla: bypasea RLS y da acceso total a la base.
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
H = {
    "apikey": KEY,
    "Authorization": f"Bearer {KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}

def uid():
    return str(uuid.uuid4())

now = datetime.utcnow().isoformat()

# Limpiar
print("Limpiando datos anteriores...")
requests.delete(f"{SUPABASE_URL}/rest/v1/turnos", headers=H, params={"id": "neq.00000000-0000-0000-0000-000000000000"}, timeout=30).raise_for_status()
requests.delete(f"{SUPABASE_URL}/rest/v1/pacientes", headers=H, params={"id": "neq.00000000-0000-0000-0000-000000000000"}, timeout=30).raise_for_status()
print("Limpio.")

# Pacientes
PACIENTES = [
    {"id": uid(), "nombre": "Valentina", "apellido": "Herrera",   "honorario_actual": 22000, "fecha_ultimo_ajuste_honorario": "2026-03-01", "created_at": now},
    {"id": uid(), "nombre": "Martin",    "apellido": "Gutierrez", "honorario_actual": 18000, "fecha_ultimo_ajuste_honorario": "2025-08-01", "created_at": now},
    {"id": uid(), "nombre": "Ana",       "apellido": "Lopez",     "honorario_actual": 16000, "fecha_ultimo_ajuste_honorario": "2025-10-01", "created_at": now},
    {"id": uid(), "nombre": "Diego",     "apellido": "Fernandez", "honorario_actual": 20000, "fecha_ultimo_ajuste_honorario": "2026-01-01", "created_at": now},
    {"id": uid(), "nombre": "Laura",     "apellido": "Mendez",    "honorario_actual": 15000, "fecha_ultimo_ajuste_honorario": "2025-12-01", "created_at": now},
    {"id": uid(), "nombre": "Tomas",     "apellido": "Rios",      "honorario_actual": 24000, "fecha_ultimo_ajuste_honorario": "2026-04-01", "created_at": now},
    {"id": uid(), "nombre": "Sofia",     "apellido": "Rodriguez", "honorario_actual":  9000, "fecha_ultimo_ajuste_honorario": "2026-02-01", "created_at": now},
    {"id": uid(), "nombre": "Cecilia",   "apellido": "Vargas",    "honorario_actual": 18000, "fecha_ultimo_ajuste_honorario": "2026-05-01", "created_at": now},
    {"id": uid(), "nombre": "Federico",  "apellido": "Morales",   "honorario_actual": 25000, "fecha_ultimo_ajuste_honorario": "2026-04-01", "created_at": now},
    {"id": uid(), "nombre": "Camila",    "apellido": "Suarez",    "honorario_actual": 21000, "fecha_ultimo_ajuste_honorario": "2025-11-01", "created_at": now},
]

print(f"Insertando {len(PACIENTES)} pacientes...")
r = requests.post(f"{SUPABASE_URL}/rest/v1/pacientes", headers=H, json=PACIENTES, timeout=30)
r.raise_for_status()
pac_map = {p["nombre"]: p["id"] for p in PACIENTES}
print("Pacientes OK")

# Turnos
TURNOS_DEF = [
    ("Valentina", "2025-11-04", 18000, "COBRADO",    "DIRECTO", None,            "2025-11-04"),
    ("Martin",    "2025-11-06", 18000, "COBRADO",    "DIRECTO", None,            "2025-11-06"),
    ("Ana",       "2025-11-10",  9500, "COBRADO",    "PREPAGA", "OSDE",          "2025-11-28"),
    ("Diego",     "2025-11-13", 17000, "COBRADO",    "DIRECTO", None,            "2025-11-13"),
    ("Laura",     "2025-11-18",  8500, "INCOBRABLE", "PREPAGA", "Galeno",        None),
    ("Camila",    "2025-11-20", 19000, "COBRADO",    "DIRECTO", None,            "2025-11-20"),
    ("Valentina", "2025-12-02", 18000, "COBRADO",    "DIRECTO", None,            "2025-12-02"),
    ("Martin",    "2025-12-04", 18000, "COBRADO",    "DIRECTO", None,            "2025-12-04"),
    ("Tomas",     "2025-12-09", 22000, "COBRADO",    "DIRECTO", None,            "2025-12-09"),
    ("Sofia",     "2025-12-11",  8500, "COBRADO",    "PREPAGA", "Swiss Medical", "2025-12-30"),
    ("Ana",       "2025-12-16",  9500, "COBRADO",    "PREPAGA", "OSDE",          "2025-12-30"),
    ("Diego",     "2025-12-18", 17000, "COBRADO",    "DIRECTO", None,            "2025-12-18"),
    ("Laura",     "2025-12-20", 14000, "COBRADO",    "DIRECTO", None,            "2025-12-20"),
    ("Federico",  "2025-12-23", 23000, "COBRADO",    "DIRECTO", None,            "2025-12-23"),
    ("Camila",    "2025-12-26", 19000, "COBRADO",    "DIRECTO", None,            "2025-12-26"),
    ("Valentina", "2026-01-06", 20000, "COBRADO",    "DIRECTO", None,            "2026-01-06"),
    ("Martin",    "2026-01-08", 18000, "COBRADO",    "DIRECTO", None,            "2026-01-08"),
    ("Tomas",     "2026-01-13", 22000, "COBRADO",    "DIRECTO", None,            "2026-01-13"),
    ("Cecilia",   "2026-01-15", 17000, "COBRADO",    "DIRECTO", None,            "2026-01-15"),
    ("Sofia",     "2026-01-20",  8500, "COBRADO",    "PREPAGA", "Swiss Medical", "2026-01-31"),
    ("Laura",     "2026-01-27", 14000, "COBRADO",    "DIRECTO", None,            "2026-01-27"),
    ("Federico",  "2026-01-29", 23000, "COBRADO",    "DIRECTO", None,            "2026-01-29"),
    ("Camila",    "2026-01-31", 19000, "COBRADO",    "DIRECTO", None,            "2026-01-31"),
    ("Valentina", "2026-02-03", 20000, "COBRADO",    "DIRECTO", None,            "2026-02-03"),
    ("Martin",    "2026-02-05", 18000, "COBRADO",    "DIRECTO", None,            "2026-02-05"),
    ("Diego",     "2026-02-10", 20000, "COBRADO",    "DIRECTO", None,            "2026-02-10"),
    ("Tomas",     "2026-02-12", 22000, "COBRADO",    "DIRECTO", None,            "2026-02-12"),
    ("Cecilia",   "2026-02-17", 17000, "COBRADO",    "DIRECTO", None,            "2026-02-17"),
    ("Laura",     "2026-02-19", 14000, "COBRADO",    "DIRECTO", None,            "2026-02-19"),
    ("Sofia",     "2026-02-26",  9000, "COBRADO",    "PREPAGA", "Swiss Medical", "2026-02-28"),
    ("Federico",  "2026-02-27", 25000, "COBRADO",    "DIRECTO", None,            "2026-02-27"),
    ("Valentina", "2026-03-03", 22000, "COBRADO",    "DIRECTO", None,            "2026-03-03"),
    ("Martin",    "2026-03-05", 18000, "COBRADO",    "DIRECTO", None,            "2026-03-05"),
    ("Diego",     "2026-03-07", 20000, "COBRADO",    "DIRECTO", None,            "2026-03-07"),
    ("Tomas",     "2026-03-10", 24000, "COBRADO",    "DIRECTO", None,            "2026-03-10"),
    ("Cecilia",   "2026-03-12", 18000, "COBRADO",    "DIRECTO", None,            "2026-03-12"),
    ("Laura",     "2026-03-14", 15000, "COBRADO",    "DIRECTO", None,            "2026-03-14"),
    ("Sofia",     "2026-03-18",  9000, "COBRADO",    "PREPAGA", "Swiss Medical", "2026-03-31"),
    ("Ana",       "2026-03-19", 10000, "COBRADO",    "PREPAGA", "Medife",        "2026-03-31"),
    ("Valentina", "2026-03-24", 22000, "COBRADO",    "DIRECTO", None,            "2026-03-24"),
    ("Diego",     "2026-03-26", 20000, "COBRADO",    "DIRECTO", None,            "2026-03-26"),
    ("Federico",  "2026-03-28", 25000, "COBRADO",    "DIRECTO", None,            "2026-03-28"),
    ("Camila",    "2026-03-31", 21000, "COBRADO",    "DIRECTO", None,            "2026-03-31"),
    ("Valentina", "2026-04-01", 22000, "COBRADO",    "DIRECTO", None,            "2026-04-01"),
    ("Martin",    "2026-04-03", 18000, "COBRADO",    "DIRECTO", None,            "2026-04-03"),
    ("Tomas",     "2026-04-07", 24000, "COBRADO",    "DIRECTO", None,            "2026-04-07"),
    ("Cecilia",   "2026-04-09", 18000, "COBRADO",    "DIRECTO", None,            "2026-04-09"),
    ("Diego",     "2026-04-11", 20000, "COBRADO",    "DIRECTO", None,            "2026-04-11"),
    ("Laura",     "2026-04-14", 15000, "COBRADO",    "DIRECTO", None,            "2026-04-14"),
    ("Sofia",     "2026-04-16",  9000, "DIFERIDO",   "PREPAGA", "Swiss Medical", None),
    ("Ana",       "2026-04-17", 10000, "DIFERIDO",   "PREPAGA", "Medife",        None),
    ("Valentina", "2026-04-22", 22000, "COBRADO",    "DIRECTO", None,            "2026-04-22"),
    ("Martin",    "2026-04-24", 18000, "COBRADO",    "DIRECTO", None,            "2026-04-24"),
    ("Diego",     "2026-04-25", 20000, "COBRADO",    "DIRECTO", None,            "2026-04-25"),
    ("Federico",  "2026-04-28", 25000, "COBRADO",    "DIRECTO", None,            "2026-04-28"),
    ("Camila",    "2026-04-29", 21000, "COBRADO",    "DIRECTO", None,            "2026-04-29"),
    ("Valentina", "2026-05-02", 22000, "COBRADO",    "DIRECTO", None,            "2026-05-02"),
    ("Tomas",     "2026-05-05", 24000, "COBRADO",    "DIRECTO", None,            "2026-05-05"),
    ("Martin",    "2026-05-06", 18000, "COBRADO",    "DIRECTO", None,            "2026-05-06"),
    ("Diego",     "2026-05-07", 20000, "DIFERIDO",   "DIRECTO", None,            None),
    ("Cecilia",   "2026-05-08", 18000, "COBRADO",    "DIRECTO", None,            "2026-05-08"),
    ("Laura",     "2026-05-09", 15000, "DIFERIDO",   "DIRECTO", None,            None),
    ("Sofia",     "2026-05-09",  9000, "DIFERIDO",   "PREPAGA", "Swiss Medical", None),
]

turnos = []
for nombre, fecha, monto, estado, origen, prepaga, fecha_ef in TURNOS_DEF:
    pid = pac_map.get(nombre)
    if not pid:
        continue
    t = {
        "id": uid(),
        "paciente_id": pid,
        "fecha_turno": fecha,
        "monto": monto,
        "estado": estado,
        "origen_pago": origen,
        "created_at": now,
        "updated_at": now,
    }
    if prepaga:
        t["prepaga"] = prepaga
    if fecha_ef:
        t["fecha_cobro_efectivo"] = fecha_ef
    turnos.append(t)

print(f"Insertando {len(turnos)} turnos uno a uno...")
ok = 0
for t in turnos:
    r = requests.post(f"{SUPABASE_URL}/rest/v1/turnos", headers=H, json=[t], timeout=30)
    if r.status_code in (200, 201):
        ok += 1
    else:
        print(f"  ERROR: {r.status_code} {r.text[:200]} — turno {t.get('fecha_turno')} {t.get('estado')}")
print(f"Turnos OK: {ok}/{len(turnos)}")
print(f"\nSEED COMPLETO: {len(PACIENTES)} pacientes, {ok} turnos")
