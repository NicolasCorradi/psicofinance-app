// Pasos del tour guiado de PsicoFinance.
//
// El tour recorre la app de verdad: cada paso navega a su pantalla y resalta
// el elemento real, con los datos reales del usuario. No es un carrusel de
// capturas — se aprende tocando lo que después vas a usar.
//
// `target` apunta a un atributo data-tour="…" puesto en el componente. Se usa
// eso y no un selector CSS para que un cambio de clases de Tailwind no rompa
// el tour en silencio. Si el elemento no está en pantalla (por ejemplo, una
// sección vacía porque el usuario recién arranca), el paso igual se muestra
// centrado: nunca bloquea el recorrido.

import type { LucideIcon } from "lucide-react";
import {
  Sparkles, MessageSquare, Wallet, AlertCircle, Shield, Bell,
  CalendarDays, Users, TrendingDown, BarChart3, CheckCircle2,
} from "lucide-react";

export interface PasoTour {
  id:      string;
  /** Página donde ocurre el paso. El tour navega solo. */
  href:    string;
  /** Valor de data-tour del elemento a resaltar. Sin esto, el paso va centrado. */
  target?: string;
  icon:    LucideIcon;
  color:   string;
  titulo:  string;
  cuerpo:  string;
  /** Dato práctico que evita un error frecuente. */
  tip?:    string;
  /** Muestra la demo interactiva del copiloto dentro de la tarjeta. */
  demo?:   boolean;
}

