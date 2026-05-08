"use client";

import { useEffect, useState } from "react";
import { X, Pencil, Check, Trash2, Calendar, TrendingUp, Clock } from "lucide-react";
import { getPacienteDetalle, actualizarPaciente, eliminarPaciente } from "@/lib/api";
import type { PacienteDetalle as Detalle, TurnoEnDetalle, EstadoTurno, PacienteUpdatePayload } from "@/lib/types";

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtPesos(n: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency", currency: "ARS",
    notation: "compact", maximumFractionDigits: 1,
  }).format(n);
}

function fmtFecha(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("es-AR", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function fechaRel(iso: string): string {
  const f   = new Date(iso + "T12:00:00");
  const hoy = new Date();
  const dias = Math.round((hoy.getTime() - f.getTime()) / 86_400_000);
  if (dias === 0) return "Hoy";
  if (dias === 1) return "Ayer";
  if (dias < 7)   return `Hace ${dias}d`;
  if (dias < 30)  return `Hace ${Math.round(dias / 7)}sem`;
  return fmtFecha(iso);
}

const CHIP_CFG: Record<EstadoTurno, { dot: string; label: string; cls: string }> = {
  COBRADO:    { dot: "bg-emerald-500", label: "Cobrado",    cls: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" },
  DIFERIDO:   { dot: "bg-amber-400",   label: "Pendiente",  cls: "bg-amber-50  text-amber-700  ring-1 ring-amber-200" },
  INCOBRABLE: { dot: "bg-red-400",     label: "Incobrable", cls: "bg-red-50    text-red-600    ring-1 ring-red-200" },
};

function Chip({ estado }: { estado: EstadoTurno }) {
  const { dot, label, cls } = CHIP_CFG[estado];
  return (
    <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

const AVATAR_PALETTES = [
  "bg-violet-100 text-violet-700", "bg-blue-100 text-blue-700",
  "bg-emerald-100 text-emerald-700", "bg-amber-100 text-amber-700",
  "bg-pink-100 text-pink-700", "bg-cyan-100 text-cyan-700",
  "bg-orange-100 text-orange-700", "bg-teal-100 text-teal-700",
];
function avatarCls(nombre: string): string {
  let h = 0;
  for (let i = 0; i < nombre.length; i++) h = (h * 31 + nombre.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTES[h % AVATAR_PALETTES.length];
}

// ── Componente principal ──────────────────────────────────────────────────────

interface Props {
  pacienteId: string;
  onClose:    () => void;
  onRefresh:  () => void;         // para recargar la lista después de editar/eliminar
}

interface EditForm {
  nombre:    string;
  apellido:  string;
  email:     string;
  honorario: string;
}

export default function PacienteDetalle({ pacienteId, onClose, onRefresh }: Props) {
  const [detalle,   setDetalle]   = useState<Detalle | null>(null);
  const [cargando,  setCargando]  = useState(true);
  const [editando,  setEditando]  = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [confirmarEliminar, setConfirmarEliminar] = useState(false);
  const [form, setForm] = useState<EditForm>({ nombre: "", apellido: "", email: "", honorario: "" });

  useEffect(() => {
    setCargando(true);
    getPacienteDetalle(pacienteId)
      .then((d) => { setDetalle(d); setCargando(false); })
      .catch(() => setCargando(false));
  }, [pacienteId]);

  function iniciarEdicion() {
    if (!detalle) return;
    setForm({
      nombre:    detalle.nombre,
      apellido:  detalle.apellido,
      email:     detalle.email ?? "",
      honorario: detalle.honorario_actual ? String(detalle.honorario_actual) : "",
    });
    setEditando(true);
  }

  async function guardar() {
    if (!detalle) return;
    setGuardando(true);
    try {
      const payload: PacienteUpdatePayload = {
        nombre:   form.nombre.trim()   || undefined,
        apellido: form.apellido.trim() || undefined,
        email:    form.email.trim()    || null,
      };
      const hon = parseFloat(form.honorario.replace(",", "."));
      if (!isNaN(hon) && hon > 0) {
        payload.honorario_actual = hon;
        payload.fecha_ultimo_ajuste_honorario = new Date().toISOString().split("T")[0];
      }
      await actualizarPaciente(detalle.id, payload);
      const d = await getPacienteDetalle(detalle.id);
      setDetalle(d);
      setEditando(false);
      onRefresh();
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar() {
    if (!detalle) return;
    setGuardando(true);
    try {
      await eliminarPaciente(detalle.id);
      onRefresh();
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      alert(msg.includes("409") || msg.includes("turnos")
        ? "No se puede eliminar: el paciente tiene turnos registrados."
        : "Error al eliminar el paciente."
      );
    } finally {
      setGuardando(false);
      setConfirmarEliminar(false);
    }
  }

  const nombreCompleto = detalle ? `${detalle.nombre} ${detalle.apellido}` : "";

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Panel */}
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-4">
          {cargando ? (
            <div className="h-4 w-40 animate-pulse rounded bg-neutral-200" />
          ) : (
            <div className="flex items-center gap-3">
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${avatarCls(nombreCompleto)}`}>
                {(nombreCompleto[0] ?? "") + (nombreCompleto.split(" ")[1]?.[0] ?? "")}
              </div>
              <div>
                <p className="text-sm font-semibold text-neutral-900">{nombreCompleto}</p>
                {detalle?.email && (
                  <p className="text-xs text-neutral-400">{detalle.email}</p>
                )}
              </div>
            </div>
          )}
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Contenido scrollable */}
        <div className="flex-1 overflow-y-auto">

          {cargando && (
            <div className="space-y-3 p-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded-xl bg-neutral-100" />
              ))}
            </div>
          )}

          {!cargando && detalle && (
            <>
              {/* Stats rápidas */}
              <div className="grid grid-cols-3 gap-px bg-neutral-100">
                {[
                  { icon: TrendingUp, label: "Cobrado total", value: fmtPesos(detalle.cobrado_total), color: "text-emerald-600" },
                  { icon: Clock,      label: "Pendiente",     value: fmtPesos(detalle.pendiente),     color: "text-amber-600"  },
                  { icon: Calendar,   label: "Sesiones",      value: String(detalle.total_sesiones),  color: "text-neutral-800" },
                ].map(({ icon: Icon, label, value, color }) => (
                  <div key={label} className="flex flex-col items-center gap-1 bg-white px-3 py-4">
                    <Icon className={`h-4 w-4 ${color} opacity-70`} />
                    <p className={`text-lg font-semibold tabular-nums ${color}`}>{value}</p>
                    <p className="text-[10px] text-neutral-400">{label}</p>
                  </div>
                ))}
              </div>

              {/* Info del paciente / Formulario edición */}
              <div className="p-5">
                {editando ? (
                  <div className="space-y-3">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">Editar datos</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] uppercase text-neutral-400">Nombre</label>
                        <input
                          value={form.nombre}
                          onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                          className="rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm focus:border-neutral-400 focus:outline-none"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] uppercase text-neutral-400">Apellido</label>
                        <input
                          value={form.apellido}
                          onChange={(e) => setForm((f) => ({ ...f, apellido: e.target.value }))}
                          className="rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm focus:border-neutral-400 focus:outline-none"
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] uppercase text-neutral-400">Email</label>
                      <input
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                        placeholder="ejemplo@mail.com"
                        className="rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm focus:border-neutral-400 focus:outline-none"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] uppercase text-neutral-400">Honorario actual $</label>
                      <input
                        type="number"
                        min={1}
                        value={form.honorario}
                        onChange={(e) => setForm((f) => ({ ...f, honorario: e.target.value }))}
                        placeholder="Ej: 25000"
                        className="rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm tabular-nums focus:border-neutral-400 focus:outline-none"
                      />
                      <p className="text-[10px] text-neutral-400">Al guardar, se actualiza la fecha de ajuste a hoy.</p>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={guardar}
                        disabled={guardando}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-neutral-900 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-40"
                      >
                        {guardando
                          ? <span className="h-3 w-3 animate-spin rounded-full border border-white/30 border-t-white" />
                          : <Check className="h-3.5 w-3.5" />
                        }
                        Guardar
                      </button>
                      <button
                        onClick={() => setEditando(false)}
                        disabled={guardando}
                        className="rounded-xl border border-neutral-200 px-4 py-2 text-sm text-neutral-500 hover:bg-neutral-50"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">Datos del paciente</p>
                      <button
                        onClick={iniciarEdicion}
                        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-neutral-500 hover:bg-neutral-100"
                      >
                        <Pencil className="h-3 w-3" /> Editar
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3 rounded-xl bg-neutral-50 p-3.5 text-sm">
                      <div>
                        <p className="text-[10px] text-neutral-400">Última sesión</p>
                        <p className="font-medium text-neutral-800">
                          {detalle.ultima_sesion ? fechaRel(detalle.ultima_sesion) : "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-neutral-400">Sesiones este mes</p>
                        <p className="font-medium text-neutral-800">{detalle.sesiones_mes}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-neutral-400">Honorario actual</p>
                        <p className="font-medium tabular-nums text-neutral-800">
                          {detalle.honorario_actual ? fmtPesos(detalle.honorario_actual) : "Sin datos"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-neutral-400">Último ajuste</p>
                        <p className="font-medium text-neutral-800">
                          {detalle.fecha_ultimo_ajuste_honorario
                            ? fmtFecha(detalle.fecha_ultimo_ajuste_honorario)
                            : "—"}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Historial de turnos */}
              <div className="px-5 pb-5">
                <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                  Historial de turnos
                </p>
                {detalle.turnos.length === 0 ? (
                  <p className="text-sm text-neutral-400">Sin turnos registrados.</p>
                ) : (
                  <div className="divide-y divide-neutral-100 rounded-xl border border-neutral-100">
                    {detalle.turnos.map((t: TurnoEnDetalle) => (
                      <div key={t.id} className="flex items-center justify-between px-3.5 py-2.5">
                        <div>
                          <p className="text-sm font-medium text-neutral-800">{fechaRel(t.fecha_turno)}</p>
                          <p className="text-xs text-neutral-400">
                            {fmtFecha(t.fecha_turno)}
                            {t.prepaga && <span className="ml-1.5 text-neutral-300">· {t.prepaga}</span>}
                          </p>
                        </div>
                        <div className="flex items-center gap-2.5">
                          <span className="text-sm font-semibold tabular-nums text-neutral-800">
                            {fmtPesos(t.monto)}
                          </span>
                          <Chip estado={t.estado} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer — eliminar */}
        {!cargando && detalle && (
          <div className="border-t border-neutral-100 px-5 py-3">
            {confirmarEliminar ? (
              <div className="flex items-center gap-2">
                <p className="flex-1 text-xs text-red-500">¿Eliminar a {detalle.nombre}? Esta acción no se puede deshacer.</p>
                <button
                  onClick={eliminar}
                  disabled={guardando}
                  className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-600 disabled:opacity-40"
                >
                  Sí, eliminar
                </button>
                <button
                  onClick={() => setConfirmarEliminar(false)}
                  className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs text-neutral-500 hover:bg-neutral-50"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmarEliminar(true)}
                className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-red-500"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Eliminar paciente
              </button>
            )}
          </div>
        )}
      </aside>
    </>
  );
}
