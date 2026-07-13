"""
Seed Julio 2026 — datos de demo para la cuenta de Nicolas (multi-tenant).
Agrega turnos y egresos de julio SIN borrar nada existente (a diferencia
de seed_data.py). Usa los 20 pacientes y el semana_modelo ya cargados.

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

HOY = date(2026, 7, 12)
FERIADOS = {date(2026, 7, 9)}  # Dia de la Independencia
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
        if d.weekday() < 5 and d not in FERIADOS:
            yield d
        d += timedelta(days=1)


def main():
    random.seed(712)

    pacientes = get("pacientes", {
        "user_id": f"eq.{UID}",
        "select": "id,nombre,apellido,honorario_actual",
    })
    hon_por_id = {p["id"]: p["honorario_actual"] for p in pacientes}
    nombre_por_id = {p["id"]: f'{p["nombre"]} {p["apellido"]}' for p in pacientes}

    modelo_rows = get("configuracion", {"clave": "eq.semana_modelo", "user_id": f"eq.{UID}"})
    slots = json.loads(modelo_rows[0]["valor"])
    # semana_modelo: dia 1=lun...5=vie -> weekday python 0=lun...4=vie
    agenda_por_dia = {}
    for s in slots:
        wd = s["dia"] - 1
        agenda_por_dia.setdefault(wd, []).append(s["paciente_id"])

    print(f"[*] {len(pacientes)} pacientes, agenda de {sum(len(v) for v in agenda_por_dia.values())} slots/semana")

    # --- Turnos de julio (1 al 12) ---
    n_cobrado = n_diferido = n_incobrable = 0
    total_cobrado = total_diferido = 0.0
    usd_asignados = 0

    dias_julio = list(laborables(date(2026, 7, 1), HOY))

    for f in dias_julio:
        pacientes_hoy = agenda_por_dia.get(f.weekday(), [])
        for pac_id in pacientes_hoy:
            if random.random() < 0.08:  # ausencias/cancelaciones normales
                continue

            monto = hon_por_id[pac_id]
            reciente = (HOY - f).days <= 4

            # Distribución de estados: la mayoria cobrado, algunos diferidos
            # (mas probable cuanto mas reciente), y algun caso viejo sin pagar
            if reciente and random.random() < 0.35:
                estado = "DIFERIDO"
            elif not reciente and random.random() < 0.06:
                estado = "DIFERIDO"  # deuda que viene arrastrando
            else:
                estado = "COBRADO"

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

            # Un par de sesiones en USD, para variedad (paciente del exterior)
            if usd_asignados < 2 and random.random() < 0.06:
                tipo_cambio = 1050
                turno["moneda"] = "USD"
                turno["monto"] = round(monto / tipo_cambio, 2)  # mismo valor real, expresado en USD
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

    # Un caso INCOBRABLE explicito (paciente que dejo de venir sin pagar)
    incobrable_pac = pacientes[0]["id"]
    ins("turnos", {
        "id": str(uuid.uuid4()),
        "user_id": UID,
        "paciente_id": incobrable_pac,
        "fecha_turno": date(2026, 7, 2).isoformat(),
        "monto": hon_por_id[incobrable_pac],
        "estado": "INCOBRABLE",
        "origen_pago": "DIRECTO",
        "medio_pago": "EFECTIVO",
        "tipo_sesion": "SESION",
        "moneda": "ARS",
    })
    n_incobrable = 1

    print(f"[T] Turnos julio: {n_cobrado} cobrados (${total_cobrado:,.0f}), "
          f"{n_diferido} diferidos (${total_diferido:,.0f}), {n_incobrable} incobrable")

    # --- Egresos de julio (1 al 12) ---
    FACTOR_JULIO = 1.18  # ~5% sobre junio (1.12), acorde a INFLACION_MENSUAL=0.05

    PLANTILLA_MENSUAL = [
        ("Alquiler consultorio",      380000, "FIJO", "ALQUILER",   3,  "TRANSFERENCIA", True),
        ("Expensas consultorio",       65000, "FIJO", "ALQUILER",   5,  "TRANSFERENCIA", True),
        ("Luz + internet consultorio", 48000, "FIJO", "SERVICIOS", 10,  "MERCADO_PAGO",  True),
        ("Software agenda + Zoom",     22000, "FIJO", "SOFTWARE",   1,  "TARJETA",       True),
    ]
    VARIABLES = [
        ("Libreria e impresiones",  12000, "INSUMOS",   "EFECTIVO"),
        ("Limpieza consultorio",    25000, "INSUMOS",   "EFECTIVO"),
        ("Libros de psicoanalisis", 28000, "FORMACION", "TARJETA"),
    ]

    def redondear(m):
        return round(m / 500) * 500

    n_egresos, total_egresos = 0, 0.0
    for desc, base, tipo, cat, dia, medio, rec in PLANTILLA_MENSUAL:
        f = date(2026, 7, dia)
        if f > HOY:
            continue
        monto = redondear(base * FACTOR_JULIO)
        ins("egresos", {
            "id": str(uuid.uuid4()), "user_id": UID,
            "descripcion": desc, "monto": monto, "tipo": tipo,
            "categoria": cat, "fecha": f.isoformat(),
            "medio_pago": medio, "recurrente": rec,
        })
        n_egresos += 1; total_egresos += monto

    for desc, base, cat, medio in random.sample(VARIABLES, 2):
        dia_v = random.randint(2, min(HOY.day, 27))
        f = date(2026, 7, dia_v)
        monto = redondear(base * FACTOR_JULIO * random.uniform(0.85, 1.25))
        ins("egresos", {
            "id": str(uuid.uuid4()), "user_id": UID,
            "descripcion": desc, "monto": monto, "tipo": "VARIABLE",
            "categoria": cat, "fecha": f.isoformat(),
            "medio_pago": medio, "recurrente": False,
        })
        n_egresos += 1; total_egresos += monto

    print(f"[E] Egresos julio: {n_egresos} (${total_egresos:,.0f})")
    print("\n[OK] Datos de julio cargados.")


if __name__ == "__main__":
    main()
