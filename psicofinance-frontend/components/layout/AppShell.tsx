"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LayoutDashboard, Users, BrainCircuit, BarChart3, CalendarDays, TrendingDown, LogOut } from "lucide-react";
import { getSemaforo, getTurnosAgenda } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";
import type { ResultadoSemaforo, EstadoSemaforo } from "@/lib/types";
import { ToastProvider } from "@/lib/toast";

const NAV_LINKS = [
  { href: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/pacientes", label: "Pacientes", Icon: Users },
  { href: "/agenda",    label: "Agenda",    Icon: CalendarDays },
  { href: "/egresos",   label: "Egresos",   Icon: TrendingDown },
  { href: "/reportes",  label: "Reportes",  Icon: BarChart3 },
];

const DOT_CLS: Record<EstadoSemaforo, string> = {
  VERDE:    "bg-emerald-400",
  AMARILLO: "bg-amber-400",
  ROJO:     "bg-red-400 animate-pulse",
};

const CHIP_CLS: Record<EstadoSemaforo, string> = {
  VERDE:    "bg-emerald-500/10 text-emerald-400",
  AMARILLO: "bg-amber-500/10 text-amber-400",
  ROJO:     "bg-red-500/10 text-red-400",
};

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [semaforo,       setSemaforo]       = useState<ResultadoSemaforo | null>(null);
  const [sesionesHoy,    setSesionesHoy]    = useState(0);
  const pathname = usePathname();
  const router   = useRouter();
  const supabase = createClient();

  useEffect(() => {
    getSemaforo().then(setSemaforo).catch(() => {});
    // Badge agenda: contar turnos REALES de hoy
    const d = new Date();
    const hoy = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    getTurnosAgenda(hoy, hoy).then(t => setSesionesHoy(t.length)).catch(() => {});
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  const today = new Date().toLocaleDateString("es-AR", {
    weekday: "short", day: "numeric", month: "short",
  });

  return (
    <ToastProvider>
    <div className="flex min-h-screen bg-background">

      {/* ── Sidebar desktop ── */}
      <aside className="hidden lg:flex w-56 shrink-0 flex-col bg-sidebar bg-gradient-to-b from-indigo-950 via-slate-950 to-slate-950 border-r border-sidebar-border fixed inset-y-0 left-0 z-50 overflow-hidden">

        {/* Luz ambiental superior — profundidad sin ruido */}
        <div className="pointer-events-none absolute -top-24 -left-16 h-64 w-64 rounded-full bg-indigo-500/15 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 -right-20 h-48 w-48 rounded-full bg-violet-500/10 blur-3xl" />

        {/* Logo */}
        <div className="relative flex items-center gap-3 px-5 pt-6 pb-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-950/60 ring-1 ring-white/10">
            <BrainCircuit className="h-4.5 w-4.5 text-white" strokeWidth={1.8} />
          </div>
          <div>
            <p className="text-sm font-bold text-white tracking-tight leading-none">PsicoFinance</p>
            <p className="text-[10px] text-indigo-300/60 leading-none mt-1 tracking-wide uppercase">Consultorio</p>
          </div>
        </div>

        <div className="mx-4 h-px bg-sidebar-border mb-3" />

        {/* Nav */}
        <nav className="flex-1 px-3 space-y-0.5">
          {NAV_LINKS.map(({ href, label, Icon }) => {
            const active = pathname.startsWith(href);
            const esAgenda = href === "/agenda";
            return (
              <Link
                key={href}
                href={href}
                className={`relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-indigo-500/15 text-indigo-300 ring-1 ring-inset ring-indigo-400/20 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]"
                    : "text-white/40 hover:bg-white/5 hover:text-white/80"
                }`}
              >
                {/* Indicador de sección activa */}
                {active && (
                  <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-gradient-to-b from-indigo-400 to-violet-500" />
                )}
                <div className="relative">
                  <Icon
                    className={`h-4 w-4 shrink-0 ${active ? "text-indigo-400" : "opacity-60"}`}
                    strokeWidth={active ? 2 : 1.8}
                  />
                  {esAgenda && sesionesHoy > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-indigo-500 text-[8px] font-bold text-white">
                      {sesionesHoy}
                    </span>
                  )}
                </div>
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Bottom */}
        <div className="px-3 pb-5 space-y-2">
          {semaforo && (
            <div className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 ${CHIP_CLS[semaforo.estado]}`}>
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT_CLS[semaforo.estado]}`} />
              <div className="min-w-0">
                <p className="text-xs font-semibold leading-none">Cat. {semaforo.categoria_actual}</p>
                <p className="text-[10px] opacity-70 leading-none mt-1">
                  {semaforo.porcentaje_consumido.toFixed(0)}% del tope
                </p>
              </div>
            </div>
          )}
          <p className="px-3 text-[11px] capitalize text-white/40">{today}</p>

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-medium text-white/30 transition-all hover:bg-white/5 hover:text-white/60"
          >
            <LogOut className="h-3.5 w-3.5" />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* ── Header móvil ── */}
      <header className="lg:hidden fixed top-0 inset-x-0 z-50 flex h-14 items-center border-b border-neutral-200/60 bg-white/95 px-3 backdrop-blur-xl">
        {/* Logo */}
        <div className="flex items-center gap-2 shrink-0 mr-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-100">
            <BrainCircuit className="h-3.5 w-3.5 text-indigo-600" strokeWidth={1.8} />
          </div>
        </div>
        {/* Nav */}
        <nav className="flex flex-1 items-center justify-around">
          {NAV_LINKS.map(({ href, label, Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link key={href} href={href}
                className={`flex flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 transition-colors ${
                  active ? "text-indigo-600" : "text-neutral-400 hover:text-neutral-600"
                }`}
              >
                <Icon className="h-4 w-4" strokeWidth={active ? 2.2 : 1.8} />
                <span className="text-[9px] font-semibold tracking-wide">{label}</span>
              </Link>
            );
          })}
          <button onClick={handleLogout}
            className="flex flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-neutral-400 hover:text-neutral-600 transition-colors">
            <LogOut className="h-4 w-4" strokeWidth={1.8} />
            <span className="text-[9px] font-semibold tracking-wide">Salir</span>
          </button>
        </nav>
      </header>

      {/* ── Contenido principal ── */}
      <div className="flex-1 lg:ml-56 min-w-0">
        <div className="lg:hidden h-14" />
        {children}
      </div>
    </div>
    </ToastProvider>
  );
}
