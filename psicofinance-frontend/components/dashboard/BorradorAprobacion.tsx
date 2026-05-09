"use client";

import { useState } from "react";
import { FileText, Check, AlertTriangle } from "lucide-react";
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

const CONFIANZA_CFG: Record<string, { label: string; cls: string; dot: string }> = {
  alta:  { label: "Alta",  cls: "bg-emerald-500/15 text-emerald-300", dot: "bg-emerald-400" },
  media: { label: "Media", cls: "bg-amber-500/15  text-amber-300",   dot: "bg-amber-400"   },
  baja:  { label: "Baja",  cls: "bg-red-500/15    text-red-300",     dot: "bg-red-400"     },
};

export default function BorradorAprobacion({ borrador, onAprobar, onDescartar }: Props) {
  const [aprobando, setAprobando] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const aprobar = async () => {
    setAprobando(true); setError(null);
    try {
      await aprobarBorrador({
        nombre_emisor: borrador.nombre_emisor,
        monto:         borrador.monto,
        fecha:         borrador.fecha,
      });
      onAprobar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar.");
    } finally {
      setAprobando(false);
    }
  };

  const conf = CONFIANZA_CFG[borrador.confianza] ?? CONFIANZA_CFG.media;

  return (
    <section className="overflow-hidden rounded-2xl shadow-sm ring-1 ring-black/5">

      {/* Header con gradiente */}
      <div className="bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-900 px-5 pt-4 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-500/25 ring-1 ring-indigo-500/30">
              <FileText className="h-4 w-4 text-indigo-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Revisar comprobante</p>
              <p className="text-[11px] text-white/40">Confirmá los datos extraídos</p>
            </div>
          </div>
          <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${conf.cls}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${conf.dot}`} />
            Confianza {conf.label}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="bg-white p-5">
        <div className="grid grid-cols-3 gap-2">
          {[
            { l: "Emisor", v: borrador.nombre_emisor || "Sin detectar" },
            { l: "Monto",  v: fmtPesos(borrador.monto), highlight: true },
            { l: "Fecha",  v: new Date(borrador.fecha + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "long" }) },
          ].map(({ l, v, highlight }) => (
            <div key={l} className={`rounded-xl p-3 ring-1 ${highlight ? "bg-indigo-50 ring-indigo-100" : "bg-slate-50 ring-slate-100"}`}>
              <p className="text-[10px] font-medium uppercase tracking-wider text-neutral-400">{l}</p>
              <p className={`mt-1 text-sm font-bold ${highlight ? "text-indigo-700" : "text-neutral-800"}`}>{v}</p>
            </div>
          ))}
        </div>

        {borrador.advertencia_monto && (
          <div className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5 ring-1 ring-amber-100">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-500" />
            <p className="text-xs text-amber-700">{borrador.advertencia_monto}</p>
          </div>
        )}

        {error && (
          <div className="mt-3 rounded-xl bg-red-50 px-3 py-2.5 ring-1 ring-red-100">
            <p className="text-xs text-red-500">{error}</p>
          </div>
        )}

        <div className="mt-5 flex items-center gap-2">
          <button
            onClick={aprobar} disabled={aprobando}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500 disabled:opacity-40"
          >
            {aprobando
              ? <span className="h-4 w-4 animate-spin rounded-full border border-white/30 border-t-white" />
              : <Check className="h-4 w-4" />
            }
            {aprobando ? "Guardando…" : "Aprobar y guardar"}
          </button>
          <button
            onClick={onDescartar} disabled={aprobando}
            className="rounded-xl border border-neutral-200 px-4 py-2.5 text-sm text-neutral-500 transition-colors hover:bg-neutral-50 disabled:opacity-40"
          >
            Descartar
          </button>
        </div>
      </div>
    </section>
  );
}
