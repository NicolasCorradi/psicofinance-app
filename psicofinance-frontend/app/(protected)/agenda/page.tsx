"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  ChevronLeft, ChevronRight, CalendarDays, Loader2,
  LayoutGrid, Plus, X, GripVertical, Check, Trash2,
  RefreshCw, WifiOff, CalendarClock, Ban, RotateCcw,
} from "lucide-react";
import {
  getTurnosAgenda, getSemanaModelo, guardarSemanaModelo,
  getPacientes, crearTurno, actualizarTurno,
  getExcepcionesSemana, guardarExcepcionesSemana, getDolarBlue,
} from "@/lib/api";
import { useToast } from "@/lib/toast";
import type {
  TurnoAgenda, EstadoTurno, TipoSesion, MedioPago, Moneda,
  SlotModelo, PacienteConStats, ExcepcionSemanal,
} from "@/lib/types";
import { avatarCls, iniciales } from "@/lib/avatar";
import { isoDate, MESES_ES, MEDIO_LABEL } from "@/lib/format";

// ── Helpers ───────────────────────────────────────────────────────────────────

function lunesDe(d: Date): Date {
  const r = new Date(d);
  const diff = r.getDay() === 0 ? -6 : 1 - r.getDay();
  r.setDate(r.getDate() + diff); r.setHours(0, 0, 0, 0); return r;
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}
const DIAS_CORTO = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];
function fmtRangoSemana(lunes: Date): string {
  const dom = addDays(lunes, 6);
  return lunes.getMonth() === dom.getMonth()
    ? `${lunes.getDate()}–${dom.getDate()} ${MESES_ES[lunes.getMonth()]} ${lunes.getFullYear()}`
    : `${lunes.getDate()} ${MESES_ES[lunes.getMonth()]} – ${dom.getDate()} ${MESES_ES[dom.getMonth()]} ${lunes.getFullYear()}`;
}
function formatFecha(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${parseInt(d)} ${MESES_ES[parseInt(m) - 1]} ${y}`;
}

const ESTADO_DOT: Record<EstadoTurno, string> = {
  COBRADO: "bg-emerald-500", DIFERIDO: "bg-amber-400", INCOBRABLE: "bg-neutral-300",
};
const TIPO_LABEL: Record<string, string> = {
  INASISTENCIA_JUSTIFICADA: "Canceló", INASISTENCIA_INJUSTIFICADA: "Faltó", CANCELACION_PROFESIONAL: "Cancelé",
};
// ── Modal Registrar (placeholder → nuevo turno) ───────────────────────────────

interface ModalRegistrarProps {
  slot: SlotModelo;
  fecha: string;
  honorario: number | null;
  monedaDefault: Moneda;
  onClose: () => void;
  onGuardado: () => void;
}

function ModalRegistrar({ slot, fecha, honorario, monedaDefault, onClose, onGuardado }: ModalRegistrarProps) {
  const [tipoSesion, setTipoSesion] = useState<TipoSesion>("SESION");
  const [monto, setMonto]           = useState(honorario ? honorario.toString() : "");
  const [moneda, setMoneda]         = useState<Moneda>(monedaDefault);
  const [tipoCambio, setTipoCambio] = useState<number | null>(null);
  const [estado, setEstado]         = useState<EstadoTurno>("DIFERIDO");
  const [medioPago, setMedioPago]   = useState<MedioPago | "">("");
  const [guardando, setGuardando]   = useState(false);
  const [error, setError]           = useState("");
  const toast = useToast();

  const esInasistencia = tipoSesion !== "SESION";

  useEffect(() => {
    if (moneda === "USD" && tipoCambio == null) {
      getDolarBlue().then(d => setTipoCambio(d.valor)).catch(() => {});
    }
  }, [moneda, tipoCambio]);

  async function confirmar() {
    setError("");
    const montoNum = Number(monto) || 0;
    if (!esInasistencia && montoNum <= 0) {
      setError(`Ingresá un monto mayor a ${moneda === "USD" ? "US$0" : "$0"} para registrar la sesión.`);
      return;
    }
    if (!esInasistencia && moneda === "USD" && (!tipoCambio || tipoCambio <= 0)) {
      setError("Ingresá un tipo de cambio válido.");
      return;
    }
    setGuardando(true);
    try {
      const hoy = isoDate(new Date());
      await crearTurno({
        paciente_id:          slot.paciente_id,
        fecha_turno:          fecha,
        monto:                esInasistencia ? 0 : montoNum,
        estado:               esInasistencia ? "COBRADO" : estado,
        tipo_sesion:          tipoSesion,
        origen_pago:          "DIRECTO",
        moneda:               esInasistencia ? "ARS" : moneda,
        tipo_cambio:          (!esInasistencia && moneda === "USD") ? tipoCambio : null,
        medio_pago:           medioPago || null,
        fecha_cobro_efectivo: (!esInasistencia && estado === "COBRADO") ? hoy : null,
      });
      toast.success(esInasistencia ? "Inasistencia registrada" : estado === "COBRADO" ? "Turno cobrado ✓" : "Turno registrado");
      onGuardado();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error al guardar";
      setError(msg);
      toast.error("No se pudo registrar el turno");
    } finally { setGuardando(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-sm sm:p-4" onClick={onClose}>
      <div className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl bg-white shadow-xl ring-1 ring-black/5 animate-in slide-in-from-bottom duration-250 sm:slide-in-from-bottom-0 dark:bg-slate-900 dark:ring-white/10" onClick={e => e.stopPropagation()}>
        {/* Handle bar mobile */}
        <div className="flex justify-center pt-3 pb-0 sm:hidden"><div className="h-1 w-10 rounded-full bg-neutral-200 dark:bg-slate-700"/></div>
        <div className="p-6">

        {/* Header */}
        <div className="mb-5 flex items-start justify-between">
          <div>
            <p className="text-xs text-neutral-400 dark:text-slate-500">{formatFecha(fecha)}</p>
            <h3 className="text-base font-bold text-neutral-900 dark:text-slate-100">{slot.paciente_nombre}</h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-neutral-300 hover:text-neutral-500 dark:text-slate-600 dark:hover:text-slate-300"><X className="h-4 w-4"/></button>
        </div>

        {/* Tipo sesión */}
        <div className="mb-4">
          <p className="mb-2 text-xs font-semibold text-neutral-500 dark:text-slate-400">Tipo</p>
          <div className="grid grid-cols-2 gap-1.5">
            {([
              ["SESION",                      "Sesión"],
              ["INASISTENCIA_JUSTIFICADA",    "Canceló"],
              ["INASISTENCIA_INJUSTIFICADA",  "Faltó"],
              ["CANCELACION_PROFESIONAL",     "Cancelé yo"],
            ] as [TipoSesion, string][]).map(([val, label]) => (
              <button key={val} onClick={() => { setTipoSesion(val); setError(""); }}
                className={`rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${tipoSesion === val ? "border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-400" : "border-neutral-200 text-neutral-500 hover:bg-neutral-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800/60"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Monto + Estado + Medio — solo si es sesión */}
        {!esInasistencia && (<>
          <div className="mb-3">
            <p className="mb-1.5 text-xs font-semibold text-neutral-500 dark:text-slate-400">Monto</p>
            <div className="flex gap-1.5">
              <div className="flex flex-1 items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800">
                <span className="text-sm text-neutral-400 dark:text-slate-500">{moneda === "USD" ? "US$" : "$"}</span>
                <input type="number" min={0} value={monto} onChange={e => setMonto(e.target.value)}
                  placeholder="0" className="flex-1 bg-transparent text-sm font-medium text-neutral-800 outline-none dark:text-slate-100"/>
              </div>
              <div className="flex overflow-hidden rounded-xl border border-neutral-200 dark:border-slate-700">
                {(["ARS", "USD"] as const).map(m => (
                  <button key={m} onClick={() => setMoneda(m)}
                    className={`px-2.5 py-2.5 text-xs font-medium transition-colors ${moneda === m ? "bg-indigo-600 text-white" : "bg-white dark:bg-slate-900 text-neutral-500 dark:text-slate-400 hover:bg-neutral-50 dark:hover:bg-slate-800/60"}`}>
                    {m}
                  </button>
                ))}
              </div>
            </div>
            {moneda === "USD" && (
              <div className="mt-2 flex items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
                <span className="text-[10px] text-neutral-400 dark:text-slate-500 whitespace-nowrap">Tipo de cambio</span>
                <input type="number" min={0} value={tipoCambio ?? ""} onChange={e => setTipoCambio(e.target.value ? Number(e.target.value) : null)}
                  placeholder="Ej: 1350" className="flex-1 bg-transparent text-sm font-medium text-neutral-800 outline-none dark:text-slate-100"/>
              </div>
            )}
          </div>
          <div className="mb-3">
            <p className="mb-1.5 text-xs font-semibold text-neutral-500 dark:text-slate-400">Estado</p>
            <div className="flex gap-2">
              {(["COBRADO","DIFERIDO"] as EstadoTurno[]).map(e => (
                <button key={e} onClick={() => setEstado(e)}
                  className={`flex-1 rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${estado === e ? (e === "COBRADO" ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-400" : "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-400") : "border-neutral-200 text-neutral-500 hover:bg-neutral-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800/60"}`}>
                  {e === "COBRADO" ? "✓ Cobrado" : "⏳ Diferido"}
                </button>
              ))}
            </div>
          </div>
          {estado === "COBRADO" && (
            <div className="mb-3">
              <p className="mb-1.5 text-xs font-semibold text-neutral-500 dark:text-slate-400">Medio de pago</p>
              <div className="grid grid-cols-2 gap-1.5">
                {(["EFECTIVO","TRANSFERENCIA","MERCADO_PAGO","TARJETA"] as MedioPago[]).map(m => (
                  <button key={m} onClick={() => setMedioPago(medioPago === m ? "" : m)}
                    className={`rounded-xl border px-2 py-1.5 text-xs font-medium transition-colors ${medioPago === m ? "border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-400" : "border-neutral-200 text-neutral-500 hover:bg-neutral-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800/60"}`}>
                    {MEDIO_LABEL[m]}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>)}

        {error && <p className="mb-3 text-xs text-red-500">{error}</p>}

        <button onClick={confirmar} disabled={guardando}
          className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60">
          {guardando ? <><Loader2 className="h-3.5 w-3.5 animate-spin"/>Guardando…</> : "Registrar turno"}
        </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal Editar (turno real) ─────────────────────────────────────────────────

interface ModalEditarProps {
  turno: TurnoAgenda;
  onClose: () => void;
  onGuardado: () => void;
}

function ModalEditar({ turno, onClose, onGuardado }: ModalEditarProps) {
  const [tipoSesion, setTipoSesion] = useState<TipoSesion>(turno.tipo_sesion);
  const [monto, setMonto]           = useState(turno.monto.toString());
  const [moneda, setMoneda]         = useState<Moneda>(turno.moneda ?? "ARS");
  const [tipoCambio, setTipoCambio] = useState<number | null>(turno.tipo_cambio ?? null);
  const [estado, setEstado]         = useState<EstadoTurno>(turno.estado);
  const [medioPago, setMedioPago]   = useState<MedioPago | "">(turno.medio_pago ?? "");
  const [guardando, setGuardando]   = useState(false);
  const [error, setError]           = useState("");
  const toast = useToast();

  const esInasistencia = tipoSesion !== "SESION";

  useEffect(() => {
    if (moneda === "USD" && tipoCambio == null) {
      getDolarBlue().then(d => setTipoCambio(d.valor)).catch(() => {});
    }
  }, [moneda, tipoCambio]);

  async function guardar() {
    setError("");
    const montoNum = Number(monto) || 0;
    if (!esInasistencia && montoNum <= 0) {
      setError(`Ingresá un monto mayor a ${moneda === "USD" ? "US$0" : "$0"} para registrar la sesión.`);
      return;
    }
    if (!esInasistencia && moneda === "USD" && (!tipoCambio || tipoCambio <= 0)) {
      setError("Ingresá un tipo de cambio válido.");
      return;
    }
    setGuardando(true);
    try {
      const hoy = isoDate(new Date());
      const estadoFinal = esInasistencia ? "COBRADO" : estado;
      // Al pasar a COBRADO se setea la fecha de cobro; al volver a DIFERIDO
      // hay que mandar null explícito (undefined significa "no tocar" y el
      // turno seguiría contando como cobrado del mes)
      let fechaCobro: string | null | undefined;
      if (estadoFinal === "COBRADO" && !turno.fecha_cobro_efectivo) fechaCobro = hoy;
      else if (estadoFinal !== "COBRADO" && turno.fecha_cobro_efectivo) fechaCobro = null;
      await actualizarTurno(turno.id, {
        tipo_sesion:          tipoSesion,
        monto:                esInasistencia ? 0 : montoNum,
        moneda:               esInasistencia ? "ARS" : moneda,
        tipo_cambio:          (!esInasistencia && moneda === "USD") ? tipoCambio : null,
        estado:               estadoFinal,
        medio_pago:           medioPago || null,
        ...(fechaCobro !== undefined ? { fecha_cobro_efectivo: fechaCobro } : {}),
      });
      toast.success("Turno actualizado");
      onGuardado();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error al guardar";
      setError(msg);
      toast.error("No se pudo guardar");
    } finally { setGuardando(false); }
  }

  const estadoLabel: Record<string, string> = { COBRADO: "Cobrado", DIFERIDO: "Pendiente", INCOBRABLE: "Incobrable" };
  const estadoBadge =
    turno.estado === "COBRADO"    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400" :
    turno.estado === "DIFERIDO"   ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"     :
                                    "bg-neutral-100 text-neutral-500 dark:bg-slate-800 dark:text-slate-400";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-sm sm:p-4" onClick={onClose}>
      <div className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl bg-white shadow-xl ring-1 ring-black/5 animate-in slide-in-from-bottom duration-250 sm:slide-in-from-bottom-0 dark:bg-slate-900 dark:ring-white/10" onClick={e => e.stopPropagation()}>
        {/* Handle bar mobile */}
        <div className="flex justify-center pt-3 pb-0 sm:hidden"><div className="h-1 w-10 rounded-full bg-neutral-200 dark:bg-slate-700"/></div>
        <div className="p-6">

        {/* Header */}
        <div className="mb-5 flex items-start justify-between">
          <div>
            <p className="text-xs text-neutral-400 dark:text-slate-500">{formatFecha(turno.fecha_turno)}</p>
            <h3 className="text-base font-bold text-neutral-900 dark:text-slate-100">{turno.paciente_nombre}</h3>
            <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${estadoBadge}`}>
              {estadoLabel[turno.estado] ?? turno.estado}
            </span>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-neutral-300 hover:text-neutral-500 dark:text-slate-600 dark:hover:text-slate-300"><X className="h-4 w-4"/></button>
        </div>

        {/* Tipo sesión */}
        <div className="mb-4">
          <p className="mb-2 text-xs font-semibold text-neutral-500 dark:text-slate-400">Tipo</p>
          <div className="grid grid-cols-2 gap-1.5">
            {([
              ["SESION",                      "Sesión"],
              ["INASISTENCIA_JUSTIFICADA",    "Canceló"],
              ["INASISTENCIA_INJUSTIFICADA",  "Faltó"],
              ["CANCELACION_PROFESIONAL",     "Cancelé yo"],
            ] as [TipoSesion, string][]).map(([val, label]) => (
              <button key={val} onClick={() => { setTipoSesion(val); setError(""); }}
                className={`rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${tipoSesion === val ? "border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-400" : "border-neutral-200 text-neutral-500 hover:bg-neutral-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800/60"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Monto + Estado + Medio — solo si es sesión */}
        {!esInasistencia && (<>
          <div className="mb-3">
            <p className="mb-1.5 text-xs font-semibold text-neutral-500 dark:text-slate-400">Monto</p>
            <div className="flex gap-1.5">
              <div className="flex flex-1 items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800">
                <span className="text-sm text-neutral-400 dark:text-slate-500">{moneda === "USD" ? "US$" : "$"}</span>
                <input type="number" min={0} value={monto} onChange={e => setMonto(e.target.value)}
                  className="flex-1 bg-transparent text-sm font-medium text-neutral-800 outline-none dark:text-slate-100"/>
              </div>
              <div className="flex overflow-hidden rounded-xl border border-neutral-200 dark:border-slate-700">
                {(["ARS", "USD"] as const).map(m => (
                  <button key={m} onClick={() => setMoneda(m)}
                    className={`px-2.5 py-2.5 text-xs font-medium transition-colors ${moneda === m ? "bg-indigo-600 text-white" : "bg-white dark:bg-slate-900 text-neutral-500 dark:text-slate-400 hover:bg-neutral-50 dark:hover:bg-slate-800/60"}`}>
                    {m}
                  </button>
                ))}
              </div>
            </div>
            {moneda === "USD" && (
              <div className="mt-2 flex items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
                <span className="text-[10px] text-neutral-400 dark:text-slate-500 whitespace-nowrap">Tipo de cambio</span>
                <input type="number" min={0} value={tipoCambio ?? ""} onChange={e => setTipoCambio(e.target.value ? Number(e.target.value) : null)}
                  placeholder="Ej: 1350" className="flex-1 bg-transparent text-sm font-medium text-neutral-800 outline-none dark:text-slate-100"/>
              </div>
            )}
          </div>
          <div className="mb-3">
            <p className="mb-1.5 text-xs font-semibold text-neutral-500 dark:text-slate-400">Estado</p>
            <div className="flex gap-2">
              {(["COBRADO","DIFERIDO"] as EstadoTurno[]).map(e => (
                <button key={e} onClick={() => setEstado(e)}
                  className={`flex-1 rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${estado === e ? (e === "COBRADO" ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-400" : "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-400") : "border-neutral-200 text-neutral-500 hover:bg-neutral-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800/60"}`}>
                  {e === "COBRADO" ? "✓ Cobrado" : "⏳ Diferido"}
                </button>
              ))}
            </div>
          </div>
          {estado === "COBRADO" && (
            <div className="mb-3">
              <p className="mb-1.5 text-xs font-semibold text-neutral-500 dark:text-slate-400">Medio de pago</p>
              <div className="grid grid-cols-2 gap-1.5">
                {(["EFECTIVO","TRANSFERENCIA","MERCADO_PAGO","TARJETA"] as MedioPago[]).map(m => (
                  <button key={m} onClick={() => setMedioPago(medioPago === m ? "" : m)}
                    className={`rounded-xl border px-2 py-1.5 text-xs font-medium transition-colors ${medioPago === m ? "border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-400" : "border-neutral-200 text-neutral-500 hover:bg-neutral-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800/60"}`}>
                    {MEDIO_LABEL[m]}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>)}

        {error && <p className="mb-3 text-xs text-red-500">{error}</p>}

        <button onClick={guardar} disabled={guardando}
          className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60">
          {guardando ? <><Loader2 className="h-3.5 w-3.5 animate-spin"/>Guardando…</> : "Guardar cambios"}
        </button>
        </div>
      </div>
    </div>
  );
}

// ── Card placeholder (slot modelo sin turno real) ─────────────────────────────

function SlotPlaceholder({ slot, estadoSemana, horaEfectiva, onRegistrar, onEditarSemana }: {
  slot: SlotModelo;
  estadoSemana: "normal" | "movido";
  horaEfectiva: string;
  onRegistrar: () => void;
  onEditarSemana: () => void;
}) {
  const nombre = slot.paciente_nombre;
  const movido = estadoSemana === "movido";
  return (
    <div className={`w-full overflow-hidden rounded-xl border border-dashed text-xs transition-all ${
      movido ? "border-indigo-300 bg-indigo-50/70 dark:border-indigo-500/40 dark:bg-indigo-500/10" : "border-neutral-300 bg-white hover:border-indigo-300 hover:bg-indigo-50/40 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-indigo-500/40 dark:hover:bg-indigo-500/10"}`}>
      <button onClick={onRegistrar} className="block w-full px-2.5 pt-2 pb-1.5 text-left">
        <div className="mb-1 flex items-center gap-1.5">
          <span className={`text-[11px] font-bold tabular-nums ${movido ? "text-indigo-700 dark:text-indigo-400" : "text-neutral-700 dark:text-slate-300"}`}>{horaEfectiva}</span>
          {movido && <span className="rounded-full bg-indigo-100 px-1 py-0.5 text-[8px] font-semibold text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400">movido</span>}
        </div>
        <div className="flex items-center gap-1.5">
          <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[8px] font-bold ${avatarCls(nombre)}`}>{iniciales(nombre)}</div>
          <p className="truncate font-medium text-neutral-700 dark:text-slate-300">{nombre}</p>
        </div>
        <p className="mt-0.5 text-[9px] text-neutral-400 dark:text-slate-500">Tap para registrar</p>
      </button>
      <button onClick={onEditarSemana}
        className={`flex w-full items-center justify-center gap-1 border-t px-2 py-1.5 text-[10px] font-medium transition-colors ${
          movido ? "border-indigo-200 text-indigo-600 hover:bg-indigo-100 dark:border-indigo-500/30 dark:text-indigo-400 dark:hover:bg-indigo-500/15" : "border-neutral-200 text-neutral-500 hover:bg-indigo-50 hover:text-indigo-600 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-400"}`}>
        <CalendarClock className="h-3 w-3"/> Mover / cancelar esta semana
      </button>
    </div>
  );
}

// ── Card de slot cancelado solo por esta semana ───────────────────────────────

function CanceladoCard({ slot, onEditarSemana }: { slot: SlotModelo; onEditarSemana: () => void }) {
  return (
    <div className="w-full overflow-hidden rounded-xl border border-dashed border-neutral-200 bg-neutral-50 text-xs dark:border-slate-800 dark:bg-slate-900/60">
      <div className="px-2.5 pt-2 pb-1.5">
        <div className="mb-1 flex items-center gap-1.5">
          <span className="text-[11px] font-bold tabular-nums text-neutral-400 line-through dark:text-slate-500">{slot.hora}</span>
          <span className="rounded-full bg-neutral-100 px-1 py-0.5 text-[8px] font-semibold text-neutral-500 dark:bg-slate-800 dark:text-slate-400">no viene</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-neutral-500 dark:bg-slate-700 dark:text-slate-400"><Ban className="h-2.5 w-2.5"/></div>
          <p className="truncate font-medium text-neutral-500 line-through dark:text-slate-400">{slot.paciente_nombre}</p>
        </div>
      </div>
      <button onClick={onEditarSemana}
        className="flex w-full items-center justify-center gap-1 border-t border-neutral-200 px-2 py-1.5 text-[10px] font-medium text-neutral-500 hover:bg-indigo-50 hover:text-indigo-600 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-400">
        <RotateCcw className="h-3 w-3"/> Deshacer / cambiar
      </button>
    </div>
  );
}

// ── Modal: mover / cancelar un slot SOLO por esta semana ──────────────────────

function ModalMoverCancelar({ slot, excepcion, semanaLabel, onAplicar, onClose }: {
  slot: SlotModelo;
  excepcion: ExcepcionSemanal | null;
  semanaLabel: string;
  onAplicar: (exc: ExcepcionSemanal | null) => void;
  onClose: () => void;
}) {
  const [dia, setDia]   = useState<number>(excepcion?.dia_nuevo ?? slot.dia);
  const [hora, setHora] = useState<string>(excepcion?.hora_nueva ?? slot.hora);

  function guardarMover() {
    // Si vuelve al día/hora original, es lo mismo que "volver a lo normal"
    if (dia === slot.dia && hora === slot.hora) { onAplicar(null); return; }
    onAplicar({
      paciente_id: slot.paciente_id,
      dia_orig: slot.dia, hora_orig: slot.hora,
      accion: "mover", dia_nuevo: dia, hora_nueva: hora,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-sm sm:p-4" onClick={onClose}>
      <div className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl bg-white shadow-xl ring-1 ring-black/5 animate-in slide-in-from-bottom duration-250 sm:slide-in-from-bottom-0 dark:bg-slate-900 dark:ring-white/10" onClick={e => e.stopPropagation()}>
        <div className="flex justify-center pt-3 pb-0 sm:hidden"><div className="h-1 w-10 rounded-full bg-neutral-200 dark:bg-slate-700"/></div>
        <div className="p-6">
          <div className="mb-4 flex items-start justify-between">
            <div>
              <p className="text-xs text-neutral-400 dark:text-slate-500">Solo esta semana · {semanaLabel}</p>
              <h3 className="text-base font-bold text-neutral-900 dark:text-slate-100">{slot.paciente_nombre}</h3>
              <p className="mt-0.5 text-xs text-neutral-400 dark:text-slate-500">
                Normalmente: {DIAS_CORTO[slot.dia - 1]} {slot.hora}
              </p>
            </div>
            <button onClick={onClose} className="rounded-lg p-2 text-neutral-300 hover:text-neutral-500 dark:text-slate-600 dark:hover:text-slate-300"><X className="h-4 w-4"/></button>
          </div>

          <p className="mb-2 text-xs font-semibold text-neutral-500 dark:text-slate-400">Mover a</p>
          <div className="mb-3 grid grid-cols-7 gap-1">
            {DIAS_CORTO.map((d, i) => (
              <button key={d} onClick={() => setDia(i + 1)}
                className={`rounded-lg border py-1.5 text-[11px] font-medium transition-colors ${dia === i + 1 ? "border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-400" : "border-neutral-200 text-neutral-500 hover:bg-neutral-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800/60"}`}>
                {d}
              </button>
            ))}
          </div>
          <div className="mb-4">
            <input type="time" value={hora} onChange={e => setHora(e.target.value)}
              className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm text-neutral-800 focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-indigo-500"/>
          </div>

          <button onClick={guardarMover}
            className="mb-2 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-500">
            Guardar cambio
          </button>

          <div className="my-3 flex items-center gap-2 text-[10px] text-neutral-300 dark:text-slate-600">
            <div className="h-px flex-1 bg-neutral-100 dark:bg-slate-800"/>o<div className="h-px flex-1 bg-neutral-100 dark:bg-slate-800"/>
          </div>

          <button
            onClick={() => onAplicar({ paciente_id: slot.paciente_id, dia_orig: slot.dia, hora_orig: slot.hora, accion: "cancelar" })}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-neutral-200 px-4 py-2.5 text-sm font-medium text-neutral-600 hover:bg-neutral-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800/60">
            <Ban className="h-3.5 w-3.5"/> No viene esta semana
          </button>

          {excepcion && (
            <button onClick={() => onAplicar(null)}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs font-medium text-neutral-400 hover:text-indigo-600 dark:text-slate-500 dark:hover:text-indigo-400">
              <RotateCcw className="h-3.5 w-3.5"/> Volver a lo normal
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Card turno real ───────────────────────────────────────────────────────────

function TurnoCard({ t, hora, onClick }: { t: TurnoAgenda; hora: string | null; onClick: () => void }) {
  const esInasistencia = t.tipo_sesion !== "SESION";
  const tipoBadge = TIPO_LABEL[t.tipo_sesion];
  const monto = t.monto > 0
    ? t.moneda === "USD"
      ? `USD ${t.monto.toLocaleString("es-AR")}`
      : new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",maximumFractionDigits:0}).format(t.monto)
    : null;
  return (
    <button onClick={onClick} className={`w-full rounded-xl border px-2.5 py-2 text-xs text-left hover:ring-2 hover:ring-indigo-200 dark:hover:ring-indigo-500/30 transition-all ${
      esInasistencia ? "border-neutral-200 bg-neutral-50 dark:border-slate-800 dark:bg-slate-900/60"
      : t.estado === "COBRADO" ? "border-emerald-200 bg-emerald-50/70 dark:border-emerald-500/30 dark:bg-emerald-500/10"
      : t.estado === "DIFERIDO" ? "border-amber-200 bg-amber-50/70 dark:border-amber-500/30 dark:bg-amber-500/10"
      : "border-neutral-200 bg-neutral-50 dark:border-slate-800 dark:bg-slate-900/60"}`}>
      <div className="mb-1 flex items-center gap-1.5">
        {hora && <span className="text-[11px] font-bold tabular-nums text-neutral-700 dark:text-slate-300">{hora}</span>}
        {tipoBadge && <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-medium text-red-600 dark:bg-red-500/15 dark:text-red-400">{tipoBadge}</span>}
        {monto && <span className="ml-auto text-[9px] tabular-nums text-neutral-500 dark:text-slate-400">{monto}</span>}
      </div>
      <div className="flex items-center gap-1.5">
        <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[8px] font-bold ${avatarCls(t.paciente_nombre)}`}>{iniciales(t.paciente_nombre)}</div>
        <p className={`truncate font-semibold ${esInasistencia ? "text-neutral-500 line-through dark:text-slate-400" : "text-neutral-800 dark:text-slate-100"}`}>{t.paciente_nombre}</p>
        {!tipoBadge && <span className={`ml-auto h-1.5 w-1.5 shrink-0 rounded-full ${ESTADO_DOT[t.estado]}`}/>}
      </div>
    </button>
  );
}

// ── Estado de error con reintento (mismo patrón que el dashboard) ─────────────

function ErrorCarga({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 ring-1 ring-red-100 dark:bg-red-500/10 dark:ring-red-500/20">
        <WifiOff className="h-6 w-6 text-red-400 dark:text-red-400" />
      </div>
      <div>
        <p className="text-sm font-semibold text-neutral-700 dark:text-slate-300">No se pudo cargar la agenda</p>
        <p className="mt-1 text-xs text-neutral-400 dark:text-slate-500">Revisá tu conexión o intentá de nuevo</p>
      </div>
      <button
        onClick={onRetry}
        className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Reintentar
      </button>
    </div>
  );
}

// ── Vista "Esta semana" ───────────────────────────────────────────────────────

function VistaSemana() {
  const [lunes, setLunes]           = useState<Date>(() => lunesDe(new Date()));
  const [turnos, setTurnos]         = useState<TurnoAgenda[]>([]);
  const [modelo, setModelo]         = useState<SlotModelo[]>([]);
  const [pacientes, setPacientes]   = useState<PacienteConStats[]>([]);
  const [excepciones, setExcepciones] = useState<ExcepcionSemanal[]>([]);
  const [cargando, setCargando]     = useState(false);
  const [error, setError]           = useState(false);
  const [modalReg, setModalReg]     = useState<{ slot: SlotModelo; fecha: string } | null>(null);
  const [modalEdit, setModalEdit]   = useState<TurnoAgenda | null>(null);
  const [modalMover, setModalMover] = useState<SlotModelo | null>(null);
  const hoyIso = isoDate(new Date());
  const toast = useToast();

  const cargar = useCallback(async (ini: Date) => {
    setCargando(true);
    setError(false);
    try {
      const [t, m, p, ex] = await Promise.all([
        getTurnosAgenda(isoDate(ini), isoDate(addDays(ini, 6))),
        getSemanaModelo(),
        getPacientes(),
        getExcepcionesSemana(isoDate(ini)),
      ]);
      setTurnos(t); setModelo(m.slots); setPacientes(p); setExcepciones(ex.excepciones);
    } catch { setError(true); } finally { setCargando(false); }
  }, []);
  useEffect(() => { cargar(lunes); }, [lunes, cargar]);

  function diaModelo(d: Date): number { return d.getDay() === 0 ? 7 : d.getDay(); }

  // Excepción que aplica a un slot de la plantilla (match por coords originales)
  function excepcionDe(s: SlotModelo): ExcepcionSemanal | null {
    return excepciones.find(e =>
      e.paciente_id === s.paciente_id && e.dia_orig === s.dia && e.hora_orig === s.hora) ?? null;
  }

  // Slots de la plantilla con la excepción de esta semana aplicada
  type SlotEfectivo = SlotModelo & {
    diaEfectivo: number; horaEfectiva: string; estadoSemana: "normal" | "movido" | "cancelado";
  };
  const slotsEfectivos: SlotEfectivo[] = modelo.map(s => {
    const exc = excepcionDe(s);
    if (exc?.accion === "cancelar")
      return { ...s, diaEfectivo: s.dia, horaEfectiva: s.hora, estadoSemana: "cancelado" };
    if (exc?.accion === "mover" && exc.dia_nuevo != null && exc.hora_nueva != null)
      return { ...s, diaEfectivo: exc.dia_nuevo, horaEfectiva: exc.hora_nueva, estadoSemana: "movido" };
    return { ...s, diaEfectivo: s.dia, horaEfectiva: s.hora, estadoSemana: "normal" };
  });

  // Hora de un turno ya registrado: el turno no la guarda, la sacamos de la
  // plantilla (slot del mismo paciente que cae ese día, ya con excepción aplicada).
  function horaDeTurno(t: TurnoAgenda, dm: number): string | null {
    const s = slotsEfectivos.find(x =>
      x.paciente_id === t.paciente_id && x.diaEfectivo === dm && x.estadoSemana !== "cancelado");
    return s ? s.horaEfectiva : null;
  }

  const dias = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(lunes, i), iso = isoDate(d);
    const dm = diaModelo(d);
    // Turnos del día, ordenados por su hora de plantilla
    const td = turnos
      .filter(t => t.fecha_turno === iso)
      .sort((a, b) => (horaDeTurno(a, dm) ?? "99").localeCompare(horaDeTurno(b, dm) ?? "99"));
    // Activos (normal/movido) que caen en este día y aún no se registraron
    const placeholders = slotsEfectivos
      .filter(s => s.estadoSemana !== "cancelado" && s.diaEfectivo === dm && !td.some(t => t.paciente_id === s.paciente_id))
      .sort((a, b) => a.horaEfectiva.localeCompare(b.horaEfectiva));
    // Cancelados: se muestran en su día ORIGINAL como recordatorio
    const cancelados = slotsEfectivos.filter(s => s.estadoSemana === "cancelado" && s.dia === dm);
    return { d, iso, dm, label: DIAS_CORTO[i], td, placeholders, cancelados };
  });

  // Aplica (o revierte con exc=null) una excepción para el slot dado
  async function aplicarExcepcion(slot: SlotModelo, exc: ExcepcionSemanal | null) {
    const otras = excepciones.filter(e =>
      !(e.paciente_id === slot.paciente_id && e.dia_orig === slot.dia && e.hora_orig === slot.hora));
    const nuevas = exc ? [...otras, exc] : otras;
    const previas = excepciones;
    setExcepciones(nuevas);
    setModalMover(null);
    try {
      await guardarExcepcionesSemana(isoDate(lunes), nuevas);
      toast.success(
        exc?.accion === "cancelar" ? "Listo, no viene esta semana"
        : exc ? "Movido solo esta semana"
        : "Volvió a lo normal"
      );
    } catch {
      setExcepciones(previas);
      toast.error("No se pudo guardar el cambio");
    }
  }

  const totalSes = turnos.filter(t => t.estado !== "INCOBRABLE").length;
  const cobrado  = turnos.filter(t => t.estado === "COBRADO").reduce((a, t) => a + (t.moneda === "USD" && t.tipo_cambio ? t.monto * t.tipo_cambio : t.monto), 0);

  function honorarioDeSlot(slot: SlotModelo): number | null {
    return pacientes.find(p => p.id === slot.paciente_id)?.honorario_actual ?? null;
  }

  function monedaDeSlot(slot: SlotModelo): Moneda {
    return pacientes.find(p => p.id === slot.paciente_id)?.moneda === "USD" ? "USD" : "ARS";
  }

  return (<>
    {/* Controles */}
    <div className="mb-4 flex flex-wrap items-center gap-2 justify-between">
      <div>
        <p className="text-sm font-semibold text-neutral-700 dark:text-slate-300">{fmtRangoSemana(lunes)}</p>
        {!cargando && totalSes > 0 && (
          <p className="text-xs text-neutral-400 dark:text-slate-500">{totalSes} sesión{totalSes !== 1 ? "es" : ""}
            {cobrado > 0 && <span className="ml-2 text-emerald-600 dark:text-emerald-400 font-medium">
              {new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",maximumFractionDigits:0}).format(cobrado)}
            </span>}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button onClick={() => setLunes(lunesDe(new Date()))} className="rounded-xl border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60">Hoy</button>
        <div className="flex overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <button onClick={() => setLunes(p => addDays(p, -7))} className="flex h-8 w-8 items-center justify-center text-neutral-400 hover:bg-neutral-50 dark:text-slate-500 dark:hover:bg-slate-800/60"><ChevronLeft className="h-4 w-4"/></button>
          <div className="w-px bg-neutral-100 dark:bg-slate-800"/>
          <button onClick={() => setLunes(p => addDays(p, 7))}  className="flex h-8 w-8 items-center justify-center text-neutral-400 hover:bg-neutral-50 dark:text-slate-500 dark:hover:bg-slate-800/60"><ChevronRight className="h-4 w-4"/></button>
        </div>
      </div>
    </div>

    {cargando
      ? <div className="flex items-center justify-center gap-2 py-16 text-sm text-neutral-400 dark:text-slate-500"><Loader2 className="h-4 w-4 animate-spin"/>Cargando…</div>
      : error
      ? <ErrorCarga onRetry={() => cargar(lunes)} />
      : <>
          {/* Desktop */}
          <div className="hidden md:grid grid-cols-7 gap-2">
            {dias.map(({ d, iso, dm, label, td, placeholders, cancelados }) => {
              const esHoy = iso === hoyIso, esFin = d.getDay() === 0 || d.getDay() === 6;
              const total = td.length + placeholders.length + cancelados.length;
              return (
                <div key={iso} className={`min-h-[200px] rounded-2xl p-2.5 ${esHoy ? "bg-indigo-50 ring-2 ring-indigo-300/60 dark:bg-indigo-500/10 dark:ring-indigo-500/40" : esFin ? "bg-white/60 ring-1 ring-black/5 dark:bg-slate-900/40 dark:ring-white/10" : "bg-white ring-1 ring-black/5 dark:bg-slate-900 dark:ring-white/10"}`}>
                  <div className="mb-2 flex items-center gap-1">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-neutral-400 dark:text-slate-500">{label}</span>
                    <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${esHoy ? "bg-indigo-600 text-white" : "text-neutral-500 dark:text-slate-400"}`}>{d.getDate()}</span>
                    {total > 0 && <span className="ml-auto rounded-full bg-neutral-100 px-1.5 py-0.5 text-[9px] font-semibold text-neutral-500 dark:bg-slate-800 dark:text-slate-400">{total}</span>}
                  </div>
                  <div className="space-y-1.5">
                    {total === 0 && <p className="pt-4 text-center text-[10px] text-neutral-300 dark:text-slate-600">—</p>}
                    {td.map(t => <TurnoCard key={t.id} t={t} hora={horaDeTurno(t, dm)} onClick={() => setModalEdit(t)}/>)}
                    {placeholders.map(s => <SlotPlaceholder key={`${s.dia}-${s.hora}-${s.paciente_id}`} slot={s} estadoSemana={s.estadoSemana === "movido" ? "movido" : "normal"} horaEfectiva={s.horaEfectiva} onRegistrar={() => setModalReg({ slot: s, fecha: iso })} onEditarSemana={() => setModalMover(s)}/>)}
                    {cancelados.map(s => <CanceladoCard key={`c-${s.dia}-${s.hora}-${s.paciente_id}`} slot={s} onEditarSemana={() => setModalMover(s)}/>)}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Mobile */}
          <div className="md:hidden space-y-2">
            {dias.map(({ d, iso, dm, label, td, placeholders, cancelados }) => {
              const esHoy = iso === hoyIso, esFin = d.getDay() === 0 || d.getDay() === 6;
              const total = td.length + placeholders.length + cancelados.length;
              return (
                <div key={iso} className={`overflow-hidden rounded-2xl ${esHoy ? "ring-2 ring-indigo-300/60 dark:ring-indigo-500/40" : "ring-1 ring-black/5 dark:ring-white/10"}`}>
                  <div className={`flex items-center gap-2 px-4 py-2.5 ${esHoy ? "bg-indigo-600" : esFin ? "bg-neutral-100 dark:bg-slate-800" : "bg-white dark:bg-slate-900"}`}>
                    <span className={`text-[11px] font-bold uppercase tracking-wider ${esHoy ? "text-white/70" : "text-neutral-400 dark:text-slate-500"}`}>{label}</span>
                    <span className={`text-sm font-bold ${esHoy ? "text-white" : "text-neutral-700 dark:text-slate-300"}`}>{d.getDate()} {MESES_ES[d.getMonth()]}</span>
                    {total > 0 && <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold ${esHoy ? "bg-white/20 text-white" : "bg-neutral-200 text-neutral-600 dark:bg-slate-700 dark:text-slate-300"}`}>{total}</span>}
                  </div>
                  <div className={`px-3 py-2 space-y-1.5 ${esHoy ? "bg-indigo-50/40 dark:bg-indigo-500/10" : "bg-white dark:bg-slate-900"}`}>
                    {total === 0 && <p className="py-2 text-center text-xs text-neutral-300 dark:text-slate-600">Sin turnos</p>}
                    {td.map(t => <TurnoCard key={t.id} t={t} hora={horaDeTurno(t, dm)} onClick={() => setModalEdit(t)}/>)}
                    {placeholders.map(s => <SlotPlaceholder key={`${s.dia}-${s.hora}-${s.paciente_id}`} slot={s} estadoSemana={s.estadoSemana === "movido" ? "movido" : "normal"} horaEfectiva={s.horaEfectiva} onRegistrar={() => setModalReg({ slot: s, fecha: iso })} onEditarSemana={() => setModalMover(s)}/>)}
                    {cancelados.map(s => <CanceladoCard key={`c-${s.dia}-${s.hora}-${s.paciente_id}`} slot={s} onEditarSemana={() => setModalMover(s)}/>)}
                  </div>
                </div>
              );
            })}
          </div>

          {turnos.length === 0 && modelo.length === 0 && (
            <div className="mt-8 flex flex-col items-center gap-2 py-12 text-center">
              <CalendarDays className="h-10 w-10 text-neutral-200 dark:text-slate-700"/>
              <p className="text-sm font-medium text-neutral-400 dark:text-slate-500">Sin turnos esta semana</p>
              <p className="text-xs text-neutral-300 dark:text-slate-600">Registrá sesiones desde el Copiloto o configurá la semana modelo</p>
            </div>
          )}
        </>
    }

    {/* Modal registrar */}
    {modalReg && (
      <ModalRegistrar
        slot={modalReg.slot}
        fecha={modalReg.fecha}
        honorario={honorarioDeSlot(modalReg.slot)}
        monedaDefault={monedaDeSlot(modalReg.slot)}
        onClose={() => setModalReg(null)}
        onGuardado={() => { setModalReg(null); cargar(lunes); }}
      />
    )}

    {/* Modal editar */}
    {modalEdit && (
      <ModalEditar
        turno={modalEdit}
        onClose={() => setModalEdit(null)}
        onGuardado={() => { setModalEdit(null); cargar(lunes); }}
      />
    )}

    {/* Modal mover / cancelar (solo esta semana) */}
    {modalMover && (
      <ModalMoverCancelar
        slot={modalMover}
        excepcion={excepcionDe(modalMover)}
        semanaLabel={fmtRangoSemana(lunes)}
        onAplicar={(exc) => aplicarExcepcion(modalMover, exc)}
        onClose={() => setModalMover(null)}
      />
    )}
  </>);
}

// ── Vista "Semana modelo" ─────────────────────────────────────────────────────

function VistaModelo() {
  const [slots,      setSlots]      = useState<SlotModelo[]>([]);
  const [pacientes,  setPacientes]  = useState<PacienteConStats[]>([]);
  const [cargando,   setCargando]   = useState(true);
  const [error,      setError]      = useState(false);
  const [guardando,  setGuardando]  = useState(false);
  const [guardado,   setGuardado]   = useState(false);
  const [dragPac,    setDragPac]    = useState<PacienteConStats | null>(null);
  const [dragSlot,   setDragSlot]   = useState<{dia:number;hora:string}|null>(null);
  // Alternativa touch al drag & drop (HTML5 drag no funciona en celulares):
  // tocás un paciente (o un slot ya asignado) y después tocás la celda destino
  const [selPac,     setSelPac]     = useState<PacienteConStats | null>(null);
  const [selSlot,    setSelSlot]    = useState<{dia:number;hora:string}|null>(null);
  const [nuevaHora,  setNuevaHora]  = useState("09:00");
  const [mostrarAdd, setMostrarAdd] = useState(false);
  const [horasExtra, setHorasExtra] = useState<string[]>([]);
  const saveTimer = useRef<ReturnType<typeof setTimeout>|null>(null);
  const toast = useToast();

  const cargar = useCallback(() => {
    setCargando(true);
    setError(false);
    Promise.all([getSemanaModelo(), getPacientes()])
      .then(([m, p]) => { setSlots(m.slots); setPacientes(p); })
      .catch(() => setError(true))
      .finally(() => setCargando(false));
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  // Cleanup del timer de autoguardado al desmontar
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  const autoGuardar = useCallback((s: SlotModelo[]) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setGuardando(true);
      try { await guardarSemanaModelo(s); setGuardado(true); setTimeout(() => setGuardado(false), 2000); }
      catch { toast.error("No se pudo guardar la semana modelo. Reintentá el último cambio."); }
      finally { setGuardando(false); }
    }, 800);
  }, [toast]);

  const mutarSlots = useCallback((fn: (prev: SlotModelo[]) => SlotModelo[]) => {
    setSlots(prev => { const n = fn(prev); autoGuardar(n); return n; });
  }, [autoGuardar]);

  function asignarPac(dia: number, hora: string, pac: PacienteConStats) {
    mutarSlots(prev => {
      const sin = prev.filter(s => !(s.dia === dia && s.hora === hora));
      return [...sin, { dia, hora, paciente_id: pac.id, paciente_nombre: `${pac.nombre} ${pac.apellido}`.trim() }]
        .sort((a, b) => a.dia !== b.dia ? a.dia - b.dia : a.hora.localeCompare(b.hora));
    });
  }
  function moverSlot(dO: number, hO: string, dD: number, hD: string) {
    mutarSlots(prev => {
      const orig = prev.find(s => s.dia === dO && s.hora === hO); if (!orig) return prev;
      const sin = prev.filter(s => !(s.dia === dO && s.hora === hO) && !(s.dia === dD && s.hora === hD));
      return [...sin, { ...orig, dia: dD, hora: hD }].sort((a, b) => a.dia !== b.dia ? a.dia - b.dia : a.hora.localeCompare(b.hora));
    });
  }
  function quitarSlot(dia: number, hora: string) {
    mutarSlots(prev => prev.filter(s => !(s.dia === dia && s.hora === hora)));
  }
  function agregarHora() {
    setHorasExtra(prev => prev.includes(nuevaHora) ? prev : [...prev, nuevaHora].sort());
    setMostrarAdd(false);
  }

  const horasEnUso = Array.from(new Set([...slots.map(s => s.hora), ...horasExtra])).sort();
  const slotMap = new Map(slots.map(s => [`${s.dia}-${s.hora}`, s]));

  if (cargando) return <div className="flex items-center justify-center gap-2 py-20 text-sm text-neutral-400 dark:text-slate-500"><Loader2 className="h-4 w-4 animate-spin"/>Cargando…</div>;
  if (error)    return <ErrorCarga onRetry={cargar} />;

  return (
    // En mobile el panel de pacientes pasa arriba como carrusel horizontal:
    // los 160px fijos del panel lateral dejaban la grilla inusable en 375px
    <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">

      {/* Panel pacientes */}
      <div className="w-full lg:w-40 lg:shrink-0">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-slate-500">Pacientes</p>
        <p className="mb-3 text-[10px] text-neutral-400 leading-tight dark:text-slate-500">
          <span className="lg:hidden">Tocá un paciente y después un horario</span>
          <span className="hidden lg:inline">Arrastrá (o tocá y elegí horario)</span>
        </p>
        <div className="flex gap-1.5 overflow-x-auto pb-1.5 lg:block lg:space-y-1 lg:max-h-[560px] lg:overflow-y-auto lg:overflow-x-visible lg:pb-0 lg:pr-0.5">
          {pacientes.map(p => {
            const nombre = `${p.nombre} ${p.apellido}`.trim();
            const seleccionado = selPac?.id === p.id;
            return (
              <div key={p.id} draggable
                onDragStart={() => setDragPac(p)}
                onDragEnd={() => setDragPac(null)}
                onClick={() => { setSelSlot(null); setSelPac(seleccionado ? null : p); }}
                className={`flex shrink-0 cursor-grab items-center gap-1.5 rounded-xl border bg-white px-2 py-2 lg:py-1.5 shadow-sm transition-all select-none active:cursor-grabbing active:shadow-md dark:bg-slate-900 ${
                  seleccionado
                    ? "border-indigo-400 ring-2 ring-indigo-200 dark:border-indigo-500 dark:ring-indigo-500/30"
                    : "border-neutral-100 active:ring-2 active:ring-indigo-300 dark:border-slate-800 dark:active:ring-indigo-500/40"
                } ${dragPac?.id === p.id ? "opacity-40" : ""}`}>
                <GripVertical className="hidden lg:block h-3 w-3 shrink-0 text-neutral-300 dark:text-slate-600"/>
                <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[7px] font-bold ${avatarCls(nombre)}`}>{iniciales(nombre)}</div>
                <p className="truncate text-[11px] font-medium text-neutral-700 dark:text-slate-300">{p.nombre}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Grilla */}
      <div className="flex-1 overflow-x-auto">
        <div className="min-w-[500px]">

          {/* Header días */}
          <div className="mb-1 grid grid-cols-7 gap-1 ml-16">
            {DIAS_CORTO.map((d, i) => (
              <div key={i} className="py-1 text-center text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-slate-500">{d}</div>
            ))}
          </div>

          {horasEnUso.length === 0 && (
            <div className="rounded-2xl border-2 border-dashed border-neutral-200 py-16 text-center dark:border-slate-800">
              <p className="text-sm text-neutral-400 dark:text-slate-500">Agregá un horario para empezar</p>
              <p className="text-xs text-neutral-300 mt-1 dark:text-slate-600">Luego arrastrá pacientes a cada celda</p>
            </div>
          )}

          <div className="space-y-1">
            {horasEnUso.map(hora => (
              <div key={hora} className="flex items-stretch gap-1">
                <div className="flex w-16 shrink-0 items-center justify-end pr-2">
                  <div className="flex items-center gap-0.5">
                    <span className="text-[10px] text-neutral-400 dark:text-slate-500">{hora}</span>
                    <button
                      onClick={() => {
                        setHorasExtra(prev => prev.filter(h => h !== hora));
                        mutarSlots(prev => prev.filter(s => s.hora !== hora));
                      }}
                      className="ml-0.5 rounded -m-1 p-2 lg:m-0 lg:p-0.5 text-neutral-200 hover:text-red-400 dark:text-slate-700 dark:hover:text-red-400" title="Eliminar esta hora">
                      <Trash2 className="h-3.5 w-3.5 lg:h-2.5 lg:w-2.5"/>
                    </button>
                  </div>
                </div>
                <div className="grid flex-1 grid-cols-7 gap-1">
                  {Array.from({ length: 7 }, (_, i) => {
                    const dia = i + 1;
                    const slot = slotMap.get(`${dia}-${hora}`);
                    const esDrop = dragPac || (dragSlot && !(dragSlot.dia === dia && dragSlot.hora === hora));
                    const esDestinoTap = (selPac || selSlot) && !(selSlot?.dia === dia && selSlot?.hora === hora);
                    const slotSeleccionado = selSlot?.dia === dia && selSlot?.hora === hora;
                    return (
                      <div key={dia}
                        className={`relative min-h-[52px] rounded-xl border-2 transition-all duration-100 ${
                          slotSeleccionado ? "border-indigo-400 bg-indigo-100 ring-2 ring-indigo-200 dark:border-indigo-500 dark:bg-indigo-500/15 dark:ring-indigo-500/30"
                          : slot ? "border-indigo-200 bg-indigo-50 dark:border-indigo-500/30 dark:bg-indigo-500/10"
                          : esDrop || esDestinoTap ? "border-dashed border-indigo-300 bg-indigo-50/40 dark:border-indigo-500/40 dark:bg-indigo-500/10"
                          : "border-dashed border-neutral-200 bg-neutral-50/50 dark:border-slate-800 dark:bg-slate-900/40"}`}
                        onDragOver={e => e.preventDefault()}
                        onDrop={() => {
                          if (dragPac) { asignarPac(dia, hora, dragPac); setDragPac(null); }
                          else if (dragSlot) { moverSlot(dragSlot.dia, dragSlot.hora, dia, hora); setDragSlot(null); }
                        }}
                        onClick={() => {
                          // Modo tap (touch): asignar el paciente o mover el slot seleccionado
                          if (selPac) { asignarPac(dia, hora, selPac); setSelPac(null); }
                          else if (selSlot && !slotSeleccionado) { moverSlot(selSlot.dia, selSlot.hora, dia, hora); setSelSlot(null); }
                        }}>
                        {slot ? (
                          <div className="h-full cursor-grab p-1.5 select-none" draggable
                            onDragStart={() => setDragSlot({ dia, hora })}
                            onDragEnd={() => setDragSlot(null)}
                            onClick={e => {
                              if (selPac || selSlot) return; // deja que la celda resuelva la asignación
                              e.stopPropagation();
                              setSelSlot({ dia, hora }); // primer tap: seleccionar para mover
                            }}>
                            <div className="flex items-start justify-between gap-0.5">
                              <div className="flex items-center gap-1 min-w-0">
                                <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[7px] font-bold ${avatarCls(slot.paciente_nombre)}`}>{iniciales(slot.paciente_nombre)}</div>
                                <p className="truncate text-[10px] font-semibold text-neutral-800 leading-tight dark:text-slate-100">{slot.paciente_nombre.split(" ")[0]}</p>
                              </div>
                              <button
                                onClick={e => { e.stopPropagation(); quitarSlot(dia, hora); }}
                                className="shrink-0 rounded -m-1 p-2 lg:m-0 lg:p-0.5 text-neutral-300 hover:bg-red-50 hover:text-red-400 dark:text-slate-600 dark:hover:bg-red-500/10 dark:hover:text-red-400">
                                <X className="h-3 w-3 lg:h-2.5 lg:w-2.5"/>
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex h-full min-h-[52px] items-center justify-center">
                            <Plus className="h-3 w-3 text-neutral-200 dark:text-slate-700"/>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Agregar horario */}
          <div className="mt-3 ml-16">
            {mostrarAdd ? (
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  value={nuevaHora}
                  onChange={e => setNuevaHora(e.target.value)}
                  className="rounded-xl border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-700 focus:border-indigo-400 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:focus:border-indigo-500"
                />
                <button onClick={agregarHora}
                  className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500">
                  <Check className="h-3 w-3"/> Agregar
                </button>
                <button onClick={() => setMostrarAdd(false)}
                  className="rounded-xl border border-neutral-200 px-3 py-1.5 text-xs text-neutral-500 hover:bg-neutral-50 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800/60">
                  Cancelar
                </button>
              </div>
            ) : (
              <button onClick={() => setMostrarAdd(true)}
                className="flex items-center gap-1.5 rounded-xl border border-dashed border-neutral-300 px-4 py-2 text-xs font-medium text-neutral-400 hover:border-indigo-400 hover:text-indigo-500 transition-colors dark:border-slate-700 dark:text-slate-500 dark:hover:border-indigo-500 dark:hover:text-indigo-400">
                <Plus className="h-3.5 w-3.5"/> Agregar horario
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Barra de selección touch: qué está seleccionado y cómo cancelar */}
      {(selPac || selSlot) && (
        <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full bg-slate-900 px-4 py-2 text-xs text-white shadow-xl">
          <span>
            {selPac
              ? <>Asignando a <strong>{selPac.nombre}</strong> — tocá un horario</>
              : <>Moviendo turno — tocá el horario destino</>}
          </span>
          <button
            onClick={() => { setSelPac(null); setSelSlot(null); }}
            className="rounded-full bg-white/15 px-2.5 py-1 font-medium hover:bg-white/25">
            Cancelar
          </button>
        </div>
      )}

      {/* Toast guardado */}
      {(guardando || guardado) && (
        <div className="fixed bottom-6 right-6">
          {guardando
            ? <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 shadow-lg ring-1 ring-black/5 text-xs text-neutral-500 dark:bg-slate-900 dark:ring-white/10 dark:text-slate-400"><Loader2 className="h-3 w-3 animate-spin text-indigo-500"/>Guardando…</div>
            : <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 shadow-lg ring-1 ring-emerald-100 text-xs text-emerald-600 dark:bg-emerald-500/10 dark:ring-emerald-500/20 dark:text-emerald-400"><Check className="h-3 w-3"/>Guardado</div>
          }
        </div>
      )}
    </div>
  );
}

// ── Página ────────────────────────────────────────────────────────────────────

export default function AgendaPage() {
  const [tab, setTab] = useState<"semana"|"modelo">("semana");
  return (
    <div className="min-h-screen bg-neutral-50/50 p-4 lg:p-8 dark:bg-slate-950">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <h1 className="bg-gradient-to-r from-neutral-900 via-indigo-800 to-neutral-900 bg-clip-text text-xl font-extrabold tracking-tight text-transparent dark:from-slate-100 dark:via-indigo-300 dark:to-slate-100">Agenda</h1>
        <div className="flex overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <button onClick={() => setTab("semana")} className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${tab === "semana" ? "bg-indigo-600 text-white" : "text-neutral-500 hover:bg-neutral-50 dark:text-slate-400 dark:hover:bg-slate-800/60"}`}>
            <CalendarDays className="h-3.5 w-3.5"/>Esta semana
          </button>
          <div className="w-px bg-neutral-100 dark:bg-slate-800"/>
          <button onClick={() => setTab("modelo")} className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${tab === "modelo" ? "bg-indigo-600 text-white" : "text-neutral-500 hover:bg-neutral-50 dark:text-slate-400 dark:hover:bg-slate-800/60"}`}>
            <LayoutGrid className="h-3.5 w-3.5"/>Semana modelo
          </button>
        </div>
      </div>
      {tab === "semana" ? <VistaSemana/> : <VistaModelo/>}
    </div>
  );
}
