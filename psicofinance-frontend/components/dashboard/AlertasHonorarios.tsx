"use client";

import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { getAlertasHonorarios } from "@/lib/api";
import type { AlertaHonorario } from "@/lib/types";
import { fmtPesosCompacto as fmtPesos } from "@/lib/format";

export default function AlertasHonorarios({ refreshKey = 0 }: { refreshKey?: number }) {
  const [alertas, setAlertas]   = useState<AlertaHonorario[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError]       = useState(false);
  const [verTodos, setVerTodos] = useState(false);

  // Sin tope, con 20 pacientes la tarjeta medía 1246px —más que la pantalla—
  // y aplastaba todo lo que venía abajo en el dashboard. Vienen ordenados por
  // urgencia, así que los primeros son los que de verdad hay que ajustar.
  const TOPE = 6;

  useEffect(() => {
    getAlertasHonorarios()
      .then(a => { setAlertas(a); setError(false); })
      .catch(() => setError(true))
      .finally(() => setCargando(false));
  }, [refreshKey]);

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5 dark:bg-slate-900 dark:ring-white/10">
      <p className="mb-4 text-[11px] font-medium uppercase tracking-wider text-neutral-400 dark:text-slate-500">
        Actualizar honorarios
      </p>

      {/* Skeleton */}
      {cargando && (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="flex items-center justify-between rounded-xl px-3 py-2.5">
              <div className="space-y-1.5">
                <div className="h-3 w-24 animate-pulse rounded bg-neutral-100 dark:bg-slate-800" />
                <div className="h-2.5 w-32 animate-pulse rounded bg-neutral-100 dark:bg-slate-800" />
              </div>
              <div className="h-5 w-12 animate-pulse rounded-full bg-neutral-100 dark:bg-slate-800" />
            </div>
          ))}
        </div>
      )}

      {/* Error de carga — nunca confundir con "sin alertas" */}
      {!cargando && error && (
        <div className="py-5 text-center">
          <p className="text-sm font-medium text-neutral-500 dark:text-slate-400">No se pudo cargar.</p>
          <p className="mt-1 text-xs text-neutral-400 dark:text-slate-500">Revisá tu conexión e intentá de nuevo.</p>
        </div>
      )}

      {/* Sin alertas */}
      {!cargando && !error && alertas.length === 0 && (
        <div className="py-5 text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-500/10">
            <span className="text-lg">✓</span>
          </div>
          <p className="text-sm font-medium text-neutral-600 dark:text-slate-300">Honorarios al día.</p>
          <p className="mt-1 text-xs text-neutral-400 dark:text-slate-500">
            Aparecerán alertas cuando un paciente lleve más de 3 meses sin ajuste.
          </p>
        </div>
      )}

      {/* Lista */}
      {!cargando && !error && alertas.length > 0 && (
        <div className="space-y-1">
          {(verTodos ? alertas : alertas.slice(0, TOPE)).map((a) => (
            <div
              key={a.paciente_id}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
            >
              {/* Indicador urgencia (vertical bar) */}
              <span className={`h-9 w-1 shrink-0 rounded-full ${a.alto ? "bg-red-400" : "bg-amber-400"}`} />

              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-neutral-800 dark:text-slate-100">{a.nombre}</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-neutral-400 dark:text-slate-500">
                  <span>{a.meses}m sin ajustar</span>
                  <span className="text-neutral-200 dark:text-slate-600">·</span>
                  <span className="font-medium text-neutral-600 dark:text-slate-300">{fmtPesos(a.honorario_actual)}</span>
                  <ArrowRight className="h-3 w-3 text-neutral-300 dark:text-slate-600" />
                  <span className={`font-semibold ${a.alto ? "text-red-500 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}`}>
                    {fmtPesos(a.honorario_sugerido)}
                  </span>
                </div>
              </div>

              <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                a.alto ? "bg-red-50 text-red-500 ring-1 ring-red-100 dark:bg-red-500/10 dark:text-red-400 dark:ring-red-500/20" : "bg-amber-50 text-amber-600 ring-1 ring-amber-100 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/20"
              }`}>
                +{Math.round(a.pct)}%
              </span>
            </div>
          ))}
          {alertas.length > TOPE && (
            <button
              onClick={() => setVerTodos(v => !v)}
              className="w-full rounded-xl px-3 py-2 text-xs font-medium text-indigo-600 transition-colors hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-500/10"
            >
              {verTodos
                ? "Ver menos"
                : `Ver los ${alertas.length - TOPE} restantes`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
