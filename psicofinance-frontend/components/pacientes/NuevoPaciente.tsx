"use client";

import { useState } from "react";
import { X, UserPlus } from "lucide-react";
import { crearPaciente } from "@/lib/api";
import type { PacienteCreatePayload } from "@/lib/types";

interface Props {
  onCreado:  () => void;
  onCancelar: () => void;
}

export default function NuevoPaciente({ onCreado, onCancelar }: Props) {
  const [form, setForm] = useState<PacienteCreatePayload>({
    nombre: "", apellido: "", email: null, honorario_actual: null,
  });
  const [guardando, setGuardando] = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  const set = (k: keyof PacienteCreatePayload, v: string) =>
    setForm((f) => ({ ...f, [k]: v || null }));

  async function guardar() {
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
        honorario_actual: form.honorario_actual
          ? parseFloat(String(form.honorario_actual).replace(",", ".")) || null
          : null,
        fecha_ultimo_ajuste_honorario:
          form.honorario_actual
            ? new Date().toISOString().split("T")[0]
            : null,
      };
      await crearPaciente(payload);
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
      <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px]" onClick={onCancelar} />

      {/* Modal */}
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-2xl">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-neutral-900">
              <UserPlus className="h-3.5 w-3.5 text-white" />
            </div>
            <p className="text-sm font-semibold text-neutral-900">Nuevo paciente</p>
          </div>
          <button onClick={onCancelar} className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Campos */}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase text-neutral-400">Nombre *</label>
              <input
                autoFocus
                value={form.nombre}
                onChange={(e) => set("nombre", e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && guardar()}
                className="rounded-lg border border-neutral-200 px-2.5 py-2 text-sm focus:border-neutral-400 focus:outline-none"
                placeholder="María"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase text-neutral-400">Apellido *</label>
              <input
                value={form.apellido}
                onChange={(e) => set("apellido", e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && guardar()}
                className="rounded-lg border border-neutral-200 px-2.5 py-2 text-sm focus:border-neutral-400 focus:outline-none"
                placeholder="García"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-medium uppercase text-neutral-400">Email (opcional)</label>
            <input
              type="email"
              value={form.email ?? ""}
              onChange={(e) => set("email", e.target.value)}
              className="rounded-lg border border-neutral-200 px-2.5 py-2 text-sm focus:border-neutral-400 focus:outline-none"
              placeholder="ejemplo@mail.com"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-medium uppercase text-neutral-400">Honorario inicial $ (opcional)</label>
            <input
              type="number"
              min={1}
              value={form.honorario_actual ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, honorario_actual: e.target.value ? Number(e.target.value) : null }))}
              className="rounded-lg border border-neutral-200 px-2.5 py-2 text-sm tabular-nums focus:border-neutral-400 focus:outline-none"
              placeholder="Ej: 25000"
            />
          </div>
        </div>

        {error && (
          <p className="mt-3 text-xs text-red-500">{error}</p>
        )}

        {/* Botones */}
        <div className="mt-5 flex gap-2">
          <button
            onClick={guardar}
            disabled={guardando}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-neutral-900 py-2.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-40"
          >
            {guardando
              ? <span className="h-3.5 w-3.5 animate-spin rounded-full border border-white/30 border-t-white" />
              : <UserPlus className="h-3.5 w-3.5" />
            }
            Crear paciente
          </button>
          <button
            onClick={onCancelar}
            className="rounded-xl border border-neutral-200 px-4 py-2.5 text-sm text-neutral-500 hover:bg-neutral-50"
          >
            Cancelar
          </button>
        </div>
      </div>
    </>
  );
}
