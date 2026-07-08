"use client";

// Fila de egreso: icono de categoría · descripción · badge tipo · fecha · monto en rojo · acciones.

import { useState } from "react";
import { Pencil, Trash2, Repeat, Loader2 } from "lucide-react";
import type { EgresoRead } from "@/lib/types";
import { CATEGORIAS, MEDIOS_PAGO, fmtPesos } from "./constantes";

interface Props {
  egreso:   EgresoRead;
  onEdit:   (e: EgresoRead) => void;
  onDelete: (e: EgresoRead) => Promise<void>;
}

function fmtFecha(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-AR", { day: "numeric", month: "short" });
}

export default function EgresoRow({ egreso, onEdit, onDelete }: Props) {
  const [borrando, setBorrando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const { label, Icon } = CATEGORIAS[egreso.categoria] ?? CATEGORIAS.OTRO;

  const handleDelete = async () => {
    if (!confirmando) {
      setConfirmando(true);
      setTimeout(() => setConfirmando(false), 3000);
      return;
    }
    setBorrando(true);
    try {
      await onDelete(egreso);
    } finally {
      setBorrando(false);
      setConfirmando(false);
    }
  };

  return (
    <div className="group grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 px-4 py-3 transition-colors hover:bg-neutral-50 sm:grid-cols-[auto_1fr_auto_auto_auto_auto]">

      {/* Icono categoría */}
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 ring-1 ring-red-100" title={label}>
        <Icon className="h-4 w-4 text-red-400" strokeWidth={1.8} />
      </div>

      {/* Descripción + meta */}
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 truncate text-sm font-medium text-neutral-800">
          {egreso.descripcion}
          {egreso.recurrente && (
            <Repeat className="h-3 w-3 shrink-0 text-neutral-300" aria-label="Recurrente" />
          )}
        </p>
        <p className="truncate text-[11px] text-neutral-400">
          {label}
          {egreso.medio_pago ? ` · ${MEDIOS_PAGO[egreso.medio_pago]}` : ""}
          {/* Fecha y tipo van en el subtítulo solo en mobile (sus columnas se ocultan) */}
          <span className="sm:hidden"> · {fmtFecha(egreso.fecha)} · {egreso.tipo === "FIJO" ? "Fijo" : "Variable"}</span>
        </p>
      </div>

      {/* Badge tipo */}
      <span className={`hidden rounded-full px-2 py-0.5 text-[10px] font-semibold sm:inline ${
        egreso.tipo === "FIJO"
          ? "bg-slate-100 text-slate-600"
          : "bg-amber-50 text-amber-600"
      }`}>
        {egreso.tipo === "FIJO" ? "Fijo" : "Variable"}
      </span>

      {/* Fecha */}
      <span className="hidden text-xs text-neutral-400 sm:inline">{fmtFecha(egreso.fecha)}</span>

      {/* Monto */}
      <span className="text-right font-mono text-sm font-semibold text-red-500">
        −{fmtPesos(egreso.monto)}
      </span>

      {/* Acciones */}
      <div className="flex items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
        <button
          onClick={() => onEdit(egreso)}
          className="flex h-9 w-9 sm:h-7 sm:w-7 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-indigo-600"
          aria-label="Editar"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={handleDelete}
          disabled={borrando}
          className={`flex h-9 sm:h-7 items-center justify-center rounded-lg transition-colors ${
            confirmando
              ? "w-auto bg-red-50 px-2 text-[10px] font-semibold text-red-600"
              : "w-9 sm:w-7 text-neutral-400 hover:bg-red-50 hover:text-red-500"
          }`}
          aria-label="Eliminar"
        >
          {borrando
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : confirmando
              ? "¿Eliminar?"
              : <Trash2 className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}
