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
  sidebar: { // sobre fondo oscuro (sidebar desktop)
    pista:    "bg-white/5",
    activo:   "bg-white/10 text-white",
    inactivo: "text-white/40 hover:text-white/70",
  },
  sheet: { // sobre fondo claro (sheet mobile)
    pista:    "bg-neutral-100",
    activo:   "bg-white text-indigo-600 shadow-sm",
    inactivo: "text-neutral-400 hover:text-neutral-600",
  },
} as const;

/** Selector Claro/Oscuro/Auto de 3 posiciones. */
export default function ThemeToggle({ variant = "sidebar", compact = false }: {
  variant?: keyof typeof ESTILOS;
  compact?: boolean;
}) {
  const { theme, setTheme } = useTheme();
  const [montado, setMontado] = useState(false);
  // Evita el mismatch de hidratación: el tema real solo se conoce en el cliente
  useEffect(() => setMontado(true), []);

  const s = ESTILOS[variant];

  if (!montado) {
    return <div className={`h-9 w-full rounded-xl ${s.pista}`} />;
  }

  return (
    <div className={`flex w-full items-center gap-0.5 rounded-xl p-0.5 ${s.pista}`}>
      {OPCIONES.map(({ valor, label, Icon }) => {
        const activo = theme === valor;
        return (
          <button
            key={valor}
            onClick={() => setTheme(valor)}
            title={label}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-medium transition-colors ${
              activo ? s.activo : s.inactivo
            }`}
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={1.8} />
            {!compact && <span>{label}</span>}
          </button>
        );
      })}
    </div>
  );
}
