"use client";

import { useState, useEffect, useCallback } from "react";
import { UserPlus, Search } from "lucide-react";
import { getPacientes } from "@/lib/api";
import type { PacienteConStats } from "@/lib/types";
import Navbar from "@/components/layout/Navbar";
import PacienteDetalle from "@/components/pacientes/PacienteDetalle";
import NuevoPaciente from "@/components/pacientes/NuevoPaciente";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtPesos(n: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency", currency: "ARS",
    notation: "compact", maximumFractionDigits: 1,
  }).format(n);
}

function fechaRel(iso: string | null): string {
  if (!iso) return "Sin sesiones";
  const f    = new Date(iso + "T12:00:00");
  const hoy  = new Date();
  const dias = Math.round((hoy.getTime() - f.getTime()) / 86_400_000);
  if (dias === 0) return "Hoy";
  if (dias === 1) return "Ayer";
  if (dias < 7)   return `Hace ${dias}d`;
  if (dias < 30)  return `Hace ${Math.round(dias / 7)}sem`;
  return f.toLocaleDateString("es-AR", { day: "numeric", month: "short" });
}

const AVATAR_PALETTES = [
  "bg-violet-100 text-violet-700", "bg-blue-100 text-blue-700",
  "bg-emerald-100 text-emerald-700", "bg-amber-100 text-amber-700",
  "bg-pink-100 text-pink-700", "bg-cyan-100 text-cyan-700",
  "bg-orange-100 text-orange-700", "bg-teal-100 text-teal-700",
];
function avatarCls(nombre: string): string {
  let h = 0;
  for (let i = 0; i < nombre.length; i++) h = (h * 31 + nombre.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTES[h % AVATAR_PALETTES.length];
}
function iniciales(nombre: string, apellido: string): string {
  return (nombre[0] ?? "").toUpperCase() + (apellido[0] ?? "").toUpperCase();
}

// ── Tarjeta de paciente ───────────────────────────────────────────────────────

function PacienteCard({
  p, onClick,
}: { p: PacienteConStats; onClick: () => void }) {
  const nombreCompleto = `${p.nombre} ${p.apellido}`;
  const inactivo = p.dias_inactivo !== null && p.dias_inactivo > 30;

  return (
    <button
      onClick={onClick}
      className="group flex w-full items-center gap-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-transparent transition-all hover:ring-neutral-200 hover:shadow-md text-left"
    >
      {/* Avatar */}
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${avatarCls(nombreCompleto)}`}>
        {iniciales(p.nombre, p.apellido)}
      </div>

      {/* Info principal */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-neutral-900">{nombreCompleto}</p>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-neutral-400">
          <span>{p.total_sesiones} sesión{p.total_sesiones !== 1 ? "es" : ""}</span>
          <span className="text-neutral-200">·</span>
          <span className={inactivo ? "text-amber-500" : ""}>{fechaRel(p.ultima_sesion)}</span>
          {p.sesiones_mes > 0 && (
            <>
              <span className="text-neutral-200">·</span>
              <span className="font-medium text-neutral-600">{p.sesiones_mes} este mes</span>
            </>
          )}
        </div>
      </div>

      {/* Montos */}
      <div className="shrink-0 text-right">
        <p className="text-sm font-semibold tabular-nums text-emerald-600">{fmtPesos(p.cobrado_total)}</p>
        {p.pendiente > 0 && (
          <p className="text-xs tabular-nums text-amber-500">{fmtPesos(p.pendiente)} pend.</p>
        )}
      </div>
    </button>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function PacientesPage() {
  const [pacientes,    setPacientes]    = useState<PacienteConStats[]>([]);
  const [cargando,     setCargando]     = useState(true);
  const [busqueda,     setBusqueda]     = useState("");
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [nuevoModal,   setNuevoModal]   = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try { setPacientes(await getPacientes()); }
    catch { /* silencioso */ }
    finally { setCargando(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const filtrados = pacientes.filter((p) => {
    const q = busqueda.toLowerCase();
    return (
      p.nombre.toLowerCase().includes(q) ||
      p.apellido.toLowerCase().includes(q) ||
      (p.email ?? "").toLowerCase().includes(q)
    );
  });

  // Agrupados: activos (últimos 30d) primero, luego por apellido
  const ordenados = [...filtrados].sort((a, b) => {
    const aActivo = (a.dias_inactivo ?? 999) <= 30;
    const bActivo = (b.dias_inactivo ?? 999) <= 30;
    if (aActivo !== bActivo) return aActivo ? -1 : 1;
    return a.apellido.localeCompare(b.apellido);
  });

  const totalCobrado  = pacientes.reduce((s, p) => s + p.cobrado_total, 0);
  const totalPendiente = pacientes.reduce((s, p) => s + p.pendiente, 0);

  return (
    <>
      <Navbar />

      <main className="mx-auto max-w-screen-lg px-4 py-6">

        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-neutral-900">Pacientes</h1>
            <p className="text-xs text-neutral-400">
              {cargando ? "Cargando…" : `${pacientes.length} paciente${pacientes.length !== 1 ? "s" : ""}`}
            </p>
          </div>
          <button
            onClick={() => setNuevoModal(true)}
            className="flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-700"
          >
            <UserPlus className="h-4 w-4" />
            Nuevo
          </button>
        </div>

        {/* Resumen global */}
        {!cargando && pacientes.length > 0 && (
          <div className="mb-5 grid grid-cols-3 gap-3">
            {[
              { label: "Total cobrado",  value: fmtPesos(totalCobrado),   color: "text-emerald-600" },
              { label: "Total pendiente", value: fmtPesos(totalPendiente), color: "text-amber-600" },
              { label: "Activos este mes",
                value: String(pacientes.filter((p) => p.sesiones_mes > 0).length),
                color: "text-neutral-800" },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-2xl bg-white p-4 shadow-sm">
                <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">{label}</p>
                <p className={`mt-1.5 text-2xl font-semibold tabular-nums ${color}`}>{value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Buscador */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, apellido o email…"
            className="w-full rounded-xl border border-neutral-200 bg-white py-2.5 pl-9 pr-4 text-sm text-neutral-800 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none"
          />
        </div>

        {/* Lista */}
        {cargando ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-[68px] animate-pulse rounded-2xl bg-neutral-100" />
            ))}
          </div>
        ) : ordenados.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm text-neutral-400">
              {busqueda ? "Sin resultados para esa búsqueda." : "Sin pacientes registrados todavía."}
            </p>
            {!busqueda && (
              <button
                onClick={() => setNuevoModal(true)}
                className="mt-3 text-sm font-medium text-neutral-600 underline underline-offset-2"
              >
                Crear el primero
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {ordenados.map((p) => (
              <PacienteCard
                key={p.id}
                p={p}
                onClick={() => setSeleccionado(p.id)}
              />
            ))}
          </div>
        )}
      </main>

      {/* Panel de detalle */}
      {seleccionado && (
        <PacienteDetalle
          pacienteId={seleccionado}
          onClose={() => setSeleccionado(null)}
          onRefresh={cargar}
        />
      )}

      {/* Modal nuevo paciente */}
      {nuevoModal && (
        <NuevoPaciente
          onCreado={() => { setNuevoModal(false); cargar(); }}
          onCancelar={() => setNuevoModal(false)}
        />
      )}
    </>
  );
}
