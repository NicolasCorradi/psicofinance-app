"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon, Monitor } from "lucide-react";

const OPCIONES = [
  { valor: "light",  label: "Claro",  Icon: Sun },
  { valor: "dark",   label: "Oscuro", Icon: Moon },
  { valor: "system", label: "Auto",   Icon: Monitor },
] as const;

const ESTILOS = {
  sidebar: { // sobre fondo oscuro (sidebar desktop) — angosto, solo iconos
    pista:    "bg-white/5 ring-1 ring-white/5",
    activo:   "bg-white/15 text-white shadow-sm",
    inactivo: "text-white/35 hover:text-white/70 hover:bg-white/5",
  },
  sheet: { // sobre fondo claro (sheet mobile) — hay lugar para el texto
    pista:    "bg-neutral-100 dark:bg-slate-800",
    activo:   "bg-white text-indigo-600 shadow-sm dark:bg-slate-700 dark:text-indigo-400",
    inactivo: "text-neutral-400 hover:text-neutral-600 dark:text-slate-500 dark:hover:text-slate-300",
  },
} as const;

/** Selector Claro/Oscuro/Auto de 3 posiciones. En el sidebar (angosto) va solo con
 * iconos; en el sheet mobile (con más lugar) muestra también la etiqueta. */
export default function ThemeToggle({ variant = "sidebar" }: {
  variant?: keyof typeof ESTILOS;
}) {
  const { theme, setTheme } = useTheme();
  const [montado, setMontado] = useState(false);
  // Evita el mismatch de hidratación: el tema real solo se conoce en el cliente
  useEffect(() => setMontado(true), []);

  const s = ESTILOS[variant];
  const conEtiqueta = variant === "sheet";

  if (!montado) {
    return <div className={`h-10 w-full rounded-xl ${s.pista}`} />;
  }

  return (
    <div className={`flex w-full items-center gap-1 rounded-xl p-1 ${s.pista}`}>
      {OPCIONES.map(({ valor, label, Icon }) => {
        const activo = theme === valor;
        return (
          <button
            key={valor}
            onClick={() => setTheme(valor)}
            title={label}
            aria-label={label}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition-colors ${
              activo ? s.activo : s.inactivo
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" strokeWidth={1.8} />
            {conEtiqueta && <span>{label}</span>}
          </button>
        );
      })}
    </div>
  );
}
