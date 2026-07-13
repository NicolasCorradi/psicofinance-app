"""
Seed Egresos PsicoFinance — ene-jun 2026.
Gastos realistas de consultorio: alquiler, monotributo, servicios,
software, supervision, formacion e insumos. Montos escalan con inflacion
(mismo criterio que seed_data.py). Total mensual ~$420k-680k vs ingresos ~$1.4M.
Inserta via API local (valida los endpoints de paso).
"""

import random
import httpx
from datetime import date

API = "http://127.0.0.1:8001/api/v1/egresos/"

# Factor de inflacion por mes (alineado al seed de ingresos)
FACTOR = {
    "2026-01": 0.48, "2026-02": 0.57, "2026-03": 0.66,
    "2026-04": 0.78, "2026-05": 1.00, "2026-06": 1.12,
}

# (descripcion, monto_base_mayo, tipo, categoria, dia, medio_pago, recurrente)
PLANTILLA_MENSUAL = [
    ("Alquiler consultorio",            380000, "FIJO",     "ALQUILER",   3,  "TRANSFERENCIA", True),
    ("Expensas consultorio",             65000, "FIJO",     "ALQUILER",   5,  "TRANSFERENCIA", True),
    ("Monotributo",                      90000, "FIJO",     "IMPUESTOS", 20,  "TRANSFERENCIA", True),
    ("Luz + internet consultorio",       48000, "FIJO",     "SERVICIOS", 10,  "MERCADO_PAGO",  True),
    ("Software agenda + Zoom",           22000, "FIJO",     "SOFTWARE",   1,  "TARJETA",       True),
    ("Supervision clinica",              60000, "FIJO",     "HONORARIOS", 15, "TRANSFERENCIA", True),
    ("Honorarios contadora",             35000, "FIJO",     "HONORARIOS", 28, "TRANSFERENCIA", True),
]

# Gastos variables esporadicos: (descripcion, monto_base, categoria, medio)
VARIABLES = [
    ("Libreria e impresiones",        12000, "INSUMOS",   "EFECTIVO"),
    ("Cafe y agua para consultorio",   9000, "INSUMOS",   "MERCADO_PAGO"),
    ("Limpieza consultorio",          25000, "INSUMOS",   "EFECTIVO"),
    ("Seminario clinico",             45000, "FORMACION", "MERCADO_PAGO"),
    ("Libros de psicoanalisis",       28000, "FORMACION", "TARJETA"),
    ("Curso actualizacion online",    38000, "FORMACION", "TARJETA"),
    ("Viaticos jornada profesional",  15000, "OTRO",      "EFECTIVO"),
    ("Regaleria fin de mes pacientes", 8000, "OTRO",      "EFECTIVO"),
]

MESES = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"]
HOY = date(2026, 6, 11)


def redondear(monto: float) -> int:
    return round(monto / 500) * 500


def main():
    random.seed(7)
    n, total = 0, 0.0
    stats = {}

    with httpx.Client(timeout=30) as client:
        for mes_key in MESES:
            anio, mes = int(mes_key[:4]), int(mes_key[5:7])
            factor = FACTOR[mes_key]

            # Fijos mensuales
            for desc, base, tipo, cat, dia, medio, rec in PLANTILLA_MENSUAL:
                f = date(anio, mes, dia)
                if f > HOY:
                    continue
                monto = redondear(base * factor)
                r = client.post(API, json={
                    "descripcion": desc, "monto": monto, "tipo": tipo,
                    "categoria": cat, "fecha": f.isoformat(),
                    "medio_pago": medio, "recurrente": rec,
                })
                r.raise_for_status()
                s = stats.setdefault(mes_key, [0, 0.0]); s[0] += 1; s[1] += monto
                n += 1; total += monto

            # 2-4 variables al azar por mes
            for desc, base, cat, medio in random.sample(VARIABLES, random.randint(2, 4)):
                dia_v = random.randint(2, 27)
                f = date(anio, mes, dia_v)
                if f > HOY:
                    continue
                monto = redondear(base * factor * random.uniform(0.85, 1.25))
                r = client.post(API, json={
                    "descripcion": desc, "monto": monto, "tipo": "VARIABLE",
                    "categoria": cat, "fecha": f.isoformat(),
                    "medio_pago": medio, "recurrente": False,
                })
                r.raise_for_status()
                s = stats.setdefault(mes_key, [0, 0.0]); s[0] += 1; s[1] += monto
                n += 1; total += monto

    print(f"[OK] {n} egresos | total ${total:,.0f}\n")
    print(f"{'Mes':<10} {'Egresos':>8} {'Total':>14}")
    print("-" * 34)
    for k in sorted(stats):
        c, t = stats[k]
        print(f"{k:<10} {c:>8} ${t:>13,.0f}")


if __name__ == "__main__":
    main()
