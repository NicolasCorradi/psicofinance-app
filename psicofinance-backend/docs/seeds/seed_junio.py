"""
Seed Junio 2026 — datos de demo para la cuenta de Nicolas (multi-tenant).
Completa el mes de junio (fue casi vacio: solo 2 turnos manuales de prueba
y 4 de 7 egresos fijos). Junio ya paso -> mayoria COBRADO, con algunas
deudas viejas (DIFERIDO) e INCOBRABLE que quedaron sin cobrar.
NO borra nada existente. Usa los 20 pacientes y el semana_modelo ya cargados.

Requiere SUPABASE_SERVICE_ROLE_KEY (o toma SUPABASE_KEY del entorno).
"""

import os
import json
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


def get(table, params):
    r = httpx.get(f"{URL}/{table}", headers=H, params=params, timeout=20)
    r.raise_for_status()
    return r.json()


def ins(table, data):
    r = httpx.post(f"{URL}/{table}", headers=H, json=data, timeout=20)
    r.raise_for_status()
    res = r.json()
    return res[0] if isinstance(res, list) else res


def laborables(desde, hasta):
    d = desde
    while d <= hasta:
        if d.weekday() < 5:  # sin feriados entre semana en junio 2026
            yield d
        d += timedelta(days=1)


def main():
    random.seed(626)

    pacientes = get("pacientes", {
        "user_id": f"eq.{UID}",
        "select": "id,nombre,apellido,honorario_actual",
    })
    hon_por_id = {p["id"]: p["honorario_actual"] for p in pacientes}

    modelo_rows = get("configuracion", {"clave": "eq.semana_modelo", "user_id": f"eq.{UID}"})
    slots = json.loads(modelo_rows[0]["valor"])
    agenda_por_dia = {}
    for s in slots:
        wd = s["dia"] - 1  # dia 1=lun...5=vie -> weekday python 0=lun...4=vie
        agenda_por_dia.setdefault(wd, []).append(s["paciente_id"])

    # Turnos ya existentes en junio (los 2 de prueba manual) -> no duplicar
    existentes = get("turnos", {
        "user_id": f"eq.{UID}", "select": "fecha_turno,paciente_id",
        "and": "(fecha_turno.gte.2026-06-01,fecha_turno.lte.2026-06-30)",
    })
    ya_cargado = {(t["fecha_turno"], t["paciente_id"]) for t in existentes}

    print(f"[*] {len(pacientes)} pacientes, {len(ya_cargado)} turnos ya cargados en junio")

    # --- Turnos de junio (mes completo, 1 al 30) ---
    n_cobrado = n_diferido = 0
    total_cobrado = total_diferido = 0.0
    usd_asignados = 0

    dias_junio = list(laborables(date(2026, 6, 1), date(2026, 6, 30)))

    for f in dias_junio:
        pacientes_hoy = agenda_por_dia.get(f.weekday(), [])
        for pac_id in pacientes_hoy:
            if (f.isoformat(), pac_id) in ya_cargado:
                continue
            if random.random() < 0.08:  # ausencias/cancelaciones normales
                continue

            monto = hon_por_id[pac_id]
            # Junio ya paso: casi todo cobrado. Una deuda vieja que quedo
            # pendiente (~4%) simula pacientes que todavia no pagaron.
            estado = "DIFERIDO" if random.random() < 0.04 else "COBRADO"

            turno = {
                "id": str(uuid.uuid4()),
                "user_id": UID,
                "paciente_id": pac_id,
                "fecha_turno": f.isoformat(),
                "monto": monto,
                "estado": estado,
                "origen_pago": "DIRECTO",
                "medio_pago": random.choice(MEDIOS),
                "tipo_sesion": "SESION",
                "moneda": "ARS",
            }

            if usd_asignados < 1 and random.random() < 0.05:
                tipo_cambio = 1020
                turno["moneda"] = "USD"
                turno["monto"] = round(monto / tipo_cambio, 2)
                turno["tipo_cambio"] = tipo_cambio
                usd_asignados += 1

            if estado == "COBRADO":
                turno["fecha_cobro_efectivo"] = f.isoformat()
                total_cobrado += monto
                n_cobrado += 1
            else:
                total_diferido += monto
                n_diferido += 1

            ins("turnos", turno)

    # Un caso INCOBRABLE de junio (paciente distinto al de julio, para variedad)
    incobrable_pac = pacientes[3]["id"]
    ins("turnos", {
        "id": str(uuid.uuid4()),
        "user_id": UID,
        "paciente_id": incobrable_pac,
        "fecha_turno": date(2026, 6, 17).isoformat(),
        "monto": hon_por_id[incobrable_pac],
        "estado": "INCOBRABLE",
        "origen_pago": "DIRECTO",
        "medio_pago": "EFECTIVO",
        "tipo_sesion": "SESION",
        "moneda": "ARS",
    })

    print(f"[T] Turnos junio: {n_cobrado} cobrados (${total_cobrado:,.0f}), "
          f"{n_diferido} diferidos (${total_diferido:,.0f}), 1 incobrable")

    # --- Egresos de junio: completar los 3 fijos que faltaban + variables ---
    FACTOR_JUNIO = 1.12  # alineado a seed_egresos.py / seed_julio.py

    FALTANTES = [
        ("Supervision clinica",   60000, "FIJO", "HONORARIOS", 15, "TRANSFERENCIA", True),
        ("Monotributo",           90000, "FIJO", "IMPUESTOS",  20, "TRANSFERENCIA", True),
        ("Honorarios contadora",  35000, "FIJO", "HONORARIOS", 28, "TRANSFERENCIA", True),
    ]
    VARIABLES = [
        ("Cafe y agua para consultorio", 9000, "INSUMOS",   "MERCADO_PAGO"),
        ("Seminario clinico",           45000, "FORMACION", "MERCADO_PAGO"),
        ("Viaticos jornada profesional", 15000, "OTRO",      "EFECTIVO"),
    ]

    def redondear(m):
        return round(m / 500) * 500

    n_egresos, total_egresos = 0, 0.0
    for desc, base, tipo, cat, dia, medio, rec in FALTANTES:
        f = date(2026, 6, dia)
        monto = redondear(base * FACTOR_JUNIO)
        ins("egresos", {
            "id": str(uuid.uuid4()), "user_id": UID,
            "descripcion": desc, "monto": monto, "tipo": tipo,
            "categoria": cat, "fecha": f.isoformat(),
            "medio_pago": medio, "recurrente": rec,
        })
        n_egresos += 1; total_egresos += monto

    for desc, base, cat, medio in random.sample(VARIABLES, 2):
        dia_v = random.randint(12, 27)
        f = date(2026, 6, dia_v)
        monto = redondear(base * FACTOR_JUNIO * random.uniform(0.85, 1.25))
        ins("egresos", {
            "id": str(uuid.uuid4()), "user_id": UID,
            "descripcion": desc, "monto": monto, "tipo": "VARIABLE",
            "categoria": cat, "fecha": f.isoformat(),
            "medio_pago": medio, "recurrente": False,
        })
        n_egresos += 1; total_egresos += monto

    print(f"[E] Egresos junio: {n_egresos} (${total_egresos:,.0f})")
    print("\n[OK] Datos de junio cargados.")


if __name__ == "__main__":
    main()
