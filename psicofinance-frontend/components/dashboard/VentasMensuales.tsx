"use client";

// Gráfico de ventas mensuales — barras div puras, sin librerías externas.
// Eje Y con valores K, tooltip con variación vs mes anterior.

import { useState } from "react";
import type { VentaMensual } from "@/lib/types";

interface Props { data: VentaMensual[] }

function fmtPesos(n: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency", currency: "ARS",
    notation: "compact", maximumFractionDigits: 1,
  }).format(n);
}

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

  const variacionGlobal =
    data.length >= 2 && data[data.length - 2].cobrado > 0
      ? ((mesActual.cobrado - data[data.length - 2].cobrado) /
          data[data.length - 2].cobrado) * 100
      : null;

  // Variación de una barra respecto a la anterior
  const varPct = (i: number): number | null => {
    if (i === 0 || data[i - 1].cobrado === 0) return null;
    return ((data[i].cobrado - data[i - 1].cobrado) / data[i - 1].cobrado) * 100;
  };

  return (
    <div className="flex flex-col rounded-2xl bg-white p-5 shadow-sm">
      {/* Encabezado */}
      <div className="flex items-start justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
          Ventas mensuales
        </p>
        {variacionGlobal !== null && (
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
            variacionGlobal >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500"
          }`}>
            {variacionGlobal >= 0 ? "+" : ""}{variacionGlobal.toFixed(0)}% vs anterior
          </span>
        )}
      </div>

      {/* Valor del mes actual */}
      <p className="mt-1 text-[1.75rem] font-semibold leading-none tracking-tight tabular-nums text-neutral-900">
        {data.length > 0
          ? fmtPesos(mesActual?.cobrado ?? 0)
          : <span className="animate-pulse text-neutral-200">——</span>
        }
      </p>

      {/* Gráfico con eje Y */}
      {data.length > 0 ? (
        <div className="mt-5 flex gap-2">
          {/* Eje Y */}
          <div className="flex flex-col justify-between pb-6 text-right" style={{ minWidth: 28 }}>
            <span className="text-[9px] leading-none text-neutral-300">{fmtK(maxValor)}</span>
            <span className="text-[9px] leading-none text-neutral-300">{fmtK(maxValor / 2)}</span>
            <span className="text-[9px] leading-none text-neutral-300">0</span>
          </div>

          {/* Barras */}
          <div className="flex flex-1 items-end gap-1.5" style={{ height: ALTURA_MAX + 24 }}>
            {data.map((d, i) => {
              const altPx   = d.cobrado === 0 ? 2 : Math.max((d.cobrado / maxValor) * ALTURA_MAX, 4);
              const esHover  = hover === i;
              const esActual = i === data.length - 1;
              const vp       = varPct(i);

              return (
                <div
                  key={i}
                  className="relative flex flex-1 flex-col items-center gap-1.5"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                >
                  {/* Tooltip */}
                  {esHover && (
                    <div className="absolute bottom-full z-10 mb-2 whitespace-nowrap rounded-xl bg-neutral-900 px-3 py-2 text-center shadow-lg">
                      <p className="text-xs font-semibold text-white">{fmtPesos(d.cobrado)}</p>
                      <p className="text-[10px] text-neutral-400">{d.mes}</p>
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
                    style={{
                      height: altPx,
                      backgroundColor: esActual ? "#111827" : esHover ? "#6B7280" : "#E5E7EB",
                    }}
                  />

                  {/* Etiqueta mes */}
                  <span className={`text-[10px] ${esActual ? "font-semibold text-neutral-700" : "text-neutral-400"}`}>
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
                <div className="w-full animate-pulse rounded-t-md bg-neutral-100" style={{ height: 20 + i * 10 }} />
                <span className="h-2.5 w-4 animate-pulse rounded bg-neutral-100" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
