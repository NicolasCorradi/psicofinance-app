"use client";

// Drawer de alta/edición de egresos. Reutiliza Sheet (bottom sheet mobile / side panel desktop).

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import Sheet from "@/components/ui/Sheet";
import { crearEgreso, actualizarEgreso, ApiError } from "@/lib/api";
import { useToast } from "@/lib/toast";
import type { EgresoRead, TipoEgreso, CategoriaEgreso, MedioPago } from "@/lib/types";
import { CATEGORIAS, MEDIOS_PAGO } from "./constantes";

interface Props {
  open:     boolean;
  onClose:  () => void;
  onSaved:  () => void;
  egreso?:  EgresoRead | null;   // si viene, es edición
}

// Fecha local (no UTC): toISOString() adelanta un día en Argentina después de las 21:00
function parsearMonto(texto: string): number {
  const limpio = texto.trim().replace(/\$|\s/g, "");
  if (!limpio) return NaN;
  const tienePunto = limpio.includes(".");
  const tieneComa = limpio.includes(",");
  let normalizado = limpio;
  if (tienePunto && tieneComa) {
    // "1.000,50" — punto = miles, coma = decimal
    normalizado = limpio.replace(/\./g, "").replace(",", ".");
  } else if (tieneComa) {
    // "1500,50" — coma decimal
    normalizado = limpio.replace(",", ".");
  } else if (tienePunto) {
    // Ambiguo: "1.000" es miles en AR, "1000.50" es decimal — si el grupo
    // tras el último punto tiene 3 dígitos, se asume separador de miles
    const partes = limpio.split(".");
    if (partes[partes.length - 1].length === 3) {
      normalizado = limpio.replace(/\./g, "");
    }
  }
  return parseFloat(normalizado);
}

const hoy = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const inputCls =
  "w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-800 " +
  "placeholder:text-neutral-300 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition-colors";

const labelCls = "mb-1.5 block text-xs font-medium text-neutral-500";

export default function EgresoModal({ open, onClose, onSaved, egreso }: Props) {
  const toast = useToast();
  const [guardando, setGuardando] = useState(false);

  const [descripcion, setDescripcion] = useState("");
  const [monto,       setMonto]       = useState("");
  const [tipo,        setTipo]        = useState<TipoEgreso>("VARIABLE");
  const [categoria,   setCategoria]   = useState<CategoriaEgreso>("OTRO");
  const [fecha,       setFecha]       = useState(hoy());
  const [medioPago,   setMedioPago]   = useState<MedioPago | "">("");
  const [recurrente,  setRecurrente]  = useState(false);
  const [notas,       setNotas]       = useState("");

  // Al abrir: precargar si es edición, resetear si es alta
  useEffect(() => {
    if (!open) return;
    setDescripcion(egreso?.descripcion ?? "");
    setMonto(egreso ? String(egreso.monto) : "");
    setTipo(egreso?.tipo ?? "VARIABLE");
    setCategoria(egreso?.categoria ?? "OTRO");
    setFecha(egreso?.fecha?.slice(0, 10) ?? hoy());
    setMedioPago(egreso?.medio_pago ?? "");
    setRecurrente(egreso?.recurrente ?? false);
    setNotas(egreso?.notas ?? "");
  }, [open, egreso]);

  // Acepta formato AR ("1.000,50"), internacional ("1000.50") y simple ("1500")
  const montoNum = parsearMonto(monto);
  const valido = descripcion.trim().length > 0 && !isNaN(montoNum) && montoNum > 0 && fecha;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valido || guardando) return;
    setGuardando(true);
    try {
      const payload = {
        descripcion: descripcion.trim(),
        monto: montoNum,
        tipo,
        categoria,
        fecha,
        medio_pago: medioPago || null,
        recurrente,
        notas: notas.trim() || null,
      };
      if (egreso) {
        await actualizarEgreso(egreso.id, payload);
        toast.success("Egreso actualizado");
      } else {
        await crearEgreso(payload);
        toast.success("Egreso registrado");
      }
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo guardar el egreso");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={egreso ? "Editar egreso" : "Nuevo egreso"}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">

        {/* Descripción */}
        <div>
          <label className={labelCls}>Descripción *</label>
          <input
            className={inputCls}
            value={descripcion}
            onChange={e => setDescripcion(e.target.value)}
            placeholder="Alquiler consultorio, supervisión…"
            maxLength={200}
            autoFocus
          />
        </div>

        {/* Monto + fecha */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Monto (ARS) *</label>
            <input
              className={`${inputCls} font-mono`}
              value={monto}
              onChange={e => setMonto(e.target.value)}
              placeholder="0"
              inputMode="decimal"
            />
          </div>
          <div>
            <label className={labelCls}>Fecha *</label>
            <input
              type="date"
              className={inputCls}
              value={fecha}
              onChange={e => setFecha(e.target.value)}
            />
          </div>
        </div>

        {/* Tipo — toggle segmentado */}
        <div>
          <label className={labelCls}>Tipo *</label>
          <div className="grid grid-cols-2 gap-2">
            {(["FIJO", "VARIABLE"] as TipoEgreso[]).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setTipo(t)}
                className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                  tipo === t
                    ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                    : "border-neutral-200 bg-white text-neutral-400 hover:bg-neutral-50"
                }`}
              >
                {t === "FIJO" ? "Fijo" : "Variable"}
              </button>
            ))}
          </div>
        </div>

        {/* Categoría — grid de chips con icono */}
        <div>
          <label className={labelCls}>Categoría</label>
          <div className="grid grid-cols-4 gap-2">
            {(Object.entries(CATEGORIAS) as [CategoriaEgreso, typeof CATEGORIAS[CategoriaEgreso]][]).map(
              ([key, { label, Icon }]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setCategoria(key)}
                  className={`flex flex-col items-center gap-1 rounded-xl border px-1 py-2 transition-colors ${
                    categoria === key
                      ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                      : "border-neutral-200 bg-white text-neutral-400 hover:bg-neutral-50"
                  }`}
                >
                  <Icon className="h-4 w-4" strokeWidth={1.8} />
                  <span className="text-[10px] font-medium leading-none">{label}</span>
                </button>
              ),
            )}
          </div>
        </div>

        {/* Medio de pago */}
        <div>
          <label className={labelCls}>Medio de pago</label>
          <select
            className={inputCls}
            value={medioPago}
            onChange={e => setMedioPago(e.target.value as MedioPago | "")}
          >
            <option value="">Sin especificar</option>
            {Object.entries(MEDIOS_PAGO).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        {/* Recurrente */}
        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-neutral-200 bg-white px-3 py-2.5">
          <input
            type="checkbox"
            checked={recurrente}
            onChange={e => setRecurrente(e.target.checked)}
            className="h-4 w-4 rounded accent-indigo-600"
          />
          <div>
            <p className="text-sm font-medium text-neutral-700">Gasto recurrente</p>
            <p className="text-[11px] text-neutral-400">Se repite todos los meses (alquiler, software…)</p>
          </div>
        </label>

        {/* Notas */}
        <div>
          <label className={labelCls}>Notas</label>
          <textarea
            className={`${inputCls} min-h-[64px] resize-none`}
            value={notas}
            onChange={e => setNotas(e.target.value)}
            placeholder="Opcional"
          />
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={!valido || guardando}
          className="mt-1 flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {guardando && <Loader2 className="h-4 w-4 animate-spin" />}
          {egreso ? "Guardar cambios" : "Registrar egreso"}
        </button>
      </form>
    </Sheet>
  );
}
