// Links de WhatsApp para recordatorios de pago.
// No usa la API de WhatsApp: arma links wa.me que abren la app con el
// mensaje pre-escrito. El psicólogo revisa y envía desde su propio número.

/**
 * Normaliza un teléfono argentino al formato que espera wa.me: 549 + área + número.
 * Acepta formatos comunes: "11 2233-4455", "011 15-2233-4455", "+54 9 11 2233 4455".
 */
export function normalizarTelefonoAR(telefono: string): string {
  let d = telefono.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (!d.startsWith("54")) {
    if (d.startsWith("0")) d = d.slice(1);   // prefijo de discado nacional
    if (d.startsWith("15")) d = d.slice(2);  // prefijo viejo de celular
    d = "549" + d;
  } else if (!d.startsWith("549")) {
    d = "549" + d.slice(2);                  // celulares necesitan el 9 tras el 54
  }
  return d;
}

/**
 * Link de WhatsApp con mensaje pre-armado.
 * Con teléfono abre el chat directo; sin teléfono, WhatsApp deja elegir el contacto.
 */
export function linkWhatsApp(telefono: string | null | undefined, mensaje: string): string {
  const texto = encodeURIComponent(mensaje);
  if (telefono?.trim()) {
    return `https://wa.me/${normalizarTelefonoAR(telefono)}?text=${texto}`;
  }
  return `https://wa.me/?text=${texto}`;
}

function fmtMoneda(monto: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency", currency: "ARS", maximumFractionDigits: 0,
  }).format(monto);
}

/** Mensaje de recordatorio de deuda, cordial y listo para enviar. */
export function mensajeRecordatorioDeuda(nombre: string, monto: number): string {
  return `Hola ${nombre}! ¿Cómo estás? Te escribo para recordarte que quedó pendiente el pago de ${fmtMoneda(monto)} de sesiones. Cualquier cosa avisame. ¡Gracias!`;
}

/**
 * Mensaje de recordatorio detallando las sesiones pendientes (fecha + monto).
 * Con turnos > 6 resume el listado para no hacer el mensaje interminable.
 */
export function mensajeRecordatorioDeudaDetallado(
  nombre: string,
  turnosPendientes: { fecha: string; monto: number }[],
): string {
  const total = turnosPendientes.reduce((s, t) => s + t.monto, 0);
  if (turnosPendientes.length === 0) {
    return mensajeRecordatorioDeuda(nombre, total);
  }

  const MAX_LISTADOS = 6;
  const ordenados = [...turnosPendientes].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const visibles = ordenados.slice(0, MAX_LISTADOS);
  const restantes = ordenados.length - visibles.length;

  const lineas = visibles.map(t => {
    const [y, m, d] = t.fecha.split("-");
    return `• ${d}/${m} - ${fmtMoneda(t.monto)}`;
  });
  if (restantes > 0) lineas.push(`• y ${restantes} sesión${restantes > 1 ? "es" : ""} más`);

  return (
    `Hola ${nombre}! ¿Cómo estás? Te escribo para recordarte que quedaron pendientes estas sesiones:\n` +
    lineas.join("\n") +
    `\nTotal: ${fmtMoneda(total)}. Cualquier cosa avisame. ¡Gracias!`
  );
}
