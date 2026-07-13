"""
Seed PsicoFinance — 20 pacientes, sesion semanal cada uno.
Honorarios $22k-$45k. Crecimiento mes a mes dic25-may26.
May (15 dias) ~$1.4M cobrado.
"""

import os
import uuid, random, json
import httpx
from datetime import date, timedelta

URL = os.environ.get("SUPABASE_URL", "https://dhtlxsodjpbiuvfhkxhx.supabase.co") + "/rest/v1"
# Service role key desde el entorno — NUNCA hardcodearla (bypasea RLS)
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}",
     "Content-Type": "application/json", "Prefer": "return=representation"}
HOY = date(2026, 5, 15)

# 20 pacientes — 4 por dia de la semana (lun=0 ... vie=4)
# (dia_semana, hora, honorario_base_mayo, fecha_ultimo_ajuste)
PACIENTES = [
    # Lunes
    {"nombre":"Martina",   "apellido":"Lopez",     "dia":0, "hora":"09:00", "honorario":35000, "ajuste":"2025-08-01"},
    {"nombre":"Laura",     "apellido":"Gomez",     "dia":0, "hora":"11:00", "honorario":28000, "ajuste":"2025-10-01"},
    {"nombre":"Ana",       "apellido":"Beltran",   "dia":0, "hora":"14:00", "honorario":32000, "ajuste":"2026-03-01"},
    {"nombre":"Matias",    "apellido":"Blanco",    "dia":0, "hora":"16:00", "honorario":42000, "ajuste":"2026-05-01"},
    # Martes
    {"nombre":"Diego",     "apellido":"Fernandez", "dia":1, "hora":"09:00", "honorario":40000, "ajuste":"2025-09-01"},
    {"nombre":"Valentina", "apellido":"Ruiz",      "dia":1, "hora":"11:00", "honorario":35000, "ajuste":"2026-02-01"},
    {"nombre":"Tomas",     "apellido":"Quiroga",   "dia":1, "hora":"14:00", "honorario":38000, "ajuste":"2026-04-01"},
    {"nombre":"Carolina",  "apellido":"Nunez",     "dia":1, "hora":"17:00", "honorario":30000, "ajuste":"2026-05-01"},
    # Miercoles
    {"nombre":"Sebastian", "apellido":"Torres",    "dia":2, "hora":"09:00", "honorario":45000, "ajuste":"2025-11-01"},
    {"nombre":"Nicolas",   "apellido":"Rios",      "dia":2, "hora":"11:00", "honorario":35000, "ajuste":"2026-04-01"},
    {"nombre":"Sofia",     "apellido":"Herrera",   "dia":2, "hora":"14:00", "honorario":30000, "ajuste":"2026-01-01"},
    {"nombre":"Rodrigo",   "apellido":"Pinto",     "dia":2, "hora":"16:00", "honorario":35000, "ajuste":"2026-05-01"},
    # Jueves
    {"nombre":"Camila",    "apellido":"Sosa",      "dia":3, "hora":"09:00", "honorario":40000, "ajuste":"2026-05-01"},
    {"nombre":"Lucas",     "apellido":"Ramirez",   "dia":3, "hora":"11:00", "honorario":35000, "ajuste":"2026-03-01"},
    {"nombre":"Lucia",     "apellido":"Moreno",    "dia":3, "hora":"14:00", "honorario":32000, "ajuste":"2026-04-01"},
    {"nombre":"Daniela",   "apellido":"Fuentes",   "dia":3, "hora":"16:00", "honorario":38000, "ajuste":"2025-12-01"},
    # Viernes
    {"nombre":"Facundo",   "apellido":"Mendez",    "dia":4, "hora":"09:00", "honorario":28000, "ajuste":"2026-05-01"},
    {"nombre":"Florencia", "apellido":"Vega",      "dia":4, "hora":"11:00", "honorario":28000, "ajuste":"2026-02-01"},
    {"nombre":"Andres",    "apellido":"Castillo",  "dia":4, "hora":"14:00", "honorario":28000, "ajuste":"2026-04-01"},
    {"nombre":"Pablo",     "apellido":"Medina",    "dia":4, "hora":"16:00", "honorario":30000, "ajuste":"2026-05-01"},
]

# Factor de honorario por mes (ajustes por inflacion)
FACTOR = {
    "2025-12": 0.40,
    "2026-01": 0.48,
    "2026-02": 0.57,
    "2026-03": 0.66,
    "2026-04": 0.78,
    "2026-05": 1.00,
}

FERIADOS = {
    date(2025,12,24), date(2025,12,25), date(2025,12,31),
    date(2026,1,1), date(2026,1,2), date(2026,1,3),
}
MEDIOS = ["EFECTIVO","TRANSFERENCIA","MERCADO_PAGO","TRANSFERENCIA","EFECTIVO","EFECTIVO"]


def ins(table, data):
    r = httpx.post(f"{URL}/{table}", headers=H, json=data, timeout=20)
    r.raise_for_status()
    res = r.json()
    return res[0] if isinstance(res, list) else res

