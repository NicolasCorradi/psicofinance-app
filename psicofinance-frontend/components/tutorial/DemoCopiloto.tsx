"use client";

// Demo interactiva del copiloto para el tutorial.
//
// Muestra qué entiende la app a partir de una frase escrita en criollo. Los
// resultados están precargados a propósito: enseñar el formato no justifica
// gastar cuota de Gemini (el tier gratis es acotado) ni depender de que el
// backend esté despierto para que el tutorial funcione.

import { useState } from "react";
import { ArrowRight, User, Wallet, CreditCard, CircleDot, CalendarDays } from "lucide-react";

interface Ejemplo {
  frase: string;
  /** Qué haría la app con esa frase. */
  lee: { paciente: string; monto: string; medio: string; estado: string; fecha: string };
  /** Por qué este ejemplo enseña algo distinto a los demás. */
  ensena: string;
}

const EJEMPLOS: Ejemplo[] = [
  {
    frase: "Vino Martina, me pagó 35 lucas en efectivo",
    lee: { paciente: "Martina López", monto: "$35.000", medio: "Efectivo", estado: "Cobrado", fecha: "Hoy" },
    ensena: "Entiende la jerga: «35 lucas» son 35.000. También «35k» o «treinta y cinco mil».",
  },
  {
    frase: "Ayer atendí a Diego y quedó debiendo",
    lee: { paciente: "Diego Fernández", monto: "Su honorario", medio: "—", estado: "Debe", fecha: "Ayer" },
    ensena: "Sin monto usa el honorario de su ficha, y resuelve fechas relativas como «ayer» o «el lunes».",
  },
  {
    frase: "Carlos faltó sin avisar",
    lee: { paciente: "Carlos Ruiz", monto: "$0", medio: "—", estado: "Faltó", fecha: "Hoy" },
    ensena: "Distingue la falta de la sesión: no suma ingreso ni cuenta como sesión prestada.",
  },
  {
    frase: "Sebastián me pagó lo que debía por transferencia",
    lee: { paciente: "Sebastián Torres", monto: "Toda su deuda", medio: "Transferencia", estado: "Cobrado", fecha: "Hoy" },
    ensena: "No crea una sesión nueva: marca como cobradas las que ya tenía pendientes.",
  },
  {
    frase: "¿Quién me debe plata?",
    lee: { paciente: "—", monto: "—", medio: "—", estado: "Es una consulta", fecha: "—" },
    ensena: "Si es una pregunta, responde con tus datos en vez de registrar nada.",
  },
];

const CAMPOS = [
  { k: "paciente" as const, label: "Paciente", Icon: User },
  { k: "monto"    as const, label: "Monto",    Icon: Wallet },
  { k: "medio"    as const, label: "Medio",    Icon: CreditCard },
  { k: "estado"   as const, label: "Estado",   Icon: CircleDot },
  { k: "fecha"    as const, label: "Fecha",    Icon: CalendarDays },
];

export default function DemoCopiloto() {
  const [sel, setSel] = useState<number | null>(null);
  const activo = sel !== null ? EJEMPLOS[sel] : null;

  return (
    <div className="rounded-2xl border border-neutral-200 bg-neutral-50/70 p-4 dark:border-slate-700 dark:bg-slate-950/40">
      <p className="mb-3 text-xs font-semibold text-neutral-600 dark:text-slate-300">
        Probalo: tocá una frase y mirá qué entiende
      </p>

      <div className="flex flex-col gap-1.5">
        {EJEMPLOS.map((e, i) => (
          <button
            key={e.frase}
            onClick={() => setSel(sel === i ? null : i)}
            aria-pressed={sel === i}
            className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs transition-colors ${
              sel === i
                ? "border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-500/40 dark:bg-violet-500/10 dark:text-violet-300"
                : "border-neutral-200 bg-white text-neutral-600 hover:border-violet-200 hover:bg-violet-50/50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-violet-500/30 dark:hover:bg-violet-500/10"
            }`}
          >
            <span className="flex-1">«{e.frase}»</span>
            <ArrowRight className={`h-3.5 w-3.5 shrink-0 transition-transform ${sel === i ? "translate-x-0.5 text-violet-500 dark:text-violet-400" : "text-neutral-300 dark:text-slate-600"}`} />
          </button>
        ))}
      </div>

      {activo && (
        <div className="mt-3 rounded-xl border border-violet-200 bg-white p-3 dark:border-violet-500/30 dark:bg-slate-900">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-violet-500 dark:text-violet-400">
            Lo que registra
          </p>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3">
            {CAMPOS.map(({ k, label, Icon }) => (
              <div key={k} className="flex items-start gap-1.5">
                <Icon className="mt-0.5 h-3 w-3 shrink-0 text-neutral-300 dark:text-slate-600" />
                <div className="min-w-0">
                  <dt className="text-[9px] uppercase tracking-wide text-neutral-400 dark:text-slate-500">{label}</dt>
                  <dd className="truncate text-xs font-medium text-neutral-800 dark:text-slate-100">{activo.lee[k]}</dd>
                </div>
              </div>
            ))}
          </dl>
          <p className="mt-3 border-t border-neutral-100 pt-2 text-[11px] leading-relaxed text-neutral-500 dark:border-slate-800 dark:text-slate-400">
            {activo.ensena}
          </p>
        </div>
      )}

      {!activo && (
        <p className="mt-3 text-center text-[10px] text-neutral-400 dark:text-slate-500">
          Los nombres y montos son de ejemplo — no se registra nada.
        </p>
      )}
    </div>
  );
}
