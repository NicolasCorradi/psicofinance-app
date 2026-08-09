"use client";

// Botón para abrir el tour desde el encabezado del dashboard.
//
// Reemplaza a la vieja "Guía": tener dos ayudas distintas (una lista de texto
// y un tour guiado) obligaba al usuario a adivinar cuál mira.

import { GraduationCap } from "lucide-react";
import { useTutorial } from "./contexto";

export default function BotonTutorial() {
  const { abrirTutorial } = useTutorial();
  return (
    <button
      onClick={abrirTutorial}
      className="flex shrink-0 items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-600 transition-colors hover:bg-indigo-100 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-400 dark:hover:bg-indigo-500/20"
    >
      <GraduationCap className="h-3.5 w-3.5" />
      Tutorial
    </button>
  );
}
