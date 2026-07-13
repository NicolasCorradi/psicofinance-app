"use client";

import { useEffect, useMemo, useState } from "react";
import { TrendingUp, Users, DollarSign, Target, Award, Calendar, Download, Loader2, Printer } from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { getMetricasDashboard, getPacientes, getSemaforo, getInflacion, actualizarCategoria, getExportIngresos, getResumenEgresos } from "@/lib/api";
import type { MetricasDashboard, PacienteConStats, ResultadoSemaforo, ResumenEgresos, CategoriaEgreso } from "@/lib/types";
import { CATEGORIAS as CATEGORIAS_EGRESO } from "@/components/egresos/constantes";
import { avatarCls, iniciales } from "@/lib/avatar";
import { exportCSV } from "@/lib/export";
import { fmtPesosCompacto as fmtPesos, fmtPesos as fmtPesosExacto } from "@/lib/format";
import { useToast } from "@/lib/toast";

function fmtPesosEje(value: number): string {
  if (value === 0) return "$0";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000)    return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value}`;
}

/** "2026-05" → "mayo 2026". Devuelve el texto crudo si no matchea. */
function fmtPeriodo(periodo: string | null): string {
  if (!periodo || !/^\d{4}-\d{2}$/.test(periodo)) return periodo ?? "";
  const [y, m] = periodo.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("es-AR", { month: "long", year: "numeric" });
}

function CustomTooltip({ active, payload, label }: {
  active?: boolean; payload?: Array<{ value: number; name: string; color: string }>; label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl bg-slate-900 px-3 py-2.5 text-xs shadow-xl">
      <p className="mb-1.5 font-semibold text-white">{label}</p>
      {payload.map(p => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="text-white/70">{p.name}:</span>
          {/* Monto exacto: el tooltip es donde el usuario va a leer el valor real */}
          <span className="font-medium tabular-nums text-white">{fmtPesosExacto(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export default function ReportesPage() {
  const [metricas,   setMetricas]   = useState<MetricasDashboard | null>(null);
  const [pacientes,  setPacientes]  = useState<PacienteConStats[]>([]);
  const [semaforo,   setSemaforo]   = useState<ResultadoSemaforo | null>(null);
  const [cargando,   setCargando]   = useState(true);
  const [ipc, setIpc] = useState<{ valor: number; periodo: string; estimado: boolean; ultimo_real_periodo: string | null; proyeccion_periodo: string | null; fuente: string } | null>(null);
  const [egresos, setEgresos] = useState<ResumenEgresos | null>(null);
  const [exportando,   setExportando]   = useState(false);
  const [errorExport,  setErrorExport]  = useState<string | null>(null);
  const [errorCarga,   setErrorCarga]   = useState(false);
  const ahora = new Date();
  const hoyISO = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}`; // "YYYY-MM" local
  const [exportDesde, setExportDesde]  = useState(`${new Date().getFullYear()}-01`);
  const [exportHasta, setExportHasta]  = useState(hoyISO);

  const cargarTodo = () => {
    setCargando(true);
    setErrorCarga(false);
    // allSettled: un fetch caído no tira abajo el resto del reporte
    Promise.allSettled([getMetricasDashboard(), getPacientes(), getSemaforo(), getInflacion()])
      .then(([m, p, s, inf]) => {
        if (m.status === "fulfilled") setMetricas(m.value);
        if (p.status === "fulfilled") setPacientes(p.value);
        if (s.status === "fulfilled") setSemaforo(s.value);
        if (inf.status === "fulfilled") setIpc(inf.value);
        if (m.status === "rejected" && p.status === "rejected") setErrorCarga(true);
      })
      .finally(() => setCargando(false));
    // Aparte: si la tabla de egresos no existe todavía, no rompe el resto del reporte
    getResumenEgresos().then(setEgresos).catch(() => {});
  };

  useEffect(() => { cargarTodo(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const kpis = useMemo(() => {
    if (!metricas) return null;
    const cobradoAno   = metricas.ventas_mensuales.reduce((s, v) => s + v.cobrado, 0);
    const mesesActivos = metricas.ventas_mensuales.filter(v => v.cobrado > 0).length;
    const promedioMes  = mesesActivos > 0 ? cobradoAno / mesesActivos : 0;
    const totalSesiones = pacientes.reduce((s, p) => s + p.total_sesiones, 0);
    const ticket       = totalSesiones > 0 ? cobradoAno / totalSesiones : 0;
    const activos      = pacientes.filter(p => p.sesiones_mes > 0).length;
    return { cobradoAno, promedioMes, ticket, activos };
  }, [metricas, pacientes]);

  const topPacientes = useMemo(() =>
    [...pacientes].filter(p => p.cobrado_total > 0)
      .sort((a, b) => b.cobrado_total - a.cobrado_total).slice(0, 5),
    [pacientes]
  );
  const totalRanking = topPacientes.reduce((s, p) => s + p.cobrado_total, 0);

  const distribucion = useMemo(() => ({
    activos:   pacientes.filter(p => p.sesiones_mes > 0).length,
    moderados: pacientes.filter(p => p.sesiones_mes === 0 && (p.dias_inactivo ?? 999) <= 90).length,
    inactivos: pacientes.filter(p => p.sesiones_mes === 0 && (p.dias_inactivo ?? 999) > 90).length,
    total:     pacientes.length,
  }), [pacientes]);

  const dataLineas = useMemo(() => {
    if (!metricas?.ventas_mensuales.length) return [];
    const tasa = (ipc?.valor ?? 3.5) / 100;
    const primerValor = metricas.ventas_mensuales.find(v => v.cobrado > 0)?.cobrado ?? 0;
    return metricas.ventas_mensuales.map((v, i) => {
      const teorico = primerValor > 0 ? primerValor * Math.pow(1 + tasa, i) : 0;
      return { mes: v.mes, real: v.cobrado, teorico: Math.round(teorico) };
    });
  }, [metricas, ipc]);

  const anioActual = new Date().getFullYear();

  return (
    <main className="mx-auto max-w-screen-lg px-4 py-6 lg:py-8">
      {!cargando && errorCarga && (
        <div className="mb-4 flex items-center justify-between rounded-2xl bg-red-50 px-4 py-3 ring-1 ring-red-100">
          <p className="text-sm text-red-600">No se pudieron cargar los datos del reporte.</p>
          <button onClick={cargarTodo}
            className="rounded-xl border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50">
            Reintentar
          </button>
        </div>
      )}
      {/* En mobile el bloque de export baja a su propia fila y wrappea:
          dos inputs month + botón no entran en 375px */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="bg-gradient-to-r from-neutral-900 via-indigo-800 to-neutral-900 bg-clip-text text-xl font-extrabold tracking-tight text-transparent">Reportes</h1>
          <p className="text-xs text-neutral-500">Análisis financiero del consultorio · año {anioActual}</p>
        </div>
        <div className="flex flex-col gap-1.5 sm:items-end print:hidden">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => window.print()}
              className="flex shrink-0 items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-medium text-neutral-600 shadow-sm transition hover:bg-neutral-50"
              title="Imprimir el reporte o guardarlo como PDF"
            >
              <Printer className="h-3.5 w-3.5" />
              Imprimir / PDF
            </button>
          </div>
          {/* Rango solo para la exportación CSV — no filtra los gráficos de esta página */}
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-dashed border-neutral-200 bg-neutral-50/60 px-2 py-1.5">
            <span className="text-[11px] font-medium text-neutral-500">Exportar CSV:</span>
            <span className="text-[11px] text-neutral-400">desde</span>
            <input
              type="month"
              value={exportDesde}
              max={exportHasta}
              onChange={e => setExportDesde(e.target.value)}
              className="rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-xs text-neutral-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <span className="text-[11px] text-neutral-400">hasta</span>
            <input
              type="month"
              value={exportHasta}
              min={exportDesde}
              max={hoyISO}
              onChange={e => setExportHasta(e.target.value)}
              className="rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-xs text-neutral-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <button
              onClick={async () => {
                setExportando(true);
                setErrorExport(null);
                try {
                  const rows = await getExportIngresos();
                  // Filtrar por período seleccionado usando fecha_cobro
                  const filtradas = rows.filter(r => {
                    const f = String(r.fecha_cobro ?? "").slice(0, 7);
                    return f >= exportDesde && f <= exportHasta;
                  });
                  if (filtradas.length === 0) {
                    setErrorExport("Sin registros en ese período");
                    return;
                  }
                  exportCSV(`ingresos_${exportDesde}_${exportHasta}.csv`, [
                    { key: "fecha_sesion", label: "Fecha sesión"  },
                    { key: "fecha_cobro",  label: "Fecha cobro"   },
                    { key: "paciente",     label: "Paciente"      },
                    { key: "monto",        label: "Monto"         },
                    { key: "moneda",       label: "Moneda"        },
                    { key: "medio_pago",   label: "Medio de pago" },
                    { key: "origen_pago",  label: "Origen pago"   },
                    { key: "prepaga",      label: "Prepaga"       },
                  ], filtradas);
                } catch (e) {
                  setErrorExport(e instanceof Error ? e.message : "Error al exportar");
                } finally {
                  setExportando(false);
                }
              }}
              disabled={exportando || cargando}
              className="flex shrink-0 items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
            >
              {exportando
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Download className="h-3.5 w-3.5" />}
              Exportar
            </button>
          </div>
          {errorExport && (
            <span className="text-[11px] text-red-500">{errorExport}</span>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { icon: DollarSign, label: "Facturado (6 meses)", value: kpis ? fmtPesos(kpis.cobradoAno)   : "—", gradient: "from-emerald-400 to-teal-500",  color: "text-emerald-600", iconBg: "bg-emerald-100", iconColor: "text-emerald-600" },
          { icon: Calendar,   label: "Promedio mensual", value: kpis ? fmtPesos(kpis.promedioMes)  : "—", gradient: "from-indigo-400 to-violet-500",  color: "text-indigo-600",  iconBg: "bg-indigo-100",  iconColor: "text-indigo-600"  },
          { icon: TrendingUp, label: "Ticket promedio",  value: kpis ? fmtPesos(kpis.ticket)       : "—", gradient: "from-amber-400 to-orange-400",   color: "text-amber-600",   iconBg: "bg-amber-100",   iconColor: "text-amber-600"   },
          { icon: Users,      label: "Activos este mes", value: kpis ? `${kpis.activos} / ${pacientes.length}` : "—", gradient: "from-cyan-400 to-blue-500", color: "text-cyan-600", iconBg: "bg-cyan-100", iconColor: "text-cyan-600" },
        ].map(({ icon: Icon, label, value, gradient, color, iconBg, iconColor }) => (
          <div key={label} className="relative overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
            <div className={`h-1 bg-gradient-to-r ${gradient}`} />
            <div className="p-4">
              <div className="flex items-start justify-between">
                <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-400">{label}</p>
                <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${iconBg}`}>
                  <Icon className={`h-4 w-4 ${iconColor}`} strokeWidth={2} />
                </div>
              </div>
              {cargando
                ? <div className="mt-3 h-7 w-24 animate-pulse rounded bg-neutral-100" />
                : <p className={`mt-3 text-xl font-bold leading-none tracking-tight tabular-nums ${color}`}>{value}</p>
              }
            </div>
          </div>
        ))}
      </div>

      {/* Gráfico 1: Ingresos mensuales */}
      <div className="mb-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
        <div className="mb-4 flex items-baseline justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-400">Ingresos mensuales</p>
            <p className="mt-1 text-lg font-bold tabular-nums text-neutral-900">
              {metricas ? fmtPesos(metricas.ventas_mensuales.reduce((s, v) => s + v.cobrado, 0)) : "—"}
            </p>
          </div>
          <span className="text-xs text-neutral-400">Últimos 6 meses</span>
        </div>
        {cargando ? (
          <div className="h-48 animate-pulse rounded-xl bg-neutral-100" />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={metricas?.ventas_mensuales ?? []} barSize={32} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={fmtPesosEje} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={52} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "#f8fafc", radius: 8 }} />
              <Bar dataKey="cobrado" name="Cobrado" radius={[6, 6, 0, 0]} fill="url(#barGradient)" />
              <defs>
                <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#818CF8" />
                  <stop offset="100%" stopColor="#4F46E5" />
                </linearGradient>
              </defs>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Gráfico 2: Real vs inflación */}
      <div className="mb-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-400">
              Facturación real vs inflación teórica
            </p>
            <p className="mt-1 text-sm text-neutral-600">¿Estás ganándole a la inflación?</p>
          </div>
          <div className="flex flex-col items-end gap-0.5">
            <div className="flex items-center gap-2 rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-1.5">
              <span className="text-xs text-indigo-500">IPC mensual:</span>
              <span className="text-xs font-bold tabular-nums text-indigo-700">
                {!ipc ? "…" : ipc.estimado ? "N/D" : `${ipc.valor.toFixed(1)}%`}
              </span>
            </div>
            {ipc && (
              <span className="text-[10px] text-neutral-400">
                {ipc.estimado
                  ? "INDEC no disponible · usando valor de config"
                  : `INDEC · ${fmtPeriodo(ipc.periodo)}${ipc.proyeccion_periodo ? " (último publicado)" : ""}`}
              </span>
            )}
          </div>
        </div>
        {cargando ? (
          <div className="h-48 animate-pulse rounded-xl bg-neutral-100" />
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={dataLineas} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={fmtPesosEje} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={52} />
              <Tooltip content={<CustomTooltip />} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10 }} formatter={(value) => <span className="text-[10px] sm:text-xs text-neutral-600">{value}</span>} />
              <Line type="monotone" dataKey="real" name="Facturación real" stroke="#4F46E5" strokeWidth={2.5} dot={{ r: 3, fill: "#4F46E5" }} activeDot={{ r: 5 }} />
              <Line type="monotone" dataKey="teorico" name="Línea de inflación" stroke="#F59E0B" strokeWidth={2} strokeDasharray="5 4" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
        <p className="mt-2 text-[10px] text-neutral-400">
          La línea de inflación parte del primer mes con datos y se proyecta con la tasa mensual indicada.
        </p>
      </div>

      {/* Estado de Resultados + egresos por categoría */}
      {egresos && (
        <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <EstadoResultados cobradoMes={metricas?.cobrado_mes ?? null} egresos={egresos} cargando={cargando} />
          <EgresosPorCategoria egresos={egresos} />
        </div>
      )}

      {/* Ranking + Distribución */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RankingPacientes top={topPacientes} total={totalRanking} cargando={cargando} />
        <DistribucionActividad d={distribucion} cargando={cargando} />
      </div>

      {/* Estado fiscal */}
      <div className="mt-4">
        <EstadoFiscal semaforo={semaforo} cargando={cargando} />
      </div>
    </main>
  );
}

// ── Estado de Resultados mensual (criterio percibido: ingresos = cobrado) ────

function EstadoResultados({ cobradoMes, egresos, cargando }: {
  cobradoMes: number | null; egresos: ResumenEgresos; cargando: boolean;
}) {
  const utilidad = cobradoMes !== null ? cobradoMes - egresos.total : null;
  const margen   = cobradoMes && cobradoMes > 0 && utilidad !== null
    ? (utilidad / cobradoMes) * 100
    : null;

  const lineas = [
    { label: "Ingresos cobrados",   valor: cobradoMes,              cls: "text-emerald-600", signo: "" },
    { label: "Egresos fijos",       valor: egresos.total_fijos,     cls: "text-red-500",     signo: "−" },
    { label: "Egresos variables",   valor: egresos.total_variables, cls: "text-red-500",     signo: "−" },
  ];

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-400">
          Estado de resultados — mes actual
        </p>
        <span className="text-[10px] text-neutral-400">Criterio percibido</span>
      </div>
      {cargando ? (
        <div className="space-y-2">{[1,2,3,4].map(i => <div key={i} className="h-9 animate-pulse rounded-xl bg-neutral-100" />)}</div>
      ) : (
        <div className="space-y-1">
          {lineas.map(({ label, valor, cls, signo }) => (
            <div key={label} className="flex items-center justify-between rounded-xl px-3 py-2 hover:bg-slate-50 transition-colors">
              <p className="text-sm text-neutral-600">{label}</p>
              <p className={`font-mono text-sm font-semibold tabular-nums ${cls}`}>
                {valor !== null ? `${signo}${fmtPesos(valor)}` : "—"}
              </p>
            </div>
          ))}
          <div className="mx-3 my-1 h-px bg-neutral-200" />
          <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5">
            <p className="text-sm font-semibold text-neutral-800">Utilidad neta</p>
            <div className="text-right">
              <p className={`font-mono text-base font-bold tabular-nums ${
                utilidad !== null && utilidad < 0 ? "text-red-600" : "text-indigo-600"
              }`}>
                {utilidad !== null ? fmtPesos(utilidad) : "—"}
              </p>
              {margen !== null && (
                <p className="text-[10px] tabular-nums text-neutral-400">margen {margen.toFixed(0)}%</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Egresos por categoría (barras apiladas, últimos 6 meses) ─────────────────

const COLORES_CATEGORIA: Record<CategoriaEgreso, string> = {
  ALQUILER:   "#475569",  // slate-600
  SERVICIOS:  "#F59E0B",  // amber-500
  HONORARIOS: "#6366F1",  // indigo-500
  INSUMOS:    "#14B8A6",  // teal-500
  SOFTWARE:   "#0EA5E9",  // sky-500
  IMPUESTOS:  "#EF4444",  // red-500
  FORMACION:  "#8B5CF6",  // violet-500
  OTRO:       "#94A3B8",  // slate-400
};

function EgresosPorCategoria({ egresos }: { egresos: ResumenEgresos }) {
  const data = useMemo(() =>
    egresos.ultimos_6_meses.map(m => {
      const [y, mes] = m.mes.split("-").map(Number);
      const label = new Date(y, mes - 1, 1).toLocaleDateString("es-AR", { month: "short" });
      return { mes: label.charAt(0).toUpperCase() + label.slice(1).replace(".", ""), ...m.categorias };
    }),
    [egresos]
  );

  const categoriasUsadas = useMemo(() => {
    const set = new Set<CategoriaEgreso>();
    egresos.ultimos_6_meses.forEach(m =>
      (Object.keys(m.categorias) as CategoriaEgreso[]).forEach(c => set.add(c))
    );
    return Array.from(set);
  }, [egresos]);

  const hayDatos = categoriasUsadas.length > 0;

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
      <div className="mb-4 flex items-baseline justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-400">Egresos por categoría</p>
        <span className="text-xs text-neutral-400">Últimos 6 meses</span>
      </div>
      {!hayDatos ? (
        <p className="py-10 text-center text-sm text-neutral-400">Todavía no hay egresos registrados.</p>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} barSize={28} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={fmtPesosEje} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={52} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "#f8fafc" }} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10 }} formatter={(value) => <span className="text-[10px] sm:text-xs text-neutral-600">{value}</span>} />
            {categoriasUsadas.map((cat, i) => (
              <Bar
                key={cat}
                dataKey={cat}
                name={CATEGORIAS_EGRESO[cat]?.label ?? cat}
                stackId="egresos"
                fill={COLORES_CATEGORIA[cat]}
                radius={i === categoriasUsadas.length - 1 ? [6, 6, 0, 0] : [0, 0, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function RankingPacientes({ top, total, cargando }: { top: PacienteConStats[]; total: number; cargando: boolean }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-400">Top 5 pacientes</p>
        <Award className="h-4 w-4 text-amber-400" />
      </div>
      {cargando ? (
        <div className="space-y-2">{[1,2,3,4,5].map(i=><div key={i} className="h-12 animate-pulse rounded-xl bg-neutral-100"/>)}</div>
      ) : top.length === 0 ? (
        <p className="py-6 text-center text-sm text-neutral-400">Sin datos suficientes.</p>
      ) : (
        <div className="space-y-2">
          {top.map((p, i) => {
            const pct = total > 0 ? (p.cobrado_total / total) * 100 : 0;
            return (
              <div key={p.id} className="flex items-center gap-3">
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ring-1 ${
                  i === 0 ? "bg-gradient-to-br from-amber-200 to-amber-400 text-amber-800 ring-amber-300 shadow-sm shadow-amber-200/50"
                  : i === 1 ? "bg-gradient-to-br from-slate-100 to-slate-300 text-slate-700 ring-slate-300"
                  : i === 2 ? "bg-gradient-to-br from-orange-200 to-orange-400 text-orange-800 ring-orange-300"
                  : "bg-neutral-100 text-neutral-500 ring-neutral-200"
                }`}>{i+1}</span>
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${avatarCls(`${p.nombre} ${p.apellido}`)}`}>
                  {iniciales(p.nombre, p.apellido)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-sm font-medium text-neutral-800">{p.nombre} {p.apellido}</p>
                    <p className="shrink-0 text-sm font-bold tabular-nums text-emerald-600">{fmtPesos(p.cobrado_total)}</p>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-emerald-50">
                      <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-500" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="shrink-0 text-[10px] tabular-nums text-neutral-400">{pct.toFixed(0)}%</span>
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

function DistribucionActividad({ d, cargando }: { d: { activos: number; moderados: number; inactivos: number; total: number }; cargando: boolean }) {
  const total = d.total || 1;
  const segs = [
    { label: "Activos este mes",     n: d.activos,   color: "bg-emerald-500", text: "text-emerald-600", desc: "Tuvieron sesión este mes" },
    { label: "Sin sesión (<90d)",    n: d.moderados, color: "bg-amber-400",   text: "text-amber-600",   desc: "Sin sesión este mes, pero recientes" },
    { label: "Inactivos (>90 días)", n: d.inactivos, color: "bg-red-400",     text: "text-red-500",     desc: "Sin sesión hace más de 3 meses" },
  ];
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-400">Distribución de pacientes</p>
        <Target className="h-4 w-4 text-indigo-400" />
      </div>
      {cargando ? (
        <div className="space-y-3">
          <div className="h-3 w-full animate-pulse rounded-full bg-neutral-100" />
          <div className="space-y-2 mt-4">{[1,2,3].map(i=><div key={i} className="h-10 animate-pulse rounded-xl bg-neutral-100"/>)}</div>
        </div>
      ) : d.total === 0 ? (
        <p className="py-6 text-center text-sm text-neutral-400">Sin pacientes registrados.</p>
      ) : (
        <>
          <div className="mb-4 flex h-3 overflow-hidden rounded-full bg-neutral-100">
            {segs.map(s => (
              <div key={s.label} className={`${s.color} transition-all`} style={{ width: `${(s.n / total) * 100}%` }} />
            ))}
          </div>
          <div className="space-y-2.5">
            {segs.map(s => (
              <div key={s.label} className="flex items-center justify-between rounded-xl px-3 py-2 hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-2.5">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${s.color}`} />
                  <div>
                    <p className="text-sm font-medium text-neutral-800">{s.label}</p>
                    <p className="text-[10px] text-neutral-400">{s.desc}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-base font-bold tabular-nums ${s.text}`}>{s.n}</p>
                  <p className="text-[10px] tabular-nums text-neutral-400">{((s.n/total)*100).toFixed(0)}%</p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const CATEGORIAS = ["A","B","C","D","E","F","G","H","I","J","K"];

function EstadoFiscal({ semaforo: initialSemaforo, cargando }: { semaforo: ResultadoSemaforo | null; cargando: boolean }) {
  const [semaforo, setSemaforo] = useState<ResultadoSemaforo | null>(initialSemaforo);
  const [guardando, setGuardando] = useState(false);
  const toast = useToast();

  // Sincronizar cuando el padre actualiza por primera vez
  useEffect(() => { if (initialSemaforo) setSemaforo(initialSemaforo); }, [initialSemaforo]);

  const colorEstado = semaforo
    ? semaforo.estado === "VERDE" ? "#10B981" : semaforo.estado === "AMARILLO" ? "#F59E0B" : "#EF4444"
    : "#E0E7FF";
  const pct = semaforo ? Math.min(semaforo.porcentaje_consumido, 100) : 0;

  async function cambiarCategoria(cat: string) {
    if (cat === semaforo?.categoria_actual || guardando) return;
    setGuardando(true);
    try {
      const nuevo = await actualizarCategoria(cat);
      setSemaforo(nuevo);
    } catch {
      toast.error("No se pudo cambiar la categoría. Intentá de nuevo.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
      <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
        <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-400">Estado fiscal — Monotributo</p>
        {/* Selector de categoría */}
        {semaforo && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-neutral-400">Categoría:</span>
            <div className="flex gap-1 flex-wrap">
              {CATEGORIAS.map(cat => (
                <button
                  key={cat}
                  onClick={() => cambiarCategoria(cat)}
                  disabled={guardando}
                  className={`h-8 w-8 sm:h-6 sm:w-6 rounded-md text-[11px] font-bold transition-all disabled:opacity-50 ${
                    cat === semaforo.categoria_actual
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "bg-neutral-100 text-neutral-500 hover:bg-indigo-50 hover:text-indigo-600"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
            {guardando && <span className="h-3 w-3 animate-spin rounded-full border border-indigo-200 border-t-indigo-500" />}
          </div>
        )}
      </div>
      {cargando ? (
        <div className="h-20 animate-pulse rounded-xl bg-neutral-100" />
      ) : semaforo ? (
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <span className="text-3xl font-bold text-neutral-900">Cat. {semaforo.categoria_actual}</span>
            <span style={{ color: colorEstado }} className="ml-2 text-sm font-semibold">{pct.toFixed(0)}%</span>
          </div>
          <div className="flex-1 min-w-48">
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-indigo-50">
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: colorEstado }} />
            </div>
            <div className="mt-2 flex justify-between text-xs text-neutral-500">
              <span>Facturado 12m: <strong className="text-neutral-800">{fmtPesos(semaforo.facturado_12m)}</strong></span>
              <span>Tope: <strong className="text-neutral-800">{fmtPesos(semaforo.tope_anual)}</strong></span>
            </div>
          </div>
          <div className="rounded-xl px-4 py-2 text-xs font-medium" style={{ backgroundColor: `${colorEstado}15`, color: colorEstado }}>
            Margen libre: {fmtPesos(semaforo.margen_disponible)}
          </div>
        </div>
      ) : null}
    </div>
  );
}
