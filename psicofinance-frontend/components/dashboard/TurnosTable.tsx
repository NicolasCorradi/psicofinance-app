"use client";

import { useState, useRef, useEffect } from "react";
import { MoreHorizontal, Pencil, Trash2, Check, X } from "lucide-react";
import { actualizarTurno, eliminarTurno } from "@/lib/api";
import type { TurnoResumen, EstadoTurno } from "@/lib/types";

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

// Avatar con iniciales y color determinístico
const AVATAR_PALETTES = [
  "bg-violet-100 text-violet-700",
  "bg-blue-100   text-blue-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100  text-amber-700",
  "bg-pink-100   text-pink-700",
  "bg-cyan-100   text-cyan-700",
  "bg-orange-100 text-orange-700",
  "bg-teal-100   text-teal-700",
];

function avatarCls(nombre: string): string {
  let h = 0;
  for (let i = 0; i < nombre.length; i++) h = (h * 31 + nombre.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTES[h % AVATAR_PALETTES.length];
}

function iniciales(nombre: string): string {
  const p = nombre.trim().split(/\s+/);
  if (p.length >= 2) return (p[0][0] + p[1][0]).toUpperCase();
  return nombre.slice(0, 2).toUpperCase();
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

// Menú contextual con cierre al hacer click fuera
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
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-300 transition-colors hover:bg-neutral-100 hover:text-neutral-600"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-36 overflow-hidden rounded-xl border border-neutral-100 bg-white py-1 shadow-lg">
          <button
            onClick={() => { setOpen(false); onEditar(); }}
            className="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm text-neutral-700 transition-colors hover:bg-neutral-50"
          >
            <Pencil className="h-3.5 w-3.5 text-neutral-400" />
            Editar
          </button>
          <button
            onClick={() => { setOpen(false); onEliminar(); }}
            className="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm text-red-500 transition-colors hover:bg-red-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Eliminar
          </button>
        </div>
      )}
    </div>
  );
}

interface EditForm {
  monto:   string;
  estado:  EstadoTurno;
  prepaga: string;
}

interface Props {
  turnos:    TurnoResumen[];
  cargando:  boolean;
  onRefresh: () => void;
}

