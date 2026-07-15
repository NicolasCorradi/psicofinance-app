"use client";

// Card hero del dashboard: el número más accionable (ingreso neto del mes)
// destacado por encima del resto de las métricas secundarias.

import { Scale, TrendingUp, TrendingDown } from "lucide-react";
import type { ResumenEgresos } from "@/lib/types";
import { fmtPesosCompacto as fmtPesos } from "@/lib/format";

interface Props {
  cobradoMes:     number | null;
  resumenEgresos: ResumenEgresos | null;
  errorEgresos:   boolean;
}

export default function IngresoNetoHero({ cobradoMes, resumenEgresos, errorEgresos }: Props) {
  // Si el endpoint de egresos falló, mostramos el cobrado igual (no bloqueamos el hero)
  // pero avisamos que el neto no está completo.
  const egresos = resumenEgresos?.total ?? null;
  const neto = cobradoMes !== null && egresos !== null ? cobradoMes - egresos : null;
  const negativo = neto !== null && neto < 0;
  const cargando = cobradoMes === null || (egresos === null && !errorEgresos);

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-900 shadow-sm ring-1 ring-black/5 dark:ring-white/10">
      <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${negativo ? "bg-red-500/20" : "bg-indigo-500/20"} ring-1 ${negativo ? "ring-red-400/30" : "ring-indigo-400/30"}`}>
              <Scale className={`h-4 w-4 ${negativo ? "text-red-300" : "text-indigo-300"}`} />
            </div>
            <p className="text-xs font-medium uppercase tracking-wider text-white/50">
              Ingreso neto del mes
            </p>
          </div>

          <p className={`mt-3 text-4xl font-bold leading-none tracking-tight tabular-nums ${negativo ? "text-red-400" : "text-white"}`}>
            {cargando
              ? <span className="inline-block h-9 w-40 animate-pulse rounded-lg bg-white/10 align-middle" />
              : neto !== null ? fmtPesos(neto) : "–"
            }
          </p>

          {errorEgresos && (
            <p className="mt-2 text-xs text-amber-300/80">
              No se pudieron cargar los egresos — este número solo refleja lo cobrado.
            </p>
          )}
        </div>

        {/* Breakdown: cobrado − egresos */}
        {!cargando && cobradoMes !== null && egresos !== null && (
          <div className="flex items-center gap-3 rounded-xl bg-white/5 px-4 py-3 ring-1 ring-white/10">
            <div className="flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-xs font-medium tabular-nums text-white/70">{fmtPesos(cobradoMes)}</span>
            </div>
            <span className="text-white/20">−</span>
            <div className="flex items-center gap-1.5">
              <TrendingDown className="h-3.5 w-3.5 text-red-400" />
              <span className="text-xs font-medium tabular-nums text-white/70">{fmtPesos(egresos)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
