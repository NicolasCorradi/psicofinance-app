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

  const conHonorario = pacientes.filter(p => p.honorario_actual && p.honorario_actual > 0);
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
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-400">
            Simulador de ajuste
          </p>
          <p className="mt-0.5 text-sm font-semibold text-neutral-800">¿Cuánto ganarías con el ajuste?</p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100">
          <Calculator className="h-4 w-4 text-violet-600" />
        </div>
      </div>

      {/* Input de porcentaje */}
      <div className="mb-4">
        <label className="mb-1.5 block text-xs font-medium text-neutral-600">
          % de aumento (ej: IPC del mes)
        </label>
        <div className="flex items-center gap-2">
          <div className="flex flex-1 items-center rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-100">
            <input
              type="number"
              min={0}
              max={500}
              step={0.5}
              value={pct}
              onChange={e => setPct(e.target.value)}
              className="flex-1 bg-transparent text-sm font-semibold text-neutral-900 focus:outline-none tabular-nums"
              placeholder="0"
            />
            <span className="ml-1 text-sm font-medium text-neutral-400">%</span>
          </div>
          {/* Sugerencias rápidas */}
          <div className="flex gap-1">
            {["5", "10", "15"].map(v => (
              <button
                key={v}
                onClick={() => setPct(v)}
                className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  pct === v
                    ? "border-violet-300 bg-violet-100 text-violet-700"
                    : "border-neutral-200 text-neutral-500 hover:border-violet-200 hover:bg-violet-50"
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
          {[1, 2].map(i => <div key={i} className="h-12 animate-pulse rounded-xl bg-neutral-100" />)}
        </div>
      ) : conHonorario.length === 0 ? (
        <div className="rounded-xl bg-neutral-50 p-4 text-center text-xs text-neutral-400">
          Configurá el honorario base en los pacientes para usar el simulador.
        </div>
      ) : activos.length === 0 ? (
        <div className="rounded-xl bg-neutral-50 p-4 text-center text-xs text-neutral-400">
          Sin sesiones registradas este mes: registrá sesiones para proyectar el ajuste.
        </div>
      ) : (
        <>
          {/* Cards de comparación */}
          <div className="mb-4 grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-neutral-50 p-3 text-center">
              <p className="text-[10px] text-neutral-400 uppercase tracking-wide">Actual</p>
              <p className="mt-1 text-base font-bold tabular-nums text-neutral-700">{fmtPesos(ingresoActual)}</p>
            </div>
            <div className="flex flex-col items-center justify-center">
              <TrendingUp className="h-4 w-4 text-violet-500" />
              <span className="mt-0.5 text-xs font-bold text-violet-600">+{ajuste}%</span>
            </div>
            <div className="rounded-xl bg-violet-50 p-3 text-center ring-1 ring-violet-200/60">
              <p className="text-[10px] text-violet-500 uppercase tracking-wide">Proyectado</p>
              <p className="mt-1 text-base font-bold tabular-nums text-violet-700">{fmtPesos(ingresoNuevo)}</p>
            </div>
          </div>

          {/* Diferencia mensual */}
          <div className="mb-3 flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-2.5 ring-1 ring-emerald-200/50">
            <span className="text-xs font-medium text-emerald-700">Ingreso adicional mensual</span>
            <span className="text-sm font-bold tabular-nums text-emerald-700">
              +{fmtPesos(diferencia)}
            </span>
          </div>
          <p className="mb-3 text-[10px] text-neutral-400">
            Proyección basada en sesiones del mes actual × honorario ajustado.
            {inactivos > 0 && ` Excluye ${inactivos} paciente${inactivos > 1 ? "s" : ""} sin sesiones este mes.`}
          </p>

          {/* Tabla de pacientes */}
          <div className="overflow-hidden rounded-xl border border-neutral-100">
            <div className="grid grid-cols-3 border-b border-neutral-100 bg-neutral-50 px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-neutral-400">
              <span>Paciente</span>
              <span className="text-right">Honorario actual</span>
              <span className="text-right text-violet-600">Ajustado</span>
            </div>
            {topPacientes.map(p => (
              <div key={p.id} className="grid grid-cols-3 border-b border-neutral-50 px-3 py-2 text-xs last:border-0">
                <div className="truncate">
                  <span className="font-medium text-neutral-700">{p.nombre} {p.apellido[0]}.</span>
                  <span className="ml-1 text-[10px] text-neutral-400">×{p.sesiones_mes}</span>
                </div>
                <span className="text-right tabular-nums text-neutral-500">
                  {fmtPesos(calcIngreso(p, p.honorario_actual ?? 0))}
                </span>
                <span className="text-right tabular-nums font-semibold text-violet-700">
                  {fmtPesos(calcIngreso(p, (p.honorario_actual ?? 0) * (1 + ajuste / 100)))}
                </span>
              </div>
            ))}
            {activos.length > 6 && (
              <div className="px-3 py-2 text-center text-[10px] text-neutral-400">
                +{activos.length - 6} pacientes más
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
