// Cliente HTTP para el backend PsicoFinance.
// Centraliza todas las llamadas HTTP y maneja errores de forma uniforme.
// El backend corre en http://127.0.0.1:8001 (configurable via .env.local).

import type {
  MetricasDashboard,
  ResultadoSemaforo,
  ChatResponse,
  DatosBorrador,
  AlertaHonorario,
  TurnoRead,
  TurnoAgenda,
  SlotModelo,
  TurnoCreatePayload,
  TurnoUpdatePayload,
  PacienteConStats,
  PacienteDetalle,
  PacienteRead,
  PacienteCreatePayload,
  PacienteUpdatePayload,
} from './types';

// URL base del backend — se lee del .env.local en build time
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:8001';
const PREFIJO = '/api/v1';

// ---------------------------------------------------------------------------
// Error tipado del API
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ---------------------------------------------------------------------------
// Helpers internos HTTP
// ---------------------------------------------------------------------------

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${PREFIJO}${path}`, {
    ...init,
    // En Next.js 16 App Router: 'no-store' desactiva caché para datos dinámicos
    cache: init?.method && init.method !== 'GET' ? undefined : 'no-store',
  });

  if (!res.ok) {
    let detalle = '';
    try {
      const json = await res.json();
      detalle = json?.detail ?? JSON.stringify(json);
    } catch {
      detalle = await res.text().catch(() => '');
    }
    throw new ApiError(res.status, detalle || `HTTP ${res.status} en ${path}`);
  }

  return res.json() as Promise<T>;
}

function get<T>(path: string): Promise<T> {
  return apiFetch<T>(path);
}

function post<T>(path: string, body: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function postForm<T>(path: string, form: FormData): Promise<T> {
  // No especificar Content-Type: el browser lo pone con el boundary automáticamente
  return apiFetch<T>(path, { method: 'POST', body: form });
}

function patch<T>(path: string, body: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function del(path: string): Promise<void> {
  const res = await fetch(`${API_BASE}${PREFIJO}${path}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) {
    throw new ApiError(res.status, `Error al eliminar: HTTP ${res.status}`);
  }
}

// ---------------------------------------------------------------------------
// Endpoints del dashboard
// ---------------------------------------------------------------------------

/** Métricas de cash flow + últimos turnos (con nombre de paciente incluido). */
export function getMetricasDashboard(): Promise<MetricasDashboard> {
  return get<MetricasDashboard>('/dashboard/metricas');
}

// ---------------------------------------------------------------------------
// Semáforo Monotributo
// ---------------------------------------------------------------------------

/** Estado fiscal de los últimos 12 meses rodantes. */
export function getSemaforo(): Promise<ResultadoSemaforo> {
  return get<ResultadoSemaforo>('/monotributo/semaforo');
}

/** Cambia la categoría del Monotributo y devuelve el semáforo actualizado. */
export function actualizarCategoria(categoria: string): Promise<ResultadoSemaforo & { categorias_disponibles: string[]; vigencia: string }> {
  return patch('/monotributo/categoria', { categoria });
}

/** Último dato de IPC mensual desde INDEC via datos.gob.ar. */
export function getInflacion(): Promise<{ valor: number; periodo: string; fuente: string }> {
  return get('/dashboard/inflacion');
}

/** Tipo de cambio dólar blue actual (dolarapi.com, cachea 30 min). */
export function getDolarBlue(): Promise<{ valor: number; fuente: string }> {
  return get('/dashboard/dolar');
}

// ---------------------------------------------------------------------------
// Copiloto NLP
// ---------------------------------------------------------------------------

/** Envía texto libre al copiloto y registra el turno automáticamente. */
export function enviarMensajeChat(
  mensaje: string,
  historial: { rol: string; texto: string }[] = [],
): Promise<ChatResponse> {
  return post<ChatResponse>('/copilot/chat', { mensaje, historial });
}

/**
 * Envía una imagen o PDF de comprobante de pago.
 * Gemini lo analiza con visión y devuelve un borrador para aprobar.
 */
