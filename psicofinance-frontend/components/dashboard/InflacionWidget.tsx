"use client";

import type { MetricasDashboard, VentaMensual } from "@/lib/types";

function fmtPesos(n: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency", currency: "ARS",
    notation: "compact", maximumFractionDigits: 1,
  }).format(n);
}

interface Props { metricas: MetricasDashboard | null }

// Mini sparkline SVG usando los cobrados mensuales como proxy de evolución
function Sparkline({ data }: { data: VentaMensual[] }) {
  if (data.length < 2) return null;
  const W = 100, H = 28;
  const vals = data.map((d) => d.cobrado);
  const min  = Math.min(...vals);
  const max  = Math.max(...vals, min + 1);
  const pts  = vals.map((v, i) => {
    const x = (i / (vals.length - 1)) * W;
    const y = H - ((v - min) / (max - min)) * (H - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-7 w-full overflow-visible"
      preserveAspectRatio="none"
    >
      <polyline
        points={pts}
        fill="none"
        stroke="#f59e0b"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.7"
      />
    </svg>
  );
}

export default function InflacionWidget({ metricas: m }: Props) {
  const perdida   = m?.perdida_inflacion ?? 0;
  const sesiones  = m?.sesiones_perdidas_equivalente ?? 0;
  const ventas    = m?.ventas_mensuales ?? [];

  // Variación del cobrado: mes actual vs mes anterior (proxy de presión inflacionaria)
  const varPct =
    ventas.length >= 2 && ventas[ventas.length - 2].cobrado > 0
      ? ((ventas[ventas.length - 1].cobrado - ventas[ventas.length - 2].cobrado) /
          ventas[ventas.length - 2].cobrado) * 100
      : null;

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
          Pérdida por inflación
        </p>
        {varPct !== null && (
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
            varPct >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
          }`}>
            {varPct >= 0 ? "+" : ""}{varPct.toFixed(0)}% cobrado
          </span>
        )}
      </div>

      {/* Valor principal */}
      <p className={`mt-3 text-[1.75rem] font-semibold leading-none tracking-tight tabular-nums ${perdida > 0 ? "text-amber-600" : "text-neutral-900"}`}>
        {m ? fmtPesos(perdida) : <span className="animate-pulse text-neutral-200">——</span>}
      </p>

      {/* Sparkline */}
      {ventas.length >= 2 && (
        <div className="mt-3">
          <Sparkline data={ventas} />
        </div>
      )}

      {/* Descripción */}
      <p className="mt-2 text-xs text-neutral-400">
        {m && sesiones > 0 ? (
          <>
            Las prepagas licuaron{" "}
            <span className="font-semibold text-amber-500">
              {sesiones} sesión{sesiones !== 1 ? "es" : ""}
            </span>{" "}
            de honorario.
          </>
        ) : m ? "Sin pérdidas este período." : "Calculando…"}
      </p>
    </div>
  );
}
