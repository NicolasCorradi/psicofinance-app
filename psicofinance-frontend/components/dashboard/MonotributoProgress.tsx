"use client";

// Gráfico de objetivo Monotributo — donut SVG puro, sin librerías.
// Muestra visualmente qué % del tope anual ya se consumió.

import { useEffect, useState } from "react";
import { getSemaforo } from "@/lib/api";
import type { ResultadoSemaforo, EstadoSemaforo } from "@/lib/types";

const CX = 80, CY = 80, R = 58, GROSOR = 9;
const CIRC = 2 * Math.PI * R;

function colorArco(estado: EstadoSemaforo): string {
  return estado === "VERDE" ? "#10B981" : estado === "AMARILLO" ? "#F59E0B" : "#EF4444";
}

function fmtPesos(n: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency", currency: "ARS",
    notation: "compact", maximumFractionDigits: 1,
  }).format(n);
}

export default function MonotributoProgress() {
  const [s, set] = useState<ResultadoSemaforo | null>(null);

  useEffect(() => { getSemaforo().then(set).catch(() => {}); }, []);

  const pct    = s ? Math.min(s.porcentaje_consumido, 100) : 0;
  const offset = CIRC * (1 - pct / 100);
  const color  = s ? colorArco(s.estado) : "#E5E7EB";

  return (
    <div className="flex flex-col rounded-2xl bg-white p-5 shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
        Objetivo Monotributo
      </p>

      {/* Donut */}
      <div className="flex flex-col items-center py-4">
        <svg width="160" height="160" viewBox="0 0 160 160" className="overflow-visible">
          {/* Track */}
          <circle cx={CX} cy={CY} r={R} fill="none" stroke="#F3F4F6" strokeWidth={GROSOR} />
          {/* Arco de progreso */}
          <circle
            cx={CX} cy={CY} r={R}
            fill="none"
            stroke={color}
            strokeWidth={GROSOR}
            strokeDasharray={CIRC}
            strokeDashoffset={offset}
            strokeLinecap="round"
            transform={`rotate(-90 ${CX} ${CY})`}
            style={{ transition: "stroke-dashoffset 0.8s ease, stroke 0.4s" }}
          />
          {/* Porcentaje */}
          <text x={CX} y={CY - 6} textAnchor="middle" fontSize="22" fontWeight="600" fontFamily="inherit" fill="#111827">
            {s ? `${pct.toFixed(0)}%` : "–"}
          </text>
          {/* Categoría */}
          <text x={CX} y={CY + 14} textAnchor="middle" fontSize="11" fontFamily="inherit" fill="#9CA3AF">
            {s ? `Categoría ${s.categoria_actual}` : "Cargando…"}
          </text>
        </svg>
      </div>

      {/* Stats debajo del donut */}
      {s && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-neutral-500">
            <span>Facturado</span>
            <span className="font-semibold text-neutral-800">{fmtPesos(s.facturado_12m)}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${pct}%`, backgroundColor: color }}
            />
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-neutral-400">Tope {fmtPesos(s.tope_anual)}</span>
            <span style={{ color }} className="font-semibold">{fmtPesos(s.margen_disponible)} libre</span>
          </div>
        </div>
      )}
    </div>
  );
}
