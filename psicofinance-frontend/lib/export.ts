// Utilidad para exportar datos a CSV compatible con Excel (UTF-8 BOM).
// No requiere ninguna dependencia extra.

type Row = Record<string, string | number | null | undefined>;

export function exportCSV(filename: string, headers: { key: string; label: string }[], rows: Row[]) {
  // UTF-8 BOM para que Excel lo abra con acentos correctamente
  const BOM = "﻿";

  const headerLine = headers.map(h => `"${h.label}"`).join(";");
  const dataLines  = rows.map(row =>
    headers.map(h => {
      const val = row[h.key] ?? "";
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
