"use client";

import { useEffect, useState } from "react";
import { getAlertasHonorarios } from "@/lib/api";
import type { AlertaHonorario } from "@/lib/types";

function fmtPesos(n: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency", currency: "ARS",
    notation: "compact", maximumFractionDigits: 1,
  }).format(n);
}

export default function AlertasHonorarios() {
  const [alertas, setAlertas] = useState<AlertaHonorario[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    getAlertasHonorarios()
      .then(setAlertas)
      .catch(() => setAlertas([]))
      .finally(() => setCargando(false));
  }, []);

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <p className="mb-4 text-[11px] font-medium uppercase tracking-wide text-neutral-400">
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
        <div className="py-4 text-center">
          <p className="text-sm text-neutral-400">Honorarios al día.</p>
          <p className="mt-1 text-xs text-neutral-300">
            Aparecerán alertas cuando algún paciente lleve más de 3 meses sin ajuste.
          </p>
        </div>
      )}

      {/* Lista */}
      {!cargando && alertas.length > 0 && (
        <div className="space-y-1">
          {alertas.map((a) => (
            <div
              key={a.paciente_id}
              className="flex items-center justify-between rounded-xl px-3 py-2.5 transition-colors hover:bg-neutral-50"
            >
              <div>
                <p className="text-sm font-medium text-neutral-800">{a.nombre}</p>
                <p className="text-xs text-neutral-400">
                  {a.meses} meses sin ajustar
                  <span className="mx-1 text-neutral-200">·</span>
                  <span className="text-neutral-500">
                    {fmtPesos(a.honorario_actual)} → {fmtPesos(a.honorario_sugerido)}
                  </span>
                </p>
              </div>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                a.alto ? "bg-red-50 text-red-500" : "bg-amber-50 text-amber-600"
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
