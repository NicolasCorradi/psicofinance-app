"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  ChevronLeft, ChevronRight, CalendarDays, Loader2,
  LayoutGrid, Plus, X, GripVertical, Check, Trash2,
} from "lucide-react";
import {
  getTurnosAgenda, getSemanaModelo, guardarSemanaModelo,
  getPacientes, crearTurno, actualizarTurno,
} from "@/lib/api";
import { useToast } from "@/lib/toast";
import type {
  TurnoAgenda, EstadoTurno, TipoSesion, MedioPago,
  SlotModelo, PacienteConStats,
} from "@/lib/types";
import { avatarCls, iniciales } from "@/lib/avatar";

// ── Helpers ───────────────────────────────────────────────────────────────────

function isoDate(d: Date): string { return d.toISOString().slice(0, 10); }
function lunesDe(d: Date): Date {
  const r = new Date(d);
  const diff = r.getDay() === 0 ? -6 : 1 - r.getDay();
  r.setDate(r.getDate() + diff); r.setHours(0, 0, 0, 0); return r;
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}
const DIAS_CORTO = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];
const MESES_ES   = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
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
const MEDIO_LABEL: Record<string, string> = {
  EFECTIVO: "Efectivo", TRANSFERENCIA: "Transferencia", MERCADO_PAGO: "Mercado Pago", TARJETA: "Tarjeta",
};
const HORAS_OPCIONES = Array.from({ length: 15 }, (_, i) => `${String(i + 7).padStart(2,"0")}:00`);

// ── Modal Registrar (placeholder → nuevo turno) ───────────────────────────────

interface ModalRegistrarProps {
  slot: SlotModelo;
  fecha: string;
  honorario: number | null;
  onClose: () => void;
  onGuardado: () => void;
}

