"use client";

// Card "Egresos del mes" + ingreso neto para el dashboard.
// Neto = cobrado del mes (criterio percibido) − egresos del mes.

import { useState, useEffect } from "react";
import Link from "next/link";
import { TrendingDown, Scale, ChevronRight } from "lucide-react";
import { getResumenEgresos } from "@/lib/api";
import type { ResumenEgresos } from "@/lib/types";
import { fmtPesosCompacto as fmtPesos } from "@/lib/format";

interface Props {
  cobradoMes: number | null;   // viene de las métricas del dashboard
}

export default function EgresosCard({ cobradoMes }: Props) {
  const [resumen, setResumen] = useState<ResumenEgresos | null>(null);
  const [error,   setError]   = useState(false);

  useEffect(() => {
    getResumenEgresos().then(setResumen).catch(() => setError(true));
  }, []);

  // Si el endpoint todavía no existe (tabla sin migrar), la card no rompe el dashboard
  if (error) return null;

  const neto = cobradoMes !== null && resumen !== null ? cobradoMes - resumen.total : null;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">

      {/* Egresos del mes */}
      <Link
        href="/egresos"
        className="relative overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5 transition-all duration-150 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0"
      >
        <div className="h-1 bg-gradient-to-r from-red-400 to-rose-400" />
        <div className="p-5">
          <div className="flex items-start justify-between">
            <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-400">
              Egresos del mes
            </p>
            <div className="flex items-center gap-1">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-red-50">
                <TrendingDown className="h-4 w-4 text-red-400" strokeWidth={2} />
              </div>
              <ChevronRight className="h-3.5 w-3.5 text-neutral-300" />
            </div>
          </div>
          <p className="mt-3 text-[1.75rem] font-bold leading-none tracking-tight tabular-nums text-red-500">
            {resumen !== null
              ? fmtPesos(resumen.total)
              : <span className="animate-pulse text-neutral-200">——</span>}
          </p>
          <p className="mt-2 text-xs text-neutral-400">
            {resumen !== null
              ? <>Fijos {fmtPesos(resumen.total_fijos)} · Variables {fmtPesos(resumen.total_variables)}</>
              : "–"}
          </p>
        </div>
      </Link>

      {/* Ingreso neto */}
      <div className="relative overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
        <div className={`h-1 bg-gradient-to-r ${
          neto !== null && neto < 0 ? "from-red-400 to-rose-500" : "from-indigo-400 to-violet-500"
        }`} />
        <div className="p-5">
          <div className="flex items-start justify-between">
            <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-400">
              Ingreso neto del mes
            </p>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50">
              <Scale className="h-4 w-4 text-indigo-500" strokeWidth={2} />
            </div>
          </div>
          <p className={`mt-3 text-[1.75rem] font-bold leading-none tracking-tight tabular-nums ${
            neto !== null && neto < 0 ? "text-red-600" : "text-indigo-600"
          }`}>
            {neto !== null
              ? fmtPesos(neto)
              : <span className="animate-pulse text-neutral-200">——</span>}
          </p>
          <p className="mt-2 text-xs text-neutral-400">Cobrado − egresos</p>
        </div>
      </div>
    </div>
  );
}