def del_all(table):
    httpx.delete(f"{URL}/{table}", headers=H,
                 params={"id": "neq.00000000-0000-0000-0000-000000000000"},
                 timeout=20).raise_for_status()

def laborables(desde, hasta):
    d = desde
    while d <= hasta:
        if d.weekday() < 5 and d not in FERIADOS:
            yield d
        d += timedelta(days=1)

def hon(pac_idx, mes_key):
    base = PACIENTES[pac_idx]["honorario"]
    return round(base * FACTOR.get(mes_key, 1.0) / 1000) * 1000


def main():
    random.seed(99)

    print("[*] Limpiando...")
    del_all("turnos")
    del_all("pacientes")

    print("[P] Creando 20 pacientes...")
    creados = []
    for p in PACIENTES:
        row = ins("pacientes", {
            "id": str(uuid.uuid4()),
            "nombre": p["nombre"], "apellido": p["apellido"],
            "honorario_actual": p["honorario"],
            "fecha_ultimo_ajuste_honorario": p["ajuste"],
        })
        creados.append(row)
    print(f"   OK {len(creados)} pacientes")

    print("[T] Generando turnos...")
    stats = {}
    n = 0

    periodos = [
        (date(2025,12,1),  date(2025,12,31)),
        (date(2026,1,5),   date(2026,1,31)),
        (date(2026,2,2),   date(2026,2,28)),
        (date(2026,3,2),   date(2026,3,31)),
        (date(2026,4,1),   date(2026,4,30)),
    ]

    # Dic-Abr: todo COBRADO
    for desde, hasta in periodos:
        for f in laborables(desde, hasta):
            mes_key = f.strftime("%Y-%m")
            for i, pac in enumerate(creados):
                if f.weekday() != PACIENTES[i]["dia"]:
                    continue
                skip = 0.18 if mes_key in ("2025-12","2026-01") else 0.08
                if random.random() < skip:
                    continue
                h = hon(i, mes_key)
                ins("turnos", {
                    "id": str(uuid.uuid4()),
                    "paciente_id": pac["id"],
                    "fecha_turno": f.isoformat(),
                    "monto": h, "estado": "COBRADO",
                    "origen_pago": "DIRECTO",
                    "medio_pago": random.choice(MEDIOS),
                    "tipo_sesion": "SESION", "moneda": "ARS",
                    "fecha_cobro_efectivo": f.isoformat(),
                })
                s = stats.setdefault(mes_key, {"cobrado": 0, "n": 0})
                s["cobrado"] += h; s["n"] += 1
                n += 1
                if n % 40 == 0:
                    print(f"   ... {n} turnos")

    # Mayo: cobrados + diferidos recientes
    for f in laborables(date(2026,5,1), HOY):
        mes_key = "2026-05"
        for i, pac in enumerate(creados):
            if f.weekday() != PACIENTES[i]["dia"]:
                continue
            if random.random() < 0.07:
                continue
            h = hon(i, mes_key)
            reciente = (HOY - f).days <= 5
            if reciente and random.random() < 0.30:
                estado = "DIFERIDO"; cobro = None
            else:
                estado = "COBRADO"; cobro = f.isoformat()
            turno = {
                "id": str(uuid.uuid4()),
                "paciente_id": pac["id"],
                "fecha_turno": f.isoformat(),
                "monto": h, "estado": estado,
                "origen_pago": "DIRECTO",
                "medio_pago": random.choice(MEDIOS),
                "tipo_sesion": "SESION", "moneda": "ARS",
            }
            if cobro:
                turno["fecha_cobro_efectivo"] = cobro
            ins("turnos", turno)
            s = stats.setdefault(mes_key, {"cobrado": 0, "n": 0})
            if estado == "COBRADO":
                s["cobrado"] += h; s["n"] += 1
            n += 1

    # Semana modelo con los 20 pacientes
    print("\n[M] Semana modelo...")
    ids = {f'{p["nombre"]} {p["apellido"]}': p["id"] for p in creados}
    dia_map = {0:1, 1:2, 2:3, 3:4, 4:5}  # python weekday -> modelo (1=lun...5=vie)
    slots = []
    for i, p in enumerate(PACIENTES):
        pid_key = f'{p["nombre"]} {p["apellido"]}'
        slots.append({
            "dia": dia_map[p["dia"]],
            "hora": p["hora"],
            "paciente_id": ids[pid_key],
            "paciente_nombre": pid_key,
        })
    valor = json.dumps(slots, ensure_ascii=False)
    r = httpx.patch(f"{URL}/configuracion", headers=H,
                    params={"clave": "eq.semana_modelo"}, json={"valor": valor}, timeout=15)
    if not r.json():
        httpx.post(f"{URL}/configuracion", headers=H,
                   json={"clave": "semana_modelo", "valor": valor}, timeout=15)

    print(f"\n[OK] {n} turnos | {len(creados)} pacientes\n")
    print(f"{'Mes':<10} {'Cobrado':>14}  {'Sesiones':>9}")
    print("-" * 36)
    for k in sorted(stats):
        s = stats[k]
        print(f"{k:<10} ${s['cobrado']:>13,.0f}  {s['n']:>9}")

if __name__ == "__main__":
    main()
