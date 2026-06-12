-- Migración: tabla egresos
-- Correr en Supabase SQL Editor (o via script con DATABASE_URL).

CREATE TABLE IF NOT EXISTS egresos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  descripcion TEXT NOT NULL,
  monto       NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  tipo        TEXT NOT NULL CHECK (tipo IN ('FIJO','VARIABLE')),
  categoria   TEXT NOT NULL DEFAULT 'OTRO' CHECK (categoria IN
                ('ALQUILER','SERVICIOS','HONORARIOS','INSUMOS',
                 'SOFTWARE','IMPUESTOS','FORMACION','OTRO')),
  fecha       DATE NOT NULL,
  medio_pago  TEXT CHECK (medio_pago IN
                ('EFECTIVO','TRANSFERENCIA','TARJETA','MERCADO_PAGO','OTRO')),
  recurrente  BOOLEAN NOT NULL DEFAULT false,
  notas       TEXT,
  user_id     UUID,                          -- multi-tenant futuro, NULL por ahora
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Las queries de listado y resumen filtran por mes y agrupan por categoría
CREATE INDEX IF NOT EXISTS idx_egresos_fecha     ON egresos (fecha DESC);
CREATE INDEX IF NOT EXISTS idx_egresos_categoria ON egresos (categoria);
