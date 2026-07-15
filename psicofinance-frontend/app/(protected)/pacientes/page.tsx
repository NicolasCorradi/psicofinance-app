"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { UserPlus, Search, ArrowUpDown, ArrowUp, ArrowDown, ChevronRight, X, Save, Download, MessageCircle } from "lucide-react";
import { linkWhatsApp, mensajeRecordatorioDeuda } from "@/lib/whatsapp";
import { useToast } from "@/lib/toast";
import { getPacientes, actualizarPaciente } from "@/lib/api";
import type { PacienteConStats } from "@/lib/types";
import { exportCSV } from "@/lib/export";
import PacienteDetalle from "@/components/pacientes/PacienteDetalle";
import NuevoPaciente from "@/components/pacientes/NuevoPaciente";
import { avatarCls, iniciales } from "@/lib/avatar";
import { fmtPesosCompacto as fmtPesos, fmtPesos as fmtPesosExacto, isoHoy, fechaRel as fechaRelBase } from "@/lib/format";

// ── Helpers ──────────────────────────────────────────────────────────────────

function fechaRel(iso: string | null): string {
  if (!iso) return "Sin sesiones";
  return fechaRelBase(iso);
}

// ── Badge de estado ───────────────────────────────────────────────────────────

type EstadoPaciente = "al_dia" | "con_deuda" | "inactivo" | "sin_sesiones";

function estadoDe(p: PacienteConStats): EstadoPaciente {
  if (p.total_sesiones === 0) return "sin_sesiones";
  if (p.pendiente > 0) return "con_deuda";
  if ((p.dias_inactivo ?? 999) > 30) return "inactivo";
  return "al_dia";
}

