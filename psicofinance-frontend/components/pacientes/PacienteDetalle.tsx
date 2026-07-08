"use client";

import { useEffect, useState } from "react";
import { X, Pencil, Check, Trash2, Calendar, TrendingUp, Clock, Mail, Banknote, CreditCard, Smartphone, ArrowLeftRight, HelpCircle } from "lucide-react";
import { getPacienteDetalle, actualizarPaciente, eliminarPaciente } from "@/lib/api";
import type { PacienteDetalle as Detalle, TurnoEnDetalle, EstadoTurno, MedioPago, TipoSesion, PacienteUpdatePayload } from "@/lib/types";
import { avatarCls } from "@/lib/avatar";
import { fmtPesosCompacto as fmtPesos, isoHoy, fechaRel, MEDIO_LABEL_CORTO as MEDIO_LABELS } from "@/lib/format";

function fmtFecha(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("es-AR", {
    day: "numeric", month: "short", year: "numeric",
  });
}

// ── Estado del turno ─────────────────────────────────────────────────────────

const CHIP_CFG: Record<EstadoTurno, { dot: string; label: string; cls: string }> = {
  COBRADO:    { dot: "bg-emerald-500", label: "Cobrado",    cls: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" },
  DIFERIDO:   { dot: "bg-amber-400",   label: "Pendiente",  cls: "bg-amber-50  text-amber-700  ring-1 ring-amber-200" },
  INCOBRABLE: { dot: "bg-red-400",     label: "Incobrable", cls: "bg-red-50    text-red-600    ring-1 ring-red-200" },
};

function EstadoChip({ estado }: { estado: EstadoTurno }) {
  const { dot, label, cls } = CHIP_CFG[estado];
  return (
    <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

// ── Tipo de sesión ────────────────────────────────────────────────────────────

const TIPO_CFG: Record<TipoSesion, { label: string; cls: string }> = {
  SESION:                    { label: "",              cls: "" },
  INASISTENCIA_JUSTIFICADA:  { label: "Canceló",       cls: "bg-amber-50 text-amber-600 ring-1 ring-amber-200" },
  INASISTENCIA_INJUSTIFICADA:{ label: "Faltó",         cls: "bg-red-50 text-red-600 ring-1 ring-red-200" },
  CANCELACION_PROFESIONAL:   { label: "Cancelé",       cls: "bg-neutral-100 text-neutral-500 ring-1 ring-neutral-200" },
};

function TipoChip({ tipo }: { tipo: TipoSesion }) {
  const { label, cls } = TIPO_CFG[tipo];
  if (!label) return null;
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${cls}`}>{label}</span>;
}

// ── Medio de pago ─────────────────────────────────────────────────────────────

const MEDIO_ICONS: Record<MedioPago, React.ReactNode> = {
  EFECTIVO:     <Banknote className="h-3 w-3" />,
  TRANSFERENCIA:<ArrowLeftRight className="h-3 w-3" />,
  MERCADO_PAGO: <Smartphone className="h-3 w-3" />,
  TARJETA:      <CreditCard className="h-3 w-3" />,
  OTRO:         <HelpCircle className="h-3 w-3" />,
};
function MedioBadge({ medio }: { medio: MedioPago | null }) {
  if (!medio) return null;
  return (
    <span className="flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] text-neutral-500">
      {MEDIO_ICONS[medio]}
      {MEDIO_LABELS[medio]}
    </span>
  );
}

// ── Props e interfaces ───────────────────────────────────────────────────────

interface Props {
  pacienteId: string;
  onClose:    () => void;
  onRefresh:  () => void;
}

interface EditForm {
  nombre:    string;
  apellido:  string;
  email:     string;
  honorario: string;
}

// ── Componente principal ─────────────────────────────────────────────────────

export default function PacienteDetalle({ pacienteId, onClose, onRefresh }: Props) {
  const [detalle,   setDetalle]   = useState<Detalle | null>(null);
  const [cargando,  setCargando]  = useState(true);
  const [editando,  setEditando]  = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [confirmarEliminar, setConfirmarEliminar] = useState(false);
  const [errorEliminar, setErrorEliminar] = useState<string | null>(null);
  const [errorCarga, setErrorCarga] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState(false);
  const [form, setForm] = useState<EditForm>({ nombre: "", apellido: "", email: "", honorario: "" });

  useEffect(() => {
    // Flag de cancelación: al cambiar rápido de paciente, una respuesta vieja
    // en vuelo no debe pisar la del paciente actual
    let activo = true;
    setCargando(true);
    setErrorCarga(false);
    getPacienteDetalle(pacienteId)
      .then((d) => { if (activo) { setDetalle(d); setCargando(false); } })
      .catch(() => { if (activo) { setErrorCarga(true); setCargando(false); } });
    return () => { activo = false; };
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
    if (!detalle || guardando) return;
    setGuardando(true);
    setErrorGuardar(false);
    try {
      const payload: PacienteUpdatePayload = {
        nombre:   form.nombre.trim()   || undefined,
        apellido: form.apellido.trim() || undefined,
        email:    form.email.trim()    || null,
      };
      const hon = parseFloat(form.honorario.replace(",", "."));
      if (!isNaN(hon) && hon > 0) {
        payload.honorario_actual = hon;
        payload.fecha_ultimo_ajuste_honorario = isoHoy();
      }
      await actualizarPaciente(detalle.id, payload);
      const d = await getPacienteDetalle(detalle.id);
      setDetalle(d);
      setEditando(false);
      onRefresh();
    } catch {
      setErrorGuardar(true); // sin catch quedaba en modo edición sin aviso
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
      setErrorEliminar(
        msg.includes("409") || msg.includes("turnos")
          ? "No se puede eliminar: el paciente tiene turnos registrados."
          : "Error al eliminar. Intentá de nuevo."
      );
      setConfirmarEliminar(false);
    } finally {
      setGuardando(false);
    }
  }

  // ── Stats derivadas ────────────────────────────────────────────────────────

  const sesionesReales = detalle?.turnos.filter(t => t.tipo_sesion === "SESION").length ?? 0;
  const inasistencias  = detalle?.turnos.filter(t =>
    t.tipo_sesion === "INASISTENCIA_INJUSTIFICADA" || t.tipo_sesion === "INASISTENCIA_JUSTIFICADA"
  ).length ?? 0;
  const totalConSesion = sesionesReales + inasistencias;
  const tasaAsistencia = totalConSesion > 0 ? Math.round((sesionesReales / totalConSesion) * 100) : null;

  const nombreCompleto  = detalle ? `${detalle.nombre} ${detalle.apellido}` : "";
  const inicialesAvatar = detalle ? `${detalle.nombre[0] ?? ""}${detalle.apellido[0] ?? ""}`.toUpperCase() : "";

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white shadow-2xl animate-in duration-200 slide-in-from-bottom sm:slide-in-from-bottom-0 sm:slide-in-from-right">

        {/* Header */}
        <div className="bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-900 px-5 pt-5 pb-6 text-white">
          <div className="flex items-start justify-between">
            {cargando ? (
              <div className="h-9 w-40 animate-pulse rounded bg-white/10" />
            ) : (
              <div className="flex items-center gap-3">
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-lg font-bold ring-2 ring-white/20 ${avatarCls(nombreCompleto)}`}>
                  {inicialesAvatar}
                </div>
                <div>
                  <p className="text-base font-semibold leading-tight">{nombreCompleto}</p>
                  {detalle?.email && (
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-white/50">
                      <Mail className="h-3 w-3" />
                      {detalle.email}
                    </p>
                  )}
                </div>
              </div>
            )}
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-white/40 hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Stats rápidas */}
        {!cargando && detalle && (
          <>
            <div className="grid grid-cols-3 gap-px bg-neutral-100 border-b border-neutral-100">
              {[
                { icon: TrendingUp, label: "Cobrado",    value: fmtPesos(detalle.cobrado_total), color: "text-emerald-600", iconBg: "bg-emerald-50" },
                { icon: Clock,      label: "Pendiente",  value: fmtPesos(detalle.pendiente),     color: "text-amber-600",   iconBg: "bg-amber-50"   },
                { icon: Calendar,   label: "Sesiones",   value: String(detalle.total_sesiones),  color: "text-indigo-600",  iconBg: "bg-indigo-50"  },
              ].map(({ icon: Icon, label, value, color, iconBg }) => (
                <div key={label} className="flex flex-col items-center gap-1.5 bg-white px-3 py-4">
                  <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${iconBg}`}>
                    <Icon className={`h-3.5 w-3.5 ${color}`} strokeWidth={2} />
                  </div>
                  <p className={`text-base font-bold tabular-nums ${color}`}>{value}</p>
                  <p className="text-[10px] uppercase tracking-wider text-neutral-400">{label}</p>
                </div>
              ))}
            </div>

            {/* Barra de asistencia */}
            {tasaAsistencia !== null && totalConSesion > 0 && (
              <div className="border-b border-neutral-100 bg-white px-4 py-2.5">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] text-neutral-400 font-medium">Tasa de asistencia</span>
                  <span className={`text-[11px] font-bold tabular-nums ${tasaAsistencia >= 80 ? "text-emerald-600" : tasaAsistencia >= 60 ? "text-amber-600" : "text-red-500"}`}>
                    {tasaAsistencia}%
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-neutral-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${tasaAsistencia >= 80 ? "bg-emerald-400" : tasaAsistencia >= 60 ? "bg-amber-400" : "bg-red-400"}`}
                    style={{ width: `${tasaAsistencia}%` }}
                  />
                </div>
                <div className="mt-1.5 flex gap-3 text-[10px] text-neutral-400">
                  <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />{sesionesReales} sesiones</span>
                  {inasistencias > 0 && <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-red-300" />{inasistencias} inasistencias</span>}
                </div>
              </div>
            )}
          </>
        )}

        {/* Contenido scrollable */}
        <div className="flex-1 overflow-y-auto">

          {cargando && (
            <div className="space-y-3 p-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded-xl bg-neutral-100" />
              ))}
            </div>
          )}

          {!cargando && errorCarga && (
            <div className="p-8 text-center">
              <p className="text-sm text-neutral-500">No se pudo cargar el detalle del paciente.</p>
              <button
                onClick={() => {
                  setCargando(true);
                  setErrorCarga(false);
                  getPacienteDetalle(pacienteId)
                    .then((d) => { setDetalle(d); setCargando(false); })
                    .catch(() => { setErrorCarga(true); setCargando(false); });
                }}
                className="mt-3 rounded-xl border border-neutral-200 px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-50"
              >
                Reintentar
              </button>
            </div>
          )}

          {!cargando && detalle && (
            <>
              {/* Datos / Edición */}
              <div className="p-5">
                {editando ? (
                  <div className="space-y-3">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-400">Editar datos</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] uppercase text-neutral-400">Nombre</label>
                        <input
                          value={form.nombre}
                          onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                          className="rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] uppercase text-neutral-400">Apellido</label>
                        <input
                          value={form.apellido}
                          onChange={(e) => setForm((f) => ({ ...f, apellido: e.target.value }))}
                          className="rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
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
                        className="rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
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
                        className="rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm tabular-nums focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                      />
                      <p className="text-[10px] text-neutral-400">Al guardar, se actualiza la fecha de ajuste a hoy.</p>
                    </div>
                    {errorGuardar && (
                      <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-500 ring-1 ring-red-100">
                        No se pudieron guardar los cambios. Intentá de nuevo.
                      </p>
                    )}
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={guardar}
                        disabled={guardando}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-indigo-600 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-500 disabled:opacity-40"
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
                      <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-400">Datos del paciente</p>
                      <button
                        onClick={iniciarEdicion}
                        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-indigo-600 hover:bg-indigo-50 transition-colors"
                      >
                        <Pencil className="h-3 w-3" /> Editar
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3.5 text-sm ring-1 ring-slate-100">
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-neutral-400">Última sesión</p>
                        <p className="mt-0.5 font-medium text-neutral-800">
                          {detalle.ultima_sesion ? fechaRel(detalle.ultima_sesion) : "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-neutral-400">Sesiones este mes</p>
                        <p className="mt-0.5 font-medium text-neutral-800">{detalle.sesiones_mes}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-neutral-400">Honorario actual</p>
                        <p className="mt-0.5 font-medium tabular-nums text-neutral-800">
                          {detalle.honorario_actual ? fmtPesos(detalle.honorario_actual) : "Sin datos"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-neutral-400">Último ajuste</p>
                        <p className="mt-0.5 font-medium text-neutral-800">
                          {detalle.fecha_ultimo_ajuste_honorario
                            ? fmtFecha(detalle.fecha_ultimo_ajuste_honorario)
                            : "—"}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Historial */}
              <div className="px-5 pb-5">
                <p className="mb-3 text-[11px] font-medium uppercase tracking-wider text-neutral-400">
                  Historial de turnos
                </p>
                {detalle.turnos.length === 0 ? (
                  <p className="text-sm text-neutral-400">Sin turnos registrados.</p>
                ) : (
                  <div className="divide-y divide-neutral-100 rounded-xl border border-neutral-100 bg-white">
                    {detalle.turnos.map((t: TurnoEnDetalle) => (
                      <div
                        key={t.id}
                        className={`flex items-center justify-between px-3.5 py-3 transition-colors hover:bg-indigo-50/30 ${
                          t.tipo_sesion !== "SESION" ? "opacity-70" : ""
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-sm font-medium text-neutral-800">{fechaRel(t.fecha_turno)}</p>
                            <TipoChip tipo={t.tipo_sesion} />
                          </div>
                          <div className="mt-0.5 flex items-center gap-1.5 flex-wrap">
                            <p className="text-xs text-neutral-400">{fmtFecha(t.fecha_turno)}</p>
                            {t.prepaga && <span className="text-xs text-neutral-300">· {t.prepaga}</span>}
                            <MedioBadge medio={t.medio_pago} />
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-2 shrink-0">
                          {t.monto > 0 && (
                            <div className="flex items-center gap-1">
                              {t.moneda === "USD" && (
                                <span className="rounded bg-emerald-100 px-1 py-0.5 text-[9px] font-semibold text-emerald-700">USD</span>
                              )}
                              <span className="text-sm font-semibold tabular-nums text-neutral-800">
                                {t.moneda === "USD"
                                  ? `${t.monto.toLocaleString("es-AR")}`
                                  : fmtPesos(t.monto)
                                }
                              </span>
                            </div>
                          )}
                          <EstadoChip estado={t.estado} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {!cargando && detalle && (
          <div className="border-t border-neutral-100 px-5 py-3 bg-white space-y-2">
            {errorEliminar && (
              <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-500 ring-1 ring-red-100">
                {errorEliminar}
              </p>
            )}
            {confirmarEliminar ? (
              <div className="flex items-center gap-2">
                <p className="flex-1 text-xs text-red-500">¿Eliminar a {detalle.nombre}? No se puede deshacer.</p>
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
                onClick={() => { setErrorEliminar(null); setConfirmarEliminar(true); }}
                className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-red-500 transition-colors"
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
