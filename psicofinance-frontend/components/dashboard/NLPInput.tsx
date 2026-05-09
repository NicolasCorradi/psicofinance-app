"use client";

import { useState, useRef, useCallback } from "react";
import { ArrowUp, Paperclip, X, Sparkles } from "lucide-react";
import { enviarMensajeChat, procesarComprobante } from "@/lib/api";
import type { ChatResponse, DatosBorrador } from "@/lib/types";
import BorradorAprobacion from "./BorradorAprobacion";

interface Props { onTurnoCreado?: () => void }

const SUGERENCIAS = [
  "Atendí a Valentina hoy, $22.000 en efectivo",
  "Sesión con Diego, OSDE, $10.000",
  "¿Cuánto cobré este mes?",
];

export default function NLPInput({ onTurnoCreado }: Props) {
  const [texto, setTexto]         = useState("");
  const [adjunto, setAdjunto]     = useState(false);
  const [cargando, setCargando]   = useState(false);
  const [respuesta, setRespuesta] = useState<ChatResponse | null>(null);
  const [borrador, setBorrador]   = useState<DatosBorrador | null>(null);
  const [error, setError]         = useState<string | null>(null);
  const inputFileRef = useRef<HTMLInputElement>(null);
  const textareaRef  = useRef<HTMLTextAreaElement>(null);

  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 112)}px`;
  };

  const enviar = async () => {
    const msg = texto.trim();
    if (!msg || cargando) return;
    setCargando(true); setError(null);
    try {
      const res = await enviarMensajeChat(msg);
      setRespuesta(res); setTexto("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";
      if (res.accion === "turno_registrado") onTurnoCreado?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al conectar.");
    } finally { setCargando(false); }
  };

  const procesarArchivo = useCallback(async (f: File) => {
    setCargando(true); setError(null); setAdjunto(false);
    try { setBorrador(await procesarComprobante(f)); }
    catch (e) { setError(e instanceof Error ? e.message : "Error al analizar."); }
    finally { setCargando(false); }
  }, []);

  const usarSugerencia = (s: string) => {
    setTexto(s);
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        autoResize(textareaRef.current);
      }
    }, 0);
  };

  if (borrador) return (
    <BorradorAprobacion
      borrador={borrador}
      onAprobar={() => { setBorrador(null); onTurnoCreado?.(); }}
      onDescartar={() => setBorrador(null)}
    />
  );

  const idle = !respuesta && !error && !adjunto;

  return (
    <section className="overflow-hidden rounded-2xl shadow-sm ring-1 ring-black/5">

      {/* ── Cabecera con gradiente ── */}
      <div className="bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-900 px-5 pt-4 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-500/25 ring-1 ring-indigo-500/30">
              <Sparkles className="h-4 w-4 text-indigo-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Copiloto Financiero</p>
              <p className="text-xs text-white/40">Registrá turnos o consultá tus finanzas</p>
            </div>
          </div>
          {cargando && (
            <span className="flex items-center gap-1.5 text-xs text-white/40">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-400" />
              Analizando…
            </span>
          )}
        </div>
      </div>

      {/* ── Cuerpo ── */}
      <div className="bg-white">

        {/* Chips de sugerencia */}
        {idle && (
          <div className="flex flex-wrap gap-2 px-5 pt-4 pb-3">
            {SUGERENCIAS.map((s) => (
              <button
                key={s}
                onClick={() => usarSugerencia(s)}
                className="rounded-full border border-indigo-100 bg-indigo-50/60 px-3 py-1.5 text-xs text-indigo-700/70 transition-colors hover:border-indigo-300 hover:bg-indigo-100 hover:text-indigo-700"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Burbuja de respuesta */}
        {respuesta && (
          <div className="px-4 pt-4 pb-2">
            <div className="max-w-[92%] rounded-2xl rounded-tl-sm bg-indigo-50 px-4 py-3 ring-1 ring-indigo-100">
              <p className="text-sm leading-relaxed text-neutral-800">{respuesta.confirmacion}</p>
              {respuesta.accion === "turno_registrado" && respuesta.datos_extraidos && respuesta.datos_extraidos.paciente !== "Sin identificar" && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  <Tag>{respuesta.datos_extraidos.paciente}</Tag>
                  <Tag color="emerald">
                    ${respuesta.datos_extraidos.monto.toLocaleString("es-AR")}
                  </Tag>
                  {respuesta.datos_extraidos.obra_social && (
                    <Tag>{respuesta.datos_extraidos.obra_social}</Tag>
                  )}
                  {respuesta.paciente_nuevo && <Tag color="blue">Paciente nuevo</Tag>}
                </div>
              )}
            </div>
            <button
              onClick={() => setRespuesta(null)}
              className="mt-1.5 text-xs text-neutral-400 hover:text-neutral-600"
            >
              Nuevo mensaje
            </button>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mx-4 mt-3 mb-1 rounded-xl bg-red-50 px-3 py-2.5 ring-1 ring-red-100">
            <p className="text-xs text-red-500">{error}</p>
          </div>
        )}

        {/* Zona de adjunto */}
        {adjunto && (
          <div className="mx-4 mt-3 mb-1">
            <div
              onClick={() => inputFileRef.current?.click()}
              className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-indigo-200 bg-indigo-50/40 py-4 transition-colors hover:bg-indigo-50"
            >
              {cargando
                ? <span className="h-4 w-4 animate-spin rounded-full border border-indigo-200 border-t-indigo-500" />
                : <>
                    <Paperclip className="h-4 w-4 text-indigo-400" />
                    <span className="text-sm text-indigo-600/70">Seleccioná el comprobante</span>
                    <span className="text-xs text-indigo-300">JPG · PNG · PDF</span>
                  </>
              }
            </div>
            <input ref={inputFileRef} type="file" accept="image/*,.pdf" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) procesarArchivo(f); }} />
          </div>
        )}

        {/* Barra de input */}
        <div className="flex items-end gap-2 border-t border-neutral-100 bg-white px-3 py-2.5">
          <button
            onClick={() => setAdjunto(v => !v)}
            className={`mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-colors ${
              adjunto ? "bg-indigo-100 text-indigo-600" : "text-neutral-300 hover:text-neutral-500"
            }`}
            title="Subir comprobante"
          >
            {adjunto ? <X className="h-3.5 w-3.5" /> : <Paperclip className="h-3.5 w-3.5" />}
          </button>

          <textarea
            ref={textareaRef}
            value={texto}
            onChange={e => { setTexto(e.target.value); autoResize(e.target); }}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); }}}
            placeholder="Ej: ¿Cuánto cobré en marzo? ¿Cuándo vence Valentina?"
            rows={1}
            disabled={cargando}
            className="flex-1 resize-none bg-transparent py-1.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none disabled:opacity-40"
            style={{ maxHeight: "112px" }}
          />

          {cargando && (
            <span className="mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center">
              <span className="h-3 w-3 animate-spin rounded-full border border-indigo-200 border-t-indigo-500" />
            </span>
          )}

          {!cargando && (
            <button
              onClick={enviar}
              disabled={!texto.trim()}
              className="mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white transition-all hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-0"
            >
              <ArrowUp className="h-3.5 w-3.5 stroke-[2.5]" />
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function Tag({ children, color = "default" }: { children: React.ReactNode; color?: "default" | "emerald" | "blue" }) {
  const s = {
    default: "bg-neutral-100 text-neutral-600",
    emerald: "bg-emerald-100 text-emerald-700 font-medium",
    blue:    "bg-indigo-100 text-indigo-700",
  };
  return <span className={`rounded-full px-2.5 py-0.5 text-xs ${s[color]}`}>{children}</span>;
}
