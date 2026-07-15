"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { TrendingUp, TrendingDown, Clock, AlertCircle, ChevronRight } from "lucide-react";
import type { MetricasDashboard, TurnoResumen, ResumenEgresos } from "@/lib/types";
import { getTurnosDiferidos, getTurnosCobradosMes } from "@/lib/api";
import Sheet from "@/components/ui/Sheet";
import { fmtPesosCompacto as fmtPesos } from "@/lib/format";

function fmtFecha(s: string | null): string {
  if (!s) return "–";
  return new Date(s + "T00:00:00").toLocaleDateString("es-AR", {
    day: "numeric", month: "short",
  });
}

type TipoSheet = "cobrado_mes" | "en_camino" | "sin_cobrar" | null;

interface Props {
  metricas:       MetricasDashboard | null;
  resumenEgresos: ResumenEgresos | null;
}

export default function CashFlowCards({ metricas: m, resumenEgresos }: Props) {
  const sinCobrar = m?.deudores ?? 0;
  const hayDeuda  = sinCobrar > 0;

  const [sheetTipo,     setSheetTipo]     = useState<TipoSheet>(null);
  const [diferidos,     setDiferidos]     = useState<TurnoResumen[]>([]);
  const [cargandoSheet, setCargandoSheet] = useState(false);
  const [errorSheet,    setErrorSheet]    = useState(false);

  // Fecha para clasificar en_camino vs deudores
  const hoy          = new Date();
  const primerDiaMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const primerSigMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1);

  useEffect(() => {
    if (!sheetTipo) return;
    // Flag de cancelación: si el usuario cambia de sheet con un fetch en vuelo,
    // la respuesta vieja no debe pisar a la nueva
    let activo = true;
    setDiferidos([]);
    setErrorSheet(false);
    setCargandoSheet(true);
    const fn = sheetTipo === "cobrado_mes" ? getTurnosCobradosMes : getTurnosDiferidos;
    fn()
      .then(d => { if (activo) setDiferidos(d); })
      .catch(() => { if (activo) setErrorSheet(true); })
      .finally(() => { if (activo) setCargandoSheet(false); });
    return () => { activo = false; };
  }, [sheetTipo]);

  // cobrado_mes: el backend ya filtra por fecha_cobro_efectivo del mes actual
  const turnosCobradosMes = diferidos;

  // "En camino" = sesión de este mes que todavía no cobró (el mes no terminó)
  const turnosEnCamino = diferidos.filter(t => {
    if (!t.fecha_turno) return false;
    const f = new Date(t.fecha_turno + "T00:00:00");
    return f >= primerDiaMes && f < primerSigMes;
  });

  // "Sin cobrar" = sesión de meses anteriores que no cobró (vencida)
  const turnosSinCobrar = diferidos.filter(t => {
    if (!t.fecha_turno) return false;
    const f = new Date(t.fecha_turno + "T00:00:00");
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
      sub:        m ? `${m.total_turnos_mes} sesión${m.total_turnos_mes !== 1 ? "es" : ""} realizadas` : "–",
      Icon:       TrendingUp,
      iconBg:     "bg-emerald-100 dark:bg-emerald-500/10",
      iconColor:  "text-emerald-600 dark:text-emerald-400",
      valorColor: "text-emerald-600 dark:text-emerald-400",
      gradient:   "from-emerald-400 to-teal-500",
      href:       null as string | null,
    },
    {
      tipo:       "en_camino" as TipoSheet,
      titulo:     "En camino",
      valor:      m?.en_camino_mes ?? null,
      sub:        "Sesiones pendientes de cobro",
      Icon:       Clock,
      iconBg:     "bg-amber-100 dark:bg-amber-500/10",
      iconColor:  "text-amber-600 dark:text-amber-400",
      valorColor: "text-amber-600 dark:text-amber-400",
      gradient:   "from-amber-400 to-orange-400",
      href:       null as string | null,
    },
    {
      tipo:       "sin_cobrar" as TipoSheet,
      titulo:     "Sin cobrar",
      valor:      m?.deudores ?? null,
      sub:        hayDeuda ? "De meses anteriores" : "Todo al día ✓",
      Icon:       AlertCircle,
      iconBg:     hayDeuda ? "bg-red-100 dark:bg-red-500/10"     : "bg-emerald-100 dark:bg-emerald-500/10",
      iconColor:  hayDeuda ? "text-red-500 dark:text-red-400"   : "text-emerald-600 dark:text-emerald-400",
      valorColor: hayDeuda ? "text-red-600 dark:text-red-400"   : "text-emerald-600 dark:text-emerald-400",
      gradient:   hayDeuda ? "from-red-400 to-rose-500" : "from-emerald-400 to-teal-500",
      href:       null as string | null,
    },
    {
      tipo:       null as TipoSheet,
      titulo:     "Egresos del mes",
      valor:      resumenEgresos?.total ?? null,
      sub:        resumenEgresos
        ? `Fijos ${fmtPesos(resumenEgresos.total_fijos)} · Variables ${fmtPesos(resumenEgresos.total_variables)}`
        : "–",
      Icon:       TrendingDown,
      iconBg:     "bg-red-50 dark:bg-red-500/10",
      iconColor:  "text-red-400 dark:text-red-400",
      valorColor: "text-red-500 dark:text-red-400",
      gradient:   "from-red-400 to-rose-400",
      href:       "/egresos" as string | null,
    },
  ];

  const sheetTitle =
    sheetTipo === "cobrado_mes" ? `Cobrado este mes — ${fmtPesos(m?.cobrado_mes ?? 0)}` :
    sheetTipo === "en_camino"   ? `En camino — ${fmtPesos(m?.en_camino_mes ?? 0)}` :
    `Sin cobrar — ${fmtPesos(m?.deudores ?? 0)}`;

  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map(({ tipo, titulo, valor, sub, Icon, iconBg, iconColor, valorColor, gradient, href }) => {
          const inner = (
            <>
              <div className={`h-1 bg-gradient-to-r ${gradient}`} />
              <div className="p-5">
                <div className="flex items-start justify-between">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                    {titulo}
                  </p>
                  <div className="flex items-center gap-1">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${iconBg}`}>
                      <Icon className={`h-4 w-4 ${iconColor}`} strokeWidth={2} />
                    </div>
                    <ChevronRight className="h-3.5 w-3.5 text-neutral-300 dark:text-neutral-600" />
                  </div>
                </div>
                <p className={`mt-3 text-[1.75rem] font-bold leading-none tracking-tight tabular-nums ${valorColor}`}>
                  {valor !== null
                    ? fmtPesos(valor)
                    : <span className="animate-pulse text-neutral-200 dark:text-neutral-700">——</span>
                  }
                </p>
                <p className="mt-2 text-xs text-neutral-400 dark:text-neutral-500">{sub}</p>
              </div>
            </>
          );

          const cls = "relative overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5 transition-all duration-150 text-left cursor-pointer hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 dark:bg-neutral-900 dark:ring-white/10";

          return href ? (
            <Link key={titulo} href={href} className={cls}>{inner}</Link>
          ) : (
            <button key={titulo} type="button" onClick={() => setSheetTipo(tipo)} className={`w-full ${cls}`}>
              {inner}
            </button>
          );
        })}
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
              <div key={i} className="h-16 animate-pulse rounded-xl bg-neutral-100 dark:bg-neutral-800" />
            ))}
          </div>
        ) : errorSheet ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-3 text-3xl">⚠️</div>
            <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">No se pudo cargar el detalle</p>
            <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">Intentá de nuevo en unos segundos</p>
          </div>
        ) : turnosActivos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-3 text-3xl">🎉</div>
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-300">
              {sheetTipo === "cobrado_mes" ? "Sin cobros registrados este mes"
               : sheetTipo === "en_camino" ? "No hay sesiones pendientes de cobro"
               : "No hay pagos vencidos"}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="mb-2 text-xs text-neutral-400 dark:text-neutral-500">
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

function TurnoRow({ turno: t, tipo }: { turno: TurnoResumen; tipo: Exclude<TipoSheet, null> }) {
  const fechaLabel =
    tipo === "cobrado_mes" ? `Cobrado ${fmtFecha(t.fecha_cobro_efectivo)}` :
    tipo === "en_camino"   ? `Sesión del mes en curso` :
    `Sesión vencida`;

  const vencido = tipo === "sin_cobrar";

  return (
    <div className="flex items-center justify-between rounded-xl border border-neutral-100 bg-neutral-50 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-950/40">
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-neutral-800 dark:text-neutral-100">
            {t.paciente_nombre || "Sin nombre"}
          </span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
            tipo === "cobrado_mes" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400" :
            vencido ? "bg-red-100 text-red-600 dark:bg-red-500/10 dark:text-red-400" : "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"
          }`}>
            {tipo === "cobrado_mes" ? "Cobrado" : vencido ? "Vencido" : "Pendiente"}
          </span>
        </div>
        <span className="text-xs text-neutral-400 dark:text-neutral-500">
          {fmtFecha(t.fecha_turno)} · {fechaLabel}
          {t.prepaga && <span className="ml-1">· {t.prepaga}</span>}
        </span>
      </div>
      <div className="flex flex-col items-end">
        {t.moneda === "USD" && (
          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700 mb-0.5 dark:bg-emerald-500/10 dark:text-emerald-400">USD</span>
        )}
        <span className={`text-sm font-bold tabular-nums ${
          tipo === "cobrado_mes" ? "text-emerald-600 dark:text-emerald-400" :
          vencido ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"
        }`}>
          {t.moneda === "USD"
            ? `${t.monto.toLocaleString("es-AR")} USD`
            : new Intl.NumberFormat("es-AR", {
                style: "currency", currency: "ARS", maximumFractionDigits: 0,
              }).format(t.monto)
          }
        </span>
        {t.moneda === "USD" && t.tipo_cambio && (
          <span className="text-[10px] text-neutral-400 dark:text-neutral-500">
            ≈ {new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(t.monto * t.tipo_cambio)}
          </span>
        )}
      </div>
    </div>
  );
}
