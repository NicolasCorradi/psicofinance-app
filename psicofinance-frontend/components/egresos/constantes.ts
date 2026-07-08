// Constantes visuales compartidas del módulo Egresos.

import {
  Home, Zap, Briefcase, Package, MonitorSmartphone,
  Landmark, GraduationCap, CircleDollarSign, type LucideIcon,
} from "lucide-react";
import type { CategoriaEgreso } from "@/lib/types";

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

// Re-exports desde lib/format para no romper los imports existentes del módulo.
export { fmtPesos, MEDIO_LABEL as MEDIOS_PAGO } from "@/lib/format";
