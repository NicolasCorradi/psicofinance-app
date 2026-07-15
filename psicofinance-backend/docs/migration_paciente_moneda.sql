-- Migración: moneda del honorario habitual del paciente (ARS por default).
-- Correr en el SQL Editor de Supabase.
--
-- Permite que un paciente tenga su honorario_actual cargado en USD (para
-- pacientes que pagan en dólares cada sesión), no solo en ARS.

ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS moneda TEXT NOT NULL DEFAULT 'ARS';
