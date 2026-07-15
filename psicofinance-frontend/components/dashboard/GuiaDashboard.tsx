"use client";

import { useEffect, useState } from "react";
import { BookOpen, MessageSquare, TrendingUp, BarChart2, Shield, CalendarDays, Bell, Calculator, List } from "lucide-react";
import Sheet from "@/components/ui/Sheet";
import { createClient } from "@/lib/supabase/client";

const DEMO_EMAIL   = "demo@psicofinance.com";
const LS_KEY       = "pf_guia_vista";

const SECCIONES = [
  {
    icon: MessageSquare,
    color: "bg-indigo-100 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400",
    titulo: "Copiloto",
    desc: "Registrá pagos y sesiones escribiendo como hablarías. Ej: «Ana me pagó $30.000 hoy en efectivo».",
  },
  {
    icon: TrendingUp,
    color: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
    titulo: "Cobrado / En camino / Sin cobrar",
    desc: "Tu cash flow del mes. Hacé click en cada card para ver el detalle de cada sesión.",
  },
  {
    icon: BarChart2,
    color: "bg-violet-100 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400",
    titulo: "Ventas mensuales",
    desc: "Tu facturación de los últimos 6 meses. Te permite ver si estás creciendo o cayendo en términos reales.",
  },
  {
    icon: Shield,
    color: "bg-amber-100 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
    titulo: "Límite Monotributo",
    desc: "Cuánto facturaste en los últimos 12 meses vs el tope de tu categoría. El semáforo avisa cuando estás cerca del límite.",
  },
  {
    icon: CalendarDays,
    color: "bg-sky-100 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400",
    titulo: "Agenda semanal",
    desc: "Tus turnos de esta semana. Configurá tu semana modelo en la sección Agenda para ver los pacientes que esperás cada día.",
  },
  {
    icon: Bell,
    color: "bg-rose-100 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400",
    titulo: "Actualizar honorarios",
    desc: "Pacientes cuyo honorario lleva más de 3 meses sin ajuste. El sistema calcula cuánto deberías cobrar hoy según la inflación real.",
  },
  {
    icon: Calculator,
    color: "bg-orange-100 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400",
    titulo: "Simulador",
    desc: "Ingresá cualquier honorario y calculá su valor actualizado por inflación acumulada desde la fecha que elijas.",
  },
  {
    icon: List,
    color: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300",
    titulo: "Últimos turnos",
    desc: "Historial de sesiones registradas. Podés editar el monto, estado o fecha directamente desde la tabla.",
  },
];

export default function GuiaDashboard() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    async function verificar() {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        const esDemo = user?.email === DEMO_EMAIL;

        if (esDemo) {
          // Demo: abre la guía una vez por sesión de navegación (no en cada visita)
          if (!sessionStorage.getItem(LS_KEY)) {
            setOpen(true);
            sessionStorage.setItem(LS_KEY, "1");
          }
        } else if (!localStorage.getItem(LS_KEY)) {
          // Primera vez: abre solo
          setOpen(true);
        }
      } catch {
        // Sin usuario o error — no mostrar
      }
    }
    verificar();
  }, []);

  function cerrar() {
    setOpen(false);
    try { localStorage.setItem(LS_KEY, "1"); } catch { /* noop */ }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-600 hover:bg-indigo-100 transition-colors shrink-0 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-400 dark:hover:bg-indigo-500/20"
      >
        <BookOpen className="h-3.5 w-3.5" />
        Guía
      </button>

      <Sheet open={open} onClose={cerrar} title="Guía del dashboard">
        <p className="mb-4 text-xs text-neutral-400 dark:text-neutral-500">
          Un resumen de cada sección para que aproveches PsicoFinance al máximo.
        </p>
        <div className="flex flex-col gap-3">
          {SECCIONES.map(({ icon: Icon, color, titulo, desc }) => (
            <div key={titulo} className="flex gap-3 rounded-xl bg-neutral-50 p-3.5 dark:bg-neutral-950/40">
              <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${color}`}>
                <Icon className="h-4 w-4" strokeWidth={2} />
              </div>
              <div>
                <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">{titulo}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">{desc}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-center text-[10px] text-neutral-300 dark:text-neutral-600">
          Podés volver a abrir esta guía desde el botón del dashboard.
        </p>
      </Sheet>
    </>
  );
}
