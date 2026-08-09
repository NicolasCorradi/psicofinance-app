"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BrainCircuit, Lock, Mail, Eye, EyeOff, Loader2, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router   = useRouter();
  const supabase = createClient();

  const [email,     setEmail]     = useState("");
  const [password,  setPassword]  = useState("");
  const [mostrar,   setMostrar]   = useState(false);
  const [cargando,  setCargando]  = useState(false);
  const [error,     setError]     = useState("");

  // Flujo de "olvidé mi contraseña" — reemplaza el form de login por un pedido de mail
  const [modoReset,      setModoReset]      = useState(false);
  const [emailReset,     setEmailReset]     = useState("");
  const [enviandoReset,  setEnviandoReset]  = useState(false);
  const [resetEnviado,   setResetEnviado]   = useState(false);
  const [errorReset,     setErrorReset]     = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setCargando(true);

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError("Email o contraseña incorrectos. Intentá de nuevo.");
      setCargando(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorReset("");
    setEnviandoReset(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(emailReset, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setEnviandoReset(false);
    // No revelamos si el mail existe o no — solo confirmamos el envío
    if (err) { setErrorReset("No se pudo enviar el link. Intentá de nuevo."); return; }
    setResetEnviado(true);
  };

  return (
    <div className="auth-dark flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950 px-4">

      {/* Fondo decorativo */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-64 w-64 rounded-full bg-violet-500/10 blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">

        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/20 ring-2 ring-indigo-500/30 shadow-lg shadow-indigo-500/20">
            <BrainCircuit className="h-7 w-7 text-indigo-400" strokeWidth={1.5} />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight text-white">PsicoFinance</h1>
            {/* Antes decía solo "Ingresá a tu consultorio": para alguien que
                nunca vio la app (los psicólogos a los que se les manda el
                link) no explicaba qué es esto ni para qué sirve. */}
            <p className="mt-1 text-sm text-white/40">Turnos, cobros y monotributo en un solo lugar</p>
          </div>
        </div>

        {/* Card de login / reset */}
        <div className="overflow-hidden rounded-2xl bg-white/5 ring-1 ring-white/10 backdrop-blur-sm shadow-2xl">
          {!modoReset ? (
          <form onSubmit={handleLogin} className="p-6 flex flex-col gap-4">

            <p className="text-sm font-semibold text-white">Ingresá a tu consultorio</p>

            {/* Email */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-white/60">
                Email
              </label>
              <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 focus-within:border-indigo-500/60 focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all">
                <Mail className="h-4 w-4 shrink-0 text-white/30" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="tu@email.com"
                  autoComplete="email"
                  className="flex-1 bg-transparent text-sm text-white placeholder:text-white/25 focus:outline-none"
                />
              </div>
            </div>

            {/* Contraseña */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-xs font-medium text-white/60">
                  Contraseña
                </label>
                <button
                  type="button"
                  onClick={() => { setModoReset(true); setEmailReset(email); setError(""); }}
                  className="text-[11px] text-indigo-300/70 hover:text-indigo-300 transition-colors"
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 focus-within:border-indigo-500/60 focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all">
                <Lock className="h-4 w-4 shrink-0 text-white/30" />
                <input
                  type={mostrar ? "text" : "password"}
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="flex-1 bg-transparent text-sm text-white placeholder:text-white/25 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setMostrar(v => !v)}
                  className="text-white/30 hover:text-white/60 transition-colors"
                >
                  {mostrar ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-400 ring-1 ring-red-500/20">
                {error}
              </p>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={cargando}
              className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition-all hover:bg-indigo-500 disabled:opacity-60"
            >
              {cargando ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Ingresando…
                </>
              ) : (
                "Ingresar"
              )}
            </button>
          </form>
          ) : (
          <div className="p-6">
            {!resetEnviado ? (
              <form onSubmit={handleReset} className="flex flex-col gap-4">
                <div>
                  <p className="text-sm font-semibold text-white">Restablecer contraseña</p>
                  <p className="mt-1 text-xs text-white/40">Te mandamos un link para elegir una nueva.</p>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-white/60">Email</label>
                  <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 focus-within:border-indigo-500/60 focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all">
                    <Mail className="h-4 w-4 shrink-0 text-white/30" />
                    <input
                      type="email"
                      required
                      value={emailReset}
                      onChange={e => setEmailReset(e.target.value)}
                      placeholder="tu@email.com"
                      autoComplete="email"
                      className="flex-1 bg-transparent text-sm text-white placeholder:text-white/25 focus:outline-none"
                    />
                  </div>
                </div>
                {errorReset && (
                  <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-400 ring-1 ring-red-500/20">
                    {errorReset}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={enviandoReset}
                  className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition-all hover:bg-indigo-500 disabled:opacity-60"
                >
                  {enviandoReset ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Enviando…</>
                  ) : "Enviar link"}
                </button>
                <button
                  type="button"
                  onClick={() => { setModoReset(false); setErrorReset(""); }}
                  className="text-xs text-white/40 hover:text-white/70 transition-colors"
                >
                  ← Volver a ingresar
                </button>
              </form>
            ) : (
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-400" />
                <p className="text-sm font-medium text-white">Listo, revisá tu mail</p>
                <p className="text-xs text-white/40">
                  Si <span className="text-white/60">{emailReset}</span> tiene una cuenta, va a recibir un link para restablecer la contraseña.
                </p>
                <button
                  onClick={() => { setModoReset(false); setResetEnviado(false); }}
                  className="mt-2 text-xs text-indigo-300/70 hover:text-indigo-300 transition-colors"
                >
                  ← Volver a ingresar
                </button>
              </div>
            )}
          </div>
          )}
        </div>

        <p className="mt-6 text-center text-[11px] text-white/20">
          PsicoFinance · Gestión financiera para consultorios
        </p>
      </div>
    </div>
  );
}