function ModalRegistrar({ slot, fecha, honorario, onClose, onGuardado }: ModalRegistrarProps) {
  const [tipoSesion, setTipoSesion] = useState<TipoSesion>("SESION");
  const [monto, setMonto]           = useState(honorario ? honorario.toString() : "");
  const [estado, setEstado]         = useState<EstadoTurno>("DIFERIDO");
  const [medioPago, setMedioPago]   = useState<MedioPago | "">("");
  const [guardando, setGuardando]   = useState(false);
  const [error, setError]           = useState("");
  const toast = useToast();

  const esInasistencia = tipoSesion !== "SESION";

  async function confirmar() {
    setGuardando(true); setError("");
    try {
      const hoy = isoDate(new Date());
      await crearTurno({
        paciente_id:          slot.paciente_id,
        fecha_turno:          fecha,
        monto:                esInasistencia ? 0 : (Number(monto) || 0),
        estado:               esInasistencia ? "COBRADO" : estado,
        tipo_sesion:          tipoSesion,
        origen_pago:          "DIRECTO",
        moneda:               "ARS",
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl ring-1 ring-black/5" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="mb-5 flex items-start justify-between">
          <div>
            <p className="text-xs text-neutral-400">{formatFecha(fecha)}</p>
            <h3 className="text-base font-bold text-neutral-900">{slot.paciente_nombre}</h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-neutral-300 hover:text-neutral-500"><X className="h-4 w-4"/></button>
        </div>

        {/* Tipo sesión */}
        <div className="mb-4">
          <p className="mb-2 text-xs font-semibold text-neutral-500">Tipo</p>
          <div className="grid grid-cols-2 gap-1.5">
            {([
              ["SESION",                      "Sesión"],
              ["INASISTENCIA_JUSTIFICADA",    "Canceló"],
              ["INASISTENCIA_INJUSTIFICADA",  "Faltó"],
              ["CANCELACION_PROFESIONAL",     "Cancelé yo"],
            ] as [TipoSesion, string][]).map(([val, label]) => (
              <button key={val} onClick={() => setTipoSesion(val)}
                className={`rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${tipoSesion === val ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-neutral-200 text-neutral-500 hover:bg-neutral-50"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Monto + Estado + Medio — solo si es sesión */}
        {!esInasistencia && (<>
          <div className="mb-3">
            <p className="mb-1.5 text-xs font-semibold text-neutral-500">Monto</p>
            <div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5">
              <span className="text-sm text-neutral-400">$</span>
              <input type="number" value={monto} onChange={e => setMonto(e.target.value)}
                placeholder="0" className="flex-1 bg-transparent text-sm font-medium text-neutral-800 outline-none"/>
            </div>
          </div>
          <div className="mb-3">
            <p className="mb-1.5 text-xs font-semibold text-neutral-500">Estado</p>
            <div className="flex gap-2">
              {(["COBRADO","DIFERIDO"] as EstadoTurno[]).map(e => (
                <button key={e} onClick={() => setEstado(e)}
                  className={`flex-1 rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${estado === e ? (e === "COBRADO" ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-amber-300 bg-amber-50 text-amber-700") : "border-neutral-200 text-neutral-500 hover:bg-neutral-50"}`}>
                  {e === "COBRADO" ? "✓ Cobrado" : "⏳ Diferido"}
                </button>
              ))}
            </div>
          </div>
          {estado === "COBRADO" && (
            <div className="mb-3">
              <p className="mb-1.5 text-xs font-semibold text-neutral-500">Medio de pago</p>
              <div className="grid grid-cols-2 gap-1.5">
                {(["EFECTIVO","TRANSFERENCIA","MERCADO_PAGO","TARJETA"] as MedioPago[]).map(m => (
                  <button key={m} onClick={() => setMedioPago(medioPago === m ? "" : m)}
                    className={`rounded-xl border px-2 py-1.5 text-xs font-medium transition-colors ${medioPago === m ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-neutral-200 text-neutral-500 hover:bg-neutral-50"}`}>
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
  const [estado, setEstado]         = useState<EstadoTurno>(turno.estado);
  const [medioPago, setMedioPago]   = useState<MedioPago | "">(turno.medio_pago ?? "");
  const [guardando, setGuardando]   = useState(false);
  const [error, setError]           = useState("");
  const toast = useToast();

  const esInasistencia = tipoSesion !== "SESION";

  async function guardar() {
    setGuardando(true); setError("");
    try {
      const hoy = isoDate(new Date());
      await actualizarTurno(turno.id, {
        tipo_sesion:          tipoSesion,
        monto:                esInasistencia ? 0 : (Number(monto) || 0),
        estado:               esInasistencia ? "COBRADO" : estado,
        medio_pago:           medioPago || null,
        fecha_cobro_efectivo: (!esInasistencia && estado === "COBRADO" && !turno.fecha_cobro_efectivo) ? hoy : undefined,
      });
      toast.success("Turno actualizado");
      onGuardado();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error al guardar";
      setError(msg);
      toast.error("No se pudo guardar");
    } finally { setGuardando(false); }
  }

  const estadoBadge =
    turno.estado === "COBRADO"    ? "bg-emerald-100 text-emerald-700" :
    turno.estado === "DIFERIDO"   ? "bg-amber-100 text-amber-700"     :
                                    "bg-neutral-100 text-neutral-500";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl ring-1 ring-black/5" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="mb-5 flex items-start justify-between">
          <div>
            <p className="text-xs text-neutral-400">{formatFecha(turno.fecha_turno)}</p>
            <h3 className="text-base font-bold text-neutral-900">{turno.paciente_nombre}</h3>
            <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${estadoBadge}`}>
              {turno.estado}
            </span>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-neutral-300 hover:text-neutral-500"><X className="h-4 w-4"/></button>
        </div>

        {/* Tipo sesión */}
        <div className="mb-4">
          <p className="mb-2 text-xs font-semibold text-neutral-500">Tipo</p>
          <div className="grid grid-cols-2 gap-1.5">
            {([
              ["SESION",                      "Sesión"],
              ["INASISTENCIA_JUSTIFICADA",    "Canceló"],
              ["INASISTENCIA_INJUSTIFICADA",  "Faltó"],
              ["CANCELACION_PROFESIONAL",     "Cancelé yo"],
            ] as [TipoSesion, string][]).map(([val, label]) => (
              <button key={val} onClick={() => setTipoSesion(val)}
                className={`rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${tipoSesion === val ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-neutral-200 text-neutral-500 hover:bg-neutral-50"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Monto + Estado + Medio — solo si es sesión */}
        {!esInasistencia && (<>
          <div className="mb-3">
            <p className="mb-1.5 text-xs font-semibold text-neutral-500">Monto</p>
            <div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5">
              <span className="text-sm text-neutral-400">$</span>
              <input type="number" value={monto} onChange={e => setMonto(e.target.value)}
                className="flex-1 bg-transparent text-sm font-medium text-neutral-800 outline-none"/>
            </div>
          </div>
          <div className="mb-3">
            <p className="mb-1.5 text-xs font-semibold text-neutral-500">Estado</p>
            <div className="flex gap-2">
              {(["COBRADO","DIFERIDO"] as EstadoTurno[]).map(e => (
                <button key={e} onClick={() => setEstado(e)}
                  className={`flex-1 rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${estado === e ? (e === "COBRADO" ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-amber-300 bg-amber-50 text-amber-700") : "border-neutral-200 text-neutral-500 hover:bg-neutral-50"}`}>
                  {e === "COBRADO" ? "✓ Cobrado" : "⏳ Diferido"}
                </button>
              ))}
            </div>
          </div>
          {estado === "COBRADO" && (
            <div className="mb-3">
              <p className="mb-1.5 text-xs font-semibold text-neutral-500">Medio de pago</p>
              <div className="grid grid-cols-2 gap-1.5">
                {(["EFECTIVO","TRANSFERENCIA","MERCADO_PAGO","TARJETA"] as MedioPago[]).map(m => (
                  <button key={m} onClick={() => setMedioPago(medioPago === m ? "" : m)}
                    className={`rounded-xl border px-2 py-1.5 text-xs font-medium transition-colors ${medioPago === m ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-neutral-200 text-neutral-500 hover:bg-neutral-50"}`}>
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
  );
}

// ── Card placeholder (slot modelo sin turno real) ─────────────────────────────

function SlotPlaceholder({ nombre, onClick }: { nombre: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full rounded-xl border border-dashed border-neutral-200 bg-neutral-50 px-2.5 py-2 text-xs opacity-60 text-left hover:opacity-100 hover:border-indigo-300 hover:bg-indigo-50/40 transition-all group">
      <div className="flex items-center gap-1.5">
        <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[8px] font-bold ${avatarCls(nombre)}`}>{iniciales(nombre)}</div>
        <p className="truncate font-medium text-neutral-400 group-hover:text-indigo-600">{nombre}</p>
      </div>
      <p className="mt-1 text-[9px] text-neutral-300 group-hover:text-indigo-400">Tap para registrar</p>
    </button>
  );
}

// ── Card turno real ───────────────────────────────────────────────────────────

function TurnoCard({ t, onClick }: { t: TurnoAgenda; onClick: () => void }) {
  const esInasistencia = t.tipo_sesion !== "SESION";
  const tipoBadge = TIPO_LABEL[t.tipo_sesion];
  const monto = t.monto > 0
    ? t.moneda === "USD"
      ? `USD ${t.monto.toLocaleString("es-AR")}`
      : new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",maximumFractionDigits:0}).format(t.monto)
    : null;
  return (
    <button onClick={onClick} className={`w-full rounded-xl border px-2.5 py-2 text-xs text-left hover:ring-2 hover:ring-indigo-200 transition-all ${
      esInasistencia ? "border-neutral-100 bg-neutral-50 opacity-65"
      : t.estado === "COBRADO" ? "border-emerald-100 bg-emerald-50/60"
      : t.estado === "DIFERIDO" ? "border-amber-100 bg-amber-50/60"
      : "border-neutral-100 bg-neutral-50"}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[8px] font-bold ${avatarCls(t.paciente_nombre)}`}>{iniciales(t.paciente_nombre)}</div>
        <p className="truncate font-semibold text-neutral-800">{t.paciente_nombre}</p>
      </div>
      <div className="flex items-center gap-1 flex-wrap">
        {tipoBadge ? <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-medium text-red-600">{tipoBadge}</span>
          : <span className={`h-1.5 w-1.5 rounded-full ${ESTADO_DOT[t.estado]}`}/>}
        {monto && <span className="ml-auto text-[9px] tabular-nums text-neutral-400">{monto}</span>}
      </div>
    </button>
  );
}

// ── Vista "Esta semana" ───────────────────────────────────────────────────────

function VistaSemana() {
  const [lunes, setLunes]           = useState<Date>(() => lunesDe(new Date()));
  const [turnos, setTurnos]         = useState<TurnoAgenda[]>([]);
  const [modelo, setModelo]         = useState<SlotModelo[]>([]);
  const [pacientes, setPacientes]   = useState<PacienteConStats[]>([]);
  const [cargando, setCargando]     = useState(false);
  const [modalReg, setModalReg]     = useState<{ slot: SlotModelo; fecha: string } | null>(null);
  const [modalEdit, setModalEdit]   = useState<TurnoAgenda | null>(null);
  const hoyIso = isoDate(new Date());

  const cargar = useCallback(async (ini: Date) => {
    setCargando(true);
    try {
      const [t, m, p] = await Promise.all([
        getTurnosAgenda(isoDate(ini), isoDate(addDays(ini, 6))),
        getSemanaModelo(),
        getPacientes(),
      ]);
      setTurnos(t); setModelo(m.slots); setPacientes(p);
    } catch { /* silencioso */ } finally { setCargando(false); }
  }, []);
  useEffect(() => { cargar(lunes); }, [lunes, cargar]);

  function diaModelo(d: Date): number { return d.getDay() === 0 ? 7 : d.getDay(); }

  const dias = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(lunes, i), iso = isoDate(d);
    const td = turnos.filter(t => t.fecha_turno === iso);
    const dm = diaModelo(d);
    const placeholders = modelo.filter(s => s.dia === dm && !td.some(t => t.paciente_id === s.paciente_id));
    return { d, iso, label: DIAS_CORTO[i], td, placeholders };
  });

  const totalSes = turnos.filter(t => t.estado !== "INCOBRABLE").length;
  const cobrado  = turnos.filter(t => t.estado === "COBRADO").reduce((a, t) => a + (t.moneda === "USD" && t.tipo_cambio ? t.monto * t.tipo_cambio : t.monto), 0);

  function honorarioDeSlot(slot: SlotModelo): number | null {
    return pacientes.find(p => p.id === slot.paciente_id)?.honorario_actual ?? null;
  }

  return (<>
    {/* Controles */}
    <div className="mb-4 flex flex-wrap items-center gap-2 justify-between">
      <div>
        <p className="text-sm font-semibold text-neutral-700">{fmtRangoSemana(lunes)}</p>
        {!cargando && totalSes > 0 && (
          <p className="text-xs text-neutral-400">{totalSes} sesión{totalSes !== 1 ? "es" : ""}
            {cobrado > 0 && <span className="ml-2 text-emerald-600 font-medium">
              {new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",maximumFractionDigits:0}).format(cobrado)}
            </span>}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button onClick={() => setLunes(lunesDe(new Date()))} className="rounded-xl border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50">Hoy</button>
        <div className="flex overflow-hidden rounded-xl border border-neutral-200 bg-white">
          <button onClick={() => setLunes(p => addDays(p, -7))} className="flex h-8 w-8 items-center justify-center text-neutral-400 hover:bg-neutral-50"><ChevronLeft className="h-4 w-4"/></button>
          <div className="w-px bg-neutral-100"/>
          <button onClick={() => setLunes(p => addDays(p, 7))}  className="flex h-8 w-8 items-center justify-center text-neutral-400 hover:bg-neutral-50"><ChevronRight className="h-4 w-4"/></button>
        </div>
      </div>
    </div>

    {cargando
      ? <div className="flex items-center justify-center gap-2 py-16 text-sm text-neutral-400"><Loader2 className="h-4 w-4 animate-spin"/>Cargando…</div>
      : <>
          {/* Desktop */}
          <div className="hidden md:grid grid-cols-7 gap-2">
            {dias.map(({ d, iso, label, td, placeholders }) => {
              const esHoy = iso === hoyIso, esFin = d.getDay() === 0 || d.getDay() === 6;
              const total = td.length + placeholders.length;
              return (
                <div key={iso} className={`min-h-[200px] rounded-2xl p-2.5 ${esHoy ? "bg-indigo-50 ring-2 ring-indigo-300/60" : esFin ? "bg-white/60 ring-1 ring-black/5" : "bg-white ring-1 ring-black/5"}`}>
                  <div className="mb-2 flex items-center gap-1">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-neutral-400">{label}</span>
                    <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${esHoy ? "bg-indigo-600 text-white" : "text-neutral-500"}`}>{d.getDate()}</span>
                    {total > 0 && <span className="ml-auto rounded-full bg-neutral-100 px-1.5 py-0.5 text-[9px] font-semibold text-neutral-500">{total}</span>}
                  </div>
                  <div className="space-y-1.5">
                    {total === 0 && <p className="pt-4 text-center text-[10px] text-neutral-300">—</p>}
                    {td.map(t => <TurnoCard key={t.id} t={t} onClick={() => setModalEdit(t)}/>)}
                    {placeholders.map(s => <SlotPlaceholder key={`${s.dia}-${s.hora}-${s.paciente_id}`} nombre={s.paciente_nombre} onClick={() => setModalReg({ slot: s, fecha: iso })}/>)}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Mobile */}
          <div className="md:hidden space-y-2">
            {dias.map(({ d, iso, label, td, placeholders }) => {
              const esHoy = iso === hoyIso, esFin = d.getDay() === 0 || d.getDay() === 6;
              const total = td.length + placeholders.length;
              return (
                <div key={iso} className={`overflow-hidden rounded-2xl ${esHoy ? "ring-2 ring-indigo-300/60" : "ring-1 ring-black/5"}`}>
                  <div className={`flex items-center gap-2 px-4 py-2.5 ${esHoy ? "bg-indigo-600" : esFin ? "bg-neutral-100" : "bg-white"}`}>
                    <span className={`text-[11px] font-bold uppercase tracking-wider ${esHoy ? "text-white/70" : "text-neutral-400"}`}>{label}</span>
                    <span className={`text-sm font-bold ${esHoy ? "text-white" : "text-neutral-700"}`}>{d.getDate()} {MESES_ES[d.getMonth()]}</span>
                    {total > 0 && <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold ${esHoy ? "bg-white/20 text-white" : "bg-neutral-200 text-neutral-600"}`}>{total}</span>}
                  </div>
                  <div className={`px-3 py-2 space-y-1.5 ${esHoy ? "bg-indigo-50/40" : "bg-white"}`}>
                    {total === 0 && <p className="py-2 text-center text-xs text-neutral-300">Sin turnos</p>}
                    {td.map(t => <TurnoCard key={t.id} t={t} onClick={() => setModalEdit(t)}/>)}
                    {placeholders.map(s => <SlotPlaceholder key={`${s.dia}-${s.hora}-${s.paciente_id}`} nombre={s.paciente_nombre} onClick={() => setModalReg({ slot: s, fecha: iso })}/>)}
                  </div>
                </div>
              );
            })}
          </div>

          {turnos.length === 0 && modelo.length === 0 && (
            <div className="mt-8 flex flex-col items-center gap-2 py-12 text-center">
              <CalendarDays className="h-10 w-10 text-neutral-200"/>
              <p className="text-sm font-medium text-neutral-400">Sin turnos esta semana</p>
              <p className="text-xs text-neutral-300">Registrá sesiones desde el Copiloto o configurá la semana modelo</p>
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
  </>);
}

// ── Vista "Semana modelo" ─────────────────────────────────────────────────────

function VistaModelo() {
  const [slots,      setSlots]      = useState<SlotModelo[]>([]);
  const [pacientes,  setPacientes]  = useState<PacienteConStats[]>([]);
  const [cargando,   setCargando]   = useState(true);
  const [guardando,  setGuardando]  = useState(false);
  const [guardado,   setGuardado]   = useState(false);
  const [dragPac,    setDragPac]    = useState<PacienteConStats | null>(null);
  const [dragSlot,   setDragSlot]   = useState<{dia:number;hora:string}|null>(null);
  const [nuevaHora,  setNuevaHora]  = useState("09:00");
  const [mostrarAdd, setMostrarAdd] = useState(false);
  const [horasExtra, setHorasExtra] = useState<string[]>([]);
  const saveTimer = useRef<ReturnType<typeof setTimeout>|null>(null);

  useEffect(() => {
    Promise.all([getSemanaModelo(), getPacientes()])
      .then(([m, p]) => { setSlots(m.slots); setPacientes(p); })
      .catch(() => {}).finally(() => setCargando(false));
  }, []);

  const autoGuardar = useCallback((s: SlotModelo[]) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setGuardando(true);
      try { await guardarSemanaModelo(s); setGuardado(true); setTimeout(() => setGuardado(false), 2000); }
      catch { /* silencioso */ } finally { setGuardando(false); }
    }, 800);
  }, []);

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

  if (cargando) return <div className="flex items-center justify-center gap-2 py-20 text-sm text-neutral-400"><Loader2 className="h-4 w-4 animate-spin"/>Cargando…</div>;

  return (
    <div className="flex gap-4 lg:gap-6">

      {/* Panel pacientes */}
      <div className="w-40 shrink-0">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">Pacientes</p>
        <p className="mb-3 text-[10px] text-neutral-400 leading-tight">Arrastrá a un horario</p>
        <div className="space-y-1 max-h-[560px] overflow-y-auto pr-0.5">
          {pacientes.map(p => {
            const nombre = `${p.nombre} ${p.apellido}`.trim();
            return (
              <div key={p.id} draggable
                onDragStart={() => setDragPac(p)}
                onDragEnd={() => setDragPac(null)}
                className={`flex cursor-grab items-center gap-1.5 rounded-xl border border-neutral-100 bg-white px-2 py-1.5 shadow-sm transition-all select-none active:cursor-grabbing active:shadow-md active:ring-2 active:ring-indigo-300 ${dragPac?.id === p.id ? "opacity-40" : ""}`}>
                <GripVertical className="h-3 w-3 shrink-0 text-neutral-300"/>
                <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[7px] font-bold ${avatarCls(nombre)}`}>{iniciales(nombre)}</div>
                <p className="truncate text-[11px] font-medium text-neutral-700">{p.nombre}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Grilla */}
      <div className="flex-1 overflow-x-auto">
        <div className="min-w-[500px]">

          {/* Header días */}
          <div className="mb-1 grid grid-cols-7 gap-1 ml-12">
            {DIAS_CORTO.map((d, i) => (
              <div key={i} className="py-1 text-center text-[10px] font-semibold uppercase tracking-wider text-neutral-400">{d}</div>
            ))}
          </div>

          {horasEnUso.length === 0 && (
            <div className="rounded-2xl border-2 border-dashed border-neutral-200 py-16 text-center">
              <p className="text-sm text-neutral-400">Agregá un horario para empezar</p>
              <p className="text-xs text-neutral-300 mt-1">Luego arrastrá pacientes a cada celda</p>
            </div>
          )}

          <div className="space-y-1">
            {horasEnUso.map(hora => (
              <div key={hora} className="flex items-stretch gap-1">
                <div className="flex w-12 shrink-0 items-center justify-end pr-2">
                  <div className="flex items-center gap-0.5">
                    <span className="text-[10px] text-neutral-400">{hora}</span>
                    <button
                      onClick={() => {
                        setHorasExtra(prev => prev.filter(h => h !== hora));
                        mutarSlots(prev => prev.filter(s => s.hora !== hora));
                      }}
                      className="ml-0.5 rounded p-0.5 text-neutral-200 hover:text-red-400" title="Eliminar esta hora">
                      <Trash2 className="h-2.5 w-2.5"/>
                    </button>
                  </div>
                </div>
                <div className="grid flex-1 grid-cols-7 gap-1">
                  {Array.from({ length: 7 }, (_, i) => {
                    const dia = i + 1;
                    const slot = slotMap.get(`${dia}-${hora}`);
                    const esDrop = dragPac || (dragSlot && !(dragSlot.dia === dia && dragSlot.hora === hora));
                    return (
                      <div key={dia}
                        className={`relative min-h-[52px] rounded-xl border-2 transition-all duration-100 ${
                          slot ? "border-indigo-200 bg-indigo-50"
                          : esDrop ? "border-dashed border-indigo-300 bg-indigo-50/40"
                          : "border-dashed border-neutral-200 bg-neutral-50/50"}`}
                        onDragOver={e => e.preventDefault()}
                        onDrop={() => {
                          if (dragPac) { asignarPac(dia, hora, dragPac); setDragPac(null); }
                          else if (dragSlot) { moverSlot(dragSlot.dia, dragSlot.hora, dia, hora); setDragSlot(null); }
                        }}>
                        {slot ? (
                          <div className="h-full cursor-grab p-1.5 select-none" draggable
                            onDragStart={() => setDragSlot({ dia, hora })}
                            onDragEnd={() => setDragSlot(null)}>
                            <div className="flex items-start justify-between gap-0.5">
                              <div className="flex items-center gap-1 min-w-0">
                                <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[7px] font-bold ${avatarCls(slot.paciente_nombre)}`}>{iniciales(slot.paciente_nombre)}</div>
                                <p className="truncate text-[10px] font-semibold text-neutral-800 leading-tight">{slot.paciente_nombre.split(" ")[0]}</p>
                              </div>
                              <button onClick={() => quitarSlot(dia, hora)} className="shrink-0 rounded p-0.5 text-neutral-300 hover:bg-red-50 hover:text-red-400">
                                <X className="h-2.5 w-2.5"/>
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex h-full min-h-[52px] items-center justify-center">
                            <Plus className="h-3 w-3 text-neutral-200"/>
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
          <div className="mt-3 ml-12">
            {mostrarAdd ? (
              <div className="flex items-center gap-2">
                <select value={nuevaHora} onChange={e => setNuevaHora(e.target.value)}
                  className="rounded-xl border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-700 focus:border-indigo-400 focus:outline-none">
                  {HORAS_OPCIONES.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
                <button onClick={agregarHora}
                  className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500">
                  <Check className="h-3 w-3"/> Agregar
                </button>
                <button onClick={() => setMostrarAdd(false)}
                  className="rounded-xl border border-neutral-200 px-3 py-1.5 text-xs text-neutral-500 hover:bg-neutral-50">
                  Cancelar
                </button>
              </div>
            ) : (
              <button onClick={() => setMostrarAdd(true)}
                className="flex items-center gap-1.5 rounded-xl border border-dashed border-neutral-300 px-4 py-2 text-xs font-medium text-neutral-400 hover:border-indigo-400 hover:text-indigo-500 transition-colors">
                <Plus className="h-3.5 w-3.5"/> Agregar horario
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Toast guardado */}
      {(guardando || guardado) && (
        <div className="fixed bottom-6 right-6">
          {guardando
            ? <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 shadow-lg ring-1 ring-black/5 text-xs text-neutral-500"><Loader2 className="h-3 w-3 animate-spin text-indigo-500"/>Guardando…</div>
            : <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 shadow-lg ring-1 ring-emerald-100 text-xs text-emerald-600"><Check className="h-3 w-3"/>Guardado</div>
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
    <div className="min-h-screen bg-neutral-50/50 p-4 lg:p-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-bold tracking-tight text-neutral-900">Agenda</h1>
        <div className="flex overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
          <button onClick={() => setTab("semana")} className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${tab === "semana" ? "bg-indigo-600 text-white" : "text-neutral-500 hover:bg-neutral-50"}`}>
            <CalendarDays className="h-3.5 w-3.5"/>Esta semana
          </button>
          <div className="w-px bg-neutral-100"/>
          <button onClick={() => setTab("modelo")} className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${tab === "modelo" ? "bg-indigo-600 text-white" : "text-neutral-500 hover:bg-neutral-50"}`}>
            <LayoutGrid className="h-3.5 w-3.5"/>Semana modelo
          </button>
        </div>
      </div>
      {tab === "semana" ? <VistaSemana/> : <VistaModelo/>}
    </div>
  );
}
