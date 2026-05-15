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
    color: "bg-indigo-100 text-indigo-600",
    titulo: "Copiloto",
    desc: "Registrá pagos y sesiones escribiendo como hablarías. Ej: «Ana me pagó $30.000 hoy en efectivo».",
  },
  {
    icon: TrendingUp,
    color: "bg-emerald-100 text-emerald-600",
    titulo: "Cobrado / En camino / Sin cobrar",
    desc: "Tu cash flow del mes. Hacé click en cada card para ver el detalle de cada sesión.",
  },
  {
    icon: BarChart2,
    color: "bg-violet-100 text-violet-600",
    titulo: "Ventas mensuales",
    desc: "Tu facturación de los últimos 6 meses. Te permite ver si estás creciendo o cayendo en términos reales.",
  },
  {
    icon: Shield,
    color: "bg-amber-100 text-amber-600",
    titulo: "Límite Monotributo",
    desc: "Cuánto facturaste en los últimos 12 meses vs el tope de tu categoría. El semáforo avisa cuando estás cerca del límite.",
  },
  {
    icon: CalendarDays,
    color: "bg-sky-100 text-sky-600",
    titulo: "Agenda semanal",
    desc: "Tus turnos de esta semana, de 9 a 18hs. Configurá tu semana modelo en la sección Agenda.",
  },
  {
    icon: Bell,
    color: "bg-rose-100 text-rose-600",
    titulo: "Actualizar honorarios",
    desc: "Pacientes cuyo honorario lleva más de 3 meses sin ajuste. El sistema calcula cuánto deberías cobrar hoy según la inflación real.",
  },
  {
    icon: Calculator,
    color: "bg-orange-100 text-orange-600",
    titulo: "Simulador",
    desc: "Ingresá cualquier honorario y calculá su valor actualizado por inflación acumulada desde la fecha que elijas.",
  },
  {
    icon: List,
    color: "bg-neutral-100 text-neutral-600",
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
          // Demo: siempre abre la guía
          setOpen(true);
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
        className="flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-600 hover:bg-indigo-100 transition-colors shrink-0"
      >
        <BookOpen className="h-3.5 w-3.5" />
        Guía
      </button>

      <Sheet open={open} onClose={cerrar} title="Guía del dashboard">
        <p className="mb-4 text-xs text-neutral-400">
          Un resumen de cada sección para que aproveches PsicoFinance al máximo.
        </p>
        <div className="flex flex-col gap-3">
          {SECCIONES.map(({ icon: Icon, color, titulo, desc }) => (
            <div key={titulo} className="flex gap-3 rounded-xl bg-neutral-50 p-3.5">
              <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${color}`}>
                <Icon className="h-4 w-4" strokeWidth={2} />
              </div>
              <div>
                <p className="text-sm font-semibold text-neutral-800">{titulo}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-neutral-500">{desc}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-center text-[10px] text-neutral-300">
          Podés volver a abrir esta guía desde el botón del dashboard.
        </p>
      </Sheet>
    </>
  );
}
