"use client";

// Checklist de arranque, con el progreso REAL del consultorio.
//
// Un tutorial explica cómo se usa; esto responde la otra pregunta, que es
// "¿qué me falta a mí?". Por eso mira los datos del usuario en vez de ser una
// lista fija.
//
// Se esconde solo cuando está todo hecho: una tarjeta de onboarding que queda
// para siempre en el dashboard deja de ser ayuda y pasa a ser ruido.

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, Rocket, ArrowRight, X } from "lucide-react";
import { getPacientes, getSemanaModelo } from "@/lib/api";
import { useTutorial } from "./contexto";

const LS_OCULTO = "pf_primeros_pasos_oculto";

interface Paso {
  id:     string;
  hecho:  boolean;
  titulo: string;
  desc:   string;
  href?:  string;
  cta:    string;
}

export default function PrimerosPasos({ refreshKey = 0 }: { refreshKey?: number }) {
  const [pasos, setPasos]     = useState<Paso[] | null>(null);
  const [oculto, setOculto]   = useState(true);   // arranca oculto: no parpadea antes de saber
  const { abrirTutorial } = useTutorial();

  useEffect(() => {
    try { if (localStorage.getItem(LS_OCULTO)) return; } catch { /* noop */ }

    let vivo = true;
    Promise.all([
      getPacientes().catch(() => null),
      getSemanaModelo().catch(() => null),
    ]).then(([pacientes, modelo]) => {
      if (!vivo) return;
      // Si alguna consulta falló, no mostramos nada: es peor decirle "te falta
      // cargar pacientes" a alguien que sí los tiene y no pudimos leerlos.
      if (pacientes === null || modelo === null) return;

      const conHonorario = pacientes.filter(p => (p.honorario_actual ?? 0) > 0).length;
      const sesiones = pacientes.reduce((a, p) => a + (p.total_sesiones ?? 0), 0);

      setPasos([
        {
          id: "pacientes",
          hecho: pacientes.length > 0,
          titulo: "Cargá tus pacientes",
          desc: "Es la base de todo lo demás.",
          href: "/pacientes",
          cta: "Ir a Pacientes",
        },
        {
          id: "honorarios",
          hecho: pacientes.length > 0 && conHonorario === pacientes.length,
          titulo: "Poneles el honorario",
          desc: pacientes.length > 0 && conHonorario < pacientes.length
            ? (pacientes.length - conHonorario === 1
                ? `Te falta 1 de ${pacientes.length}.`
                : `Te faltan ${pacientes.length - conHonorario} de ${pacientes.length}.`)
            : "Sin honorario, la app te pregunta el monto en cada sesión.",
          href: "/pacientes",
          cta: "Completar honorarios",
        },
        {
          id: "semana",
          hecho: (modelo.slots?.length ?? 0) > 0,
          titulo: "Armá tu semana modelo",
          desc: "Quién viene cada día y a qué hora. Después la agenda se arma sola.",
          href: "/agenda",
          cta: "Ir a la Agenda",
        },
        {
          id: "sesiones",
          hecho: sesiones > 0,
          titulo: "Registrá tu primera sesión",
          desc: "Con el copiloto o desde la agenda. Es el hábito que hace que los números sirvan.",
          cta: "Ver cómo",
        },
      ]);
      setOculto(false);
    });
    return () => { vivo = false; };
  }, [refreshKey]);

  function ocultar() {
    setOculto(true);
    try { localStorage.setItem(LS_OCULTO, "1"); } catch { /* noop */ }
  }

  if (oculto || !pasos) return null;

  const hechos = pasos.filter(p => p.hecho).length;
  // Todo listo: la tarjeta ya cumplió su función y desaparece sola
  if (hechos === pasos.length) return null;

  const proximo = pasos.find(p => !p.hecho);

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5 dark:bg-slate-900 dark:ring-white/10">
      <div className="h-1 bg-gradient-to-r from-indigo-400 to-violet-500" />
      <div className="p-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-500/10">
              <Rocket className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-neutral-800 dark:text-slate-100">Primeros pasos</p>
              <p className="text-[11px] text-neutral-400 dark:text-slate-500">
                {hechos} de {pasos.length} listos
              </p>
            </div>
          </div>
          <button
            onClick={ocultar}
            aria-label="No mostrar más"
            className="rounded-lg p-1.5 text-neutral-300 hover:bg-neutral-100 hover:text-neutral-500 dark:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-400"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Barra de progreso */}
        <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-slate-800">
          <div
            className="h-full rounded-full bg-indigo-500 transition-all duration-500"
            style={{ width: `${(hechos / pasos.length) * 100}%` }}
          />
        </div>

        <ul className="flex flex-col gap-2">
          {pasos.map(p => (
            <li key={p.id} className="flex items-start gap-2.5">
              {p.hecho
                ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500 dark:text-emerald-400" />
                : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-neutral-300 dark:text-slate-600" />}
              <div className="min-w-0">
                <p className={`text-xs font-medium ${p.hecho
                  ? "text-neutral-400 line-through dark:text-slate-600"
                  : "text-neutral-800 dark:text-slate-100"}`}>
                  {p.titulo}
                </p>
                {!p.hecho && (
                  <p className="text-[11px] leading-relaxed text-neutral-500 dark:text-slate-400">{p.desc}</p>
                )}
              </div>
            </li>
          ))}
        </ul>

        {proximo && (
          <div className="mt-4 flex items-center gap-2">
            {proximo.href ? (
              <Link
                href={proximo.href}
                className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-500"
              >
                {proximo.cta} <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            ) : (
              <button
                onClick={abrirTutorial}
                className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-500"
              >
                {proximo.cta} <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={abrirTutorial}
              className="rounded-xl px-2.5 py-2 text-xs font-medium text-neutral-500 transition-colors hover:text-neutral-700 dark:text-slate-400 dark:hover:text-slate-200"
            >
              Ver el tutorial
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