export const PASOS: PasoTour[] = [
  {
    id: "bienvenida",
    href: "/dashboard",
    icon: Sparkles,
    color: "bg-indigo-100 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400",
    titulo: "Te muestro la app en 2 minutos",
    cuerpo:
      "Voy a llevarte por cada pantalla y explicarte qué hacés en cada una. Podés seguir usando la app mientras tanto, y cortar cuando quieras.",
    tip: "Si lo cerrás por la mitad, la próxima vez retomás donde ibas.",
  },
  {
    id: "copiloto",
    href: "/dashboard",
    target: "copiloto",
    icon: MessageSquare,
    color: "bg-violet-100 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400",
    titulo: "Acá registrás todo",
    cuerpo:
      "Escribile como le contarías a un colega: «Vino Martina, me pagó 35 lucas en efectivo». Entiende jerga, fechas relativas y medios de pago. También podés hablarle con el micrófono, o preguntarle «¿cuánto facturé este mes?».",
    tip: "Si no aclarás el monto, usa el honorario que tenga cargado ese paciente y te lo avisa.",
    demo: true,
  },
  {
    id: "neto",
    href: "/dashboard",
    target: "ingreso-neto",
    icon: Wallet,
    color: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
    titulo: "Con cuánto te quedás",
    cuerpo:
      "Lo que cobraste este mes menos lo que gastaste. Es el número que realmente importa: facturar mucho no sirve de nada si los gastos se lo comen.",
  },
  {
    id: "cashflow",
    href: "/dashboard",
    target: "cashflow",
    icon: AlertCircle,
    color: "bg-rose-100 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400",
    titulo: "Cobrado, en camino y sin cobrar",
    cuerpo:
      "«Cobrado» ya entró. «En camino» son sesiones de este mes todavía impagas. «Sin cobrar» es lo vencido, de meses anteriores. Tocá esa card: te abre la deuda agrupada por antigüedad para saber a quién reclamarle primero.",
    tip: "Lo de prepaga aparece pendiente porque la obra social paga a ~60 días. Eso no se lo reclames al paciente.",
  },
  {
    id: "monotributo",
    href: "/dashboard",
    target: "monotributo",
    icon: Shield,
    color: "bg-amber-100 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
    titulo: "Monotributo sin sustos",
    cuerpo:
      "Cuánto facturaste en los últimos 12 meses contra el tope de tu categoría. Verde tranquilo, amarillo atento, rojo te pasaste. Cargá tu categoría real de ARCA para que el semáforo te sirva.",
    tip: "Cuenta por fecha de sesión (criterio ARCA), así que incluye lo que todavía no cobraste.",
  },
  {
    id: "honorarios",
    href: "/dashboard",
    target: "alertas-honorarios",
    icon: Bell,
    color: "bg-fuchsia-100 text-fuchsia-600 dark:bg-fuchsia-500/10 dark:text-fuchsia-400",
    titulo: "A quién le tenés que ajustar",
    cuerpo:
      "Te marca los pacientes que llevan más de 3 meses sin aumento y cuánto deberías cobrarles hoy según el IPC del INDEC. Es la plata que perdés por no ajustar a tiempo.",
    tip: "Más abajo el simulador te muestra cuánto ganarías por mes con el ajuste aplicado.",
  },
  {
    id: "agenda-semana",
    href: "/agenda",
    target: "agenda-vista",
    icon: CalendarDays,
    color: "bg-sky-100 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400",
    titulo: "Tu semana de trabajo",
    cuerpo:
      "Cargá una vez tu «semana modelo» —quién viene cada día y a qué hora— y la agenda se arma sola todas las semanas. Los turnos con borde punteado son los que todavía no registraste: tocalos para cargarlos.",
    tip: "¿Esta semana alguien no viene o lo movés? Usá «Mover / cancelar esta semana»: tu plantilla queda intacta.",
  },
  {
    id: "cerrar-dia",
    href: "/agenda",
    target: "agenda-vista",
    icon: CheckCircle2,
    color: "bg-indigo-100 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400",
    titulo: "Cerrá el día de una sola vez",
    cuerpo:
      "Si te quedaron 2 o más turnos sin registrar, aparece el botón «Cerrar día». Te lista todos: cada uno arranca en «Cobré» con su honorario ya cargado, y vos solo tocás las excepciones — el que debe, el que faltó. De 28 clics a 3.",
    tip: "Solo se pueden cerrar días que ya pasaron: dar por cobrada una sesión futura inventaría plata que no entró.",
  },
  {
    id: "pacientes",
    href: "/pacientes",
    target: "pacientes-lista",
    icon: Users,
    color: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
    titulo: "Tus pacientes",
    cuerpo:
      "Cargá a cada uno con su honorario: es lo que el copiloto asume cuando no aclarás el monto y la base de casi todos los cálculos. Si cobrás en dólares, elegí USD y la app convierte al blue del día.",
    tip: "Cargá el teléfono: con eso podés mandar el recordatorio de deuda por WhatsApp ya escrito desde su ficha.",
  },
  {
    id: "egresos",
    href: "/egresos",
    target: "egresos-vista",
    icon: TrendingDown,
    color: "bg-orange-100 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400",
    titulo: "Tus gastos",
    cuerpo:
      "Alquiler, supervisión, matrícula, monotributo. Cargá los fijos una vez y los variables cuando aparezcan. La app los separa para que veas cuánto de tu costo es inevitable.",
    tip: "Un gasto que no anotaste hace que tu resultado se vea mejor de lo que realmente es.",
  },
  {
    id: "reportes",
    href: "/reportes",
    target: "reportes-vista",
    icon: BarChart3,
    color: "bg-violet-100 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400",
    titulo: "Cómo venís en el tiempo",
    cuerpo:
      "Tu evolución mes a mes y comparada contra la inflación real del INDEC. Sirve para saber si estás creciendo de verdad o solo acompañando los precios.",
  },
  {
    id: "final",
    href: "/dashboard",
    icon: CheckCircle2,
    color: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
    titulo: "Listo, eso es todo",
    cuerpo:
      "Si arrancás de cero, hacé esto en orden: 1) cargá tus pacientes con su honorario, 2) armá tu semana modelo en la Agenda, 3) registrá las sesiones cada día. Con eso todos los números empiezan a servirte.",
    tip: "Podés volver a ver este tour cuando quieras desde el botón «Tutorial» del menú.",
  },
];
