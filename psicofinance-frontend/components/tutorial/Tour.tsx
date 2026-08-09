"use client";

// Motor del tour guiado: navega la app real y resalta el elemento de cada paso.
//
// Decisiones que importan:
//  - El overlay tiene pointer-events:none, así que la app sigue siendo usable
//    mientras el tour está abierto. Es un acompañante, no un bloqueo.
//  - El elemento se busca por data-tour y con reintentos: después de navegar,
//    la pantalla todavía está cargando datos y el nodo aparece más tarde.
//  - Si el elemento no aparece (sección vacía porque el usuario recién
//    arranca), el paso se muestra centrado igual. El tour nunca se traba.

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { X, ArrowLeft, ArrowRight, Lightbulb } from "lucide-react";
import { PASOS } from "./pasos";
import DemoCopiloto from "./DemoCopiloto";

const LS_PASO = "pf_tour_paso";
const LS_VISTO = "pf_tour_visto";

interface Rect { top: number; left: number; width: number; height: number }

/** Busca el nodo del paso reintentando: tras navegar, la pantalla aún carga. */
function useNodoDelPaso(target: string | undefined, pathname: string, i: number) {
  const [rect, setRect] = useState<Rect | null>(null);

  const medir = useCallback(() => {
    if (!target) { setRect(null); return false; }
    const el = document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
    if (!el) { setRect(null); return false; }
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) { setRect(null); return false; }
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    return true;
  }, [target]);

  useEffect(() => {
    let cancelado = false;
    let intentos = 0;
    let primeraVez = true;

    function intentar() {
      if (cancelado) return;
      const ok = medir();
      if (ok && primeraVez) {
        primeraVez = false;
        const el = document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
        // Remedir después del scroll, si no la posición queda vieja
        window.setTimeout(() => { if (!cancelado) medir(); }, 450);
        return;
      }
      if (!ok && intentos < 24) {   // ~3s de margen para que cargue la pantalla
        intentos++;
        window.setTimeout(intentar, 125);
      }
    }
    intentar();
    return () => { cancelado = true; };
  }, [medir, target, pathname, i]);

  // Mantener el recuadro pegado al elemento si el usuario scrollea o rota
  useEffect(() => {
    if (!target) return;
    const on = () => medir();
    window.addEventListener("scroll", on, true);
    window.addEventListener("resize", on);
    return () => {
      window.removeEventListener("scroll", on, true);
      window.removeEventListener("resize", on);
    };
  }, [medir, target]);

  return rect;
}