export function procesarComprobante(archivo: File): Promise<DatosBorrador> {
  const form = new FormData();
  form.append('archivo', archivo);
  return postForm<DatosBorrador>('/copilot/comprobante', form);
}

/** Pacientes cuyo honorario lleva ≥ 3 meses sin actualizarse. */
export function getAlertasHonorarios(): Promise<AlertaHonorario[]> {
  return get<AlertaHonorario[]>('/pacientes/alertas-honorarios');
}

/**
 * Aprueba un borrador de comprobante y crea el turno en la BD.
 * Se llama cuando el psicólogo confirma los datos extraídos de la imagen.
 */
export function aprobarBorrador(datos: {
  nombre_emisor: string;
  monto: number;
  fecha: string;
}): Promise<ChatResponse> {
  return post<ChatResponse>('/copilot/comprobante/aprobar', datos);
}

// ---------------------------------------------------------------------------
// CRUD de turnos
// ---------------------------------------------------------------------------

/** Turnos de un rango de fechas con nombre de paciente (para agenda). */
export function getTurnosAgenda(desde: string, hasta: string): Promise<TurnoAgenda[]> {
  return get<TurnoAgenda[]>(`/turnos/agenda?desde=${desde}&hasta=${hasta}`);
}

/** Semana modelo guardada. */
export function getSemanaModelo(): Promise<{ slots: SlotModelo[] }> {
  return get('/agenda/semana-modelo');
}

/** Guarda la semana modelo completa. */
export function guardarSemanaModelo(slots: SlotModelo[]): Promise<{ slots: SlotModelo[] }> {
  return patch('/agenda/semana-modelo', { slots });
}

/** Lista turnos DIFERIDO con nombre de paciente. */
export function getTurnosDiferidos(): Promise<TurnoResumen[]> {
  return get<TurnoResumen[]>('/dashboard/turnos-diferidos');
}

/** Turnos COBRADO del mes actual — filtrado en backend por fecha_cobro_efectivo. */
export function getTurnosCobradosMes(): Promise<TurnoResumen[]> {
  return get<TurnoResumen[]>('/dashboard/turnos-cobrado-mes');
}

/** Crea un turno nuevo directamente (sin pasar por el copiloto). */
export function crearTurno(datos: TurnoCreatePayload): Promise<TurnoRead> {
  return post<TurnoRead>('/turnos/', datos);
}

/** Actualiza parcialmente un turno (monto, estado, prepaga, etc.). */
export function actualizarTurno(id: string, datos: TurnoUpdatePayload): Promise<TurnoRead> {
  return patch<TurnoRead>(`/turnos/${id}`, datos);
}

/** Elimina un turno permanentemente. */
export function eliminarTurno(id: string): Promise<void> {
  return del(`/turnos/${id}`);
}

// ---------------------------------------------------------------------------
// CRUD de pacientes
// ---------------------------------------------------------------------------

/** Lista todos los pacientes con estadísticas agregadas. */
export function getPacientes(): Promise<PacienteConStats[]> {
  return get<PacienteConStats[]>('/pacientes/');
}

/** Detalle de un paciente: datos + historial completo de turnos. */
export function getPacienteDetalle(id: string): Promise<PacienteDetalle> {
  return get<PacienteDetalle>(`/pacientes/${id}`);
}

/** Crea un paciente nuevo. */
export function crearPaciente(datos: PacienteCreatePayload): Promise<PacienteRead> {
  return post<PacienteRead>('/pacientes/', datos);
}

/** Actualiza parcialmente un paciente. */
export function actualizarPaciente(id: string, datos: PacienteUpdatePayload): Promise<PacienteRead> {
  return patch<PacienteRead>(`/pacientes/${id}`, datos);
}

/** Elimina un paciente (solo si no tiene turnos). */
export function eliminarPaciente(id: string): Promise<void> {
  return del(`/pacientes/${id}`);
}
