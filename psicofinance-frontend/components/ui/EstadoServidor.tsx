"use client";

// Aviso flotante mientras el backend "despierta".
//
// Render (free tier) apaga el servicio tras 15 min sin tráfico: el primer
// request después puede tardar decenas de segundos. Sin este cartel el
// usuario ve un spinner eterno y concluye que la app está rota — que es
// justo lo que pasó en la demo del copiloto.
//
// Muestra el contador de segundos para que la espera se sienta previsible
// en vez de indefinida.

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { suscribirServidorDespertando } from "@/lib/api";

export default function EstadoServidor() {
  const [despertando, setDespertando] = useState(false);
  const [segundos, setSegundos]       = useState(0);

  useEffect(() => suscribirServidorDespertando(setDespertando), []);

  useEffect(() => {
    if (!despertando) { setSegundos(0); return; }
    const t = setInterval(() => setSegundos(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [despertando]);

  if (!despertando) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-3 z-[60] flex justify-center px-4 print:hidden"
    >
      <div className="flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50/95 px-3.5 py-1.5 shadow-sm backdrop-blur-sm dark:border-amber-500/30 dark:bg-amber-500/15">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-600 dark:text-amber-400" />
        <span className="text-xs font-medium text-amber-800 dark:text-amber-300">
          Iniciando el servidor…
          <span className="ml-1 tabular-nums opacity-70">{segundos}s</span>
        </span>
      </div>
    </div>
  );
}
