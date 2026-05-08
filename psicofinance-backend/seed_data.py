"""
Seed realista para PsicoFinance.
Crea pacientes con honorarios históricos y 6 meses de turnos variados.
Ejecutar: python seed_data.py (desde psicofinance-backend/)
"""

import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from datetime import date, timedelta
from dateutil.relativedelta import relativedelta
from app.database import SessionLocal
from app.models.paciente import Paciente
from app.models.turno import Turno, EstadoTurno, OrigenPago

db = SessionLocal()

# ── 1. Pacientes ─────────────────────────────────────────────────────────────
# Cada uno tiene honorario actual y fecha del último ajuste
# (algunos desactualizados para activar las alertas)

PACIENTES = [
    # nombre, apellido, honorario_actual, meses_desde_ajuste
    ("Valentina", "Herrera",   22000, 2),   # reciente — sin alerta
    ("Martín",    "Gutiérrez", 18000, 9),   # 9 meses — alerta alta
    ("Ana",       "López",     16000, 7),   # 7 meses — alerta alta
    ("Diego",     "Fernández", 20000, 4),   # 4 meses — alerta media
    ("Laura",     "Méndez",    15000, 5),   # 5 meses — alerta media
    ("Tomás",     "Ríos",      24000, 1),   # reciente — sin alerta
    ("Sofía",     "Rodríguez", 9000,  3),   # justo en el umbral
    ("Cecilia",   "Vargas",    18000, 0),   # ajustado este mes
]

hoy = date.today()

# Eliminar pacientes/turnos de seed anterior para poder correr múltiples veces
db.query(Turno).delete()
db.query(Paciente).delete()
db.commit()

pacientes_obj = []
for nombre, apellido, honorario, meses_atras in PACIENTES:
    fecha_ajuste = (hoy - relativedelta(months=meses_atras)).replace(day=1)
    p = Paciente(
        nombre=nombre,
        apellido=apellido,
        honorario_actual=float(honorario),
        fecha_ultimo_ajuste_honorario=fecha_ajuste if meses_atras > 0 else hoy,
    )
    db.add(p)
    pacientes_obj.append((p, honorario))

db.flush()  # Para tener los IDs

# ── 2. Turnos — 6 meses de historia ──────────────────────────────────────────
# Mezcla de COBRADO / DIFERIDO / INCOBRABLE, directo y prepaga

PREPAGAS = ["OSDE", "Swiss Medical", "Galeno", "Medifé", None]

def turno(paciente, fecha_t, monto, estado, origen, prepaga=None,
          fecha_cobro_est=None, fecha_cobro_ef=None):
    return Turno(
        paciente_id=paciente.id,
        fecha_turno=fecha_t,
        monto=float(monto),
        estado=estado,
        origen_pago=origen,
        prepaga=prepaga,
        fecha_cobro_estimada=fecha_cobro_est,
        fecha_cobro_efectivo=fecha_cobro_ef,
    )

turnos = []
p = {p.nombre: p for p, _ in pacientes_obj}

# ─── Noviembre 2025 ───────────────────────────────────────────────────────────
turnos += [
    turno(p["Valentina"], date(2025,11, 4), 18000, EstadoTurno.COBRADO,  OrigenPago.DIRECTO,  fecha_cobro_ef=date(2025,11, 4)),
    turno(p["Martín"],    date(2025,11, 6), 18000, EstadoTurno.COBRADO,  OrigenPago.DIRECTO,  fecha_cobro_ef=date(2025,11, 6)),
    turno(p["Ana"],       date(2025,11,10),  9500, EstadoTurno.COBRADO,  OrigenPago.PREPAGA,  prepaga="OSDE",          fecha_cobro_ef=date(2025,11,28)),
    turno(p["Diego"],     date(2025,11,13), 17000, EstadoTurno.COBRADO,  OrigenPago.DIRECTO,  fecha_cobro_ef=date(2025,11,13)),
    turno(p["Laura"],     date(2025,11,18),  8500, EstadoTurno.INCOBRABLE,OrigenPago.PREPAGA, prepaga="Galeno"),
]

