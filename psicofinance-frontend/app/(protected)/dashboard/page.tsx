"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, WifiOff, Sparkles } from "lucide-react";
import { getMetricasDashboard, getResumenEgresos } from "@/lib/api";
import type { MetricasDashboard, ResumenEgresos } from "@/lib/types";

import NLPInput            from "@/components/dashboard/NLPInput";
import IngresoNetoHero     from "@/components/dashboard/IngresoNetoHero";
import CashFlowCards       from "@/components/dashboard/CashFlowCards";
import VentasMensuales     from "@/components/dashboard/VentasMensuales";
import MonotributoProgress from "@/components/dashboard/MonotributoProgress";
import MiniAgenda          from "@/components/dashboard/MiniAgenda";
import AlertasHonorarios   from "@/components/dashboard/AlertasHonorarios";
import TurnosTable         from "@/components/dashboard/TurnosTable";
import SimuladorHonorarios from "@/components/dashboard/SimuladorHonorarios";
import GuiaDashboard       from "@/components/dashboard/GuiaDashboard";

// ── Helpers ───────────────────────────────────────────────────────────────────

function saludo(): string {
  const h = new Date().getHours();
  if (h >= 6  && h < 12) return "Buenos días";
  if (h >= 12 && h < 20) return "Buenas tardes";
  return "Buenas noches";
}

// ── Pantalla de error ─────────────────────────────────────────────────────────

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 ring-1 ring-red-100">
        <WifiOff className="h-6 w-6 text-red-400" />
      </div>
      <div>
        <p className="text-sm font-semibold text-neutral-700">No se pudo conectar con el servidor</p>
        <p className="mt-1 text-xs text-neutral-400">Revisá tu conexión o intentá de nuevo</p>
      </div>
      <button
        onClick={onRetry}
        className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Reintentar
      </button>
    </div>
  );
}

// ── Empty state (primera vez) ─────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-neutral-200 bg-white px-6 py-12 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 ring-1 ring-indigo-100">
        <Sparkles className="h-6 w-6 text-indigo-500" />
      </div>
      <div>
        <p className="text-base font-bold text-neutral-800">¡Bienvenido a PsicoFinance!</p>
        <p className="mt-1.5 text-sm text-neutral-500 max-w-xs mx-auto">
          Empezá registrando tu primera sesión con el Copiloto. Escribí algo como{" "}
          <span className="font-medium text-indigo-600">"Juan me pagó $20.000 hoy"</span>.
        </p>
      </div>
      <div className="mt-2 flex items-center gap-2 text-xs text-neutral-400">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-white text-[10px] font-bold">↑</span>
        Usá el campo de arriba
      </div>
    </div>
  );
}

// ── Página ────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [metricas,   setMetricas]   = useState<MetricasDashboard | null>(null);
  const [cargando,   setCargando]   = useState(true);
  const [error,      setError]      = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Resumen de egresos — alimenta tanto el hero de ingreso neto como la card de Egresos
  const [resumenEgresos, setResumenEgresos] = useState<ResumenEgresos | null>(null);
  const [errorEgresos,   setErrorEgresos]   = useState(false);

  // En cliente tras montar: a nivel de módulo quedaba vieja después de
  // medianoche y podía diferir entre servidor y cliente (hydration mismatch)
  const [fechaCompleta, setFechaCompleta] = useState("");
  useEffect(() => {
    setFechaCompleta(new Date().toLocaleDateString("es-AR", {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
    }));
  }, []);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(false);
    try {
      setMetricas(await getMetricasDashboard());
    } catch {
      setError(true);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar, refreshKey]);

  useEffect(() => {
    getResumenEgresos()
      .then(r => { setResumenEgresos(r); setErrorEgresos(false); })
      .catch(() => setErrorEgresos(true));
  }, [refreshKey]);

  const handleTurnoCreado = () => setRefreshKey(k => k + 1);

  const esVacio = !cargando && !error && metricas && metricas.ultimos_turnos.length === 0;

  return (
    <main className="mx-auto max-w-screen-lg px-4 py-6 lg:py-8">

      {/* ── Header con saludo ── */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="bg-gradient-to-r from-neutral-900 via-indigo-800 to-neutral-900 bg-clip-text text-2xl font-extrabold tracking-tight text-transparent">
            {saludo()} 👋
          </h1>
          <p className="mt-0.5 text-xs text-neutral-400 capitalize">{fechaCompleta}</p>
        </div>
        {/* Botones header */}
        <div className="flex items-center gap-2 shrink-0">
          <GuiaDashboard />
          {!error && (
            <button
              onClick={() => setRefreshKey(k => k + 1)}
              disabled={cargando}
              aria-busy={cargando}
              className="flex items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-medium text-neutral-500 hover:bg-neutral-50 transition-colors disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${cargando ? "animate-spin" : ""}`} />
              Actualizar
            </button>
          )}
        </div>
      </div>

      {/* ── Error state ── */}
      {error && <ErrorState onRetry={cargar} />}

      {/* ── Contenido ── */}
      {!error && (
        <div className="flex flex-col gap-4">

          {/* Copiloto NLP */}
          <div className="animate-in fade-in slide-in-from-bottom-3 duration-400">
            <NLPInput
              onTurnoCreado={handleTurnoCreado}
              ultimoPaciente={metricas?.ultimos_turnos?.[0]?.paciente_nombre}
            />
          </div>

          {/* Empty state */}
          {esVacio && <EmptyState />}

          {/* Hero: ingreso neto del mes — el número más accionable, destacado */}
          <div className="animate-in fade-in slide-in-from-bottom-3 duration-400" style={{ animationDelay: "80ms" }}>
            <IngresoNetoHero
              cobradoMes={metricas?.cobrado_mes ?? null}
              resumenEgresos={resumenEgresos}
              errorEgresos={errorEgresos}
            />
          </div>

          {/* Métricas secundarias */}
          <div className="animate-in fade-in slide-in-from-bottom-3 duration-400" style={{ animationDelay: "110ms" }}>
            <CashFlowCards metricas={metricas} resumenEgresos={resumenEgresos} />
          </div>

          {/* Gráfico + Monotributo */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 animate-in fade-in slide-in-from-bottom-3 duration-400" style={{ animationDelay: "150ms" }}>
            <div className="lg:col-span-2">
              <VentasMensuales data={metricas?.ventas_mensuales ?? []} />
            </div>
            <MonotributoProgress refreshKey={refreshKey} />
          </div>

          {/* Mini agenda + Alertas */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 animate-in fade-in slide-in-from-bottom-3 duration-400" style={{ animationDelay: "220ms" }}>
            <MiniAgenda refreshKey={refreshKey} />
            <AlertasHonorarios refreshKey={refreshKey} />
          </div>

          {/* Simulador */}
          <div className="animate-in fade-in slide-in-from-bottom-3 duration-400" style={{ animationDelay: "280ms" }}>
            <SimuladorHonorarios refreshKey={refreshKey} />
          </div>

          {/* Tabla de turnos */}
          {!esVacio && (
            <TurnosTable
              turnos={metricas?.ultimos_turnos ?? []}
              cargando={cargando}
              onRefresh={handleTurnoCreado}
            />
          )}

        </div>
      )}
    </main>
  );
}
