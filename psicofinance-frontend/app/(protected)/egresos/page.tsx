"use client";

// Página de Egresos: chips de resumen, filtros por tipo/categoría y lista del mes.

import { useState, useEffect, useCallback, useMemo } from "react";
import { Plus, RefreshCw, WifiOff, ChevronLeft, ChevronRight, Receipt } from "lucide-react";
import { getEgresos, getResumenEgresos, eliminarEgreso, ApiError } from "@/lib/api";
import { useToast } from "@/lib/toast";
import type { EgresoRead, ResumenEgresos, TipoEgreso, CategoriaEgreso } from "@/lib/types";
import EgresoModal from "@/components/egresos/EgresoModal";
import EgresoRow from "@/components/egresos/EgresoRow";
import { CATEGORIAS, fmtPesos } from "@/components/egresos/constantes";
import { fmtPesosCompacto } from "@/lib/format";

// ── Helpers de mes ────────────────────────────────────────────────────────────

function mesActual(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function moverMes(mes: string, delta: number): string {
  const [y, m] = mes.split("-").map(Number);
  const total = y * 12 + (m - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

function labelMes(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("es-AR", { month: "long", year: "numeric" });
}

// ── Chips de resumen ──────────────────────────────────────────────────────────

function ChipsResumen({ resumen }: { resumen: ResumenEgresos | null }) {
  const chips = [
    { label: "Fijos",     valor: resumen?.total_fijos,     cls: "text-slate-700 dark:text-slate-300", gradient: "from-slate-400 to-slate-600",  sub: "Alquiler, impuestos, software…" },
    { label: "Variables", valor: resumen?.total_variables, cls: "text-amber-600 dark:text-amber-400", gradient: "from-amber-400 to-orange-400", sub: "Insumos, formación, otros" },
    { label: "Total mes", valor: resumen?.total,           cls: "text-red-500 dark:text-red-400",   gradient: "from-red-400 to-rose-500",     sub: "Fijos + variables" },
  ];
  return (
    <div className="grid grid-cols-3 gap-3 sm:gap-4">
      {chips.map(({ label, valor, cls, gradient, sub }) => (
        <div key={label} className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5 dark:bg-slate-900 dark:ring-white/10">
          <div className={`h-1 bg-gradient-to-r ${gradient}`} />
          <div className="px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-400 dark:text-slate-500">{label}</p>
            <p className={`mt-1.5 font-mono text-lg sm:text-xl font-bold leading-none tabular-nums ${cls}`}>
              {valor != null
                ? <>
                    {/* Compacto en mobile ($1,2M): el monto completo desborda la card de ~105px */}
                    <span className="sm:hidden">{fmtPesosCompacto(valor)}</span>
                    <span className="hidden sm:inline">{fmtPesos(valor)}</span>
                  </>
                : <span className="animate-pulse text-neutral-200 dark:text-slate-700">——</span>}
            </p>
            <p className="mt-1.5 hidden text-[11px] text-neutral-400 dark:text-slate-500 sm:block">{sub}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Página ────────────────────────────────────────────────────────────────────

export default function EgresosPage() {
  const toast = useToast();
  const [mes,          setMes]          = useState(mesActual());
  const [egresos,      setEgresos]      = useState<EgresoRead[]>([]);
  const [resumen,      setResumen]      = useState<ResumenEgresos | null>(null);
  const [cargando,     setCargando]     = useState(true);
  const [error,        setError]        = useState(false);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [editando,     setEditando]     = useState<EgresoRead | null>(null);
  const [filtroTipo,   setFiltroTipo]   = useState<TipoEgreso | null>(null);
  const [filtroCat,    setFiltroCat]    = useState<CategoriaEgreso | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(false);
    try {
      const [lista, res] = await Promise.all([getEgresos({ mes }), getResumenEgresos(mes)]);
      setEgresos(lista);
      setResumen(res);
    } catch {
      setError(true);
    } finally {
      setCargando(false);
    }
  }, [mes]);

  useEffect(() => { cargar(); }, [cargar]);

  // Filtros aplicados en cliente: la lista del mes ya está cargada completa
  const filtrados = useMemo(
    () => egresos.filter(e =>
      (!filtroTipo || e.tipo === filtroTipo) &&
      (!filtroCat || e.categoria === filtroCat)
    ),
    [egresos, filtroTipo, filtroCat],
  );

  const categoriasPresentes = useMemo(
    () => Array.from(new Set(egresos.map(e => e.categoria))),
    [egresos],
  );

  const handleDelete = async (e: EgresoRead) => {
    try {
      await eliminarEgreso(e.id);
      toast.success("Egreso eliminado");
      cargar();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo eliminar");
    }
  };

  const abrirEdicion = (e: EgresoRead) => { setEditando(e); setModalAbierto(true); };
  const abrirAlta    = ()              => { setEditando(null); setModalAbierto(true); };

  return (
    <main data-tour="egresos-vista" className="mx-auto max-w-screen-lg px-4 py-6 lg:py-8">

      {/* ── Header ── */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="bg-gradient-to-r from-neutral-900 via-indigo-800 to-neutral-900 dark:from-slate-100 dark:via-indigo-300 dark:to-slate-100 bg-clip-text text-2xl font-extrabold tracking-tight text-transparent">Egresos</h1>
          <p className="mt-0.5 text-xs text-neutral-400 dark:text-slate-500">Gastos fijos y variables del consultorio</p>
        </div>
        <button
          onClick={abrirAlta}
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
        >
          <Plus className="h-4 w-4" />
          Egreso
        </button>
      </div>

      {/* ── Selector de mes ── */}
      <div className="mb-4 flex items-center gap-2">
        <button
          onClick={() => setMes(m => moverMes(m, -1))}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-500 transition-colors hover:bg-neutral-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60"
          aria-label="Mes anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="min-w-[140px] text-center text-sm font-semibold capitalize text-neutral-700 dark:text-slate-300">
          {labelMes(mes)}
        </span>
        <button
          onClick={() => setMes(m => moverMes(m, 1))}
          disabled={mes >= mesActual()}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-500 transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-30 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60"
          aria-label="Mes siguiente"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 ring-1 ring-red-100 dark:bg-red-500/10 dark:ring-red-500/20">
            <WifiOff className="h-6 w-6 text-red-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-neutral-700 dark:text-slate-300">No se pudieron cargar los egresos</p>
            <p className="mt-1 text-xs text-neutral-400 dark:text-slate-500">Revisá tu conexión o intentá de nuevo</p>
          </div>
          <button
            onClick={cargar}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Reintentar
          </button>
        </div>
      )}

      {!error && (
        <div className="flex flex-col gap-4">

          {/* ── Chips resumen ── */}
          <ChipsResumen resumen={resumen} />

          {/* ── Filtros ── */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Tipo */}
            {(["FIJO", "VARIABLE"] as TipoEgreso[]).map(t => (
              <button
                key={t}
                onClick={() => setFiltroTipo(f => f === t ? null : t)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  filtroTipo === t
                    ? "bg-indigo-600 text-white"
                    : "bg-white text-neutral-500 ring-1 ring-neutral-200 hover:bg-neutral-50 dark:bg-slate-900 dark:text-slate-400 dark:ring-slate-800 dark:hover:bg-slate-800/60"
                }`}
              >
                {t === "FIJO" ? "Fijos" : "Variables"}
              </button>
            ))}
            {categoriasPresentes.length > 0 && <span className="h-4 w-px bg-neutral-200 dark:bg-slate-700" />}
            {/* Categorías presentes en el mes */}
            {categoriasPresentes.map(cat => {
              const { label, Icon } = CATEGORIAS[cat] ?? CATEGORIAS.OTRO;
              return (
                <button
                  key={cat}
                  onClick={() => setFiltroCat(f => f === cat ? null : cat)}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    filtroCat === cat
                      ? "bg-indigo-600 text-white"
                      : "bg-white text-neutral-500 ring-1 ring-neutral-200 hover:bg-neutral-50 dark:bg-slate-900 dark:text-slate-400 dark:ring-slate-800 dark:hover:bg-slate-800/60"
                  }`}
                >
                  <Icon className="h-3 w-3" strokeWidth={1.8} />
                  {label}
                </button>
              );
            })}
          </div>

          {/* ── Lista ── */}
          <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-black/5 dark:bg-slate-900 dark:ring-white/10">
            {cargando ? (
              <div className="flex flex-col gap-2 p-4">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-12 animate-pulse rounded-xl bg-neutral-100 dark:bg-slate-800" />
                ))}
              </div>
            ) : filtrados.length === 0 ? (
              <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-50 ring-1 ring-neutral-100 dark:bg-slate-950 dark:ring-slate-800">
                  <Receipt className="h-5 w-5 text-neutral-300 dark:text-slate-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-neutral-600 dark:text-slate-400">
                    {egresos.length === 0 ? "Sin egresos este mes" : "Nada con esos filtros"}
                  </p>
                  <p className="mt-1 text-xs text-neutral-400 dark:text-slate-500">
                    {egresos.length === 0
                      ? "Registrá tu primer gasto con el botón + Egreso"
                      : "Probá quitando algún filtro"}
                  </p>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-neutral-100 dark:divide-slate-800">
                {filtrados.map(e => (
                  <EgresoRow key={e.id} egreso={e} onEdit={abrirEdicion} onDelete={handleDelete} />
                ))}
              </div>
            )}
          </div>

          {/* ── Footer conteo ── */}
          {!cargando && filtrados.length > 0 && (
            <p className="px-1 text-right text-[11px] text-neutral-400 dark:text-slate-500">
              {filtrados.length} {filtrados.length === 1 ? "egreso" : "egresos"}
              {filtrados.length !== egresos.length ? ` (de ${egresos.length} del mes)` : ""}
            </p>
          )}
        </div>
      )}

      {/* ── Modal alta/edición ── */}
      <EgresoModal
        open={modalAbierto}
        onClose={() => setModalAbierto(false)}
        onSaved={cargar}
        egreso={editando}
      />
    </main>
  );
}
