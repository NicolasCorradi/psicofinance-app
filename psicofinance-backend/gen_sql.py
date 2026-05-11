import uuid

def uid(): return str(uuid.uuid4())

pacientes = [
    (uid(), 'Valentina', 'Herrera',   22000, '2026-03-01'),
    (uid(), 'Martin',    'Gutierrez', 18000, '2025-08-01'),
    (uid(), 'Ana',       'Lopez',     16000, '2025-10-01'),
    (uid(), 'Diego',     'Fernandez', 20000, '2026-01-01'),
    (uid(), 'Laura',     'Mendez',    15000, '2025-12-01'),
    (uid(), 'Tomas',     'Rios',      24000, '2026-04-01'),
    (uid(), 'Sofia',     'Rodriguez',  9000, '2026-02-01'),
    (uid(), 'Cecilia',   'Vargas',    18000, '2026-05-01'),
    (uid(), 'Federico',  'Morales',   25000, '2026-04-01'),
    (uid(), 'Camila',    'Suarez',    21000, '2025-11-01'),
]

TURNOS = [
    ('Valentina','2025-11-04',18000,'COBRADO','DIRECTO',None,'2025-11-04'),
    ('Martin',   '2025-11-06',18000,'COBRADO','DIRECTO',None,'2025-11-06'),
    ('Ana',      '2025-11-10', 9500,'COBRADO','PREPAGA','OSDE','2025-11-28'),
    ('Diego',    '2025-11-13',17000,'COBRADO','DIRECTO',None,'2025-11-13'),
    ('Laura',    '2025-11-18', 8500,'INCOBRABLE','PREPAGA','Galeno',None),
    ('Camila',   '2025-11-20',19000,'COBRADO','DIRECTO',None,'2025-11-20'),
    ('Valentina','2025-12-02',18000,'COBRADO','DIRECTO',None,'2025-12-02'),
    ('Martin',   '2025-12-04',18000,'COBRADO','DIRECTO',None,'2025-12-04'),
    ('Tomas',    '2025-12-09',22000,'COBRADO','DIRECTO',None,'2025-12-09'),
    ('Sofia',    '2025-12-11', 8500,'COBRADO','PREPAGA','Swiss Medical','2025-12-30'),
    ('Ana',      '2025-12-16', 9500,'COBRADO','PREPAGA','OSDE','2025-12-30'),
    ('Diego',    '2025-12-18',17000,'COBRADO','DIRECTO',None,'2025-12-18'),
    ('Laura',    '2025-12-20',14000,'COBRADO','DIRECTO',None,'2025-12-20'),
    ('Federico', '2025-12-23',23000,'COBRADO','DIRECTO',None,'2025-12-23'),
    ('Camila',   '2025-12-26',19000,'COBRADO','DIRECTO',None,'2025-12-26'),
    ('Valentina','2026-01-06',20000,'COBRADO','DIRECTO',None,'2026-01-06'),
    ('Martin',   '2026-01-08',18000,'COBRADO','DIRECTO',None,'2026-01-08'),
    ('Tomas',    '2026-01-13',22000,'COBRADO','DIRECTO',None,'2026-01-13'),
    ('Cecilia',  '2026-01-15',17000,'COBRADO','DIRECTO',None,'2026-01-15'),
    ('Sofia',    '2026-01-20', 8500,'COBRADO','PREPAGA','Swiss Medical','2026-01-31'),
    ('Laura',    '2026-01-27',14000,'COBRADO','DIRECTO',None,'2026-01-27'),
    ('Federico', '2026-01-29',23000,'COBRADO','DIRECTO',None,'2026-01-29'),
    ('Camila',   '2026-01-31',19000,'COBRADO','DIRECTO',None,'2026-01-31'),
    ('Valentina','2026-02-03',20000,'COBRADO','DIRECTO',None,'2026-02-03'),
    ('Martin',   '2026-02-05',18000,'COBRADO','DIRECTO',None,'2026-02-05'),
    ('Diego',    '2026-02-10',20000,'COBRADO','DIRECTO',None,'2026-02-10'),
    ('Tomas',    '2026-02-12',22000,'COBRADO','DIRECTO',None,'2026-02-12'),
    ('Cecilia',  '2026-02-17',17000,'COBRADO','DIRECTO',None,'2026-02-17'),
    ('Laura',    '2026-02-19',14000,'COBRADO','DIRECTO',None,'2026-02-19'),
    ('Sofia',    '2026-02-26', 9000,'COBRADO','PREPAGA','Swiss Medical','2026-02-28'),
    ('Federico', '2026-02-27',25000,'COBRADO','DIRECTO',None,'2026-02-27'),
    ('Valentina','2026-03-03',22000,'COBRADO','DIRECTO',None,'2026-03-03'),
    ('Martin',   '2026-03-05',18000,'COBRADO','DIRECTO',None,'2026-03-05'),
    ('Diego',    '2026-03-07',20000,'COBRADO','DIRECTO',None,'2026-03-07'),
    ('Tomas',    '2026-03-10',24000,'COBRADO','DIRECTO',None,'2026-03-10'),
    ('Cecilia',  '2026-03-12',18000,'COBRADO','DIRECTO',None,'2026-03-12'),
    ('Laura',    '2026-03-14',15000,'COBRADO','DIRECTO',None,'2026-03-14'),
    ('Sofia',    '2026-03-18', 9000,'COBRADO','PREPAGA','Swiss Medical','2026-03-31'),
    ('Ana',      '2026-03-19',10000,'COBRADO','PREPAGA','Medife','2026-03-31'),
    ('Valentina','2026-03-24',22000,'COBRADO','DIRECTO',None,'2026-03-24'),
    ('Diego',    '2026-03-26',20000,'COBRADO','DIRECTO',None,'2026-03-26'),
    ('Federico', '2026-03-28',25000,'COBRADO','DIRECTO',None,'2026-03-28'),
    ('Camila',   '2026-03-31',21000,'COBRADO','DIRECTO',None,'2026-03-31'),
    ('Valentina','2026-04-01',22000,'COBRADO','DIRECTO',None,'2026-04-01'),
    ('Martin',   '2026-04-03',18000,'COBRADO','DIRECTO',None,'2026-04-03'),
    ('Tomas',    '2026-04-07',24000,'COBRADO','DIRECTO',None,'2026-04-07'),
    ('Cecilia',  '2026-04-09',18000,'COBRADO','DIRECTO',None,'2026-04-09'),
    ('Diego',    '2026-04-11',20000,'COBRADO','DIRECTO',None,'2026-04-11'),
    ('Laura',    '2026-04-14',15000,'COBRADO','DIRECTO',None,'2026-04-14'),
    ('Sofia',    '2026-04-16', 9000,'DIFERIDO','PREPAGA','Swiss Medical',None),
    ('Ana',      '2026-04-17',10000,'DIFERIDO','PREPAGA','Medife',None),
    ('Valentina','2026-04-22',22000,'COBRADO','DIRECTO',None,'2026-04-22'),
    ('Martin',   '2026-04-24',18000,'COBRADO','DIRECTO',None,'2026-04-24'),
    ('Diego',    '2026-04-25',20000,'COBRADO','DIRECTO',None,'2026-04-25'),
    ('Federico', '2026-04-28',25000,'COBRADO','DIRECTO',None,'2026-04-28'),
    ('Camila',   '2026-04-29',21000,'COBRADO','DIRECTO',None,'2026-04-29'),
    ('Valentina','2026-05-02',22000,'COBRADO','DIRECTO',None,'2026-05-02'),
    ('Tomas',    '2026-05-05',24000,'COBRADO','DIRECTO',None,'2026-05-05'),
    ('Martin',   '2026-05-06',18000,'COBRADO','DIRECTO',None,'2026-05-06'),
    ('Diego',    '2026-05-07',20000,'DIFERIDO','DIRECTO',None,None),
    ('Cecilia',  '2026-05-08',18000,'COBRADO','DIRECTO',None,'2026-05-08'),
    ('Laura',    '2026-05-09',15000,'DIFERIDO','DIRECTO',None,None),
    ('Sofia',    '2026-05-09', 9000,'DIFERIDO','PREPAGA','Swiss Medical',None),
]

