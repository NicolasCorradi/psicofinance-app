"use client";

import { useState, useRef, useEffect } from "react";
import { MoreHorizontal, Pencil, Trash2, Check, X, CheckCircle2 } from "lucide-react";
import { actualizarTurno, eliminarTurno } from "@/lib/api";
import type { TurnoResumen, EstadoTurno, MedioPago, TipoSesion } from "@/lib/types";
import { avatarCls, iniciales } from "@/lib/avatar";
import { useToast } from "@/lib/toast";

function fmtPesos(n: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency", currency: "ARS",
    notation: "compact", maximumFractionDigits: 1,
  }).format(n);
}

function fechaRel(iso: string): string {
  const f    = new Date(iso + "T12:00:00");
  const hoy  = new Date();
  const ayer = new Date(hoy); ayer.setDate(hoy.getDate() - 1);
  if (f.toDateString() === hoy.toDateString())  return "Hoy";
  if (f.toDateString() === ayer.toDateString()) return "Ayer";
  const dias = Math.round((hoy.getTime() - f.getTime()) / 86_400_000);
  if (dias < 7)  return `Hace ${dias}d`;
  if (dias < 30) return `Hace ${Math.round(dias / 7)}sem`;
  return f.toLocaleDateString("es-AR", { day: "numeric", month: "short" });
}

function Chip({ estado }: { estado: EstadoTurno }) {
  const cfg: Record<EstadoTurno, { dot: string; label: string; cls: string }> = {
    COBRADO:    { dot: "bg-emerald-500", label: "Cobrado",    cls: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" },
    DIFERIDO:   { dot: "bg-amber-400",   label: "Pendiente",  cls: "bg-amber-50  text-amber-700  ring-1 ring-amber-200" },
    INCOBRABLE: { dot: "bg-red-400",     label: "Incobrable", cls: "bg-red-50    text-red-600    ring-1 ring-red-200" },
  };
  const { dot, label, cls } = cfg[estado];
  return (
    <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

function RowMenu({ onEditar, onEliminar }: { onEditar: () => void; onEliminar: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(v => !v)}
        className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-300 transition-colors hover:bg-neutral-100 hover:text-neutral-600">
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-36 overflow-hidden rounded-xl border border-neutral-100 bg-white py-1 shadow-lg">
          <button onClick={() => { setOpen(false); onEditar(); }}
            className="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm text-neutral-700 transition-colors hover:bg-neutral-50">
            <Pencil className="h-3.5 w-3.5 text-neutral-400" />Editar
          </button>
          <button onClick={() => { setOpen(false); onEliminar(); }}
            className="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm text-red-500 transition-colors hover:bg-red-50">
            <Trash2 className="h-3.5 w-3.5" />Eliminar
          </button>
        </div>
      )}
    </div>
  );
}

const MEDIO_PAGO_LABELS: Record<MedioPago, string> = {
  EFECTIVO: "Efectivo", TRANSFERENCIA: "Transferencia",
  MERCADO_PAGO: "Mercado Pago", TARJETA: "Tarjeta", OTRO: "Otro",
};

const TIPO_SESION_LABELS: Record<TipoSesion, string> = {
  SESION: "Sesión normal",
  INASISTENCIA_JUSTIFICADA:  "Inasistencia justificada",
  INASISTENCIA_INJUSTIFICADA: "Inasistencia injustificada",
  CANCELACION_PROFESIONAL:   "Cancelación profesional",
};

const TIPO_BADGE: Record<string, { label: string; cls: string }> = {
  INASISTENCIA_JUSTIFICADA:   { label: "Canceló", cls: "bg-amber-50 text-amber-600 ring-1 ring-amber-200" },
  INASISTENCIA_INJUSTIFICADA: { label: "Faltó",   cls: "bg-red-50 text-red-500 ring-1 ring-red-200" },
  CANCELACION_PROFESIONAL:    { label: "Cancelé", cls: "bg-neutral-100 text-neutral-500 ring-1 ring-neutral-200" },
};

