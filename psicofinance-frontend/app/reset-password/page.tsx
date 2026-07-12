"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Eye, EyeOff, Loader2, CheckCircle2, KeyRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router   = useRouter();
  const supabase = createClient();

  const [verificando, setVerificando] = useState(true);
  const [listo,       setListo]       = useState(false);
  const [password,    setPassword]    = useState("");
  const [confirmar,   setConfirmar]   = useState("");
  const [mostrar,     setMostrar]     = useState(false);
  const [guardando,   setGuardando]   = useState(false);
  const [error,       setError]       = useState("");
  const [exito,       setExito]       = useState(false);

  // El link del mail crea una sesión temporal de tipo "recovery". La detectamos
  // vía el evento PASSWORD_RECOVERY, y también chequeamos la sesión actual por
  // si el evento ya disparó antes de que el listener se registrara.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setListo(true);
        setVerificando(false);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setListo(true);
      setVerificando(false);
    });

    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (password !== confirmar) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setGuardando(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setGuardando(false);
    if (err) {
      setError("No se pudo actualizar la contraseña. Probá pedir el link de nuevo.");
      return;
    }
    setExito(true);
    setTimeout(() => {
      router.push("/dashboard");
      router.refresh();
    }, 1800);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950 px-4">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-64 w-64 rounded-full bg-violet-500/10 blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/20 ring-2 ring-indigo-500/30 shadow-lg shadow-indigo-500/20">
            <KeyRound className="h-7 w-7 text-indigo-400" strokeWidth={1.5} />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight text-white">Nueva contraseña</h1>
            <p className="mt-1 text-sm text-white/40">Elegí una contraseña para tu cuenta</p>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl bg-white/5 ring-1 ring-white/10 backdrop-blur-sm shadow-2xl">
          <div className="p-6">

            {verificando && (
              <div className="flex flex-col items-center gap-3 py-6">
                <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
                <p className="text-sm text-white/50">Verificando el link…</p>
              </div>
            )}

            {!verificando && !listo && !exito && (
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <p className="text-sm text-white/70">
                  Este link no es válido o ya expiró.
                </p>
                <p className="text-xs text-white/40">
                  Pedí uno nuevo desde la pantalla de inicio de sesión.
                </p>
                <button
                  onClick={() => router.push("/")}
                  className="mt-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
                >
                  Volver al login
                </button>
              </div>
            )}

            {!verificando && listo && !exito && (
              <form onSubmit={guardar} className="flex flex-col gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-white/60">
                    Nueva contraseña
                  </label>
                  <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 focus-within:border-indigo-500/60 focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all">
                    <Lock className="h-4 w-4 shrink-0 text-white/30" />
                    <input
                      type={mostrar ? "text" : "password"}
                      required
                      minLength={6}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="new-password"
                      className="flex-1 bg-transparent text-sm text-white placeholder:text-white/25 focus:outline-none"
                    />
                    <button type="button" onClick={() => setMostrar(v => !v)} className="text-white/30 hover:text-white/60 transition-colors">
                      {mostrar ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-white/60">
                    Confirmar contraseña
                  </label>
                  <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 focus-within:border-indigo-500/60 focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all">
                    <Lock className="h-4 w-4 shrink-0 text-white/30" />
                    <input
                      type={mostrar ? "text" : "password"}
                      required
                      value={confirmar}
                      onChange={e => setConfirmar(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="new-password"
                      className="flex-1 bg-transparent text-sm text-white placeholder:text-white/25 focus:outline-none"
                    />
                  </div>
                </div>

                {error && (
                  <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-400 ring-1 ring-red-500/20">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={guardando}
                  className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition-all hover:bg-indigo-500 disabled:opacity-60"
                >
                  {guardando ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Guardando…
                    </>
                  ) : "Guardar contraseña"}
                </button>
              </form>
            )}

            {exito && (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-400" />
                <p className="text-sm font-medium text-white">Contraseña actualizada</p>
                <p className="text-xs text-white/40">Entrando a tu cuenta…</p>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
