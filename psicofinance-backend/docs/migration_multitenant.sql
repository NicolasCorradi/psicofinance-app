-- Migración: multi-tenancy — separar los datos por psicólogo logueado.
-- Correr en Supabase SQL Editor.
--
-- IMPORTANTE: reemplazá el UUID de abajo por el user_id real del psicólogo
-- dueño de los datos actuales (Authentication → Users → columna UID).
-- En este proyecto corresponde a nicolascorradi1@gmail.com:
--   fdff0fcf-5781-4852-a309-59810efec8f7
-- Si el dueño real de los datos es otro usuario, cambiá el valor antes de correr.

-- 1. Agregar user_id a las tablas que todavía no lo tienen (egresos ya lo tiene)
ALTER TABLE pacientes      ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE turnos         ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE configuracion  ADD COLUMN IF NOT EXISTS user_id UUID;

-- 2. Asignar todos los datos existentes al usuario actual
UPDATE pacientes     SET user_id = 'fdff0fcf-5781-4852-a309-59810efec8f7' WHERE user_id IS NULL;
UPDATE turnos        SET user_id = 'fdff0fcf-5781-4852-a309-59810efec8f7' WHERE user_id IS NULL;
UPDATE egresos       SET user_id = 'fdff0fcf-5781-4852-a309-59810efec8f7' WHERE user_id IS NULL;
-- Solo las claves per-usuario (semana_modelo, monotributo_categoria).
-- "monotributo_topes" queda sin dueño: es la escala de ARCA, compartida por todos.
UPDATE configuracion SET user_id = 'fdff0fcf-5781-4852-a309-59810efec8f7'
  WHERE user_id IS NULL AND clave IN ('semana_modelo', 'monotributo_categoria');

-- 3. NOT NULL ahora que ya están todas asignadas (configuracion queda nullable
--    a propósito: monotributo_topes no tiene dueño)
ALTER TABLE pacientes ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE turnos    ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE egresos   ALTER COLUMN user_id SET NOT NULL;

-- 4. Índices — todo query nuevo filtra por user_id
CREATE INDEX IF NOT EXISTS idx_pacientes_user_id ON pacientes (user_id);
CREATE INDEX IF NOT EXISTS idx_turnos_user_id    ON turnos (user_id);
CREATE INDEX IF NOT EXISTS idx_egresos_user_id   ON egresos (user_id);

-- 5. configuracion: la clave única pasa de "clave" sola a (clave, user_id),
--    para que cada psicólogo tenga su propia fila con la misma clave
--    (ej: cada uno tiene su "semana_modelo" y su "monotributo_categoria").
--    "monotributo_topes" con user_id NULL no choca con nada (NULL nunca
--    es igual a otro NULL en una constraint UNIQUE de Postgres).
ALTER TABLE configuracion DROP CONSTRAINT IF EXISTS configuracion_pkey;
ALTER TABLE configuracion ADD CONSTRAINT configuracion_clave_user_key UNIQUE (clave, user_id);
