"use client";

import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { getAlertasHonorarios } from "@/lib/api";
import type { AlertaHonorario } from "@/lib/types";

function fmtPesos(n: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency", currency: "ARS",
    notation: "compact", maximumFractionDigits: 1,
  }).format(n);
}

export default function AlertasHonorarios() {
  const [alertas, setAlertas]   = useState<AlertaHonorario[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    getAlertasHonorarios()
      .then(setAlertas)
      .catch(() => setAlertas([]))
      .finally(() => setCargando(false));
  }, []);

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
      <p className="mb-4 text-[11px] font-medium uppercase tracking-wider text-neutral-400">
        Actualizar honorarios
      </p>

      {/* Skeleton */}
      {cargando && (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="flex items-center justify-between rounded-xl px-3 py-2.5">
              <div className="space-y-1.5">
                <div className="h-3 w-24 animate-pulse rounded bg-neutral-100" />
                <div className="h-2.5 w-32 animate-pulse rounded bg-neutral-100" />
              </div>
              <div className="h-5 w-12 animate-pulse rounded-full bg-neutral-100" />
            </div>
          ))}
        </div>
      )}

      {/* Sin alertas */}
      {!cargando && alertas.length === 0 && (
        <div className="py-5 text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50">
            <span className="text-lg">✓</span>
          </div>
          <p className="text-sm font-medium text-neutral-600">Honorarios al día.</p>
          <p className="mt-1 text-xs text-neutral-400">
            Aparecerán alertas cuando un paciente lleve más de 3 meses sin ajuste.
          </p>
        </div>
      )}

      {/* Lista */}
      {!cargando && alertas.length > 0 && (
        <div className="space-y-1">
          {alertas.map((a) => (
            <div
              key={a.paciente_id}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-slate-50"
            >
              {/* Indicador urgencia (vertical bar) */}
              <span className={`h-9 w-1 shrink-0 rounded-full ${a.alto ? "bg-red-400" : "bg-amber-400"}`} />

              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-neutral-800">{a.nombre}</p>
                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-neutral-400">
                  <span>{a.meses}m sin ajustar</span>
                  <span className="text-neutral-200">·</span>
                  <span className="font-medium text-neutral-600">{fmtPesos(a.honorario_actual)}</span>
                  <ArrowRight className="h-3 w-3 text-neutral-300" />
                  <span className={`font-semibold ${a.alto ? "text-red-500" : "text-amber-600"}`}>
                    {fmtPesos(a.honorario_sugerido)}
                  </span>
                </div>
              </div>

              <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                a.alto ? "bg-red-50 text-red-500 ring-1 ring-red-100" : "bg-amber-50 text-amber-600 ring-1 ring-amber-100"
              }`}>
                +{a.pct}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
