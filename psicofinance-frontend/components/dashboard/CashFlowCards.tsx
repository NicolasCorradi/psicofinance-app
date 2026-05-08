"use client";

import { TrendingUp, Clock, AlertCircle } from "lucide-react";
import type { MetricasDashboard } from "@/lib/types";

function fmtPesos(n: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency", currency: "ARS",
    notation: "compact", maximumFractionDigits: 1,
  }).format(n);
}

interface Props { metricas: MetricasDashboard | null }

export default function CashFlowCards({ metricas: m }: Props) {
  const sinCobrarColor = m && m.deudores > 0 ? "text-red-500" : "text-neutral-900";

  const cards = [
    {
      titulo:     "Cobrado este mes",
      valor:      m?.cobrado_mes ?? null,
      sub:        m ? `${m.total_turnos_mes} sesión${m.total_turnos_mes !== 1 ? "es" : ""}` : "–",
      Icon:       TrendingUp,
      iconColor:  "text-emerald-500",
      valorColor: "text-emerald-600",
    },
    {
      titulo:     "En camino",
      valor:      m?.en_camino_mes ?? null,
      sub:        "Prepagas pendientes",
      Icon:       Clock,
      iconColor:  "text-amber-500",
      valorColor: "text-amber-600",
    },
    {
      titulo:     "Sin cobrar",
      valor:      m?.deudores ?? null,
      sub:        m && m.deudores > 0 ? "Pagos vencidos" : "Todo al día",
      Icon:       AlertCircle,
      iconColor:  "text-red-400",
      valorColor: sinCobrarColor,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {cards.map(({ titulo, valor, sub, Icon, iconColor, valorColor }) => (
        <div key={titulo} className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
              {titulo}
            </p>
            <Icon className={`h-4 w-4 ${iconColor} opacity-60`} />
          </div>
          <p className={`mt-3 text-[1.75rem] font-semibold leading-none tracking-tight tabular-nums ${valorColor}`}>
            {valor !== null
              ? fmtPesos(valor)
              : <span className="animate-pulse text-neutral-200">——</span>
            }
          </p>
          <p className="mt-2 text-xs text-neutral-400">{sub}</p>
        </div>
      ))}
    </div>
  );
}
