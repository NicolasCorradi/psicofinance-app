"use client";

import { useState, useEffect } from "react";
import { CalendarDays, Clock, Loader2 } from "lucide-react";
import { getTurnosAgenda, getSemanaModelo } from "@/lib/api";
import type { TurnoAgenda, SlotModelo } from "@/lib/types";
import { avatarCls, iniciales } from "@/lib/avatar";
import Link from "next/link";

// ── Helpers ───────────────────────────────────────────────────────────────────

const MESES_ES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
const DIAS_ES  = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];

function hoyLabel(): string {
  const d = new Date();
  return `${DIAS_ES[d.getDay()]} ${d.getDate()} ${MESES_ES[d.getMonth()]}`;
}

function isoHoy(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function diaModelo(d: Date): number { return d.getDay() === 0 ? 7 : d.getDay(); }

// ── Tipos internos ────────────────────────────────────────────────────────────

interface SesionHoy {
  key:            string;
  hora:           string | null;   // del modelo, o null si solo existe en BD
  paciente_id:    string;
  nombre:         string;
  estado:         "cobrado" | "pendiente" | "sin_registrar";
  turno?:         TurnoAgenda;
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function MiniAgenda() {
  const [sesiones,  setSesiones]  = useState<SesionHoy[]>([]);
  const [cargando,  setCargando]  = useState(true);

  useEffect(() => {
    const hoy   = isoHoy();
    const diaMod = diaModelo(new Date());

    Promise.all([
      getTurnosAgenda(hoy, hoy),
      getSemanaModelo(),
    ]).then(([turnos, { slots }]) => {
      const slotsHoy: SlotModelo[] = slots.filter(s => s.dia === diaMod);

      // Construir lista combinada
      const lista: SesionHoy[] = [];
      const turnosUsados = new Set<string>();

      // 1. Slots del modelo para hoy
      for (const slot of slotsHoy) {
        const turno = turnos.find(t => t.paciente_id === slot.paciente_id);
        if (turno) turnosUsados.add(turno.id);
        lista.push({
          key:         `modelo-${slot.paciente_id}-${slot.hora}`,
          hora:        slot.hora,
          paciente_id: slot.paciente_id,
          nombre:      slot.paciente_nombre,
          estado:      turno
            ? (turno.estado === "COBRADO" ? "cobrado" : "pendiente")
            : "sin_registrar",
          turno,
        });
      }

      // 2. Turnos del día que NO estaban en el modelo (registrados vía copiloto)
      for (const turno of turnos) {
        if (!turnosUsados.has(turno.id)) {
          lista.push({
            key:         `turno-${turno.id}`,
            hora:        null,
            paciente_id: turno.paciente_id,
            nombre:      turno.paciente_nombre,
            estado:      turno.estado === "COBRADO" ? "cobrado" : "pendiente",
            turno,
          });
        }
      }

      // Ordenar: por hora asc, los sin hora al final
      lista.sort((a, b) => {
        if (!a.hora && !b.hora) return 0;
        if (!a.hora) return 1;
        if (!b.hora) return -1;
        return a.hora.localeCompare(b.hora);
      });

      setSesiones(lista);
    }).catch(() => {}).finally(() => setCargando(false));
  }, []);

  const registradas   = sesiones.filter(s => s.estado !== "sin_registrar").length;
  const total         = sesiones.length;
  const sinRegistrar  = sesiones.filter(s => s.estado === "sin_registrar").length;

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-100">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50">
            <CalendarDays className="h-4 w-4 text-indigo-500" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Agenda de hoy</p>
            <p className="text-xs font-medium text-neutral-600 capitalize">{hoyLabel()}</p>
          </div>
        </div>
        {total > 0 && (
          <div className="text-right">
            <p className="text-sm font-bold text-neutral-800">{registradas}/{total}</p>
            <p className="text-[10px] text-neutral-400">registradas</p>
          </div>
        )}
      </div>

      {/* Contenido */}
      <div className="px-5 py-3">

        {cargando && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-neutral-400">
            <Loader2 className="h-4 w-4 animate-spin" />Cargando…
          </div>
        )}

        {!cargando && total === 0 && (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <span className="text-2xl">🌿</span>
            <p className="text-sm font-medium text-neutral-500">Sin sesiones hoy</p>
            <p className="text-xs text-neutral-300">Configurá la semana modelo para ver tu agenda aquí</p>
          </div>
        )}

        {!cargando && total > 0 && (
          <div className="max-h-72 overflow-y-auto space-y-2 pr-1
            [&::-webkit-scrollbar]:w-1.5
            [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-neutral-100
            [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-neutral-300">
            {sesiones.map(s => (
              <div key={s.key}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${
                  s.estado === "cobrado"       ? "bg-emerald-50/60 ring-1 ring-emerald-100" :
                  s.estado === "pendiente"     ? "bg-amber-50/60 ring-1 ring-amber-100" :
                                                 "bg-neutral-50 ring-1 ring-neutral-100 opacity-70"
                }`}>

                {/* Hora */}
                <div className="flex w-10 shrink-0 flex-col items-center">
                  {s.hora
                    ? <span className="text-[11px] font-bold tabular-nums text-neutral-500">{s.hora}</span>
                    : <Clock className="h-3 w-3 text-neutral-300" />
                  }
                </div>

                {/* Avatar */}
                <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${avatarCls(s.nombre)}`}>
                  {iniciales(s.nombre)}
                </div>

                {/* Nombre */}
                <p className="flex-1 truncate text-sm font-medium text-neutral-800">{s.nombre}</p>

                {/* Estado */}
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  s.estado === "cobrado"   ? "bg-emerald-100 text-emerald-700" :
                  s.estado === "pendiente" ? "bg-amber-100 text-amber-700" :
                                             "bg-neutral-100 text-neutral-400"
                }`}>
                  {s.estado === "cobrado"   ? "✓ Cobrado" :
                   s.estado === "pendiente" ? "Pendiente" :
                                              "Sin registrar"}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Footer — ir a agenda completa */}
        {!cargando && (
          <div className="mt-3 flex items-center justify-between">
            {sinRegistrar > 0 && (
              <p className="text-xs text-amber-600 font-medium">
                {sinRegistrar} sin registrar
              </p>
            )}
            <Link href="/agenda"
              className="ml-auto text-xs font-medium text-indigo-500 hover:text-indigo-700 transition-colors">
              Ver agenda completa →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
