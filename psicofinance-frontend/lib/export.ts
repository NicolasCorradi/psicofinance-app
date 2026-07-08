// Utilidad para exportar datos a CSV compatible con Excel (UTF-8 BOM).
// No requiere ninguna dependencia extra.

// Acepta cualquier objeto (interfaces tipadas incluidas, sin exigir index signature)
export function exportCSV<T extends object>(filename: string, headers: { key: string; label: string }[], rows: T[]) {
  // UTF-8 BOM para que Excel lo abra con acentos correctamente
  const BOM = "﻿";

  const headerLine = headers.map(h => `"${h.label}"`).join(";");
  const dataLines  = rows.map(row =>
    headers.map(h => {
      const val = (row as Record<string, string | number | null | undefined>)[h.key] ?? "";
      // Escapar comillas dobles dentro del valor
      return `"${String(val).replace(/"/g, '""')}"`;
    }).join(";")
  );

  const csv  = BOM + [headerLine, ...dataLines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
