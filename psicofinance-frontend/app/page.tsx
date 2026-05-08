"use client";

// Dashboard principal — estado centralizado, un solo fetch de métricas.
// Todos los widgets reciben datos por props; ninguno hace fetch propio.

import { useState, useEffect, useCallback } from "react";
import { getMetricasDashboard } from "@/lib/api";
import type { MetricasDashboard } from "@/lib/types";

import Navbar             from "@/components/layout/Navbar";
import NLPInput           from "@/components/dashboard/NLPInput";
import CashFlowCards      from "@/components/dashboard/CashFlowCards";
import VentasMensuales    from "@/components/dashboard/VentasMensuales";
import MonotributoProgress from "@/components/dashboard/MonotributoProgress";
import InflacionWidget    from "@/components/dashboard/InflacionWidget";
import AlertasHonorarios  from "@/components/dashboard/AlertasHonorarios";
import TurnosTable        from "@/components/dashboard/TurnosTable";

export default function DashboardPage() {
  const [metricas,    setMetricas]    = useState<MetricasDashboard | null>(null);
  const [refreshKey,  setRefreshKey]  = useState(0);

  const cargar = useCallback(async () => {
    try {
      setMetricas(await getMetricasDashboard());
    } catch {
      // Silenciamos — los widgets muestran skeleton hasta que lleguen datos.
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar, refreshKey]);

  const handleTurnoCreado = () => setRefreshKey((k) => k + 1);

  return (
    <>
      <Navbar />

      <main className="mx-auto max-w-screen-lg px-4 py-6">
        <div className="flex flex-col gap-4">

          {/* Copiloto NLP */}
          <NLPInput onTurnoCreado={handleTurnoCreado} />

          {/* Métricas cash flow */}
          <CashFlowCards metricas={metricas} />

          {/* Gráfico de ventas (2/3) + Progreso Monotributo (1/3) */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <VentasMensuales data={metricas?.ventas_mensuales ?? []} />
            </div>
            <MonotributoProgress />
          </div>

          {/* Pérdida por inflación + Alertas de honorarios */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <InflacionWidget    metricas={metricas} />
            <AlertasHonorarios />
          </div>

          {/* Tabla de turnos */}
          <TurnosTable
            turnos={metricas?.ultimos_turnos ?? []}
            cargando={!metricas}
            onRefresh={handleTurnoCreado}
          />

        </div>
      </main>
    </>
  );
}
