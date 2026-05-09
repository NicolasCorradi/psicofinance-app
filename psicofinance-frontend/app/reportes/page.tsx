"use client";

// Reportes — vista analítica con KPIs anuales, ranking de pacientes
// y proyecciones derivadas de los datos existentes (sin endpoints nuevos).

import { useEffect, useMemo, useState } from "react";
import { TrendingUp, Users, DollarSign, Target, Award, Calendar } from "lucide-react";
import { getMetricasDashboard, getPacientes, getSemaforo } from "@/lib/api";
import type { MetricasDashboard, PacienteConStats, ResultadoSemaforo } from "@/lib/types";
import { avatarCls, iniciales } from "@/lib/avatar";

function fmtPesos(n: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency", currency: "ARS",
    notation: "compact", maximumFractionDigits: 1,
  }).format(n);
}

export default function ReportesPage() {
  const [metricas,  setMetricas]  = useState<MetricasDashboard | null>(null);
  const [pacientes, setPacientes] = useState<PacienteConStats[]>([]);
  const [semaforo,  setSemaforo]  = useState<ResultadoSemaforo | null>(null);
  const [cargando,  setCargando]  = useState(true);

  useEffect(() => {
    Promise.all([getMetricasDashboard(), getPacientes(), getSemaforo()])
      .then(([m, p, s]) => {
        setMetricas(m); setPacientes(p); setSemaforo(s);
      })
      .catch(() => {})
      .finally(() => setCargando(false));
  }, []);

  // KPIs anuales derivados
  const kpis = useMemo(() => {
    if (!metricas) return null;
    const cobradoAno   = metricas.ventas_mensuales.reduce((s, v) => s + v.cobrado, 0);
    const mesesActivos = metricas.ventas_mensuales.filter(v => v.cobrado > 0).length;
    const promedioMes  = mesesActivos > 0 ? cobradoAno / mesesActivos : 0;
    const totalSesiones = pacientes.reduce((s, p) => s + p.total_sesiones, 0);
    const ticket       = totalSesiones > 0 ? cobradoAno / totalSesiones : 0;
    const activos      = pacientes.filter(p => p.sesiones_mes > 0).length;
    return { cobradoAno, promedioMes, ticket, activos, totalSesiones };
  }, [metricas, pacientes]);

  // Top pacientes por cobrado
  const topPacientes = useMemo(() => {
    return [...pacientes]
      .filter(p => p.cobrado_total > 0)
      .sort((a, b) => b.cobrado_total - a.cobrado_total)
      .slice(0, 5);
  }, [pacientes]);

  const totalRanking = topPacientes.reduce((s, p) => s + p.cobrado_total, 0);

  // Distribución activos vs inactivos
  const distribucion = useMemo(() => {
    const activos    = pacientes.filter(p => (p.dias_inactivo ?? 999) <= 30).length;
    const moderados  = pacientes.filter(p => (p.dias_inactivo ?? 999) > 30 && (p.dias_inactivo ?? 0) <= 90).length;
    const inactivos  = pacientes.filter(p => (p.dias_inactivo ?? 0) > 90).length;
    return { activos, moderados, inactivos, total: pacientes.length };
  }, [pacientes]);

  // Año de referencia
  const anioActual = new Date().getFullYear();

  return (
    <main className="mx-auto max-w-screen-lg px-4 py-6 lg:py-8">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-xl font-bold tracking-tight text-neutral-900">Reportes</h1>
        <p className="text-xs text-neutral-500">
          Análisis financiero del consultorio · año {anioActual}
        </p>
      </div>

      {/* KPIs anuales */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          icon={DollarSign}
          label="Facturado 12m"
          value={kpis ? fmtPesos(kpis.cobradoAno) : "—"}
          gradient="from-emerald-400 to-teal-500"
          color="text-emerald-600"
          iconBg="bg-emerald-100"
          iconColor="text-emerald-600"
          loading={cargando}
        />
        <KpiCard
          icon={Calendar}
          label="Promedio mensual"
          value={kpis ? fmtPesos(kpis.promedioMes) : "—"}
          gradient="from-indigo-400 to-violet-500"
          color="text-indigo-600"
          iconBg="bg-indigo-100"
          iconColor="text-indigo-600"
          loading={cargando}
        />
        <KpiCard
          icon={TrendingUp}
          label="Ticket promedio"
          value={kpis ? fmtPesos(kpis.ticket) : "—"}
          gradient="from-amber-400 to-orange-400"
          color="text-amber-600"
          iconBg="bg-amber-100"
          iconColor="text-amber-600"
          loading={cargando}
        />
        <KpiCard
          icon={Users}
          label="Pacientes activos"
          value={kpis ? `${kpis.activos} / ${pacientes.length}` : "—"}
          gradient="from-cyan-400 to-blue-500"
          color="text-cyan-600"
          iconBg="bg-cyan-100"
          iconColor="text-cyan-600"
          loading={cargando}
        />
      </div>

      {/* Sección 1: Evolución anual + Estado fiscal */}
      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <EvolucionAnual data={metricas?.ventas_mensuales ?? []} cargando={cargando} />
        </div>
        <EstadoFiscal semaforo={semaforo} cargando={cargando} />
      </div>

      {/* Sección 2: Ranking + Distribución */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RankingPacientes top={topPacientes} total={totalRanking} cargando={cargando} />
        <DistribucionActividad d={distribucion} cargando={cargando} />
      </div>
    </main>
  );
}

// ── Componentes ─────────────────────────────────────────────────────────────

interface KpiCardProps {
  icon: React.ElementType;
  label: string;
  value: string;
  gradient: string;
  color: string;
  iconBg: string;
  iconColor: string;
  loading: boolean;
}

function KpiCard({ icon: Icon, label, value, gradient, color, iconBg, iconColor, loading }: KpiCardProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
      <div className={`h-1 bg-gradient-to-r ${gradient}`} />
      <div className="p-4">
        <div className="flex items-start justify-between">
          <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-400">{label}</p>
          <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${iconBg}`}>
            <Icon className={`h-4 w-4 ${iconColor}`} strokeWidth={2} />
          </div>
        </div>
        {loading ? (
          <div className="mt-3 h-7 w-24 animate-pulse rounded bg-neutral-100" />
        ) : (
          <p className={`mt-3 text-xl font-bold leading-none tracking-tight tabular-nums ${color}`}>{value}</p>
        )}
      </div>
    </div>
  );
}

function EvolucionAnual({ data, cargando }: { data: { mes: string; cobrado: number }[]; cargando: boolean }) {
  const max = Math.max(...data.map(d => d.cobrado), 1);
  const totalAno = data.reduce((s, d) => s + d.cobrado, 0);
  const mesesActivos = data.filter(d => d.cobrado > 0).length;
  const promedio = mesesActivos > 0 ? totalAno / mesesActivos : 0;

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-400">Evolución 12 meses</p>
          <p className="mt-1 text-[1.5rem] font-bold leading-none tracking-tight tabular-nums text-neutral-900">
            {cargando ? <span className="animate-pulse text-neutral-200">——</span> : fmtPesos(totalAno)}
          </p>
        </div>
        {!cargando && data.length > 0 && (
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-neutral-400">Línea promedio</p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums text-indigo-600">{fmtPesos(promedio)}</p>
          </div>
        )}
      </div>

      {/* Bar chart */}
      <div className="mt-5 relative">
        {/* Área de barras con línea promedio en porcentaje */}
        <div className="relative" style={{ height: 160 }}>
          {/* Línea promedio (posición relativa, escala con max) */}
          {!cargando && data.length > 0 && promedio > 0 && (
            <>
              <div
                className="absolute inset-x-0 border-t border-dashed border-indigo-300/70 z-10 pointer-events-none"
                style={{ bottom: `${(promedio / max) * 100}%` }}
              />
              <span
                className="absolute right-0 -translate-y-1/2 rounded bg-indigo-50 px-1.5 py-0.5 text-[9px] font-medium tabular-nums text-indigo-600 ring-1 ring-indigo-100 z-10"
                style={{ bottom: `${(promedio / max) * 100}%` }}
              >
                Prom. {fmtPesos(promedio)}
              </span>
            </>
          )}

          <div className="flex h-full items-end gap-2">
            {(cargando ? Array.from({ length: 12 }) : data).map((d, i) => {
              if (cargando) {
                return (
                  <div key={i} className="flex-1">
                    <div className="w-full animate-pulse rounded-t-md bg-indigo-50" style={{ height: 30 + (i % 4) * 25 }} />
                  </div>
                );
              }
              const dataPoint = d as { mes: string; cobrado: number };
              const altPct = dataPoint.cobrado === 0 ? 1 : Math.max((dataPoint.cobrado / max) * 100, 2);
              const esActual = i === data.length - 1;
              return (
                <div key={i} className="group relative flex flex-1 flex-col justify-end">
                  {/* Tooltip on hover */}
                  <div className="absolute bottom-full left-1/2 z-20 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2 py-1 text-[10px] font-medium text-white shadow-lg group-hover:block">
                    {fmtPesos(dataPoint.cobrado)}
                  </div>
                  <div
                    className="w-full rounded-t-md transition-all duration-300 group-hover:opacity-80"
                    style={{
                      height: `${altPct}%`,
                      background: esActual
                        ? "linear-gradient(180deg, #818CF8 0%, #4F46E5 100%)"
                        : "#C7D2FE",
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* Etiquetas de meses */}
        {!cargando && data.length > 0 && (
          <div className="mt-2 flex gap-2">
            {data.map((d, i) => {
              const esActual = i === data.length - 1;
              return (
                <span key={i} className={`flex-1 text-center text-[10px] ${
                  esActual ? "font-semibold text-indigo-600" : "text-neutral-400"
                }`}>
                  {d.mes}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function EstadoFiscal({ semaforo, cargando }: { semaforo: ResultadoSemaforo | null; cargando: boolean }) {
  const colorEstado = semaforo
    ? semaforo.estado === "VERDE" ? "#10B981"
    : semaforo.estado === "AMARILLO" ? "#F59E0B"
    : "#EF4444"
    : "#E0E7FF";

  const pct = semaforo ? Math.min(semaforo.porcentaje_consumido, 100) : 0;

  return (
    <div className="flex flex-col rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
      <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-400">Estado fiscal</p>

      {cargando ? (
        <div className="mt-4 space-y-3">
          <div className="h-32 w-full animate-pulse rounded-xl bg-neutral-100" />
          <div className="h-3 w-3/4 animate-pulse rounded bg-neutral-100" />
        </div>
      ) : semaforo && (
        <>
          {/* Categoría grande */}
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold tabular-nums text-neutral-900">
              Cat. {semaforo.categoria_actual}
            </span>
            <span style={{ color: colorEstado }} className="text-sm font-semibold">
              {pct.toFixed(0)}%
            </span>
          </div>

          {/* Barra de progreso grande */}
          <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-indigo-50">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${pct}%`, backgroundColor: colorEstado }}
            />
          </div>

          {/* Stats */}
          <div className="mt-4 space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-neutral-500">Facturado 12m</span>
              <span className="font-semibold tabular-nums text-neutral-800">{fmtPesos(semaforo.facturado_12m)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-neutral-500">Tope anual</span>
              <span className="font-semibold tabular-nums text-neutral-800">{fmtPesos(semaforo.tope_anual)}</span>
            </div>
            <div className="flex items-center justify-between border-t border-neutral-100 pt-2.5">
              <span className="text-neutral-500">Margen libre</span>
              <span style={{ color: colorEstado }} className="font-bold tabular-nums">
                {fmtPesos(semaforo.margen_disponible)}
              </span>
            </div>
          </div>

          {/* Mensaje */}
          <div
            className="mt-4 rounded-xl p-3 text-xs"
            style={{ backgroundColor: `${colorEstado}15`, color: colorEstado }}
          >
            {semaforo.mensaje}
          </div>
        </>
      )}
    </div>
  );
}

