// Utilidad compartida de avatares — un solo lugar para que paleta e iniciales
// se mantengan consistentes en TurnosTable, PacienteDetalle, Pacientes, Reportes.

const PALETAS = [
  "bg-gradient-to-br from-violet-100 to-violet-200 text-violet-700",
  "bg-gradient-to-br from-blue-100 to-blue-200 text-blue-700",
  "bg-gradient-to-br from-emerald-100 to-emerald-200 text-emerald-700",
  "bg-gradient-to-br from-amber-100 to-amber-200 text-amber-700",
  "bg-gradient-to-br from-pink-100 to-pink-200 text-pink-700",
  "bg-gradient-to-br from-cyan-100 to-cyan-200 text-cyan-700",
  "bg-gradient-to-br from-orange-100 to-orange-200 text-orange-700",
  "bg-gradient-to-br from-teal-100 to-teal-200 text-teal-700",
];

/** Hash determinístico → paleta de avatar. Mismo nombre = mismo color siempre. */
export function avatarCls(nombre: string): string {
  let h = 0;
  for (let i = 0; i < nombre.length; i++) h = (h * 31 + nombre.charCodeAt(i)) >>> 0;
  return PALETAS[h % PALETAS.length];
}

/** Iniciales de un nombre (1-2 palabras) o de nombre+apellido separado. */
export function iniciales(nombre: string, apellido?: string): string {
  if (apellido !== undefined) {
    return ((nombre[0] ?? "") + (apellido[0] ?? "")).toUpperCase();
  }
  const partes = nombre.trim().split(/\s+/);
  if (partes.length >= 2) return (partes[0][0] + partes[1][0]).toUpperCase();
  return nombre.slice(0, 2).toUpperCase();
}