pac_map = {p[1]: p[0] for p in pacientes}

lines = []
lines.append('-- Limpiar datos anteriores')
lines.append('TRUNCATE turnos, pacientes RESTART IDENTITY CASCADE;')
lines.append('')
lines.append('-- Insertar pacientes')
lines.append('INSERT INTO pacientes (id, nombre, apellido, honorario_actual, fecha_ultimo_ajuste_honorario, created_at) VALUES')
pvals = []
for p in pacientes:
    pvals.append(f"('{p[0]}', '{p[1]}', '{p[2]}', {p[3]}, '{p[4]}', NOW())")
lines.append(',\n'.join(pvals) + ';')

lines.append('')
lines.append('-- Insertar turnos')
lines.append('INSERT INTO turnos (id, paciente_id, fecha_turno, monto, estado, origen_pago, prepaga, fecha_cobro_efectivo, created_at, updated_at) VALUES')
tvals = []
for t in TURNOS:
    nombre, fecha, monto, estado, origen, prepaga, fecha_ef = t
    pid = pac_map.get(nombre)
    if not pid:
        continue
    p_val = f"'{prepaga}'" if prepaga else 'NULL'
    ef_val = f"'{fecha_ef}'" if fecha_ef else 'NULL'
    tvals.append(f"('{uid()}', '{pid}', '{fecha}', {monto}, '{estado}', '{origen}', {p_val}, {ef_val}, NOW(), NOW())")
lines.append(',\n'.join(tvals) + ';')

sql = '\n'.join(lines)
with open('seed.sql', 'w', encoding='utf-8') as f:
    f.write(sql)
print(f'seed.sql generado: {len(pacientes)} pacientes, {len(tvals)} turnos')