interface RankingProps {
  top: PacienteConStats[];
  total: number;
  cargando: boolean;
}

function RankingPacientes({ top, total, cargando }: RankingProps) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-400">
          Top 5 pacientes (por cobrado)
        </p>
        <Award className="h-4 w-4 text-amber-400" />
      </div>

      {cargando && (
        <div className="mt-4 space-y-2">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-12 animate-pulse rounded-xl bg-neutral-100" />
          ))}
        </div>
      )}

      {!cargando && top.length === 0 && (
        <p className="mt-6 py-6 text-center text-sm text-neutral-400">Sin datos suficientes.</p>
      )}

      {!cargando && top.length > 0 && (
        <div className="mt-4 space-y-2">
          {top.map((p, i) => {
            const pctTotal = total > 0 ? (p.cobrado_total / total) * 100 : 0;
            return (
              <div key={p.id} className="flex items-center gap-3">
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ring-1 ${
                  i === 0 ? "bg-gradient-to-br from-amber-200 to-amber-400 text-amber-800 ring-amber-300 shadow-sm shadow-amber-200/50"
                  : i === 1 ? "bg-gradient-to-br from-slate-100 to-slate-300 text-slate-700 ring-slate-300"
                  : i === 2 ? "bg-gradient-to-br from-orange-200 to-orange-400 text-orange-800 ring-orange-300"
                  : "bg-neutral-100 text-neutral-500 ring-neutral-200"
                }`}>
                  {i + 1}
                </span>
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${avatarCls(`${p.nombre} ${p.apellido}`)}`}>
                  {iniciales(p.nombre, p.apellido)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-sm font-medium text-neutral-800">
                      {p.nombre} {p.apellido}
                    </p>
                    <p className="shrink-0 text-sm font-bold tabular-nums text-emerald-600">
                      {fmtPesos(p.cobrado_total)}
                    </p>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-emerald-50">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-500"
                        style={{ width: `${pctTotal}%` }}
                      />
                    </div>
                    <span className="shrink-0 text-[10px] tabular-nums text-neutral-400">
                      {pctTotal.toFixed(0)}%
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface DistribucionProps {
  d: { activos: number; moderados: number; inactivos: number; total: number };
  cargando: boolean;
}

function DistribucionActividad({ d, cargando }: DistribucionProps) {
  const total = d.total || 1;
  const segs = [
    { label: "Activos (≤30 días)",    n: d.activos,    color: "bg-emerald-500", text: "text-emerald-600", desc: "Vienen este mes" },
    { label: "Moderados (31-90)",     n: d.moderados,  color: "bg-amber-400",   text: "text-amber-600",   desc: "Hace tiempo no vienen" },
    { label: "Inactivos (>90 días)",  n: d.inactivos,  color: "bg-red-400",     text: "text-red-500",     desc: "Posiblemente perdidos" },
  ];

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-400">
          Distribución de pacientes
        </p>
        <Target className="h-4 w-4 text-indigo-400" />
      </div>

      {cargando ? (
        <div className="mt-5 space-y-3">
          <div className="h-3 w-full animate-pulse rounded-full bg-neutral-100" />
          <div className="space-y-2 mt-4">
            {[1, 2, 3].map(i => <div key={i} className="h-10 animate-pulse rounded-xl bg-neutral-100" />)}
          </div>
        </div>
      ) : d.total === 0 ? (
        <p className="mt-6 py-6 text-center text-sm text-neutral-400">Sin pacientes registrados.</p>
      ) : (
        <>
          {/* Stacked bar */}
          <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-neutral-100">
            {segs.map((s) => (
              <div
                key={s.label}
                className={`${s.color} transition-all`}
                style={{ width: `${(s.n / total) * 100}%` }}
                title={`${s.label}: ${s.n}`}
              />
            ))}
          </div>

          {/* Lista */}
          <div className="mt-4 space-y-2.5">
            {segs.map((s) => (
              <div key={s.label} className="flex items-center justify-between rounded-xl px-3 py-2 transition-colors hover:bg-slate-50">
                <div className="flex items-center gap-2.5">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${s.color}`} />
                  <div>
                    <p className="text-sm font-medium text-neutral-800">{s.label}</p>
                    <p className="text-[10px] text-neutral-400">{s.desc}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-base font-bold tabular-nums ${s.text}`}>{s.n}</p>
                  <p className="text-[10px] tabular-nums text-neutral-400">
                    {((s.n / total) * 100).toFixed(0)}%
                  </p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
