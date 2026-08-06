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
  TurnoResumen,
  TurnoAgenda,
  SlotModelo,
  ExcepcionSemanal,
  TurnoCreatePayload,
  TurnoUpdatePayload,
  PacienteConStats,
  PacienteDetalle,
  PacienteRead,
  PacienteCreatePayload,
  PacienteUpdatePayload,
  EgresoRead,
  EgresoCreatePayload,
  EgresoUpdatePayload,
  ResumenEgresos,
  TipoEgreso,
  CategoriaEgreso,
  IngresoExport,
} from './types';

import { createClient } from './supabase/client';

// URL base del backend — se lee del .env.local en build time
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:8001';
const PREFIJO = '/api/v1';

/** Token de sesión de Supabase para autenticar contra el backend. */
async function tokenSesion(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  try {
    const { data } = await createClient().auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

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

// El backend en Render (free tier) puede tardar hasta ~50s en despertar
// si estuvo inactivo. 55s da margen sin dejar al usuario esperando indefinidamente.
const TIMEOUT_MS = 55_000;

// ── Aviso de "el servidor está iniciando" ────────────────────────────────────
// Render (free tier) apaga el servicio tras 15 min sin tráfico, así que el
// primer request después de un rato tarda decenas de segundos. Sin ningún
// aviso el usuario ve un spinner eterno y concluye que la app se colgó.
// El umbral evita ruido: una respuesta normal tarda milisegundos y nunca
// llega a mostrar nada.
const UMBRAL_DESPERTANDO_MS = 3_000;

// Rutas que tardan por naturaleza, no porque el servidor esté dormido: las del
// copiloto esperan la respuesta de Gemini y pasan los 3 segundos SIEMPRE.
// Mostrarles "Iniciando el servidor…" es directamente falso —el backend está
// respondiendo, es la IA pensando— y el copiloto ya tiene su propio indicador.
const RUTAS_LENTAS_POR_NATURALEZA = ["/copilot/"];

function esperaEsperable(path: string): boolean {
  return RUTAS_LENTAS_POR_NATURALEZA.some(r => path.startsWith(r));
}

type OyenteDespertando = (despertando: boolean) => void;
const oyentesDespertando = new Set<OyenteDespertando>();
let requestsLentos = 0;

/** Avisa cuando hay algún request tardando más de lo normal (backend dormido). */
export function suscribirServidorDespertando(fn: OyenteDespertando): () => void {
  oyentesDespertando.add(fn);
  fn(requestsLentos > 0);
  return () => { oyentesDespertando.delete(fn); };
}

function notificarDespertando() {
  const hay = requestsLentos > 0;
  oyentesDespertando.forEach(fn => fn(hay));
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await tokenSesion();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let contadoLento = false;
  const timerLento = esperaEsperable(path) ? null : setTimeout(() => {
    contadoLento = true;
    requestsLentos++;
    notificarDespertando();
  }, UMBRAL_DESPERTANDO_MS);

  // Se llama sí o sí al terminar (ok, error o timeout): si quedara colgado,
  // el cartel de "iniciando servidor" no se iría más.
  function finLento() {
    if (timerLento !== null) clearTimeout(timerLento);
    if (contadoLento) {
      contadoLento = false;
      requestsLentos = Math.max(0, requestsLentos - 1);
      notificarDespertando();
    }
  }

  try {
    let res: Response;
    try {
      res = await fetch(`${API_BASE}${PREFIJO}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          ...init?.headers,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        // En Next.js 16 App Router: 'no-store' desactiva caché para datos dinámicos
        cache: init?.method && init.method !== 'GET' ? undefined : 'no-store',
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        throw new ApiError(0, 'El servidor está tardando en responder (puede estar iniciando). Probá de nuevo en un momento.');
      }
      throw new ApiError(0, 'No pudimos conectar con el servidor. Revisá tu conexión a internet.');
    } finally {
      clearTimeout(timeoutId);
    }

    if (!res.ok) {
      let detalle = '';
      try {
        const json = await res.json();
        detalle = json?.detail ?? JSON.stringify(json);
      } catch {
        detalle = await res.text().catch(() => '');
      }
      if (res.status === 401) {
        throw new ApiError(401, 'Tu sesión expiró. Iniciá sesión de nuevo.');
      }
      throw new ApiError(res.status, detalle || `HTTP ${res.status} en ${path}`);
    }

    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  } finally {
    finLento();
  }
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
  await apiFetch<void>(path, { method: 'DELETE' });
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
export function getInflacion(): Promise<{ valor: number; periodo: string; estimado: boolean; ultimo_real_periodo: string | null; proyeccion_periodo: string | null; fuente: string }> {
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

/** Envía un blob de audio al copiloto. Gemini transcribe y procesa igual que texto. */
export function enviarAudio(blob: Blob): Promise<ChatResponse> {
  const form = new FormData();
  form.append('archivo', blob, 'audio.webm');
  return postForm<ChatResponse>('/copilot/audio', form);
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
  const params = new URLSearchParams({ desde, hasta });
  return get<TurnoAgenda[]>(`/turnos/agenda?${params}`);
}

/** Semana modelo guardada. */
export function getSemanaModelo(): Promise<{ slots: SlotModelo[] }> {
  return get('/agenda/semana-modelo');
}

/** Guarda la semana modelo completa. */
export function guardarSemanaModelo(slots: SlotModelo[]): Promise<{ slots: SlotModelo[] }> {
  return patch('/agenda/semana-modelo', { slots });
}

/** Excepciones (movidos/cancelados) de una semana puntual. `semana` = lunes ISO. */
export function getExcepcionesSemana(semana: string): Promise<{ semana: string; excepciones: ExcepcionSemanal[] }> {
  return get(`/agenda/excepciones?semana=${semana}`);
}

/** Reemplaza las excepciones de UNA semana (lista vacía = borra esa semana). */
export function guardarExcepcionesSemana(semana: string, excepciones: ExcepcionSemanal[]): Promise<{ semana: string; excepciones: ExcepcionSemanal[] }> {
  return patch('/agenda/excepciones', { semana, excepciones });
}

/** Lista turnos DIFERIDO con nombre de paciente. */
export function getTurnosDiferidos(): Promise<TurnoResumen[]> {
  return get<TurnoResumen[]>('/dashboard/turnos-diferidos');
}

/** Turnos COBRADO del mes actual — filtrado en backend por fecha_cobro_efectivo. */
export function getTurnosCobradosMes(): Promise<TurnoResumen[]> {
  return get<TurnoResumen[]>('/dashboard/turnos-cobrado-mes');
}

/** Todos los turnos COBRADO históricos para exportar a CSV/Excel. */
export function getExportIngresos(): Promise<IngresoExport[]> {
  return get('/dashboard/export-ingresos');
}

/** Crea un turno nuevo directamente (sin pasar por el copiloto). */
export function crearTurno(datos: TurnoCreatePayload): Promise<TurnoRead> {
  return post<TurnoRead>('/turnos/', datos);
}

/** Crea varios turnos de una (cierre de jornada). Atómico: entran todos o ninguno. */
export function crearTurnosLote(turnos: TurnoCreatePayload[]): Promise<TurnoRead[]> {
  return post<TurnoRead[]>('/turnos/lote', { turnos });
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

// ---------------------------------------------------------------------------
// CRUD de egresos
// ---------------------------------------------------------------------------

/** Lista egresos con filtros opcionales por mes (YYYY-MM), tipo y categoría. */
export function getEgresos(filtros?: {
  mes?: string;
  tipo?: TipoEgreso;
  categoria?: CategoriaEgreso;
}): Promise<EgresoRead[]> {
  const params = new URLSearchParams();
  if (filtros?.mes) params.set('mes', filtros.mes);
  if (filtros?.tipo) params.set('tipo', filtros.tipo);
  if (filtros?.categoria) params.set('categoria', filtros.categoria);
  const qs = params.toString();
  return get<EgresoRead[]>(`/egresos/${qs ? `?${qs}` : ''}`);
}

/** Totales fijos vs variables del mes + breakdown por categoría + últimos 6 meses. */
export function getResumenEgresos(mes?: string): Promise<ResumenEgresos> {
  return get<ResumenEgresos>(`/egresos/resumen${mes ? `?mes=${mes}` : ''}`);
}

/** Crea un egreso nuevo. */
export function crearEgreso(datos: EgresoCreatePayload): Promise<EgresoRead> {
  return post<EgresoRead>('/egresos/', datos);
}

/** Actualiza parcialmente un egreso. */
export function actualizarEgreso(id: string, datos: EgresoUpdatePayload): Promise<EgresoRead> {
  return patch<EgresoRead>(`/egresos/${id}`, datos);
}

/** Elimina un egreso permanentemente. */
export function eliminarEgreso(id: string): Promise<void> {
  return del(`/egresos/${id}`);
}