export default function Tour({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [i, setI] = useState(0);
  const router = useRouter();
  const pathname = usePathname();
  const paso = PASOS[i];
  const rect = useNodoDelPaso(open ? paso?.target : undefined, pathname, i);
  const tarjetaRef = useRef<HTMLDivElement>(null);

  // Retomar donde había quedado
  useEffect(() => {
    if (!open) return;
    try {
      const g = Number(localStorage.getItem(LS_PASO));
      if (Number.isFinite(g) && g > 0 && g < PASOS.length) setI(g);
    } catch { /* localStorage bloqueado: arranca de cero */ }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    try { localStorage.setItem(LS_PASO, String(i)); } catch { /* noop */ }
  }, [i, open]);

  // Llevar al usuario a la pantalla del paso.
  // Se navega UNA sola vez por paso: si el push no llegara a destino (una
  // redirección, una ruta que no existe), reintentar en cada render dejaría
  // la app navegando en loop.
  const navegadoEn = useRef<number | null>(null);
  useEffect(() => {
    if (!open || !paso) return;
    if (navegadoEn.current === i) return;
    navegadoEn.current = i;
    if (pathname !== paso.href) router.push(paso.href);
  }, [open, paso, pathname, router, i]);

  // Al cerrar, olvidar la última navegación para que reabrir vuelva a llevarte
  useEffect(() => { if (!open) navegadoEn.current = null; }, [open]);

  const cerrar = useCallback(() => {
    try { localStorage.setItem(LS_VISTO, "1"); } catch { /* noop */ }
    onClose();
  }, [onClose]);

  const terminar = useCallback(() => {
    try {
      localStorage.setItem(LS_VISTO, "1");
      localStorage.removeItem(LS_PASO);   // la próxima arranca de cero
    } catch { /* noop */ }
    onClose();
  }, [onClose]);

  const siguiente = useCallback(() => {
    setI(p => (p < PASOS.length - 1 ? p + 1 : p));
  }, []);
  const anterior = useCallback(() => setI(p => Math.max(0, p - 1)), []);

  // Teclado: flechas para avanzar, Escape para salir
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") cerrar();
      else if (e.key === "ArrowRight") siguiente();
      else if (e.key === "ArrowLeft") anterior();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, cerrar, siguiente, anterior]);

  useEffect(() => {
    if (open) tarjetaRef.current?.focus();
  }, [open, i]);

  if (!open || !paso) return null;

  const esUltimo = i === PASOS.length - 1;
  const progreso = ((i + 1) / PASOS.length) * 100;
  const Icon = paso.icon;

  // La tarjeta va debajo del elemento si entra; si no, arriba; sin elemento,
  // abajo y centrada para no tapar la pantalla que se está explicando.
  const MARGEN = 14, ALTO_APROX = 300;
  let estiloTarjeta: React.CSSProperties = {};
  if (rect) {
    const cabeAbajo = rect.top + rect.height + MARGEN + ALTO_APROX < window.innerHeight;
    estiloTarjeta = cabeAbajo
      ? { top: rect.top + rect.height + MARGEN }
      : { bottom: Math.max(MARGEN, window.innerHeight - rect.top + MARGEN) };
  } else {
    estiloTarjeta = { bottom: MARGEN * 2 };
  }

  return (
    <>
      {/* Recuadro sobre el elemento. pointer-events:none — la app sigue usable */}
      {rect && (
        <div
          aria-hidden
          className="pointer-events-none fixed z-[70] rounded-2xl ring-4 ring-indigo-400/70 transition-all duration-300 dark:ring-indigo-400/60"
          style={{
            top: rect.top - 6, left: rect.left - 6,
            width: rect.width + 12, height: rect.height + 12,
            boxShadow: "0 0 0 9999px rgba(15,23,42,0.55)",
          }}
        />
      )}
      {!rect && (
        <div aria-hidden className="pointer-events-none fixed inset-0 z-[70] bg-slate-900/50" />
      )}

      {/* Tarjeta del paso */}
      <div
        ref={tarjetaRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="false"
        aria-label={`Tutorial, paso ${i + 1} de ${PASOS.length}: ${paso.titulo}`}
        style={estiloTarjeta}
        className="fixed inset-x-3 z-[80] mx-auto max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/10 outline-none sm:inset-x-auto sm:right-6 dark:bg-slate-900 dark:ring-white/10"
      >
        {/* Progreso */}
        <div className="h-1 w-full bg-neutral-100 dark:bg-slate-800">
          <div className="h-full bg-indigo-500 transition-all duration-300" style={{ width: `${progreso}%` }} />
        </div>

        <div className="p-4">
          <div className="mb-2 flex items-start gap-2.5">
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${paso.color}`}>
              <Icon className="h-4 w-4" strokeWidth={2} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-medium uppercase tracking-wider text-neutral-400 dark:text-slate-500">
                Paso {i + 1} de {PASOS.length}
              </p>
              <h3 className="text-sm font-bold leading-tight text-neutral-900 dark:text-slate-100">{paso.titulo}</h3>
            </div>
            <button
              onClick={cerrar}
              aria-label="Cerrar tutorial"
              className="rounded-lg p-1.5 text-neutral-300 hover:bg-neutral-100 hover:text-neutral-600 dark:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <p className="text-xs leading-relaxed text-neutral-600 dark:text-slate-300">{paso.cuerpo}</p>

          {paso.tip && (
            <div className="mt-2.5 flex gap-2 rounded-xl bg-amber-50 px-3 py-2 dark:bg-amber-500/10">
              <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500 dark:text-amber-400" />
              <p className="text-[11px] leading-relaxed text-amber-800 dark:text-amber-300">{paso.tip}</p>
            </div>
          )}

          {paso.demo && <div className="mt-3"><DemoCopiloto /></div>}

          {/* Navegación */}
          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={anterior}
              disabled={i === 0}
              className="flex items-center gap-1 rounded-xl border border-neutral-200 px-3 py-2 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Atrás
            </button>
            <button
              onClick={cerrar}
              className="rounded-xl px-2 py-2 text-xs font-medium text-neutral-400 transition-colors hover:text-neutral-600 dark:text-slate-500 dark:hover:text-slate-300"
            >
              Salir
            </button>
            <button
              onClick={esUltimo ? terminar : siguiente}
              className="ml-auto flex items-center gap-1 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-500"
            >
              {esUltimo ? "Terminar" : "Siguiente"}
              {!esUltimo && <ArrowRight className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