# ─── Diciembre 2025 ───────────────────────────────────────────────────────────
turnos += [
    turno(p["Valentina"], date(2025,12, 2), 18000, EstadoTurno.COBRADO,  OrigenPago.DIRECTO,  fecha_cobro_ef=date(2025,12, 2)),
    turno(p["Martín"],    date(2025,12, 4), 18000, EstadoTurno.COBRADO,  OrigenPago.DIRECTO,  fecha_cobro_ef=date(2025,12, 4)),
    turno(p["Tomás"],     date(2025,12, 9), 22000, EstadoTurno.COBRADO,  OrigenPago.DIRECTO,  fecha_cobro_ef=date(2025,12, 9)),
    turno(p["Sofía"],     date(2025,12,11),  8500, EstadoTurno.COBRADO,  OrigenPago.PREPAGA,  prepaga="Swiss Medical", fecha_cobro_ef=date(2025,12,30)),
    turno(p["Ana"],       date(2025,12,16),  9500, EstadoTurno.COBRADO,  OrigenPago.PREPAGA,  prepaga="OSDE",          fecha_cobro_ef=date(2025,12,30)),
    turno(p["Diego"],     date(2025,12,18), 17000, EstadoTurno.COBRADO,  OrigenPago.DIRECTO,  fecha_cobro_ef=date(2025,12,18)),
    turno(p["Laura"],     date(2025,12,20), 14000, EstadoTurno.COBRADO,  OrigenPago.DIRECTO,  fecha_cobro_ef=date(2025,12,20)),
]

# ─── Enero 2026 ───────────────────────────────────────────────────────────────
turnos += [
    turno(p["Valentina"], date(2026, 1, 6), 20000, EstadoTurno.COBRADO,  OrigenPago.DIRECTO,  fecha_cobro_ef=date(2026, 1, 6)),
    turno(p["Martín"],    date(2026, 1, 8), 18000, EstadoTurno.COBRADO,  OrigenPago.DIRECTO,  fecha_cobro_ef=date(2026, 1, 8)),
    turno(p["Tomás"],     date(2026, 1,13), 22000, EstadoTurno.COBRADO,  OrigenPago.DIRECTO,  fecha_cobro_ef=date(2026, 1,13)),
    turno(p["Cecilia"],   date(2026, 1,15), 17000, EstadoTurno.COBRADO,  OrigenPago.DIRECTO,  fecha_cobro_ef=date(2026, 1,15)),
    turno(p["Sofía"],     date(2026, 1,20),  8500, EstadoTurno.COBRADO,  OrigenPago.PREPAGA,  prepaga="Swiss Medical", fecha_cobro_ef=date(2026, 1,31)),
    turno(p["Ana"],       date(2026, 1,22),  9500, EstadoTurno.DIFERIDO, OrigenPago.PREPAGA,  prepaga="OSDE",          fecha_cobro_est=date(2026, 1,31)),
    turno(p["Laura"],     date(2026, 1,27), 14000, EstadoTurno.COBRADO,  OrigenPago.DIRECTO,  fecha_cobro_ef=date(2026, 1,27)),
]

# ─── Febrero 2026 ─────────────────────────────────────────────────────────────
turnos += [
    turno(p["Valentina"], date(2026, 2, 3), 20000, EstadoTurno.COBRADO,  OrigenPago.DIRECTO,  fecha_cobro_ef=date(2026, 2, 3)),
    turno(p["Martín"],    date(2026, 2, 5), 18000, EstadoTurno.COBRADO,  OrigenPago.DIRECTO,  fecha_cobro_ef=date(2026, 2, 5)),
    turno(p["Diego"],     date(2026, 2,10), 20000, EstadoTurno.COBRADO,  OrigenPago.DIRECTO,  fecha_cobro_ef=date(2026, 2,10)),
    turno(p["Tomás"],     date(2026, 2,12), 22000, EstadoTurno.COBRADO,  OrigenPago.DIRECTO,  fecha_cobro_ef=date(2026, 2,12)),
    turno(p["Cecilia"],   date(2026, 2,17), 17000, EstadoTurno.COBRADO,  OrigenPago.DIRECTO,  fecha_cobro_ef=date(2026, 2,17)),
    turno(p["Laura"],     date(2026, 2,19), 14000, EstadoTurno.COBRADO,  OrigenPago.DIRECTO,  fecha_cobro_ef=date(2026, 2,19)),
    turno(p["Ana"],       date(2026, 2,24),  9500, EstadoTurno.DIFERIDO, OrigenPago.PREPAGA,  prepaga="OSDE",          fecha_cobro_est=date(2026, 2,28)),
    turno(p["Sofía"],     date(2026, 2,26),  8500, EstadoTurno.COBRADO,  OrigenPago.PREPAGA,  prepaga="Swiss Medical", fecha_cobro_ef=date(2026, 2,28)),
]

