"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { ArrowUp, Paperclip, X, Sparkles, Command, RotateCcw } from "lucide-react";
import { enviarMensajeChat, procesarComprobante } from "@/lib/api";
import type { ChatResponse, DatosBorrador, DatosExtraidos } from "@/lib/types";
import BorradorAprobacion from "./BorradorAprobacion";

interface Props { onTurnoCreado?: () => void }

type Mensaje = {
  tipo:           "user" | "bot";
  texto:          string;
  accion?:        string;
  datos?:         DatosExtraidos | null;
  pacienteNuevo?: boolean;
};

const SUGERENCIAS = [
  "Atendí a Valentina hoy, $22.000 en efectivo",
  "Sesión con Diego, OSDE, $10.000",
  "¿Cuánto cobré este mes?",
];

const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.platform);

export default function NLPInput({ onTurnoCreado }: Props) {
  const [texto,    setTexto]    = useState("");
  const [adjunto,  setAdjunto]  = useState(false);
  const [cargando, setCargando] = useState(false);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [borrador, setBorrador] = useState<DatosBorrador | null>(null);
  const [error,    setError]    = useState<string | null>(null);
  const [focused,  setFocused]  = useState(false);

  const inputFileRef  = useRef<HTMLInputElement>(null);
  const textareaRef   = useRef<HTMLTextAreaElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // CMD+K / Ctrl+K para enfocar
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        textareaRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Auto-scroll al último mensaje — solo dentro del contenedor, sin afectar la página
  useEffect(() => {
    if (mensajes.length > 0 && chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [mensajes]);

  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 112)}px`;
  };

  const enviar = async () => {
    const msg = texto.trim();
    if (!msg || cargando) return;

    const msgUsuario: Mensaje = { tipo: "user", texto: msg };
    setMensajes(prev => [...prev, msgUsuario]);
    setTexto("");
    setError(null);
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    setCargando(true);
    try {
      const historialParaApi = [...mensajes, msgUsuario].map(m => ({
        rol: m.tipo === "user" ? "user" : "assistant",
        texto: m.texto,
      }));
      const res: ChatResponse = await enviarMensajeChat(msg, historialParaApi);
      const msgBot: Mensaje = {
        tipo:           "bot",
        texto:          res.confirmacion,
        accion:         res.accion,
        datos:          res.datos_extraidos,
        pacienteNuevo:  res.paciente_nuevo,
      };
      setMensajes(prev => [...prev, msgBot]);
      if (res.accion === "turno_registrado") onTurnoCreado?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al conectar.");
      // Quitar el mensaje del usuario si falló
      setMensajes(prev => prev.slice(0, -1));
    } finally {
      setCargando(false);
    }
  };

  const procesarArchivo = useCallback(async (f: File) => {
    setCargando(true); setError(null); setAdjunto(false);
    try {
      const b = await procesarComprobante(f);
      setBorrador(b);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error al analizar el comprobante.";
      setError(`No se pudo leer el comprobante: ${msg}`);
    } finally {
      setCargando(false);
    }
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

  const limpiar = () => {
    setMensajes([]);
    setError(null);
    textareaRef.current?.focus();
  };

  if (borrador) return (
    <BorradorAprobacion
      borrador={borrador}
      onAprobar={() => { setBorrador(null); onTurnoCreado?.(); }}
      onDescartar={() => setBorrador(null)}
    />
  );

  const hayConversacion = mensajes.length > 0;

  return (
    <section
      className={`overflow-hidden rounded-2xl transition-all duration-200 ${
        focused
          ? "shadow-lg shadow-indigo-500/10 ring-2 ring-indigo-400/40"
          : "shadow-sm ring-1 ring-black/5"
      }`}
    >
      {/* Cabecera */}
      <div className="bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-900 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-500/20 ring-1 ring-indigo-400/30">
              <Sparkles className="h-4 w-4 text-indigo-300" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Copiloto Financiero</p>
              <p className="text-[11px] text-white/40">Registrá turnos o consultá tus finanzas</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {cargando && (
              <span className="flex items-center gap-1.5 text-[11px] text-white/40">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-400" />
                Analizando…
              </span>
            )}
            {hayConversacion && !cargando && (
              <button
                onClick={limpiar}
                className="flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-white/30 hover:text-white/60 transition-colors"
                title="Limpiar conversación"
              >
                <RotateCcw className="h-2.5 w-2.5" /> Limpiar
              </button>
            )}
            <div className="hidden sm:flex items-center gap-0.5 rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5">
              {isMac
                ? <Command className="h-2.5 w-2.5 text-white/30" />
                : <span className="text-[10px] text-white/30 font-mono">Ctrl</span>
              }
              <span className="text-[10px] text-white/30 font-mono">K</span>
            </div>
          </div>
        </div>
      </div>

      {/* Cuerpo */}
      <div className="bg-white">

        {/* Historial de conversación */}
        {hayConversacion && (
          <div ref={chatContainerRef} className="max-h-72 overflow-y-auto px-4 py-3 flex flex-col gap-3">
            {mensajes.map((m, i) => (
              <div key={i} className={`flex ${m.tipo === "user" ? "justify-end" : "justify-start"}`}>
                {m.tipo === "user" ? (
                  <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-indigo-600 px-3.5 py-2.5">
                    <p className="text-sm text-white">{m.texto}</p>
                  </div>
                ) : (
                  <div className="max-w-[90%] rounded-2xl rounded-tl-sm bg-indigo-50 px-3.5 py-2.5 ring-1 ring-indigo-100">
                    <p className="text-sm leading-relaxed text-neutral-800">{m.texto}</p>
                    {m.accion === "turno_registrado" && m.datos && m.datos.paciente !== "Sin identificar" && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Tag>{m.datos.paciente}</Tag>
                        {m.datos.monto > 0 && <Tag color="emerald">${m.datos.monto.toLocaleString("es-AR")}</Tag>}
                        {m.datos.obra_social && <Tag>{m.datos.obra_social}</Tag>}
                        {m.datos.medio_pago && (
                          <Tag>{{ EFECTIVO: "Efectivo", TRANSFERENCIA: "Transfe", MERCADO_PAGO: "MP", TARJETA: "Tarjeta", OTRO: "Otro" }[m.datos.medio_pago] ?? m.datos.medio_pago}</Tag>
                        )}
                        {m.datos.tipo_sesion && m.datos.tipo_sesion !== "SESION" && (
                          <Tag>{{ INASISTENCIA_JUSTIFICADA: "Canceló", INASISTENCIA_INJUSTIFICADA: "Faltó", CANCELACION_PROFESIONAL: "Cancelé" }[m.datos.tipo_sesion] ?? ""}</Tag>
                        )}
                        {m.pacienteNuevo && <Tag color="blue">Paciente nuevo</Tag>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Chips de sugerencia (solo si no hay conversación) */}
        {!hayConversacion && (
          <div className="flex flex-wrap gap-2 px-4 pt-3 pb-2">
            {SUGERENCIAS.map((s) => (
              <button
                key={s}
                onClick={() => usarSugerencia(s)}
                className="rounded-full border border-indigo-100 bg-indigo-50/60 px-3 py-1 text-xs text-indigo-600/70 transition-all hover:border-indigo-300 hover:bg-indigo-100 hover:text-indigo-700 hover:shadow-sm"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mx-4 mt-3 mb-1 rounded-xl bg-red-50 px-3 py-2.5 ring-1 ring-red-100">
            <p className="text-xs text-red-600">{error}</p>
            <button onClick={() => setError(null)} className="mt-1 text-[10px] text-red-400 hover:text-red-600">Cerrar</button>
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
        <div className={`flex items-end gap-2 px-3 py-2.5 border-t ${hayConversacion ? "border-neutral-100" : "border-neutral-100"}`}>
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
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={hayConversacion ? "Continuá la consulta…" : "Ej: ¿Cuánto cobré en marzo?"}
            rows={1}
            disabled={cargando}
            className="flex-1 resize-none bg-transparent py-1.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none disabled:opacity-40"
            style={{ maxHeight: "112px" }}
          />

          {texto.trim() && !cargando && (
            <span className="mb-0.5 shrink-0 rounded border border-neutral-200 bg-neutral-50 px-1.5 py-0.5 text-[10px] text-neutral-400 font-mono">
              ↵
            </span>
          )}

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
