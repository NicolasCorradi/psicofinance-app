"use client";

import { useState, useEffect } from "react";
import { TrendingUp, Clock, AlertCircle, ChevronRight } from "lucide-react";
import type { MetricasDashboard, TurnoRead } from "@/lib/types";
import { getTurnosDiferidos, getTurnosCobradosMes } from "@/lib/api";
import Sheet from "@/components/ui/Sheet";

function fmtPesos(n: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency", currency: "ARS",
    notation: "compact", maximumFractionDigits: 1,
  }).format(n);
}

function fmtFecha(s: string | null): string {
  if (!s) return "–";
  return new Date(s + "T00:00:00").toLocaleDateString("es-AR", {
    day: "numeric", month: "short",
  });
}

type TipoSheet = "cobrado_mes" | "en_camino" | "sin_cobrar" | null;

interface Props { metricas: MetricasDashboard | null }

export default function CashFlowCards({ metricas: m }: Props) {
  const sinCobrar = m?.deudores ?? 0;
  const hayDeuda  = sinCobrar > 0;

  const [sheetTipo,    setSheetTipo]    = useState<TipoSheet>(null);
  const [diferidos,    setDiferidos]    = useState<TurnoRead[]>([]);
  const [cargandoSheet, setCargandoSheet] = useState(false);

  // Fecha para clasificar en_camino vs deudores
  const hoy          = new Date();
  const primerDiaMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const primerSigMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1);

  useEffect(() => {
    if (!sheetTipo) return;
    // Reset inmediato para evitar flash de datos del sheet anterior
    setDiferidos([]);
    setCargandoSheet(true);
    if (sheetTipo === "cobrado_mes") {
      getTurnosCobradosMes()
        .then(setDiferidos)
        .catch(() => setDiferidos([]))
        .finally(() => setCargandoSheet(false));
    } else {
      getTurnosDiferidos()
        .then(setDiferidos)
        .catch(() => setDiferidos([]))
        .finally(() => setCargandoSheet(false));
    }
  }, [sheetTipo]);

  // cobrado_mes: el backend ya filtra por fecha_cobro_efectivo del mes actual
  const turnosCobradosMes = diferidos;

  const turnosEnCamino = diferidos.filter(t => {
    if (!t.fecha_cobro_estimada) return false;
    const f = new Date(t.fecha_cobro_estimada + "T00:00:00");
    return f >= primerDiaMes && f < primerSigMes;
  });

  const turnosSinCobrar = diferidos.filter(t => {
    if (!t.fecha_cobro_estimada) return true;
    const f = new Date(t.fecha_cobro_estimada + "T00:00:00");
    return f < primerDiaMes;
  });

  const turnosActivos =
    sheetTipo === "cobrado_mes" ? turnosCobradosMes :
    sheetTipo === "en_camino"  ? turnosEnCamino :
    turnosSinCobrar;

  const cards = [
    {
      tipo:       "cobrado_mes" as TipoSheet,
      titulo:     "Cobrado este mes",
      valor:      m?.cobrado_mes ?? null,
      sub:        m ? `${m.total_turnos_mes} sesión${m.total_turnos_mes !== 1 ? "es" : ""}` : "–",
      Icon:       TrendingUp,
      iconBg:     "bg-emerald-100",
      iconColor:  "text-emerald-600",
      valorColor: "text-emerald-600",
      gradient:   "from-emerald-400 to-teal-500",
      clickable:  true,
    },
    {
      tipo:       "en_camino" as TipoSheet,
      titulo:     "En camino",
      valor:      m?.en_camino_mes ?? null,
      sub:        "Prepagas pendientes",
      Icon:       Clock,
      iconBg:     "bg-amber-100",
      iconColor:  "text-amber-600",
      valorColor: "text-amber-600",
      gradient:   "from-amber-400 to-orange-400",
      clickable:  true,
    },
    {
      tipo:       "sin_cobrar" as TipoSheet,
      titulo:     "Sin cobrar",
      valor:      m?.deudores ?? null,
      sub:        hayDeuda ? "Pagos vencidos" : "Todo al día ✓",
      Icon:       AlertCircle,
      iconBg:     hayDeuda ? "bg-red-100"     : "bg-emerald-100",
      iconColor:  hayDeuda ? "text-red-500"   : "text-emerald-600",
      valorColor: hayDeuda ? "text-red-600"   : "text-emerald-600",
      gradient:   hayDeuda ? "from-red-400 to-rose-500" : "from-emerald-400 to-teal-500",
      clickable:  true,
    },
  ];

  const sheetTitle =
    sheetTipo === "cobrado_mes" ? `Cobrado este mes — ${fmtPesos(m?.cobrado_mes ?? 0)}` :
    sheetTipo === "en_camino"   ? `En camino — ${fmtPesos(m?.en_camino_mes ?? 0)}` :
    `Sin cobrar — ${fmtPesos(m?.deudores ?? 0)}`;

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {cards.map(({ tipo, titulo, valor, sub, Icon, iconBg, iconColor, valorColor, gradient, clickable }) => (
          <div
            key={titulo}
            onClick={() => clickable && setSheetTipo(tipo)}
            className={`relative overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5 transition-all duration-150 ${
              clickable
                ? "cursor-pointer hover:shadow-md hover:-translate-y-0.5 active:translate-y-0"
                : ""
            }`}
          >
            <div className={`h-1 bg-gradient-to-r ${gradient}`} />
            <div className="p-5">
              <div className="flex items-start justify-between">
                <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-400">
                  {titulo}
                </p>
                <div className="flex items-center gap-1">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${iconBg}`}>
                    <Icon className={`h-4 w-4 ${iconColor}`} strokeWidth={2} />
                  </div>
                  {clickable && (
                    <ChevronRight className="h-3.5 w-3.5 text-neutral-300" />
                  )}
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

      {/* Sheet de desglose */}
      <Sheet
        open={!!sheetTipo}
        onClose={() => setSheetTipo(null)}
        title={sheetTitle}
      >
        {cargandoSheet ? (
          <div className="flex flex-col gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-neutral-100" />
            ))}
          </div>
        ) : turnosActivos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-3 text-3xl">🎉</div>
            <p className="text-sm font-medium text-neutral-600">
              {sheetTipo === "cobrado_mes" ? "Sin cobros registrados este mes"
               : sheetTipo === "en_camino" ? "No hay prepagas pendientes este mes"
               : "No hay pagos vencidos"}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="mb-2 text-xs text-neutral-400">
              {turnosActivos.length} turno{turnosActivos.length !== 1 ? "s" : ""}
            </p>
            {turnosActivos.map(t => (
              <TurnoRow key={t.id} turno={t} tipo={sheetTipo ?? "sin_cobrar"} />
            ))}
          </div>
        )}
      </Sheet>
    </>
  );
}

function TurnoRow({ turno: t, tipo }: { turno: TurnoRead; tipo: Exclude<TipoSheet, null> }) {
  const fechaLabel =
    tipo === "cobrado_mes" ? `Cobrado ${fmtFecha(t.fecha_cobro_efectivo)}` :
    tipo === "en_camino"   ? `Cobro est. ${fmtFecha(t.fecha_cobro_estimada)}` :
    t.fecha_cobro_estimada ? `Vencido ${fmtFecha(t.fecha_cobro_estimada)}` : "Sin fecha de cobro";

  const vencido = tipo === "sin_cobrar";

  return (
    <div className="flex items-center justify-between rounded-xl border border-neutral-100 bg-neutral-50 px-4 py-3">
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-neutral-800">
            {t.prepaga ?? "Directo"}
          </span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
            tipo === "cobrado_mes" ? "bg-emerald-100 text-emerald-700" :
            vencido ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-700"
          }`}>
            {tipo === "cobrado_mes" ? "Cobrado" : vencido ? "Vencido" : "En camino"}
          </span>
        </div>
        <span className="text-xs text-neutral-400">
          Sesión {fmtFecha(t.fecha_turno)} · {fechaLabel}
        </span>
      </div>
      <span className={`text-sm font-bold tabular-nums ${
        tipo === "cobrado_mes" ? "text-emerald-600" :
        vencido ? "text-red-600" : "text-amber-600"
      }`}>
        {new Intl.NumberFormat("es-AR", {
          style: "currency", currency: "ARS", maximumFractionDigits: 0,
        }).format(t.monto)}
      </span>
    </div>
  );
}