# ─── Marzo 2026 ───────────────────────────────────────────────────────────────
turnos += [
    turno(p["Valentina"], date(2026, 3, 3), 22000, EstadoTurno.COBRADO,  OrigenPago.DIRECTO,  fecha_cobro_ef=date(2026, 3, 3)),
    turno(p["Martín"],    date(2026, 3, 5), 18000, EstadoTurno.COBRADO,  OrigenPago.DIRECTO,  fecha_cobro_ef=date(2026, 3, 5)),
    turno(p["Diego"],     date(2026, 3, 7), 20000, EstadoTurno.COBRADO,  OrigenPago.DIRECTO,  fecha_cobro_ef=date(2026, 3, 7)),
    turno(p["Tomás"],     date(2026, 3,10), 24000, EstadoTurno.COBRADO,  OrigenPago.DIRECTO,  fecha_cobro_ef=date(2026, 3,10)),
    turno(p["Cecilia"],   date(2026, 3,12), 18000, EstadoTurno.COBRADO,  OrigenPago.DIRECTO,  fecha_cobro_ef=date(2026, 3,12)),
    turno(p["Laura"],     date(2026, 3,14), 15000, EstadoTurno.COBRADO,  OrigenPago.DIRECTO,  fecha_cobro_ef=date(2026, 3,14)),
    turno(p["Sofía"],     date(2026, 3,18),  9000, EstadoTurno.COBRADO,  OrigenPago.PREPAGA,  prepaga="Swiss Medical", fecha_cobro_ef=date(2026, 3,31)),
    turno(p["Ana"],       date(2026, 3,19), 10000, EstadoTurno.COBRADO,  OrigenPago.PREPAGA,  prepaga="Medifé",        fecha_cobro_ef=date(2026, 3,31)),
    turno(p["Valentina"], date(2026, 3,24), 22000, EstadoTurno.COBRADO,  OrigenPago.DIRECTO,  fecha_cobro_ef=date(2026, 3,24)),
    turno(p["Diego"],     date(2026, 3,26), 20000, EstadoTurno.COBRADO,  OrigenPago.DIRECTO,  fecha_cobro_ef=date(2026, 3,26)),
]

# ─── Abril 2026 (mes actual) ──────────────────────────────────────────────────
turnos += [
    turno(p["Valentina"], date(2026, 4, 1), 22000, EstadoTurno.COBRADO,  OrigenPago.DIRECTO,  fecha_cobro_ef=date(2026, 4, 1)),
    turno(p["Martín"],    date(2026, 4, 3), 18000, EstadoTurno.COBRADO,  OrigenPago.DIRECTO,  fecha_cobro_ef=date(2026, 4, 3)),
    turno(p["Tomás"],     date(2026, 4, 7), 24000, EstadoTurno.COBRADO,  OrigenPago.DIRECTO,  fecha_cobro_ef=date(2026, 4, 7)),
    turno(p["Cecilia"],   date(2026, 4, 9), 18000, EstadoTurno.COBRADO,  OrigenPago.DIRECTO,  fecha_cobro_ef=date(2026, 4, 9)),
    turno(p["Diego"],     date(2026, 4,11), 20000, EstadoTurno.COBRADO,  OrigenPago.DIRECTO,  fecha_cobro_ef=date(2026, 4,11)),
    turno(p["Laura"],     date(2026, 4,14), 15000, EstadoTurno.DIFERIDO, OrigenPago.DIRECTO,  fecha_cobro_est=date(2026, 4,30)),
    turno(p["Sofía"],     date(2026, 4,16),  9000, EstadoTurno.DIFERIDO, OrigenPago.PREPAGA,  prepaga="Swiss Medical", fecha_cobro_est=date(2026, 4,30)),
    turno(p["Ana"],       date(2026, 4,17), 10000, EstadoTurno.DIFERIDO, OrigenPago.PREPAGA,  prepaga="Medifé",        fecha_cobro_est=date(2026, 4,30)),
    turno(p["Valentina"], date(2026, 4,22), 22000, EstadoTurno.COBRADO,  OrigenPago.DIRECTO,  fecha_cobro_ef=date(2026, 4,22)),
    turno(p["Martín"],    date(2026, 4,24), 18000, EstadoTurno.COBRADO,  OrigenPago.DIRECTO,  fecha_cobro_ef=date(2026, 4,24)),
    turno(p["Diego"],     date(2026, 4,25), 20000, EstadoTurno.COBRADO,  OrigenPago.DIRECTO,  fecha_cobro_ef=date(2026, 4,25)),
]

for t in turnos:
    db.add(t)

db.commit()
db.close()

print(f"✅ Seed completo: {len(PACIENTES)} pacientes, {len(turnos)} turnos insertados.")
