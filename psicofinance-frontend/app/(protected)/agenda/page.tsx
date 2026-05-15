"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, CalendarDays, Loader2 } from "lucide-react";
import { getTurnosAgenda } from "@/lib/api";
import type { TurnoAgenda, EstadoTurno, TipoSesion } from "@/lib/types";
import { avatarCls, iniciales } from "@/lib/avatar";

// ── Helpers de fecha ──────────────────────────────────────────────────────────

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Lunes de la semana que contiene `d`. */
function lunesDe(d: Date): Date {
  const r = new Date(d);
  const day = r.getDay(); // 0=Dom, 1=Lun…
  const diff = day === 0 ? -6 : 1 - day;
  r.setDate(r.getDate() + diff);
  r.setHours(0, 0, 0, 0);
  return r;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

const DIAS_ES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MESES_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function fmtRangoSemana(lunes: Date): string {
  const dom = addDays(lunes, 6);
  if (lunes.getMonth() === dom.getMonth()) {
    return `${lunes.getDate()} – ${dom.getDate()} de ${MESES_ES[lunes.getMonth()]} ${lunes.getFullYear()}`;
  }
  return `${lunes.getDate()} ${MESES_ES[lunes.getMonth()]} – ${dom.getDate()} ${MESES_ES[dom.getMonth()]} ${lunes.getFullYear()}`;
}

function fmtMonto(t: TurnoAgenda): string {
  if (t.monto === 0) return "";
  if (t.moneda === "USD") return `USD ${t.monto.toLocaleString("es-AR")}`;
  return new Intl.NumberFormat("es-AR", {
    style: "currency", currency: "ARS", maximumFractionDigits: 0,
  }).format(t.monto);
}

// ── Chips de estado ───────────────────────────────────────────────────────────

const ESTADO_CLS: Record<EstadoTurno, string> = {
  COBRADO:    "bg-emerald-100 text-emerald-700",
  DIFERIDO:   "bg-amber-100 text-amber-700",
  INCOBRABLE: "bg-neutral-100 text-neutral-500",
};
const ESTADO_LABEL: Record<EstadoTurno, string> = {
  COBRADO:    "Cobrado",
  DIFERIDO:   "Pendiente",
  INCOBRABLE: "Incobrable",
};

const TIPO_BADGE: Record<string, string> = {
  INASISTENCIA_JUSTIFICADA:   "Canceló",
  INASISTENCIA_INJUSTIFICADA: "Faltó",
  CANCELACION_PROFESIONAL:    "Cancelé",
};

// ── Card de un turno ──────────────────────────────────────────────────────────

function TurnoCard({ turno: t }: { turno: TurnoAgenda }) {
  const esInasistencia = t.tipo_sesion !== "SESION";
  const monto = fmtMonto(t);
  const tipoBadge = TIPO_BADGE[t.tipo_sesion];

  return (
    <div
      className={`group rounded-xl border px-3 py-2.5 transition-all hover:shadow-sm ${
        esInasistencia
          ? "border-neutral-100 bg-neutral-50 opacity-70"
          : t.estado === "COBRADO"
          ? "border-emerald-100 bg-emerald-50/60"
          : t.estado === "DIFERIDO"
          ? "border-amber-100 bg-amber-50/60"
          : "border-neutral-100 bg-neutral-50"
      }`}
    >
      {/* Avatar + nombre */}
      <div className="flex items-center gap-2">
        <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${avatarCls(t.paciente_nombre)}`}>
          {iniciales(t.paciente_nombre)}
        </div>
        <p className="truncate text-xs font-semibold text-neutral-800">{t.paciente_nombre}</p>
      </div>

      {/* Info */}
      <div className="mt-1.5 flex items-center justify-between gap-1 flex-wrap">
        <div className="flex items-center gap-1 flex-wrap">
          {tipoBadge ? (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[9px] font-medium text-red-600">
              {tipoBadge}
            </span>
          ) : (
            <span className={`rounded-full px-2 py-0.5 text-[9px] font-medium ${ESTADO_CLS[t.estado]}`}>
              {ESTADO_LABEL[t.estado]}
            </span>
          )}
          {t.prepaga && (
            <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[9px] text-indigo-600">{t.prepaga}</span>
          )}
        </div>
        {monto && (
          <span className="text-[10px] font-semibold tabular-nums text-neutral-600">{monto}</span>
        )}
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function AgendaPage() {
  const [lunes, setLunes]     = useState<Date>(() => lunesDe(new Date()));
  const [turnos, setTurnos]   = useState<TurnoAgenda[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const hoyIso = isoDate(new Date());

  const cargar = useCallback(async (inicioSemana: Date) => {
    setCargando(true);
    setError(null);
    try {
      const hasta = addDays(inicioSemana, 6);
      const data = await getTurnosAgenda(isoDate(inicioSemana), isoDate(hasta));
      setTurnos(data);
    } catch {
      setError("No se pudo cargar la agenda.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(lunes); }, [lunes, cargar]);

  const semanaAnterior = () => setLunes(prev => addDays(prev, -7));
  const semanaSiguiente = () => setLunes(prev => addDays(prev, 7));
  const irHoy = () => setLunes(lunesDe(new Date()));

  // Construir array de 7 días (Lun→Dom)
  const diasSemana = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(lunes, i);
    const iso = isoDate(d);
    const turnosDia = turnos.filter(t => t.fecha_turno === iso);
    return { fecha: d, iso, label: DIAS_ES[i], turnosDia };
  });

  const totalSemana = turnos.filter(t => t.estado !== "INCOBRABLE").length;
  const cobradoSemana = turnos
    .filter(t => t.estado === "COBRADO")
    .reduce((acc, t) => acc + (t.moneda === "USD" && t.tipo_cambio ? t.monto * t.tipo_cambio : t.monto), 0);

  return (
    <div className="min-h-screen bg-neutral-50/50 p-4 lg:p-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-900">Agenda</h1>
          <p className="text-sm text-neutral-500">{fmtRangoSemana(lunes)}</p>
        </div>

        {/* Controles de navegación */}
        <div className="flex items-center gap-2">
          {/* Resumen semanal */}
          {!cargando && totalSemana > 0 && (
            <div className="hidden sm:flex items-center gap-3 mr-2 text-sm text-neutral-500">
              <span>{totalSemana} sesión{totalSemana !== 1 ? "es" : ""}</span>
              {cobradoSemana > 0 && (
                <span className="text-emerald-600 font-medium">
                  {new Intl.NumberFormat("es-AR", {
                    style: "currency", currency: "ARS", maximumFractionDigits: 0,
                  }).format(cobradoSemana)}
                </span>
              )}
            </div>
          )}
          <button
            onClick={irHoy}
            className="rounded-xl border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-50 hover:text-neutral-900"
          >
            Hoy
          </button>
          <div className="flex rounded-xl border border-neutral-200 bg-white overflow-hidden">
            <button
              onClick={semanaAnterior}
              className="flex h-8 w-8 items-center justify-center text-neutral-400 transition-colors hover:bg-neutral-50 hover:text-neutral-700"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="w-px bg-neutral-100" />
            <button
              onClick={semanaSiguiente}
              className="flex h-8 w-8 items-center justify-center text-neutral-400 transition-colors hover:bg-neutral-50 hover:text-neutral-700"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 ring-1 ring-red-100">
          {error}
        </div>
      )}

      {/* Loading overlay */}
      {cargando && (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-neutral-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando agenda…
        </div>
      )}

      {/* Grilla semanal */}
      {!cargando && (
        <>
          {/* Vista desktop: 7 columnas */}
          <div className="hidden md:grid grid-cols-7 gap-2">
            {diasSemana.map(({ fecha, iso, label, turnosDia }) => {
              const esHoy = iso === hoyIso;
              const esFin = fecha.getDay() === 0 || fecha.getDay() === 6;
              return (
                <div key={iso} className={`min-h-[220px] rounded-2xl p-3 ${
                  esHoy
                    ? "bg-indigo-50 ring-2 ring-indigo-300/60"
                    : esFin
                    ? "bg-white/60 ring-1 ring-black/5"
                    : "bg-white ring-1 ring-black/5"
                }`}>
                  {/* Cabecera del día */}
                  <div className="mb-2.5 flex items-center gap-1.5">
                    <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-400">{label}</span>
                    <span className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${
                      esHoy ? "bg-indigo-600 text-white" : "text-neutral-500"
                    }`}>
                      {fecha.getDate()}
                    </span>
                    {turnosDia.length > 0 && (
                      <span className="ml-auto rounded-full bg-neutral-100 px-1.5 py-0.5 text-[9px] font-semibold text-neutral-500">
                        {turnosDia.length}
                      </span>
                    )}
                  </div>

                  {/* Turnos del día */}
                  <div className="space-y-1.5">
                    {turnosDia.length === 0 && (
                      <p className="text-center text-[10px] text-neutral-300 pt-4">—</p>
                    )}
                    {turnosDia.map(t => (
                      <TurnoCard key={t.id} turno={t} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Vista móvil: lista vertical por día */}
          <div className="md:hidden space-y-3">
            {diasSemana.map(({ fecha, iso, label, turnosDia }) => {
              const esHoy = iso === hoyIso;
              const esFin = fecha.getDay() === 0 || fecha.getDay() === 6;
              return (
                <div key={iso} className={`rounded-2xl ${
                  esHoy ? "ring-2 ring-indigo-300/60" : "ring-1 ring-black/5"
                } overflow-hidden`}>
                  {/* Cabecera */}
                  <div className={`flex items-center gap-2 px-4 py-2.5 ${
                    esHoy ? "bg-indigo-600" : esFin ? "bg-neutral-100" : "bg-white"
                  }`}>
                    <span className={`text-xs font-bold uppercase tracking-wider ${esHoy ? "text-white/70" : "text-neutral-400"}`}>
                      {label}
                    </span>
                    <span className={`text-sm font-bold ${esHoy ? "text-white" : "text-neutral-700"}`}>
                      {fecha.getDate()} de {MESES_ES[fecha.getMonth()]}
                    </span>
                    {turnosDia.length > 0 && (
                      <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        esHoy ? "bg-white/20 text-white" : "bg-neutral-200 text-neutral-600"
                      }`}>
                        {turnosDia.length} sesión{turnosDia.length !== 1 ? "es" : ""}
                      </span>
                    )}
                  </div>
                  {/* Turnos */}
                  <div className={`px-3 py-2 space-y-2 ${esHoy ? "bg-indigo-50/40" : "bg-white"}`}>
                    {turnosDia.length === 0 ? (
                      <p className="py-2 text-center text-xs text-neutral-300">Sin turnos</p>
                    ) : (
                      turnosDia.map(t => <TurnoCard key={t.id} turno={t} />)
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Estado vacío */}
          {turnos.length === 0 && (
            <div className="mt-8 flex flex-col items-center justify-center gap-2 py-12 text-center">
              <CalendarDays className="h-10 w-10 text-neutral-200" />
              <p className="text-sm font-medium text-neutral-400">Sin turnos esta semana</p>
              <p className="text-xs text-neutral-300">Registrá sesiones desde el Copiloto en el Dashboard</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
