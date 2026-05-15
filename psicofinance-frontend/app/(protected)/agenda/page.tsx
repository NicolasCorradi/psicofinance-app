"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  ChevronLeft, ChevronRight, CalendarDays, Loader2,
  LayoutGrid, Plus, X, GripVertical, Check, Trash2,
} from "lucide-react";
import { getTurnosAgenda, getSemanaModelo, guardarSemanaModelo, getPacientes } from "@/lib/api";
import type { TurnoAgenda, EstadoTurno, SlotModelo, PacienteConStats } from "@/lib/types";
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

const ESTADO_DOT: Record<EstadoTurno, string> = {
  COBRADO: "bg-emerald-500", DIFERIDO: "bg-amber-400", INCOBRABLE: "bg-neutral-300",
};
const TIPO_LABEL: Record<string, string> = {
  INASISTENCIA_JUSTIFICADA: "Canceló", INASISTENCIA_INJUSTIFICADA: "Faltó", CANCELACION_PROFESIONAL: "Cancelé",
};
// Horas disponibles para agregar a la semana modelo
const HORAS_OPCIONES = Array.from({ length: 15 }, (_, i) => `${String(i + 7).padStart(2,"0")}:00`);

// ── Card turno real ───────────────────────────────────────────────────────────

function TurnoCard({ t }: { t: TurnoAgenda }) {
  const esInasistencia = t.tipo_sesion !== "SESION";
  const tipoBadge = TIPO_LABEL[t.tipo_sesion];
  const monto = t.monto > 0
    ? t.moneda === "USD"
      ? `USD ${t.monto.toLocaleString("es-AR")}`
      : new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",maximumFractionDigits:0}).format(t.monto)
    : null;
  return (
    <div className={`rounded-xl border px-2.5 py-2 text-xs ${
      esInasistencia ? "border-neutral-100 bg-neutral-50 opacity-65"
      : t.estado==="COBRADO" ? "border-emerald-100 bg-emerald-50/60"
      : t.estado==="DIFERIDO" ? "border-amber-100 bg-amber-50/60"
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
    </div>
  );
}

// ── Vista "Esta semana" ───────────────────────────────────────────────────────

function VistaSemana() {
  const [lunes, setLunes]       = useState<Date>(() => lunesDe(new Date()));
  const [turnos, setTurnos]     = useState<TurnoAgenda[]>([]);
  const [cargando, setCargando] = useState(false);
  const hoyIso = isoDate(new Date());

  const cargar = useCallback(async (ini: Date) => {
    setCargando(true);
    try { setTurnos(await getTurnosAgenda(isoDate(ini), isoDate(addDays(ini, 6)))); }
    catch { /* silencioso */ } finally { setCargando(false); }
  }, []);
  useEffect(() => { cargar(lunes); }, [lunes, cargar]);

  const dias = Array.from({length:7},(_,i)=>{
    const d = addDays(lunes,i), iso = isoDate(d);
    return { d, iso, label: DIAS_CORTO[i], td: turnos.filter(t=>t.fecha_turno===iso) };
  });
  const totalSes = turnos.filter(t=>t.estado!=="INCOBRABLE").length;
  const cobrado  = turnos.filter(t=>t.estado==="COBRADO").reduce((a,t)=>a+(t.moneda==="USD"&&t.tipo_cambio?t.monto*t.tipo_cambio:t.monto),0);

  return (<>
    {/* Controles */}
    <div className="mb-4 flex flex-wrap items-center gap-2 justify-between">
      <div>
        <p className="text-sm font-semibold text-neutral-700">{fmtRangoSemana(lunes)}</p>
        {!cargando && totalSes > 0 && (
          <p className="text-xs text-neutral-400">{totalSes} sesión{totalSes!==1?"es":""}
            {cobrado>0 && <span className="ml-2 text-emerald-600 font-medium">
              {new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",maximumFractionDigits:0}).format(cobrado)}
            </span>}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button onClick={()=>setLunes(lunesDe(new Date()))} className="rounded-xl border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50">Hoy</button>
        <div className="flex overflow-hidden rounded-xl border border-neutral-200 bg-white">
          <button onClick={()=>setLunes(p=>addDays(p,-7))} className="flex h-8 w-8 items-center justify-center text-neutral-400 hover:bg-neutral-50"><ChevronLeft className="h-4 w-4"/></button>
          <div className="w-px bg-neutral-100"/>
          <button onClick={()=>setLunes(p=>addDays(p,7))}  className="flex h-8 w-8 items-center justify-center text-neutral-400 hover:bg-neutral-50"><ChevronRight className="h-4 w-4"/></button>
        </div>
      </div>
    </div>
    {cargando
      ? <div className="flex items-center justify-center gap-2 py-16 text-sm text-neutral-400"><Loader2 className="h-4 w-4 animate-spin"/>Cargando…</div>
      : <>
          {/* Desktop */}
          <div className="hidden md:grid grid-cols-7 gap-2">
            {dias.map(({d,iso,label,td})=>{
              const esHoy=iso===hoyIso, esFin=d.getDay()===0||d.getDay()===6;
              return (
                <div key={iso} className={`min-h-[200px] rounded-2xl p-2.5 ${esHoy?"bg-indigo-50 ring-2 ring-indigo-300/60":esFin?"bg-white/60 ring-1 ring-black/5":"bg-white ring-1 ring-black/5"}`}>
                  <div className="mb-2 flex items-center gap-1">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-neutral-400">{label}</span>
                    <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${esHoy?"bg-indigo-600 text-white":"text-neutral-500"}`}>{d.getDate()}</span>
                    {td.length>0 && <span className="ml-auto rounded-full bg-neutral-100 px-1.5 py-0.5 text-[9px] font-semibold text-neutral-500">{td.length}</span>}
                  </div>
                  <div className="space-y-1.5">
                    {td.length===0&&<p className="pt-4 text-center text-[10px] text-neutral-300">—</p>}
                    {td.map(t=><TurnoCard key={t.id} t={t}/>)}
                  </div>
                </div>
              );
            })}
          </div>
          {/* Mobile */}
          <div className="md:hidden space-y-2">
            {dias.map(({d,iso,label,td})=>{
              const esHoy=iso===hoyIso, esFin=d.getDay()===0||d.getDay()===6;
              return (
                <div key={iso} className={`overflow-hidden rounded-2xl ${esHoy?"ring-2 ring-indigo-300/60":"ring-1 ring-black/5"}`}>
                  <div className={`flex items-center gap-2 px-4 py-2.5 ${esHoy?"bg-indigo-600":esFin?"bg-neutral-100":"bg-white"}`}>
                    <span className={`text-[11px] font-bold uppercase tracking-wider ${esHoy?"text-white/70":"text-neutral-400"}`}>{label}</span>
                    <span className={`text-sm font-bold ${esHoy?"text-white":"text-neutral-700"}`}>{d.getDate()} {MESES_ES[d.getMonth()]}</span>
                    {td.length>0&&<span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold ${esHoy?"bg-white/20 text-white":"bg-neutral-200 text-neutral-600"}`}>{td.length}</span>}
                  </div>
                  <div className={`px-3 py-2 space-y-1.5 ${esHoy?"bg-indigo-50/40":"bg-white"}`}>
                    {td.length===0?<p className="py-2 text-center text-xs text-neutral-300">Sin turnos</p>:td.map(t=><TurnoCard key={t.id} t={t}/>)}
                  </div>
                </div>
              );
            })}
          </div>
          {turnos.length===0&&(
            <div className="mt-8 flex flex-col items-center gap-2 py-12 text-center">
              <CalendarDays className="h-10 w-10 text-neutral-200"/>
              <p className="text-sm font-medium text-neutral-400">Sin turnos esta semana</p>
              <p className="text-xs text-neutral-300">Registrá sesiones desde el Copiloto</p>
            </div>
          )}
        </>
    }
  </>);
}

// ── Vista "Semana modelo" ─────────────────────────────────────────────────────
// Lógica:
//  1. Panel izquierdo: lista de pacientes, cada uno es draggable.
//  2. Grilla: filas = horas, columnas = días Lun-Dom.
//  3. Drag un paciente sobre una celda → lo asigna.
//  4. Drag un slot existente a otra celda → lo mueve.
//  5. Botón "Agregar horario" → agrega una fila nueva con la hora elegida.
//  6. X en una celda → quita el paciente de ese slot.
//  7. Auto-guarda 800ms después del último cambio.

function VistaModelo() {
  const [slots,     setSlots]     = useState<SlotModelo[]>([]);
  const [pacientes, setPacientes] = useState<PacienteConStats[]>([]);
  const [cargando,  setCargando]  = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [guardado,  setGuardado]  = useState(false);
  const [dragPac,   setDragPac]   = useState<PacienteConStats | null>(null);
  const [dragSlot,  setDragSlot]  = useState<{dia:number;hora:string}|null>(null);
  const [nuevaHora, setNuevaHora] = useState("09:00");
  const [mostrarAdd, setMostrarAdd] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout>|null>(null);

  useEffect(() => {
    Promise.all([getSemanaModelo(), getPacientes()])
      .then(([m,p]) => { setSlots(m.slots); setPacientes(p); })
      .catch(()=>{}).finally(()=>setCargando(false));
  }, []);

  const autoGuardar = useCallback((s: SlotModelo[]) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setGuardando(true);
      try { await guardarSemanaModelo(s); setGuardado(true); setTimeout(()=>setGuardado(false),2000); }
      catch {/* silencioso */} finally { setGuardando(false); }
    }, 800);
  }, []);

  const mutarSlots = useCallback((fn: (prev: SlotModelo[]) => SlotModelo[]) => {
    setSlots(prev => { const n = fn(prev); autoGuardar(n); return n; });
  }, [autoGuardar]);

  function asignarPac(dia: number, hora: string, pac: PacienteConStats) {
    mutarSlots(prev => {
      const sin = prev.filter(s=>!(s.dia===dia&&s.hora===hora));
      return [...sin, {dia,hora,paciente_id:pac.id,paciente_nombre:`${pac.nombre} ${pac.apellido}`.trim()}]
        .sort((a,b)=>a.dia!==b.dia?a.dia-b.dia:a.hora.localeCompare(b.hora));
    });
  }
  function moverSlot(dO:number,hO:string,dD:number,hD:string) {
    mutarSlots(prev=>{
      const orig = prev.find(s=>s.dia===dO&&s.hora===hO); if(!orig) return prev;
      const sin = prev.filter(s=>!(s.dia===dO&&s.hora===hO)&&!(s.dia===dD&&s.hora===hD));
      return [...sin,{...orig,dia:dD,hora:hD}].sort((a,b)=>a.dia!==b.dia?a.dia-b.dia:a.hora.localeCompare(b.hora));
    });
  }
  function quitarSlot(dia:number,hora:string) {
    mutarSlots(prev=>prev.filter(s=>!(s.dia===dia&&s.hora===hora)));
  }
  function agregarHora() {
    if (!slots.some(s=>s.hora===nuevaHora)) {
      // Fila vacía: no hay paciente todavía — no agrega slot, solo marca la hora para que aparezca la fila
      // Truco: agregamos un slot temporal con paciente vacío para "reservar" la fila
      // El usuario la llena arrastrando. En realidad NO guardamos un slot vacío,
      // solo ajustamos la lista de horas visibles.
      setHorasExtra(prev=>{
        if(prev.includes(nuevaHora)) return prev;
        return [...prev,nuevaHora].sort();
      });
    }
    setMostrarAdd(false);
  }

  const [horasExtra, setHorasExtra] = useState<string[]>([]);
  const horasEnUso = Array.from(new Set([...slots.map(s=>s.hora),...horasExtra])).sort();

  const slotMap = new Map(slots.map(s=>[`${s.dia}-${s.hora}`,s]));

  if(cargando) return <div className="flex items-center justify-center gap-2 py-20 text-sm text-neutral-400"><Loader2 className="h-4 w-4 animate-spin"/>Cargando…</div>;

  return (
    <div className="flex gap-4 lg:gap-6">

      {/* Panel pacientes */}
      <div className="w-40 shrink-0">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">Pacientes</p>
        <p className="mb-3 text-[10px] text-neutral-400 leading-tight">Arrastrá a un horario</p>
        <div className="space-y-1 max-h-[560px] overflow-y-auto pr-0.5">
          {pacientes.map(p=>{
            const nombre=`${p.nombre} ${p.apellido}`.trim();
            return (
              <div
                key={p.id}
                draggable
                onDragStart={()=>setDragPac(p)}
                onDragEnd={()=>setDragPac(null)}
                className={`flex cursor-grab items-center gap-1.5 rounded-xl border border-neutral-100 bg-white px-2 py-1.5 shadow-sm transition-all select-none active:cursor-grabbing active:shadow-md active:ring-2 active:ring-indigo-300 ${dragPac?.id===p.id?"opacity-40":""}`}
              >
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
            {DIAS_CORTO.map((d,i)=>(
              <div key={i} className="py-1 text-center text-[10px] font-semibold uppercase tracking-wider text-neutral-400">{d}</div>
            ))}
          </div>

          {/* Filas de horas */}
          {horasEnUso.length===0&&(
            <div className="rounded-2xl border-2 border-dashed border-neutral-200 py-16 text-center">
              <p className="text-sm text-neutral-400">Agregá un horario para empezar</p>
              <p className="text-xs text-neutral-300 mt-1">Luego arrastrá pacientes a cada celda</p>
            </div>
          )}

          <div className="space-y-1">
            {horasEnUso.map(hora=>(
              <div key={hora} className="flex items-stretch gap-1">
                {/* Etiqueta hora */}
                <div className="flex w-12 shrink-0 items-center justify-end pr-2">
                  <div className="flex items-center gap-0.5">
                    <span className="text-[10px] text-neutral-400">{hora}</span>
                    <button
                      onClick={()=>{
                        setHorasExtra(prev=>prev.filter(h=>h!==hora));
                        mutarSlots(prev=>prev.filter(s=>s.hora!==hora));
                      }}
                      className="ml-0.5 rounded p-0.5 text-neutral-200 hover:text-red-400"
                      title="Eliminar esta hora"
                    >
                      <Trash2 className="h-2.5 w-2.5"/>
                    </button>
                  </div>
                </div>
                {/* Celdas */}
                <div className="grid flex-1 grid-cols-7 gap-1">
                  {Array.from({length:7},(_,i)=>{
                    const dia=i+1;
                    const slot=slotMap.get(`${dia}-${hora}`);
                    const esDrop = dragPac || (dragSlot && !(dragSlot.dia===dia&&dragSlot.hora===hora));
                    return (
                      <div
                        key={dia}
                        className={`relative min-h-[52px] rounded-xl border-2 transition-all duration-100 ${
                          slot
                            ? "border-indigo-200 bg-indigo-50"
                            : esDrop
                              ? "border-dashed border-indigo-300 bg-indigo-50/40"
                              : "border-dashed border-neutral-200 bg-neutral-50/50"
                        }`}
                        onDragOver={e=>e.preventDefault()}
                        onDrop={()=>{
                          if(dragPac) { asignarPac(dia,hora,dragPac); setDragPac(null); }
                          else if(dragSlot) { moverSlot(dragSlot.dia,dragSlot.hora,dia,hora); setDragSlot(null); }
                        }}
                      >
                        {slot ? (
                          <div
                            className="h-full cursor-grab p-1.5 select-none"
                            draggable
                            onDragStart={()=>setDragSlot({dia,hora})}
                            onDragEnd={()=>setDragSlot(null)}
                          >
                            <div className="flex items-start justify-between gap-0.5">
                              <div className="flex items-center gap-1 min-w-0">
                                <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[7px] font-bold ${avatarCls(slot.paciente_nombre)}`}>{iniciales(slot.paciente_nombre)}</div>
                                <p className="truncate text-[10px] font-semibold text-neutral-800 leading-tight">{slot.paciente_nombre.split(" ")[0]}</p>
                              </div>
                              <button onClick={()=>quitarSlot(dia,hora)} className="shrink-0 rounded p-0.5 text-neutral-300 hover:bg-red-50 hover:text-red-400">
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
                <select value={nuevaHora} onChange={e=>setNuevaHora(e.target.value)}
                  className="rounded-xl border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-700 focus:border-indigo-400 focus:outline-none">
                  {HORAS_OPCIONES.map(h=><option key={h} value={h}>{h}</option>)}
                </select>
                <button onClick={agregarHora}
                  className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500">
                  <Check className="h-3 w-3"/> Agregar
                </button>
                <button onClick={()=>setMostrarAdd(false)}
                  className="rounded-xl border border-neutral-200 px-3 py-1.5 text-xs text-neutral-500 hover:bg-neutral-50">
                  Cancelar
                </button>
              </div>
            ) : (
              <button onClick={()=>setMostrarAdd(true)}
                className="flex items-center gap-1.5 rounded-xl border border-dashed border-neutral-300 px-4 py-2 text-xs font-medium text-neutral-400 hover:border-indigo-400 hover:text-indigo-500 transition-colors">
                <Plus className="h-3.5 w-3.5"/> Agregar horario
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Toast guardado */}
      {(guardando||guardado) && (
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
          <button onClick={()=>setTab("semana")} className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${tab==="semana"?"bg-indigo-600 text-white":"text-neutral-500 hover:bg-neutral-50"}`}>
            <CalendarDays className="h-3.5 w-3.5"/>Esta semana
          </button>
          <div className="w-px bg-neutral-100"/>
          <button onClick={()=>setTab("modelo")} className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${tab==="modelo"?"bg-indigo-600 text-white":"text-neutral-500 hover:bg-neutral-50"}`}>
            <LayoutGrid className="h-3.5 w-3.5"/>Semana modelo
          </button>
        </div>
      </div>
      {tab==="semana" ? <VistaSemana/> : <VistaModelo/>}
    </div>
  );
}
