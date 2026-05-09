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
  const sinCobrar  = m?.deudores ?? 0;
  const hayDeuda   = sinCobrar > 0;

  const cards = [
    {
      titulo:     "Cobrado este mes",
      valor:      m?.cobrado_mes ?? null,
      sub:        m ? `${m.total_turnos_mes} sesión${m.total_turnos_mes !== 1 ? "es" : ""}` : "–",
      Icon:       TrendingUp,
      iconBg:     "bg-emerald-100",
      iconColor:  "text-emerald-600",
      valorColor: "text-emerald-600",
      gradient:   "from-emerald-400 to-teal-500",
    },
    {
      titulo:     "En camino",
      valor:      m?.en_camino_mes ?? null,
      sub:        "Prepagas pendientes",
      Icon:       Clock,
      iconBg:     "bg-amber-100",
      iconColor:  "text-amber-600",
      valorColor: "text-amber-600",
      gradient:   "from-amber-400 to-orange-400",
    },
    {
      titulo:     "Sin cobrar",
      valor:      m?.deudores ?? null,
      sub:        hayDeuda ? "Pagos vencidos" : "Todo al día ✓",
      Icon:       AlertCircle,
      iconBg:     hayDeuda ? "bg-red-100"     : "bg-emerald-100",
      iconColor:  hayDeuda ? "text-red-500"   : "text-emerald-600",
      valorColor: hayDeuda ? "text-red-600"   : "text-emerald-600",
      gradient:   hayDeuda ? "from-red-400 to-rose-500" : "from-emerald-400 to-teal-500",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {cards.map(({ titulo, valor, sub, Icon, iconBg, iconColor, valorColor, gradient }) => (
        <div key={titulo} className="relative overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
          {/* Tira de gradiente superior */}
          <div className={`h-1 bg-gradient-to-r ${gradient}`} />
          <div className="p-5">
            <div className="flex items-start justify-between">
              <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-400">
                {titulo}
              </p>
              <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${iconBg}`}>
                <Icon className={`h-4 w-4 ${iconColor}`} strokeWidth={2} />
              </div>
            </div>
            <p className={`mt-3 text-[1.75rem] font-bold leading-none tracking-tight tabular-nums ${valorColor}`}>
              {valor !== null
                ? fmtPesos(valor)
                : <span className="animate-pulse text-neutral-200">——</span>
              }
            </p>
            <p className="mt-2 text-xs text-neutral-400">{sub}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
