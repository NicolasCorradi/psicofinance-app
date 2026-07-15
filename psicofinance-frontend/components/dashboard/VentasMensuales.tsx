"use client";

import { useState } from "react";
import type { VentaMensual } from "@/lib/types";
import { fmtPesosCompacto as fmtPesos } from "@/lib/format";

interface Props { data: VentaMensual[] }

function fmtK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${Math.round(n / 1_000)}K`;
  return String(Math.round(n));
}

const ALTURA_MAX = 96;

export default function VentasMensuales({ data }: Props) {
  const [hover, setHover] = useState<number | null>(null);

  const maxValor  = Math.max(...data.map((d) => d.cobrado), 1);
  const mesActual = data[data.length - 1];

  const varPct = (i: number): number | null => {
    if (i === 0 || data[i - 1].cobrado === 0) return null;
    return ((data[i].cobrado - data[i - 1].cobrado) / data[i - 1].cobrado) * 100;
  };

  return (
    <div className="flex flex-col rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5 dark:bg-neutral-900 dark:ring-white/10">
      {/* Encabezado */}
      <div className="flex items-start justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
          Ventas mensuales
        </p>
      </div>

      {/* Valor del mes actual */}
      <p className="mt-1 text-[1.75rem] font-bold leading-none tracking-tight tabular-nums text-neutral-900 dark:text-neutral-100">
        {data.length > 0
          ? fmtPesos(mesActual?.cobrado ?? 0)
          : <span className="animate-pulse text-neutral-200 dark:text-neutral-700">——</span>
        }
      </p>

      {/* Gráfico */}
      {data.length > 0 ? (
        <div className="mt-5 flex gap-3">
          {/* Eje Y */}
          <div className="flex flex-col justify-between pb-6 text-right" style={{ minWidth: 32 }}>
            <span className="text-[10px] tabular-nums leading-none text-neutral-400 dark:text-neutral-500">{fmtK(maxValor)}</span>
            <span className="text-[10px] tabular-nums leading-none text-neutral-300 dark:text-neutral-600">{fmtK(maxValor / 2)}</span>
            <span className="text-[10px] tabular-nums leading-none text-neutral-300 dark:text-neutral-600">0</span>
          </div>

          {/* Barras */}
          <div className="flex flex-1 items-end gap-1.5" style={{ height: ALTURA_MAX + 24 }}>
            {data.map((d, i) => {
              const altPx   = d.cobrado === 0 ? 2 : Math.max((d.cobrado / maxValor) * ALTURA_MAX, 4);
              const esHover  = hover === i;
              const esActual = i === data.length - 1;
              const vp       = varPct(i);

              const barStyle = esActual
                ? { height: altPx, background: "linear-gradient(180deg, #818CF8 0%, #4F46E5 100%)" }
                : { height: altPx, backgroundColor: esHover ? "#A5B4FC" : "#C7D2FE" };

              return (
                <div
                  key={i}
                  className="relative flex flex-1 flex-col items-center gap-1.5"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  // En touch no hay hover: el tap alterna el tooltip
                  onClick={() => setHover(hover === i ? null : i)}
                >
                  {/* Tooltip */}
                  {esHover && (
                    <div className="absolute bottom-full z-10 mb-2 whitespace-nowrap rounded-xl bg-slate-900 px-3 py-2 text-center shadow-lg ring-1 ring-white/10">
                      <p className="text-xs font-semibold text-white">{fmtPesos(d.cobrado)}</p>
                      <p className="text-[10px] text-slate-400">{d.mes}</p>
                      {vp !== null && (
                        <p className={`mt-0.5 text-[10px] font-medium ${vp >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {vp >= 0 ? "▲" : "▼"} {Math.abs(vp).toFixed(0)}% vs anterior
                        </p>
                      )}
                    </div>
                  )}

                  {/* Barra */}
                  <div
                    className="w-full rounded-t-md transition-all duration-300"
                    style={barStyle}
                  />

                  {/* Etiqueta mes */}
                  <span className={`text-[10px] ${esActual ? "font-semibold text-indigo-600 dark:text-indigo-400" : "text-neutral-400 dark:text-neutral-500"}`}>
                    {d.mes}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="mt-4 flex gap-2">
          <div className="w-7" />
          <div className="flex flex-1 items-end gap-1.5" style={{ height: ALTURA_MAX + 24 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
                <div className="w-full animate-pulse rounded-t-md bg-indigo-50 dark:bg-indigo-500/10" style={{ height: 20 + i * 10 }} />
                <span className="h-2.5 w-4 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
