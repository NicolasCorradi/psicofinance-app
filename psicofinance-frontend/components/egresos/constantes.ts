// Constantes visuales compartidas del módulo Egresos.

import {
  Home, Zap, Briefcase, Package, MonitorSmartphone,
  Landmark, GraduationCap, CircleDollarSign, type LucideIcon,
} from "lucide-react";
import type { CategoriaEgreso, MedioPago } from "@/lib/types";

export const CATEGORIAS: Record<CategoriaEgreso, { label: string; Icon: LucideIcon }> = {
  ALQUILER:   { label: "Alquiler",   Icon: Home },
  SERVICIOS:  { label: "Servicios",  Icon: Zap },
  HONORARIOS: { label: "Honorarios", Icon: Briefcase },
  INSUMOS:    { label: "Insumos",    Icon: Package },
  SOFTWARE:   { label: "Software",   Icon: MonitorSmartphone },
  IMPUESTOS:  { label: "Impuestos",  Icon: Landmark },
  FORMACION:  { label: "Formación",  Icon: GraduationCap },
  OTRO:       { label: "Otro",       Icon: CircleDollarSign },
};

export const MEDIOS_PAGO: Record<MedioPago, string> = {
  EFECTIVO:      "Efectivo",
  TRANSFERENCIA: "Transferencia",
  TARJETA:       "Tarjeta",
  MERCADO_PAGO:  "Mercado Pago",
  OTRO:          "Otro",
};

export function fmtPesos(n: number, compact = false): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: compact ? 1 : 0,
    ...(compact ? { notation: "compact" as const } : {}),
  }).format(n);
}