interface EditForm {
  monto:       string;
  estado:      EstadoTurno;
  prepaga:     string;
  medio_pago:  MedioPago | "";
  tipo_sesion: TipoSesion;
}

interface Props {
  turnos:    TurnoResumen[];
  cargando:  boolean;
  onRefresh: () => void;
}

export default function TurnosTable({ turnos, cargando, onRefresh }: Props) {
  const toast = useToast();
  const [editandoId,   setEditandoId]   = useState<string | null>(null);
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);
  const [cobrandoId,   setCobrandoId]   = useState<string | null>(null);  // ← nuevo
  const [guardando,    setGuardando]    = useState(false);
  const [editForm, setEditForm] = useState<EditForm>({
    monto: "", estado: "COBRADO", prepaga: "", medio_pago: "", tipo_sesion: "SESION",
  });

  function iniciarEdicion(t: TurnoResumen) {
    setEditForm({
      monto:       String(t.monto),
      estado:      t.estado,
      prepaga:     t.prepaga ?? "",
      medio_pago:  (t.medio_pago as MedioPago | null) ?? "",
      tipo_sesion: (t.tipo_sesion as TipoSesion | undefined) ?? "SESION",
    });
    setEditandoId(t.id);
    setEliminandoId(null);
  }

  async function guardarEdicion(id: string) {
    const monto = parseFloat(editForm.monto.replace(",", "."));
    if (isNaN(monto) || monto < 0) return;
    setGuardando(true);
    const esInasistencia = ["INASISTENCIA_INJUSTIFICADA", "INASISTENCIA_JUSTIFICADA", "CANCELACION_PROFESIONAL"].includes(editForm.tipo_sesion);
    const estadoFinal = esInasistencia && monto === 0 ? "INCOBRABLE" as EstadoTurno : editForm.estado;
    try {
      await actualizarTurno(id, {
        monto, estado: estadoFinal,
        prepaga:     editForm.prepaga.trim() || null,
        medio_pago:  editForm.medio_pago as MedioPago || null,
        tipo_sesion: editForm.tipo_sesion,
      });
      setEditandoId(null);
      toast.success("Turno actualizado");
      onRefresh();
    } catch {
      toast.error("No se pudo guardar. Intentá de nuevo.");
    } finally { setGuardando(false); }
  }

  async function confirmarEliminacion(id: string) {
    setGuardando(true);
    try {
      await eliminarTurno(id);
      setEliminandoId(null);
      toast.success("Turno eliminado");
      onRefresh();
    } catch {
      setEliminandoId(null);
      toast.error("No se pudo eliminar el turno.");
    } finally { setGuardando(false); }
  }

  // ── Cobro rápido ─────────────────────────────────────────────────────────────
  async function cobrarRapido(t: TurnoResumen) {
    setCobrandoId(t.id);
    try {
      const hoy = new Date().toISOString().slice(0, 10);
      await actualizarTurno(t.id, {
        estado:               "COBRADO",
        fecha_cobro_efectivo: hoy,
      });
      toast.success(`${t.paciente_nombre} — cobrado ✓`);
      onRefresh();
    } catch {
      toast.error("No se pudo marcar como cobrado.");
    } finally { setCobrandoId(null); }
  }

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5 animate-in fade-in slide-in-from-bottom-2 duration-500" style={{ animationDelay: "300ms" }}>
      <div className="flex items-baseline justify-between px-5 py-4">
        <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-400">Últimos turnos</p>
        {!cargando && turnos.length > 0 && (
          <span className="text-xs text-neutral-300">{turnos.length} registros</span>
        )}
      </div>

      {cargando && (
        <div className="divide-y divide-neutral-100">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex items-center gap-3.5 px-5 py-3.5">
              <div className="h-8 w-8 animate-pulse rounded-full bg-neutral-100" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-32 animate-pulse rounded bg-neutral-100" />
                <div className="h-2.5 w-20 animate-pulse rounded bg-neutral-100" />
              </div>
              <div className="h-6 w-16 animate-pulse rounded-full bg-neutral-100" />
            </div>
          ))}
        </div>
      )}

      {!cargando && turnos.length === 0 && (
        <div className="py-12 text-center">
          <p className="text-sm text-neutral-400">Sin turnos registrados todavía.</p>
          <p className="mt-1 text-xs text-neutral-300">Usá el copiloto para registrar el primero.</p>
        </div>
      )}

      {!cargando && turnos.length > 0 && (
        <div className="divide-y divide-neutral-100">
          {turnos.map(t => {

            /* ── Fila edición ── */
            if (editandoId === t.id) {
              return (
                <div key={t.id} className="bg-slate-50 px-5 py-3">
                  <div className="flex items-center gap-2">
                    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${avatarCls(t.paciente_nombre)}`}>
                      {iniciales(t.paciente_nombre)}
                    </div>
                    <p className="text-sm font-medium text-neutral-700">{t.paciente_nombre}</p>
                  </div>
                  <div className="mt-3 flex flex-wrap items-end gap-2">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-medium uppercase text-neutral-400">Monto $</label>
                      <input type="number" min={1} value={editForm.monto}
                        onChange={e => setEditForm(f => ({ ...f, monto: e.target.value }))}
                        className="w-28 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm tabular-nums text-neutral-800 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-medium uppercase text-neutral-400">Estado</label>
                      <select value={editForm.estado} onChange={e => setEditForm(f => ({ ...f, estado: e.target.value as EstadoTurno }))}
                        className="rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm text-neutral-800 focus:border-neutral-400 focus:outline-none">
                        <option value="COBRADO">Cobrado</option>
                        <option value="DIFERIDO">Pendiente</option>
                        <option value="INCOBRABLE">Incobrable</option>
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-medium uppercase text-neutral-400">Prepaga (opcional)</label>
                      <input type="text" placeholder="OSDE, Swiss Medical…" value={editForm.prepaga}
                        onChange={e => setEditForm(f => ({ ...f, prepaga: e.target.value }))}
                        className="w-36 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm text-neutral-800 placeholder:text-neutral-300 focus:border-neutral-400 focus:outline-none" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-medium uppercase text-neutral-400">Medio de pago</label>
                      <select value={editForm.medio_pago} onChange={e => setEditForm(f => ({ ...f, medio_pago: e.target.value as MedioPago | "" }))}
                        className="rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm text-neutral-800 focus:border-neutral-400 focus:outline-none">
                        <option value="">Sin especificar</option>
                        {(Object.keys(MEDIO_PAGO_LABELS) as MedioPago[]).map(k => (
                          <option key={k} value={k}>{MEDIO_PAGO_LABELS[k]}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-medium uppercase text-neutral-400">Tipo de sesión</label>
                      <select value={editForm.tipo_sesion} onChange={e => setEditForm(f => ({ ...f, tipo_sesion: e.target.value as TipoSesion }))}
                        className="rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm text-neutral-800 focus:border-neutral-400 focus:outline-none">
                        {(Object.keys(TIPO_SESION_LABELS) as TipoSesion[]).map(k => (
                          <option key={k} value={k}>{TIPO_SESION_LABELS[k]}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex gap-1.5">
                      <button onClick={() => guardarEdicion(t.id)} disabled={guardando}
                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white transition-colors hover:bg-indigo-500 disabled:opacity-40">
                        {guardando
                          ? <span className="h-3 w-3 animate-spin rounded-full border border-white/30 border-t-white" />
                          : <Check className="h-3.5 w-3.5" />}
                      </button>
                      <button onClick={() => setEditandoId(null)} disabled={guardando}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 text-neutral-500 transition-colors hover:bg-neutral-100">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            }

            /* ── Fila eliminación ── */
            if (eliminandoId === t.id) {
              return (
                <div key={t.id} className="flex items-center gap-3 bg-red-50 px-5 py-3.5">
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${avatarCls(t.paciente_nombre)}`}>
                    {iniciales(t.paciente_nombre)}
                  </div>
                  <p className="flex-1 text-sm text-red-600">
                    ¿Eliminar el turno de <strong>{t.paciente_nombre}</strong>?
                  </p>
                  <div className="flex gap-2">
                    <button onClick={() => confirmarEliminacion(t.id)} disabled={guardando}
                      className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-40">
                      {guardando ? "Eliminando…" : "Sí, eliminar"}
                    </button>
                    <button onClick={() => setEliminandoId(null)} disabled={guardando}
                      className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs text-neutral-500 transition-colors hover:bg-white">
                      Cancelar
                    </button>
                  </div>
                </div>
              );
            }

            /* ── Fila normal ── */
            const esInasistencia = t.tipo_sesion && t.tipo_sesion !== "SESION";
            const esDiferido = t.estado === "DIFERIDO";
            const cobrando = cobrandoId === t.id;

            return (
              <div key={t.id} className={`group flex items-center gap-3.5 px-5 py-3 transition-colors hover:bg-neutral-50/80 ${esInasistencia ? "opacity-75" : ""}`}>
                {/* Avatar */}
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${avatarCls(t.paciente_nombre)}`}>
                  {iniciales(t.paciente_nombre)}
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="truncate text-sm font-medium text-neutral-800">{t.paciente_nombre}</p>
                    {esInasistencia && t.tipo_sesion && TIPO_BADGE[t.tipo_sesion] && (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${TIPO_BADGE[t.tipo_sesion].cls}`}>
                        {TIPO_BADGE[t.tipo_sesion].label}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-neutral-400">
                    {fechaRel(t.fecha_turno)}
                    {t.prepaga && <span className="ml-1.5 text-neutral-300">· {t.prepaga}</span>}
                    {t.medio_pago && <span className="ml-1.5 text-neutral-300">· {MEDIO_PAGO_LABELS[t.medio_pago as MedioPago]}</span>}
                  </p>
                </div>

                {/* Monto + estado + acciones */}
                <div className="flex shrink-0 items-center gap-2">
                  {t.monto > 0 && (
                    <div className="flex items-center gap-1.5">
                      {t.moneda === "USD" && (
                        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">USD</span>
                      )}
                      <span className="text-sm font-semibold tabular-nums text-neutral-800">
                        {t.moneda === "USD" ? t.monto.toLocaleString("es-AR") : fmtPesos(t.monto)}
                      </span>
                      {t.moneda === "USD" && t.tipo_cambio && (
                        <span className="text-xs text-neutral-400">≈ {fmtPesos(t.monto * t.tipo_cambio)}</span>
                      )}
                    </div>
                  )}

                  <Chip estado={t.estado} />

                  {/* Botón cobrar rápido — siempre visible en mobile, hover en desktop */}
                  {esDiferido && (
                    <button
                      onClick={() => cobrarRapido(t)}
                      disabled={cobrando}
                      title="Marcar como cobrado"
                      className="flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 opacity-100 transition-all hover:bg-emerald-100 md:opacity-0 md:group-hover:opacity-100 disabled:opacity-60"
                    >
                      {cobrando
                        ? <span className="h-3 w-3 animate-spin rounded-full border border-emerald-300 border-t-emerald-700" />
                        : <CheckCircle2 className="h-3 w-3" />
                      }
                      Cobrar
                    </button>
                  )}

                  <div className="opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                    <RowMenu
                      onEditar={() => iniciarEdicion(t)}
                      onEliminar={() => { setEliminandoId(t.id); setEditandoId(null); }}
                    />
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
