"use client";

import { useEffect, useState } from "react";
import { TrendingUp, Calculator } from "lucide-react";
import { getPacientes } from "@/lib/api";
import type { PacienteConStats } from "@/lib/types";
import { fmtPesosCompacto as fmtPesos } from "@/lib/format";

export default function SimuladorHonorarios({ refreshKey = 0 }: { refreshKey?: number }) {
  const [pacientes, setPacientes] = useState<PacienteConStats[]>([]);
  const [pct,       setPct]       = useState<string>("10");
  const [cargando,  setCargando]  = useState(true);

  useEffect(() => {
    getPacientes()
      .then(setPacientes)
      .catch(() => {})
      .finally(() => setCargando(false));
  }, [refreshKey]);

  // Pacientes en USD quedan afuera: el % simulado es un ajuste por inflación
  // en pesos (ej. IPC del mes), que no tiene sentido aplicarle a un honorario
  // ya dolarizado.
  const enUsd = pacientes.filter(p => p.honorario_actual && p.honorario_actual > 0 && p.moneda === "USD").length;
  const conHonorario = pacientes.filter(p => p.honorario_actual && p.honorario_actual > 0 && p.moneda !== "USD");
  // Solo pacientes con sesiones este mes: contar inactivos como 1 sesión
  // inflaba el ingreso "Actual" y el adicional proyectado
  const activos = conHonorario.filter(p => p.sesiones_mes > 0);
  const inactivos = conHonorario.length - activos.length;

  const ajuste = Math.max(0, Math.min(Number(pct) || 0, 500));

  // Ingreso mensual realista = honorario × sesiones de este mes
  const calcIngreso = (p: PacienteConStats, honorario: number) =>
    honorario * p.sesiones_mes;

  const ingresoActual = activos.reduce(
    (s, p) => s + calcIngreso(p, p.honorario_actual ?? 0), 0
  );
  const ingresoNuevo = activos.reduce(
    (s, p) => s + calcIngreso(p, (p.honorario_actual ?? 0) * (1 + ajuste / 100)), 0
  );
  const diferencia = ingresoNuevo - ingresoActual;

  // Top pacientes para mostrar la tabla de simulación
  const topPacientes = [...activos]
    .sort((a, b) => (b.honorario_actual ?? 0) - (a.honorario_actual ?? 0))
    .slice(0, 6);

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5 dark:bg-slate-900 dark:ring-white/10">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-400 dark:text-slate-500">
            Simulador de ajuste
          </p>
          <p className="mt-0.5 text-sm font-semibold text-neutral-800 dark:text-slate-100">¿Cuánto ganarías con el ajuste?</p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-500/15">
          <Calculator className="h-4 w-4 text-violet-600 dark:text-violet-400" />
        </div>
      </div>

      {/* Input de porcentaje */}
      <div className="mb-4">
        <label className="mb-1.5 block text-xs font-medium text-neutral-600 dark:text-slate-300">
          % de aumento (ej: IPC del mes)
        </label>
        <div className="flex items-center gap-2">
          <div className="flex flex-1 items-center rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-100 dark:border-slate-700 dark:bg-slate-800 dark:focus-within:border-violet-500 dark:focus-within:ring-violet-500/20">
            <input
              type="number"
              min={0}
              max={500}
              step={0.5}
              value={pct}
              onChange={e => setPct(e.target.value)}
              className="flex-1 bg-transparent text-sm font-semibold text-neutral-900 focus:outline-none tabular-nums dark:text-slate-100"
              placeholder="0"
            />
            <span className="ml-1 text-sm font-medium text-neutral-400 dark:text-slate-500">%</span>
          </div>
          {/* Sugerencias rápidas */}
          <div className="flex gap-1">
            {["5", "10", "15"].map(v => (
              <button
                key={v}
                onClick={() => setPct(v)}
                className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  pct === v
                    ? "border-violet-300 bg-violet-100 text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/15 dark:text-violet-400"
                    : "border-neutral-200 text-neutral-500 hover:border-violet-200 hover:bg-violet-50 dark:border-slate-700 dark:text-slate-400 dark:hover:border-violet-500/20 dark:hover:bg-violet-500/10"
                }`}
              >
                {v}%
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Resultado comparativo */}
      {cargando ? (
        <div className="space-y-2">
          {[1, 2].map(i => <div key={i} className="h-12 animate-pulse rounded-xl bg-neutral-100 dark:bg-slate-800" />)}
        </div>
      ) : conHonorario.length === 0 ? (
        <div className="rounded-xl bg-neutral-50 p-4 text-center text-xs text-neutral-400 dark:bg-slate-800/40 dark:text-slate-500">
          Configurá el honorario base en los pacientes para usar el simulador.
        </div>
      ) : activos.length === 0 ? (
        <div className="rounded-xl bg-neutral-50 p-4 text-center text-xs text-neutral-400 dark:bg-slate-800/40 dark:text-slate-500">
          Sin sesiones registradas este mes: registrá sesiones para proyectar el ajuste.
        </div>
      ) : (
        <>
          {/* Cards de comparación */}
          <div className="mb-4 grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-neutral-50 p-3 text-center dark:bg-slate-800/40">
              <p className="text-[10px] text-neutral-400 uppercase tracking-wide dark:text-slate-500">Actual</p>
              <p className="mt-1 text-base font-bold tabular-nums text-neutral-700 dark:text-slate-300">{fmtPesos(ingresoActual)}</p>
            </div>
            <div className="flex flex-col items-center justify-center">
              <TrendingUp className="h-4 w-4 text-violet-500 dark:text-violet-400" />
              <span className="mt-0.5 text-xs font-bold text-violet-600 dark:text-violet-400">+{ajuste}%</span>
            </div>
            <div className="rounded-xl bg-violet-50 p-3 text-center ring-1 ring-violet-200/60 dark:bg-violet-500/10 dark:ring-violet-500/20">
              <p className="text-[10px] text-violet-500 uppercase tracking-wide dark:text-violet-400">Proyectado</p>
              <p className="mt-1 text-base font-bold tabular-nums text-violet-700 dark:text-violet-400">{fmtPesos(ingresoNuevo)}</p>
            </div>
          </div>

          {/* Diferencia mensual */}
          <div className="mb-3 flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-2.5 ring-1 ring-emerald-200/50 dark:bg-emerald-500/10 dark:ring-emerald-500/20">
            <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Ingreso adicional mensual</span>
            <span className="text-sm font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
              +{fmtPesos(diferencia)}
            </span>
          </div>
          <p className="mb-3 text-[10px] text-neutral-400 dark:text-slate-500">
            Proyección basada en sesiones del mes actual × honorario ajustado.
            {inactivos > 0 && ` Excluye ${inactivos} paciente${inactivos > 1 ? "s" : ""} sin sesiones este mes.`}
            {enUsd > 0 && ` Excluye ${enUsd} en USD (no aplica ajuste por inflación).`}
          </p>

          {/* Tabla de pacientes */}
          <div className="overflow-hidden rounded-xl border border-neutral-100 dark:border-slate-800">
            <div className="grid grid-cols-3 border-b border-neutral-100 bg-neutral-50 px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-neutral-400 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-500">
              <span>Paciente</span>
              <span className="text-right">Honorario actual</span>
              <span className="text-right text-violet-600 dark:text-violet-400">Ajustado</span>
            </div>
            {topPacientes.map(p => (
              <div key={p.id} className="grid grid-cols-3 border-b border-neutral-50 px-3 py-2 text-xs last:border-0 dark:border-slate-800">
                <div className="truncate">
                  <span className="font-medium text-neutral-700 dark:text-slate-300">{p.nombre} {p.apellido[0]}.</span>
                  <span className="ml-1 text-[10px] text-neutral-400 dark:text-slate-500">×{p.sesiones_mes}</span>
                </div>
                <span className="text-right tabular-nums text-neutral-500 dark:text-slate-400">
                  {fmtPesos(calcIngreso(p, p.honorario_actual ?? 0))}
                </span>
                <span className="text-right tabular-nums font-semibold text-violet-700 dark:text-violet-400">
                  {fmtPesos(calcIngreso(p, (p.honorario_actual ?? 0) * (1 + ajuste / 100)))}
                </span>
              </div>
            ))}
            {activos.length > 6 && (
              <div className="px-3 py-2 text-center text-[10px] text-neutral-400 dark:text-slate-500">
                +{activos.length - 6} pacientes más
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
