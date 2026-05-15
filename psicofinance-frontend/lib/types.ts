// Tipos TypeScript sincronizados con los modelos Pydantic del backend.

export type EstadoTurno   = 'COBRADO' | 'DIFERIDO' | 'INCOBRABLE';
export type OrigenPago    = 'DIRECTO' | 'PREPAGA';
export type Confianza     = 'alta' | 'media' | 'baja';
export type EstadoSemaforo = 'VERDE' | 'AMARILLO' | 'ROJO';
export type MedioPago     = 'EFECTIVO' | 'TRANSFERENCIA' | 'MERCADO_PAGO' | 'TARJETA' | 'OTRO';
export type TipoSesion    = 'SESION' | 'INASISTENCIA_JUSTIFICADA' | 'INASISTENCIA_INJUSTIFICADA' | 'CANCELACION_PROFESIONAL';
export type Moneda        = 'ARS' | 'USD';

// ── Semáforo Monotributo ─────────────────────────────────────────────────────
export interface ResultadoSemaforo {
  categoria_actual:     string;
  facturado_12m:        number;
  tope_anual:           number;
  porcentaje_consumido: number;
  margen_disponible:    number;
  estado:               EstadoSemaforo;
  mensaje:              string;
}

// ── Copiloto NLP ─────────────────────────────────────────────────────────────
export interface DatosExtraidos {
  paciente:    string;
  monto:       number;
  es_prepaga:  boolean;
  obra_social: string | null;
  fecha:       string;
  confianza:   Confianza;
  medio_pago:  MedioPago | null;
  tipo_sesion: TipoSesion;
  moneda:      Moneda;
}

export interface ChatResponse {
  confirmacion:    string;
  accion:          string;
  datos_extraidos: DatosExtraidos | null;
  turno_creado:    TurnoRead | null;
  paciente_nuevo:  boolean;
}

// ── Turnos ───────────────────────────────────────────────────────────────────
export interface TurnoRead {
  id:                    string;
  paciente_id:           string;
  fecha_turno:           string;
  monto:                 number;
  estado:                EstadoTurno;
  origen_pago:           OrigenPago;
  fecha_cobro_estimada:  string | null;
  fecha_cobro_efectivo:  string | null;
  prepaga:               string | null;
  medio_pago:            MedioPago | null;
  tipo_sesion:           TipoSesion;
  moneda:                Moneda;
  tipo_cambio:           number | null;
  created_at:            string;
  updated_at:            string;
}

// Turno con nombre de paciente (viene del JOIN en /dashboard/metricas)
export interface TurnoResumen {
  id:                    string;
  paciente_nombre:       string;
  fecha_turno:           string;
  monto:                 number;
  estado:                EstadoTurno;
  origen_pago:           OrigenPago;
  prepaga:               string | null;
  fecha_cobro_estimada:  string | null;
  fecha_cobro_efectivo:  string | null;
  medio_pago:            MedioPago | null;
  tipo_sesion:           TipoSesion;
  moneda:                Moneda;
  tipo_cambio:           number | null;
}

// ── Dashboard ────────────────────────────────────────────────────────────────
export interface VentaMensual {
  mes:     string;   // "Ene", "Feb", …
  cobrado: number;
}

export interface MetricasDashboard {
  cobrado_mes:                   number;
  en_camino_mes:                 number;
  deudores:                      number;
  total_turnos_mes:              number;
  perdida_inflacion:             number;
  sesiones_perdidas_equivalente: number;
  honorario_promedio:            number;
  ultimos_turnos:                TurnoResumen[];
  ventas_mensuales:              VentaMensual[];
}

// ── Alertas de honorarios ────────────────────────────────────────────────────
export interface AlertaHonorario {
  paciente_id:        string;
  nombre:             string;   // "Nombre A."
  meses:              number;
  pct:                number;   // % inflación acumulada
  honorario_actual:   number;
  honorario_sugerido: number;
  alto:               boolean;  // true si >= 6 meses
}

// ── Pacientes ────────────────────────────────────────────────────────────────

export interface PacienteRead {
  id:                            string;
  nombre:                        string;
  apellido:                      string;
  email:                         string | null;
  honorario_actual:              number | null;
  fecha_ultimo_ajuste_honorario: string | null;
  created_at:                    string;
}

export interface PacienteConStats extends PacienteRead {
  total_sesiones:  number;
  ultima_sesion:   string | null;
  dias_inactivo:   number | null;
  cobrado_total:   number;
  pendiente:       number;
  sesiones_mes:    number;
}

export interface TurnoEnDetalle {
  id:                   string;
  fecha_turno:          string;
  monto:                number;
  estado:               EstadoTurno;
  origen_pago:          OrigenPago;
  prepaga:              string | null;
  fecha_cobro_estimada: string | null;
  fecha_cobro_efectivo: string | null;
  medio_pago:           MedioPago | null;
  tipo_sesion:          TipoSesion;
  moneda:               Moneda;
  tipo_cambio:          number | null;
  created_at:           string;
}

export interface PacienteDetalle extends PacienteConStats {
  turnos: TurnoEnDetalle[];
}

export interface PacienteCreatePayload {
  nombre:                        string;
  apellido:                      string;
  email?:                        string | null;
  honorario_actual?:             number | null;
  fecha_ultimo_ajuste_honorario?: string | null;
}

export interface PacienteUpdatePayload {
  nombre?:                       string;
  apellido?:                     string;
  email?:                        string | null;
  honorario_actual?:             number | null;
  fecha_ultimo_ajuste_honorario?: string | null;
}

// ── Turno update (frontend → PATCH) ─────────────────────────────────────────
export interface TurnoUpdatePayload {
  estado?:               EstadoTurno;
  monto?:                number;
  prepaga?:              string | null;
  fecha_cobro_efectivo?: string | null;
  fecha_cobro_estimada?: string | null;
  medio_pago?:           MedioPago | null;
  tipo_sesion?:          TipoSesion;
  moneda?:               Moneda;
  tipo_cambio?:          number | null;
}

// ── Comprobantes ─────────────────────────────────────────────────────────────
export interface DatosBorrador {
  nombre_emisor:    string;
  monto:            number;
  fecha:            string;
  confianza:        Confianza;
  advertencia_monto?: string;
}
