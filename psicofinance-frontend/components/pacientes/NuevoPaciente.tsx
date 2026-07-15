"use client";

import { useState } from "react";
import { X, UserPlus } from "lucide-react";
import { crearPaciente } from "@/lib/api";
import type { PacienteCreatePayload } from "@/lib/types";
import { isoHoy } from "@/lib/format";
import { useToast } from "@/lib/toast";

interface Props {
  onCreado:  () => void;
  onCancelar: () => void;
}

export default function NuevoPaciente({ onCreado, onCancelar }: Props) {
  const [form, setForm] = useState<PacienteCreatePayload>({
    nombre: "", apellido: "", email: null, telefono: null, honorario_actual: null,
  });
  const [guardando, setGuardando] = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const toast = useToast();

  const set = (k: keyof PacienteCreatePayload, v: string) =>
    setForm((f) => ({ ...f, [k]: v || null }));

  async function guardar() {
    if (guardando) return; // dos Enter rápidos crearían el paciente duplicado
    if (!form.nombre.trim() || !form.apellido.trim()) {
      setError("Nombre y apellido son obligatorios.");
      return;
    }
    setGuardando(true); setError(null);
    try {
      const payload: PacienteCreatePayload = {
        nombre:   form.nombre.trim(),
        apellido: form.apellido.trim(),
        email:    form.email?.trim() || null,
        telefono: form.telefono?.trim() || null,
        honorario_actual: form.honorario_actual
          ? parseFloat(String(form.honorario_actual).replace(",", ".")) || null
          : null,
        fecha_ultimo_ajuste_honorario:
          form.honorario_actual
            ? isoHoy()
            : null,
      };
      await crearPaciente(payload);
      toast.success(`${payload.nombre} ${payload.apellido} agregado`);
      onCreado();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al crear el paciente.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-sm" onClick={onCancelar} />

      {/* Modal */}
      <div className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl bg-white dark:bg-neutral-900 shadow-2xl ring-1 ring-black/5 dark:ring-white/10">

        {/* Header con gradiente */}
        <div className="bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-900 px-5 pt-5 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-500/25 ring-1 ring-indigo-500/30">
                <UserPlus className="h-4 w-4 text-indigo-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Nuevo paciente</p>
                <p className="text-[11px] text-white/40">Datos básicos para empezar</p>
              </div>
            </div>
            <button
              onClick={onCancelar}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-white/40 hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-5">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500">Nombre *</label>
                <input
                  autoFocus
                  value={form.nombre}
                  onChange={(e) => set("nombre", e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && guardar()}
                  className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 px-2.5 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  placeholder="María"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500">Apellido *</label>
                <input
                  value={form.apellido}
                  onChange={(e) => set("apellido", e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && guardar()}
                  className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 px-2.5 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  placeholder="García"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500">Email (opcional)</label>
              <input
                type="email"
                value={form.email ?? ""}
                onChange={(e) => set("email", e.target.value)}
                className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 px-2.5 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                placeholder="ejemplo@mail.com"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500">Celular (opcional)</label>
              <input
                type="tel"
                inputMode="tel"
                value={form.telefono ?? ""}
                onChange={(e) => set("telefono", e.target.value)}
                className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 px-2.5 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                placeholder="Ej: 11 2233-4455"
              />
              <p className="text-[10px] text-neutral-400 dark:text-neutral-500">Para enviar recordatorios de pago por WhatsApp.</p>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500">Honorario inicial $ (opcional)</label>
              <input
                type="number"
                min={1}
                value={form.honorario_actual ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, honorario_actual: e.target.value ? Number(e.target.value) : null }))}
                className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 px-2.5 py-2 text-sm tabular-nums focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                placeholder="Ej: 25000"
              />
            </div>
          </div>

          {error && (
            <div className="mt-3 rounded-xl bg-red-50 dark:bg-red-500/10 px-3 py-2 ring-1 ring-red-100 dark:ring-red-500/20">
              <p className="text-xs text-red-500 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Botones */}
          <div className="mt-5 flex gap-2">
            <button
              onClick={guardar}
              disabled={guardando}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-indigo-600 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-500 disabled:opacity-40"
            >
              {guardando
                ? <span className="h-3.5 w-3.5 animate-spin rounded-full border border-white/30 border-t-white" />
                : <UserPlus className="h-3.5 w-3.5" />
              }
              Crear paciente
            </button>
            <button
              onClick={onCancelar}
              className="rounded-xl border border-neutral-200 dark:border-neutral-800 px-4 py-2.5 text-sm text-neutral-500 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800/60"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
