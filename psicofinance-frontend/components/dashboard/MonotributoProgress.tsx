"use client";

import { useEffect, useState } from "react";
import { getSemaforo } from "@/lib/api";
import type { ResultadoSemaforo, EstadoSemaforo } from "@/lib/types";
import { fmtPesosCompacto as fmtPesos } from "@/lib/format";

const CX = 80, CY = 80, R = 58, GROSOR = 10;
const CIRC = 2 * Math.PI * R;

function colorArco(estado: EstadoSemaforo): string {
  return estado === "VERDE" ? "#10B981" : estado === "AMARILLO" ? "#F59E0B" : "#EF4444";
}

function gradientId(estado: EstadoSemaforo): string {
  return `grad-${estado.toLowerCase()}`;
}

export default function MonotributoProgress({ refreshKey = 0 }: { refreshKey?: number }) {
  const [s, set] = useState<ResultadoSemaforo | null>(null);

  useEffect(() => { getSemaforo().then(set).catch(() => {}); }, [refreshKey]);

  // El arco se capea en 100% pero el texto muestra el % real (130% del tope
  // debe leerse como 130%, no como 100%)
  const pctReal = s ? s.porcentaje_consumido : 0;
  const pct     = Math.min(pctReal, 100);
  const offset  = CIRC * (1 - pct / 100);
  const color  = s ? colorArco(s.estado) : "#E0E7FF";
  const gId    = s ? gradientId(s.estado) : "grad-empty";

  return (
    <div className="flex flex-col rounded-2xl bg-white dark:bg-neutral-900 p-5 shadow-sm ring-1 ring-black/5 dark:ring-white/10">
      <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
        Límite Monotributo
      </p>

      {/* Donut */}
      <div className="flex flex-col items-center py-3">
        <svg width="160" height="160" viewBox="0 0 160 160" className="overflow-visible">
          <defs>
            {s && (
              <linearGradient id={gId} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={color} stopOpacity="0.7" />
                <stop offset="100%" stopColor={color} stopOpacity="1" />
              </linearGradient>
            )}
          </defs>
          {/* Track */}
          <circle cx={CX} cy={CY} r={R} fill="none" stroke="#EEF2FF" strokeWidth={GROSOR} />
          {/* Arco de progreso */}
          <circle
            cx={CX} cy={CY} r={R}
            fill="none"
            stroke={s ? `url(#${gId})` : "#E0E7FF"}
            strokeWidth={GROSOR}
            strokeDasharray={CIRC}
            strokeDashoffset={offset}
            strokeLinecap="round"
            transform={`rotate(-90 ${CX} ${CY})`}
            style={{ transition: "stroke-dashoffset 0.8s ease, stroke 0.4s" }}
          />
          {/* Porcentaje */}
          <text x={CX} y={CY - 7} textAnchor="middle" fontSize="24" fontWeight="700" fontFamily="inherit" fill="#111827">
            {s ? `${pctReal.toFixed(0)}%` : "–"}
          </text>
          {/* Categoría */}
          <text x={CX} y={CY + 13} textAnchor="middle" fontSize="11" fontFamily="inherit" fill="#9CA3AF">
            {s ? `Categoría ${s.categoria_actual}` : "Cargando…"}
          </text>
        </svg>
      </div>

      {/* Stats */}
      {s && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
            <span>Facturado (12m)</span>
            <span className="font-semibold text-neutral-800 dark:text-neutral-100">{fmtPesos(s.facturado_12m)}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-indigo-50 dark:bg-indigo-500/10">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${pct}%`, backgroundColor: color }}
            />
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-neutral-400 dark:text-neutral-500">Tope {fmtPesos(s.tope_anual)}</span>
            <span style={{ color }} className="font-semibold">{fmtPesos(s.margen_disponible)} libre</span>
          </div>
          {s.criterio && (
            <p className="text-[10px] text-neutral-300 dark:text-neutral-600">
              Criterio {s.criterio === "PERCIBIDO" ? "percibido (por cobro)" : "devengado (por sesión)"}
              {s.vigencia ? ` · Escala ${s.vigencia}` : ""}
            </p>
          )}
          {s.advertencia && (
            <p className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-[10px] leading-snug text-amber-700 ring-1 ring-amber-200/60 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/20">
              ⚠ {s.advertencia}
            </p>
          )}
        </div>
      )}

      {!s && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="h-3 w-20 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
            <div className="h-3 w-16 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
          </div>
          <div className="h-1.5 w-full animate-pulse rounded-full bg-neutral-100 dark:bg-neutral-800" />
          <div className="flex items-center justify-between">
            <div className="h-3 w-24 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
            <div className="h-3 w-20 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
          </div>
        </div>
      )}
    </div>
  );
}
