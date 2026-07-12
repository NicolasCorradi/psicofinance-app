"use client";

import { useState } from "react";
import { X, Lock, KeyRound, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/lib/toast";

interface Props {
  onCerrar: () => void;
}

export default function CambiarPassword({ onCerrar }: Props) {
  const supabase = createClient();
  const toast = useToast();

  const [password,  setPassword]  = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error,     setError]     = useState("");

  async function guardar() {
    setError("");
    if (password.length < 6) { setError("La contraseña debe tener al menos 6 caracteres."); return; }
    if (password !== confirmar) { setError("Las contraseñas no coinciden."); return; }
    setGuardando(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setGuardando(false);
    if (err) { setError("No se pudo actualizar la contraseña. Intentá de nuevo."); return; }
    toast.success("Contraseña actualizada");
    onCerrar();
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-sm sm:p-4" onClick={onCerrar}>
      <div
        className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 animate-in slide-in-from-bottom duration-250 sm:slide-in-from-bottom-0"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-0 sm:hidden"><div className="h-1 w-10 rounded-full bg-neutral-200" /></div>
        <div className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50">
                <KeyRound className="h-4 w-4 text-indigo-500" />
              </div>
              <h3 className="text-sm font-semibold text-neutral-900">Cambiar contraseña</h3>
            </div>
            <button onClick={onCerrar} className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-neutral-500">Nueva contraseña</label>
              <div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100">
                <Lock className="h-4 w-4 shrink-0 text-neutral-400" />
                <input
                  autoFocus
                  type="password"
                  minLength={6}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  className="flex-1 bg-transparent text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-neutral-500">Confirmar contraseña</label>
              <div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100">
                <Lock className="h-4 w-4 shrink-0 text-neutral-400" />
                <input
                  type="password"
                  value={confirmar}
                  onChange={e => setConfirmar(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && guardar()}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  className="flex-1 bg-transparent text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {error && <p className="mt-3 text-xs text-red-500">{error}</p>}

          <div className="mt-5 flex gap-2">
            <button
              onClick={onCerrar}
              className="flex-1 rounded-xl border border-neutral-200 py-2.5 text-sm text-neutral-600 hover:bg-neutral-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={guardar}
              disabled={guardando}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60 transition-colors"
            >
              {guardando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
