"use client";

import { useState } from "react";
import { aprobarBorrador } from "@/lib/api";
import type { DatosBorrador } from "@/lib/types";

interface Props {
  borrador:    DatosBorrador;
  onAprobar:   () => void;
  onDescartar: () => void;
}

function fmtPesos(n: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency", currency: "ARS",
    notation: "compact", maximumFractionDigits: 1,
  }).format(n);
}

export default function BorradorAprobacion({ borrador, onAprobar, onDescartar }: Props) {
  const [aprobando, setAprobando] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const aprobar = async () => {
    setAprobando(true); setError(null);
    try {
      await aprobarBorrador({ nombre_emisor: borrador.nombre_emisor, monto: borrador.monto, fecha: borrador.fecha });
      onAprobar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar.");
    } finally { setAprobando(false); }
  };

  const colorConf: Record<string, string> = {
    alta:  "text-emerald-600",
    media: "text-amber-500",
    baja:  "text-red-500",
  };

  return (
    <section className="overflow-hidden rounded-2xl bg-white shadow-sm">
      <div className="flex items-center justify-between px-5 py-4">
        <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
          Revisar comprobante
        </p>
        <span className={`text-xs font-medium ${colorConf[borrador.confianza] ?? "text-neutral-400"}`}>
          Confianza {borrador.confianza}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 px-5 pb-4">
        {[
          { l: "Emisor", v: borrador.nombre_emisor || "Sin detectar" },
          { l: "Monto",  v: fmtPesos(borrador.monto) },
          { l: "Fecha",  v: new Date(borrador.fecha + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "long" }) },
        ].map(({ l, v }) => (
          <div key={l} className="rounded-xl bg-neutral-50 p-3">
            <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-400">{l}</p>
            <p className="mt-1 text-sm font-semibold text-neutral-800">{v}</p>
          </div>
        ))}
      </div>

      {borrador.advertencia_monto && (
        <div className="mx-5 mb-4 rounded-xl bg-amber-50 px-3 py-2.5">
          <p className="text-xs text-amber-600">{borrador.advertencia_monto}</p>
        </div>
      )}

      {error && (
        <div className="mx-5 mb-4 rounded-xl bg-red-50 px-3 py-2.5">
          <p className="text-xs text-red-500">{error}</p>
        </div>
      )}

      <div className="flex items-center gap-2 border-t border-neutral-100 px-5 py-3.5">
        <button
          onClick={aprobar} disabled={aprobando}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-neutral-900 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-neutral-700 disabled:opacity-40"
        >
          {aprobando && <span className="h-4 w-4 animate-spin rounded-full border border-white/30 border-t-white" />}
          {aprobando ? "Guardando…" : "Aprobar y guardar"}
        </button>
        <button
          onClick={onDescartar} disabled={aprobando}
          className="rounded-xl px-4 py-2.5 text-sm text-neutral-400 transition-colors hover:text-neutral-700 disabled:opacity-40"
        >
          Descartar
        </button>
      </div>
    </section>
  );
}