const BADGE: Record<EstadoPaciente, { label: string; cls: string }> = {
  al_dia:       { label: "Al día",       cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400" },
  con_deuda:    { label: "Con deuda",    cls: "bg-red-100 text-red-600 dark:bg-red-500/10 dark:text-red-400" },
  inactivo:     { label: "Inactivo",     cls: "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400" },
  sin_sesiones: { label: "Sin sesiones", cls: "bg-neutral-100 text-neutral-500 dark:bg-slate-800 dark:text-slate-400" },
};

function EstadoBadge({ p }: { p: PacienteConStats }) {
  const { label, cls } = BADGE[estadoDe(p)];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${cls}`}>
      {label}
    </span>
  );
}

// ── Modal rápido de honorario ─────────────────────────────────────────────────

function EditarHonorario({
  paciente,
  onGuardado,
  onCerrar,
}: { paciente: PacienteConStats; onGuardado: () => void; onCerrar: () => void }) {
  const [valor,    setValor]    = useState(String(paciente.honorario_actual ?? ""));
  const [moneda,   setMoneda]   = useState<"ARS" | "USD">(paciente.moneda === "USD" ? "USD" : "ARS");
  const [guardando, setGuardando] = useState(false);
  const [error,    setError]    = useState("");
  const toast = useToast();

  const guardar = async () => {
    if (guardando) return; // Enter rápido dispara doble submit
    const num = Number(valor.replace(/\D/g, ""));
    if (!num || num <= 0) { setError("Ingresá un monto válido"); return; }
    setGuardando(true);
    try {
      await actualizarPaciente(paciente.id, {
        honorario_actual: num,
        moneda,
        fecha_ultimo_ajuste_honorario: isoHoy(),
      });
      toast.success(`Honorario de ${paciente.nombre} actualizado`);
      onGuardado();
      onCerrar();
    } catch {
      setError("Error al guardar. Intentá de nuevo.");
    } finally {
      setGuardando(false);
    }
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onCerrar]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:px-4 bg-black/30 backdrop-blur-[2px]" onClick={onCerrar}>
      <div className="relative w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl bg-white dark:bg-slate-900 shadow-2xl ring-1 ring-black/5 dark:ring-white/10 animate-in slide-in-from-bottom duration-250 sm:slide-in-from-bottom-0" onClick={e => e.stopPropagation()}>
        <div className="flex justify-center pt-3 pb-0 sm:hidden"><div className="h-1 w-10 rounded-full bg-neutral-200 dark:bg-slate-700"/></div>
        <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-slate-100">Editar honorario</h3>
            <p className="text-xs text-neutral-400 dark:text-slate-500 mt-0.5">{paciente.nombre} {paciente.apellido}</p>
          </div>
          <button onClick={onCerrar} className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 dark:text-slate-500 hover:bg-neutral-100 dark:hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-1">
          <label className="mb-1.5 block text-xs font-medium text-neutral-600 dark:text-slate-300">Honorario base mensual</label>
          <div className="flex gap-1.5">
            <div className="flex flex-1 items-center rounded-xl border border-neutral-200 dark:border-slate-800 bg-neutral-50 dark:bg-slate-950 px-3 py-2.5 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100">
              <span className="mr-2 text-sm text-neutral-400 dark:text-slate-500">{moneda === "USD" ? "US$" : "$"}</span>
              <input
                autoFocus
                type="text"
                inputMode="numeric"
                value={valor}
                onChange={e => { setValor(e.target.value); setError(""); }}
                onKeyDown={e => { if (e.key === "Enter") guardar(); }}
                className="flex-1 bg-transparent text-sm text-neutral-900 dark:text-slate-100 placeholder:text-neutral-400 dark:placeholder:text-slate-500 focus:outline-none"
                placeholder="Ej: 25000"
              />
            </div>
            <div className="flex overflow-hidden rounded-xl border border-neutral-200 dark:border-slate-800">
              {(["ARS", "USD"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMoneda(m)}
                  className={`px-3 py-2.5 text-xs font-medium transition-colors ${
                    moneda === m
                      ? "bg-indigo-600 text-white"
                      : "bg-white dark:bg-slate-900 text-neutral-500 dark:text-slate-400 hover:bg-neutral-50 dark:hover:bg-slate-800/60"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        </div>
        {error && <p className="mt-1 text-xs text-red-500 dark:text-red-400">{error}</p>}

        <div className="mt-4 flex gap-2">
          <button onClick={onCerrar} className="flex-1 rounded-xl border border-neutral-200 dark:border-slate-800 py-2.5 text-sm text-neutral-600 dark:text-slate-300 hover:bg-neutral-50 dark:hover:bg-slate-800/60 transition-colors">
            Cancelar
          </button>
          <button
            onClick={guardar}
            disabled={guardando}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60 transition-colors"
          >
            <Save className="h-3.5 w-3.5" />
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        </div>
        </div>
      </div>
    </div>
  );
}

// ── Tipos de orden ────────────────────────────────────────────────────────────

type OrdenCampo = "apellido" | "pendiente" | "ultima_sesion" | "honorario_actual" | "total_sesiones";
type OrdenDir   = "asc" | "desc";

// ── Página principal ──────────────────────────────────────────────────────────

export default function PacientesPage() {
  const [pacientes,    setPacientes]    = useState<PacienteConStats[]>([]);
  const [cargando,     setCargando]     = useState(true);
  const [busqueda,     setBusqueda]     = useState("");
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [nuevoModal,   setNuevoModal]   = useState(false);
  const [editando,     setEditando]     = useState<PacienteConStats | null>(null);
  const [ordenCampo,   setOrdenCampo]   = useState<OrdenCampo>("apellido");
  const [ordenDir,     setOrdenDir]     = useState<OrdenDir>("asc");
  const [errorCarga,   setErrorCarga]   = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorCarga(false);
    try { setPacientes(await getPacientes()); }
    catch { setErrorCarga(true); } // sin esto, un fallo se ve igual que "sin pacientes"
    finally { setCargando(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const toggleOrden = (campo: OrdenCampo) => {
    if (ordenCampo === campo) {
      setOrdenDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setOrdenCampo(campo);
      setOrdenDir(campo === "apellido" ? "asc" : "desc");
    }
  };

  const filtradosOrdenados = useMemo(() => {
    const q = busqueda.toLowerCase();
    const filtrados = pacientes.filter(p =>
      p.nombre.toLowerCase().includes(q) ||
      p.apellido.toLowerCase().includes(q) ||
      (p.email ?? "").toLowerCase().includes(q)
    );

    return [...filtrados].sort((a, b) => {
      const mult = ordenDir === "asc" ? 1 : -1;
      if (ordenCampo === "apellido") {
        return mult * a.apellido.localeCompare(b.apellido);
      }
      if (ordenCampo === "pendiente") {
        return mult * (a.pendiente - b.pendiente);
      }
      if (ordenCampo === "ultima_sesion") {
        if (!a.ultima_sesion && !b.ultima_sesion) return 0;
        if (!a.ultima_sesion) return 1;
        if (!b.ultima_sesion) return -1;
        return mult * (new Date(a.ultima_sesion).getTime() - new Date(b.ultima_sesion).getTime());
      }
      if (ordenCampo === "honorario_actual") {
        return mult * ((a.honorario_actual ?? 0) - (b.honorario_actual ?? 0));
      }
      if (ordenCampo === "total_sesiones") {
        return mult * (a.total_sesiones - b.total_sesiones);
      }
      return 0;
    });
  }, [pacientes, busqueda, ordenCampo, ordenDir]);

  const totalCobrado   = pacientes.reduce((s, p) => s + p.cobrado_total, 0);
  const totalPendiente = pacientes.reduce((s, p) => s + p.pendiente, 0);
  const totalActivos   = pacientes.filter(p => p.sesiones_mes > 0).length;

  function SortIcon({ campo }: { campo: OrdenCampo }) {
    if (ordenCampo !== campo) return <ArrowUpDown className="h-3 w-3 text-neutral-300 dark:text-slate-600" />;
    return ordenDir === "asc"
      ? <ArrowUp className="h-3 w-3 text-indigo-500" />
      : <ArrowDown className="h-3 w-3 text-indigo-500" />;
  }

  return (
    <>
      <main className="mx-auto max-w-screen-lg px-4 py-6 lg:py-8">

        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h1 className="bg-gradient-to-r from-neutral-900 via-indigo-800 to-neutral-900 dark:from-slate-100 dark:via-indigo-300 dark:to-slate-100 bg-clip-text text-lg font-extrabold tracking-tight text-transparent">Pacientes</h1>
            <p className="text-xs text-neutral-400 dark:text-slate-500">
              {cargando ? "Cargando…" : `${pacientes.length} paciente${pacientes.length !== 1 ? "s" : ""}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!cargando && pacientes.length > 0 && (
              <button
                onClick={() => exportCSV(
                  `pacientes_${isoHoy()}.csv`,
                  [
                    { key: "apellido",                      label: "Apellido" },
                    { key: "nombre",                        label: "Nombre" },
                    { key: "honorario_actual",              label: "Honorario actual" },
                    { key: "fecha_ultimo_ajuste_honorario", label: "Último ajuste honorario" },
                    { key: "total_sesiones",                label: "Total sesiones" },
                    { key: "sesiones_mes",                  label: "Sesiones este mes" },
                    { key: "cobrado_total",                 label: "Total cobrado" },
                    { key: "pendiente",                     label: "Pendiente" },
                    { key: "ultima_sesion",                 label: "Última sesión" },
                    { key: "estado",                        label: "Estado" },
                  ],
                  pacientes.map(p => ({
                    ...p,
                    estado: p.total_sesiones === 0 ? "Sin sesiones"
                      : p.pendiente > 0 ? "Con deuda"
                      : (p.dias_inactivo ?? 999) > 30 ? "Inactivo"
                      : "Al día",
                  }))
                )}
                className="flex items-center gap-1.5 rounded-xl border border-neutral-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-medium text-neutral-500 dark:text-slate-400 hover:bg-neutral-50 dark:hover:bg-slate-800/60 transition-colors"
              >
                <Download className="h-3.5 w-3.5" />
                Exportar
              </button>
            )}
            <button
              onClick={() => setNuevoModal(true)}
              className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 shadow-sm"
            >
              <UserPlus className="h-4 w-4" />
              Nuevo
            </button>
          </div>
        </div>

        {/* Resumen global */}
        {!cargando && pacientes.length > 0 && (
          <div className="mb-5 grid grid-cols-3 gap-3">
            {[
              { label: "Total cobrado",    value: fmtPesos(totalCobrado),   color: "text-emerald-600 dark:text-emerald-400", gradient: "from-emerald-400 to-teal-500" },
              { label: "Total pendiente",  value: fmtPesos(totalPendiente), color: "text-amber-600 dark:text-amber-400",   gradient: "from-amber-400 to-orange-400" },
              { label: "Activos este mes", value: String(totalActivos),     color: "text-indigo-600 dark:text-indigo-400",  gradient: "from-indigo-400 to-violet-500" },
            ].map(({ label, value, color, gradient }) => (
              <div key={label} className="relative overflow-hidden rounded-2xl bg-white dark:bg-slate-900 p-4 shadow-sm ring-1 ring-black/5 dark:ring-white/10">
                <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${gradient}`} />
                <p className="mt-1 text-[11px] font-medium uppercase tracking-wider text-neutral-400 dark:text-slate-500">{label}</p>
                <p className={`mt-1.5 text-xl sm:text-2xl font-bold tabular-nums ${color}`}>{value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Buscador */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400 dark:text-slate-500" />
          <input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, apellido o email…"
            className="w-full rounded-xl border border-neutral-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-2.5 pl-9 pr-4 text-sm text-neutral-800 dark:text-slate-100 placeholder:text-neutral-400 dark:placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 shadow-sm"
          />
        </div>

        {/* Tabla */}
        {cargando ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-neutral-100 dark:bg-slate-800" />
            ))}
          </div>
        ) : errorCarga ? (
          <div className="py-16 text-center">
            <p className="text-sm text-neutral-500 dark:text-slate-400">No se pudieron cargar los pacientes.</p>
            <button onClick={cargar}
              className="mt-3 rounded-xl border border-neutral-200 dark:border-slate-800 px-4 py-2 text-sm text-neutral-600 dark:text-slate-300 hover:bg-neutral-50 dark:hover:bg-slate-800/60">
              Reintentar
            </button>
          </div>
        ) : filtradosOrdenados.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm text-neutral-400 dark:text-slate-500">
              {busqueda ? "Sin resultados." : "Sin pacientes registrados todavía."}
            </p>
          </div>
        ) : (
          <>
            {/* ── Mobile: tarjetas apiladas (el modelo de tabla no entra en 375px) ── */}
            <div className="space-y-2 md:hidden">
              {filtradosOrdenados.map(p => (
                <div key={p.id} className="rounded-2xl bg-white dark:bg-slate-900 shadow-sm ring-1 ring-black/5 dark:ring-white/10">
                  <button
                    onClick={() => setSeleccionado(p.id)}
                    className="flex w-full items-center gap-3 px-3.5 pt-3.5 pb-2 text-left"
                  >
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${avatarCls(`${p.nombre} ${p.apellido}`)}`}>
                      {iniciales(p.nombre, p.apellido)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-neutral-800 dark:text-slate-100">{p.nombre} {p.apellido}</p>
                      <p className="mt-0.5 text-[11px] text-neutral-400 dark:text-slate-500 tabular-nums">
                        {p.total_sesiones} ses. · {fmtPesos(p.cobrado_total)}
                        {p.ultima_sesion && <span> · {fechaRel(p.ultima_sesion)}</span>}
                      </p>
                    </div>
                    <EstadoBadge p={p} />
                  </button>
                  <div className="flex items-center justify-between gap-2 border-t border-neutral-50 dark:border-slate-800 px-3.5 py-2.5">
                    <div className="flex items-baseline gap-1.5 text-xs">
                      <span className="text-neutral-400 dark:text-slate-500">Pendiente</span>
                      <span className={`font-semibold tabular-nums ${p.pendiente > 0 ? "text-red-600 dark:text-red-400" : "text-neutral-300 dark:text-slate-600"}`}>
                        {p.pendiente > 0 ? fmtPesosExacto(p.pendiente) : "—"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {p.pendiente > 0 && (
                        <a
                          href={linkWhatsApp(p.telefono, mensajeRecordatorioDeuda(p.nombre, p.pendiente))}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="flex items-center gap-1 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-200 dark:ring-emerald-500/20 active:bg-emerald-100 dark:active:bg-emerald-500/20"
                          title="Recordar pago por WhatsApp"
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                          Recordar
                        </a>
                      )}
                      <button
                        onClick={e => { e.stopPropagation(); setEditando(p); }}
                        className="rounded-lg border border-neutral-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-medium text-neutral-600 dark:text-slate-300 shadow-sm active:bg-indigo-50 active:text-indigo-700"
                      >
                        $ Honorario
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* ── Desktop: tabla de columnas ── */}
            <div className="hidden overflow-hidden rounded-2xl bg-white dark:bg-slate-900 shadow-sm ring-1 ring-black/5 dark:ring-white/10 md:block">
              {/* Header de tabla */}
              <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] items-center gap-3 border-b border-neutral-100 dark:border-slate-800 px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-neutral-400 dark:text-slate-500">
                <button
                  onClick={() => toggleOrden("apellido")}
                  className="flex items-center gap-1 hover:text-neutral-700 dark:hover:text-slate-300 transition-colors text-left"
                >
                  Paciente <SortIcon campo="apellido" />
                </button>
                <span>Estado</span>
                <button
                  onClick={() => toggleOrden("total_sesiones")}
                  className="flex items-center gap-1 hover:text-neutral-700 dark:hover:text-slate-300 transition-colors"
                >
                  Sesiones <SortIcon campo="total_sesiones" />
                </button>
                <button
                  onClick={() => toggleOrden("honorario_actual")}
                  className="flex items-center gap-1 hover:text-neutral-700 dark:hover:text-slate-300 transition-colors"
                >
                  Honorario <SortIcon campo="honorario_actual" />
                </button>
                <button
                  onClick={() => toggleOrden("pendiente")}
                  className="flex items-center gap-1 hover:text-neutral-700 dark:hover:text-slate-300 transition-colors"
                >
                  Pendiente <SortIcon campo="pendiente" />
                </button>
                <span className="text-right">Acciones</span>
              </div>

              {/* Filas */}
              {filtradosOrdenados.map(p => (
                <div
                  key={p.id}
                  className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] items-center gap-3 border-b border-neutral-50 dark:border-slate-800 px-4 py-3 transition-colors last:border-0 hover:bg-neutral-50/60 dark:hover:bg-slate-800/60"
                >
                  <button
                    onClick={() => setSeleccionado(p.id)}
                    className="flex items-center gap-3 text-left min-w-0"
                  >
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${avatarCls(`${p.nombre} ${p.apellido}`)}`}>
                      {iniciales(p.nombre, p.apellido)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold text-neutral-800 dark:text-slate-100">
                          {p.nombre} {p.apellido}
                        </p>
                        {p.sesiones_mes > 0 && (
                          <span className="shrink-0 rounded-full bg-indigo-100 dark:bg-indigo-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-600 dark:text-indigo-400">
                            {p.sesiones_mes} este mes
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-neutral-400 dark:text-slate-500 tabular-nums">
                        {p.total_sesiones} ses. · {fmtPesos(p.cobrado_total)}
                        {p.ultima_sesion && <span> · {fechaRel(p.ultima_sesion)}</span>}
                      </p>
                    </div>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-neutral-300 dark:text-slate-600" />
                  </button>

                  <div><EstadoBadge p={p} /></div>

                  <span className="text-xs text-neutral-500 dark:text-slate-400 tabular-nums text-center">
                    {p.total_sesiones}
                  </span>

                  <span className="text-xs text-neutral-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
                    {p.honorario_actual
                      ? p.moneda === "USD"
                        ? `USD ${p.honorario_actual.toLocaleString("es-AR")}`
                        : fmtPesosExacto(p.honorario_actual)
                      : "—"}
                  </span>

                  <span className={`text-sm font-semibold tabular-nums whitespace-nowrap ${
                    p.pendiente > 0 ? "text-red-600 dark:text-red-400" : "text-neutral-300 dark:text-slate-600"
                  }`}>
                    {p.pendiente > 0 ? fmtPesosExacto(p.pendiente) : "—"}
                  </span>

                  <div className="flex items-center justify-end gap-1.5">
                    {p.pendiente > 0 && (
                      <a
                        href={linkWhatsApp(p.telefono, mensajeRecordatorioDeuda(p.nombre, p.pendiente))}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-200 dark:ring-emerald-500/20 transition-all hover:bg-emerald-100 dark:hover:bg-emerald-500/20"
                        title={`Recordar pago por WhatsApp (${fmtPesosExacto(p.pendiente)})`}
                        aria-label="Recordar pago por WhatsApp"
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                      </a>
                    )}
                    <button
                      onClick={e => { e.stopPropagation(); setEditando(p); }}
                      className="rounded-lg border border-neutral-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-[11px] font-medium text-neutral-600 dark:text-slate-300 shadow-sm transition-all hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
                      title="Editar honorario"
                    >
                      $ Honorario
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </main>

      {/* Panel de detalle */}
      {seleccionado && (
        <PacienteDetalle
          pacienteId={seleccionado}
          onClose={() => setSeleccionado(null)}
          onRefresh={cargar}
        />
      )}

      {/* Modal nuevo paciente */}
      {nuevoModal && (
        <NuevoPaciente
          onCreado={() => { setNuevoModal(false); cargar(); }}
          onCancelar={() => setNuevoModal(false)}
        />
      )}

      {/* Modal editar honorario */}
      {editando && (
        <EditarHonorario
          paciente={editando}
          onGuardado={cargar}
          onCerrar={() => setEditando(null)}
        />
      )}
    </>
  );
}
