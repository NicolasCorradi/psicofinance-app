"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getSemaforo } from "@/lib/api";
import type { ResultadoSemaforo, EstadoSemaforo } from "@/lib/types";

function Dot({ estado }: { estado: EstadoSemaforo | null }) {
  if (!estado) return <span className="inline-block h-1.5 w-1.5 rounded-full bg-neutral-300" />;
  const color: Record<EstadoSemaforo, string> = {
    VERDE:    "bg-emerald-500",
    AMARILLO: "bg-amber-400",
    ROJO:     "bg-red-500 animate-pulse",
  };
  return <span className={`inline-block h-1.5 w-1.5 rounded-full ${color[estado]}`} />;
}

const NAV_LINKS = [
  { href: "/",          label: "Dashboard" },
  { href: "/pacientes", label: "Pacientes" },
];

export default function Navbar() {
  const [s, set]  = useState<ResultadoSemaforo | null>(null);
  const pathname  = usePathname();
  useEffect(() => { getSemaforo().then(set).catch(() => {}); }, []);

  const pct = s ? `${s.porcentaje_consumido.toFixed(0)}%` : null;

  return (
    <header className="sticky top-0 z-50 border-b border-neutral-200/60 bg-white/80 backdrop-blur-xl">
      <div className="mx-auto flex h-12 max-w-screen-lg items-center justify-between px-4">

        {/* Logo + nav */}
        <div className="flex items-center gap-6">
          <span className="text-sm font-semibold tracking-tight text-neutral-900">
            PsicoFinance
          </span>
          <nav className="flex items-center gap-1">
            {NAV_LINKS.map(({ href, label }) => {
              const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    active
                      ? "bg-neutral-100 text-neutral-900"
                      : "text-neutral-500 hover:bg-neutral-50 hover:text-neutral-700"
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Semáforo chip */}
        {s && (
          <div title={s.mensaje} className="flex cursor-default items-center gap-2 rounded-full bg-neutral-100 px-3 py-1.5">
            <Dot estado={s.estado} />
            <span className="text-xs font-medium text-neutral-600">Cat. {s.categoria_actual}</span>
            <span className="hidden text-xs text-neutral-400 sm:inline">{pct} del tope</span>
          </div>
        )}

        {/* Fecha */}
        <p className="hidden text-xs capitalize text-neutral-400 sm:block">
          {new Date().toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}
        </p>
      </div>
    </header>
  );
}
