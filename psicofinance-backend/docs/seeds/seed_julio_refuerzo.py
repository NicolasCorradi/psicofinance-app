"""
Refuerzo de ingresos julio 2026 — cuenta demo de Nicolas.
Julio (1-12) tenia solo ~$767k cobrado contra ~$647k de egresos porque
los egresos fijos del mes ya estaban cargados completos mientras los
ingresos solo cubrian 12 dias. Se agregan sesiones extra (pacientes que
piden un segundo check-in esa semana) para que julio parcial se vea
acorde al resto de los meses. NO borra ni toca lo existente.

Requiere SUPABASE_SERVICE_ROLE_KEY (o toma SUPABASE_KEY del entorno).
"""

import os
import uuid
import random
import httpx
from datetime import date, timedelta

URL = os.environ.get("SUPABASE_URL", "https://dhtlxsodjpbiuvfhkxhx.supabase.co") + "/rest/v1"
KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ["SUPABASE_KEY"]
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}",
     "Content-Type": "application/json", "Prefer": "return=representation"}
UID = "fdff0fcf-5781-4852-a309-59810efec8f7"  # nicolascorradi1@gmail.com

MEDIOS = ["EFECTIVO", "TRANSFERENCIA", "MERCADO_PAGO", "TRANSFERENCIA", "EFECTIVO"]
HOY = date(2026, 7, 12)


def get(table, params):
    r = httpx.get(f"{URL}/{table}", headers=H, params=params, timeout=20)
    r.raise_for_status()
    return r.json()


def ins(table, data):
    r = httpx.post(f"{URL}/{table}", headers=H, json=data, timeout=20)
    r.raise_for_status()
    res = r.json()
    return res[0] if isinstance(res, list) else res


def main():
    random.seed(713)

    pacientes = get("pacientes", {
        "user_id": f"eq.{UID}", "select": "id,honorario_actual",
    })
    hon_por_id = {p["id"]: p["honorario_actual"] for p in pacientes}
    ids = list(hon_por_id.keys())

    existentes = get("turnos", {
        "user_id": f"eq.{UID}", "select": "fecha_turno,paciente_id",
        "and": "(fecha_turno.gte.2026-07-01,fecha_turno.lte.2026-07-31)",
    })
    ocupado = {(t["fecha_turno"], t["paciente_id"]) for t in existentes}

    dias = [date(2026, 7, d) for d in range(1, HOY.day + 1) if date(2026, 7, d).weekday() < 5]

    n, total = 0, 0.0
    objetivo = 16  # sesiones de refuerzo/check-in extra
    intentos = 0
    while n < objetivo and intentos < objetivo * 10:
        intentos += 1
        pac_id = random.choice(ids)
        f = random.choice(dias)
        if (f.isoformat(), pac_id) in ocupado:
            continue
        ocupado.add((f.isoformat(), pac_id))

        monto = hon_por_id[pac_id]
        turno = {
            "id": str(uuid.uuid4()),
            "user_id": UID,
            "paciente_id": pac_id,
            "fecha_turno": f.isoformat(),
            "monto": monto,
            "estado": "COBRADO",
            "origen_pago": "DIRECTO",
            "medio_pago": random.choice(MEDIOS),
            "tipo_sesion": "SESION",
            "moneda": "ARS",
            "fecha_cobro_efectivo": f.isoformat(),
        }
        ins("turnos", turno)
        n += 1
        total += monto

    print(f"[OK] {n} sesiones de refuerzo agregadas en julio (${total:,.0f})")


if __name__ == "__main__":
    main()