export default function TurnosTable({ turnos, cargando, onRefresh }: Props) {
  const [editandoId,    setEditandoId]    = useState<string | null>(null);
  const [eliminandoId,  setEliminandoId]  = useState<string | null>(null);
  const [guardando,     setGuardando]     = useState(false);
  const [editForm,      setEditForm]      = useState<EditForm>({ monto: "", estado: "COBRADO", prepaga: "" });

  function iniciarEdicion(t: TurnoResumen) {
    setEditForm({
      monto:   String(t.monto),
      estado:  t.estado,
      prepaga: t.prepaga ?? "",
    });
    setEditandoId(t.id);
    setEliminandoId(null);
  }

  function iniciarEliminacion(t: TurnoResumen) {
    setEliminandoId(t.id);
    setEditandoId(null);
  }

  async function guardarEdicion(id: string) {
    const monto = parseFloat(editForm.monto.replace(",", "."));
    if (isNaN(monto) || monto <= 0) return;
    setGuardando(true);
    try {
      await actualizarTurno(id, {
        monto,
        estado:  editForm.estado,
        prepaga: editForm.prepaga.trim() || null,
      });
      setEditandoId(null);
      onRefresh();
    } finally {
      setGuardando(false);
    }
  }

  async function confirmarEliminacion(id: string) {
    setGuardando(true);
    try {
      await eliminarTurno(id);
      setEliminandoId(null);
      onRefresh();
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
      <div className="flex items-baseline justify-between px-5 py-4">
        <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
          Últimos turnos
        </p>
        {!cargando && turnos.length > 0 && (
          <span className="text-xs text-neutral-300">{turnos.length} registros</span>
        )}
      </div>

      {cargando && (
        <div className="flex items-center justify-center gap-2 py-10 text-xs text-neutral-400">
          <span className="h-3 w-3 animate-spin rounded-full border border-neutral-200 border-t-neutral-500" />
          Cargando…
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
          {turnos.map((t) => {

            /* ── Fila en modo edición ── */
            if (editandoId === t.id) {
              return (
                <div key={t.id} className="bg-slate-50 px-5 py-3">
                  <div className="flex items-center gap-2">
                    {/* Avatar pequeño */}
                    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${avatarCls(t.paciente_nombre)}`}>
                      {iniciales(t.paciente_nombre)}
                    </div>
                    <p className="text-sm font-medium text-neutral-700">{t.paciente_nombre}</p>
                  </div>
                  <div className="mt-3 flex flex-wrap items-end gap-2">
                    {/* Monto */}
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-medium uppercase text-neutral-400">Monto $</label>
                      <input
                        type="number"
                        min={1}
                        value={editForm.monto}
                        onChange={(e) => setEditForm((f) => ({ ...f, monto: e.target.value }))}
                        className="w-28 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm tabular-nums text-neutral-800 focus:border-neutral-400 focus:outline-none"
                      />
                    </div>
                    {/* Estado */}
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-medium uppercase text-neutral-400">Estado</label>
                      <select
                        value={editForm.estado}
                        onChange={(e) => setEditForm((f) => ({ ...f, estado: e.target.value as EstadoTurno }))}
                        className="rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm text-neutral-800 focus:border-neutral-400 focus:outline-none"
                      >
                        <option value="COBRADO">Cobrado</option>
                        <option value="DIFERIDO">Pendiente</option>
                        <option value="INCOBRABLE">Incobrable</option>
                      </select>
                    </div>
                    {/* Prepaga */}
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-medium uppercase text-neutral-400">Prepaga (opcional)</label>
                      <input
                        type="text"
                        placeholder="OSDE, Swiss Medical…"
                        value={editForm.prepaga}
                        onChange={(e) => setEditForm((f) => ({ ...f, prepaga: e.target.value }))}
                        className="w-36 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm text-neutral-800 placeholder:text-neutral-300 focus:border-neutral-400 focus:outline-none"
                      />
                    </div>
                    {/* Botones */}
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => guardarEdicion(t.id)}
                        disabled={guardando}
                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-900 text-white transition-colors hover:bg-neutral-700 disabled:opacity-40"
                      >
                        {guardando
                          ? <span className="h-3 w-3 animate-spin rounded-full border border-white/30 border-t-white" />
                          : <Check className="h-3.5 w-3.5" />
                        }
                      </button>
                      <button
                        onClick={() => setEditandoId(null)}
                        disabled={guardando}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 text-neutral-500 transition-colors hover:bg-neutral-100"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            }

            /* ── Fila en modo confirmación de eliminación ── */
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
                    <button
                      onClick={() => confirmarEliminacion(t.id)}
                      disabled={guardando}
                      className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-40"
                    >
                      {guardando ? "Eliminando…" : "Sí, eliminar"}
                    </button>
                    <button
                      onClick={() => setEliminandoId(null)}
                      disabled={guardando}
                      className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs text-neutral-500 transition-colors hover:bg-white"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              );
            }

            /* ── Fila normal ── */
            return (
              <div key={t.id} className="group flex items-center gap-3.5 px-5 py-3 transition-colors hover:bg-neutral-50">
                {/* Avatar */}
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${avatarCls(t.paciente_nombre)}`}>
                  {iniciales(t.paciente_nombre)}
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-neutral-800">{t.paciente_nombre}</p>
                  <p className="text-xs text-neutral-400">
                    {fechaRel(t.fecha_turno)}
                    {t.prepaga && <span className="ml-1.5 text-neutral-300">· {t.prepaga}</span>}
                  </p>
                </div>

                {/* Monto + estado + menú */}
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-sm font-semibold tabular-nums text-neutral-800">
                    {fmtPesos(t.monto)}
                  </span>
                  <Chip estado={t.estado} />
                  <div className="opacity-0 transition-opacity group-hover:opacity-100">
                    <RowMenu
                      onEditar={() => iniciarEdicion(t)}
                      onEliminar={() => iniciarEliminacion(t)}
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
