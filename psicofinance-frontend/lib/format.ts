// Helpers compartidos de formato: moneda, fechas y labels.
// Centraliza definiciones que estaban duplicadas en varios componentes.

import type { MedioPago } from "./types";

// ── Moneda ────────────────────────────────────────────────────────────────────

/** Formatea un monto en pesos argentinos. Con compact=true usa notación "$25 mil". */
export function fmtPesos(n: number, compact = false): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: compact ? 1 : 0,
    ...(compact ? { notation: "compact" as const } : {}),
  }).format(n);
}

/** Variante compacta ($25 mil) — la más usada en cards y tablas. */
export function fmtPesosCompacto(n: number): string {
  return fmtPesos(n, true);
}

// ── Fechas ────────────────────────────────────────────────────────────────────

/** Fecha en formato YYYY-MM-DD en hora LOCAL (toISOString adelanta un día en AR de noche). */
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Hoy en formato YYYY-MM-DD en hora local. */
export function isoHoy(): string {
  return isoDate(new Date());
}

export const MESES_ES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];

/** Fecha relativa: "Hoy", "Ayer", "Hace 3d", "Hace 2sem", "En 4d" o "12 mar". */
export function fechaRel(iso: string): string {
  const f    = new Date(iso + "T12:00:00");
  const dias = Math.round((Date.now() - f.getTime()) / 86_400_000);
  if (dias === 0) return "Hoy";
  if (dias === 1) return "Ayer";
  if (dias < 0) {
    // Fecha futura: "En Xd" si es cercana, si no la fecha formateada
    if (-dias < 7) return `En ${-dias}d`;
    return f.toLocaleDateString("es-AR", { day: "numeric", month: "short" });
  }
  if (dias < 7)  return `Hace ${dias}d`;
  if (dias < 30) return `Hace ${Math.round(dias / 7)}sem`;
  return f.toLocaleDateString("es-AR", { day: "numeric", month: "short" });
}

// ── Medios de pago ────────────────────────────────────────────────────────────

/** Labels completos de medios de pago (selects, filas de tablas, chips de egresos). */
export const MEDIO_LABEL: Record<MedioPago, string> = {
  EFECTIVO:      "Efectivo",
  TRANSFERENCIA: "Transferencia",
  TARJETA:       "Tarjeta",
  MERCADO_PAGO:  "Mercado Pago",
  OTRO:          "Otro",
};

/** Labels abreviados para badges chicos (detalle de paciente, tags del copiloto). */
export const MEDIO_LABEL_CORTO: Record<MedioPago, string> = {
  EFECTIVO:      "Efectivo",
  TRANSFERENCIA: "Transfe",
  TARJETA:       "Tarjeta",
  MERCADO_PAGO:  "MP",
  OTRO:          "Otro",
};
