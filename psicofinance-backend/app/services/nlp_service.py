# Servicio NLP del Copiloto PsicoFinance.
# Usa Gemini para:
#   1. Clasificar la intención del mensaje (registro de turno vs consulta financiera)
#   2. Extraer datos estructurados cuando es un registro de turno
#   3. Responder preguntas financieras con contexto real de la BD

import json
import logging
from dataclasses import dataclass
from datetime import date

from google import genai
from google.genai import types

from app.config import config
from app.utils import hoy_argentina

logger = logging.getLogger(__name__)


# ── Tipos de retorno ──────────────────────────────────────────────────────────

@dataclass
class DatosTurnoNLP:
    paciente:    str
    monto:       float
    es_prepaga:  bool
    obra_social: str | None
    fecha:       date
    confianza:   str        # "alta" | "media" | "baja"
    medio_pago:  str | None  # "EFECTIVO" | "TRANSFERENCIA" | "MERCADO_PAGO" | "TARJETA" | "OTRO" | None
    tipo_sesion: str         # "SESION" | "INASISTENCIA_JUSTIFICADA" | "INASISTENCIA_INJUSTIFICADA" | "CANCELACION_PROFESIONAL"
    moneda:      str = "ARS"  # "ARS" | "USD"


class ErrorNLP(Exception):
    pass


class ErrorCuotaNLP(ErrorNLP):
    """Gemini devolvió 429 (cuota agotada). El tier gratis permite 5 requests
    por minuto — distinguirlo permite avisarle al usuario que reintente en
    unos segundos en vez del genérico 'no pude entender el mensaje'."""
    pass


def _es_error_cuota(exc: Exception) -> bool:
    txt = str(exc)
    return "429" in txt or "RESOURCE_EXHAUSTED" in txt


# ── Prompts ───────────────────────────────────────────────────────────────────

PROMPT_CLASIFICACION = """Sos un clasificador de intenciones para PsicoFinance,
una app de finanzas para psicólogos.

Clasificá el mensaje en UNA de estas dos categorías:
- "registro_turno": el psicólogo quiere registrar una sesión, turno o atención con un paciente
- "consulta": el psicólogo hace una pregunta sobre sus finanzas: ingresos, gastos/egresos
  ("¿cuánto gasté?"), utilidad, estadísticas, o pide cualquier información

Ojo: "gasté", "gastos" o "egresos" refieren a los gastos del consultorio → es "consulta",
NO un registro de turno.

Respondé ÚNICAMENTE con una de estas dos palabras exactas: registro_turno  o  consulta
Sin explicaciones, sin puntuación extra."""

PROMPT_EXTRACCION = """Sos un asistente de extracción de datos para PsicoFinance,
un sistema contable para psicólogos independientes en Argentina.

Tu única tarea es analizar el mensaje del psicólogo y extraer los datos del turno.
Respondés ÚNICAMENTE con un objeto JSON válido, sin markdown, sin texto adicional.

Campos a extraer:
- "paciente": string — nombre del paciente (solo el nombre, sin títulos)
- "monto": number — honorario en pesos argentinos ("10k"=10000, "2 lucas"=2000, "medio palo"=500000)
- "es_prepaga": boolean — true si el pago viene de obra social o prepaga
- "obra_social": string o null — nombre de la prepaga (null si es_prepaga es false)
- "fecha": string ISO 8601 (YYYY-MM-DD). Resolver fechas relativas con la fecha actual provista
- "medio_pago": string o null — uno de: "EFECTIVO", "TRANSFERENCIA", "MERCADO_PAGO", "TARJETA", "OTRO". null si no se menciona
- "tipo_sesion": string — uno de: "SESION", "INASISTENCIA_JUSTIFICADA", "INASISTENCIA_INJUSTIFICADA", "CANCELACION_PROFESIONAL". Default "SESION"
- "moneda": string — "USD" si el monto es en dólares (se menciona "dólares", "USD", "usd", "us$", "u$s"), sino "ARS"
- "confianza": "alta" si todos los datos son claros, "media" si algo fue inferido, "baja" si hay ambigüedad

Reglas:
- Si no hay monto, devolvé monto: 0
- Si no hay fecha, usá la fecha actual
- Si no se menciona paciente, devolvé paciente: "Sin identificar"
- Jerga argentina: "lucas"=miles, "palo"=millón, "k"=miles
- "efectivo"/"cash"/"en mano" → EFECTIVO; "transferencia"/"transfe" → TRANSFERENCIA; "mercado pago"/"MP" → MERCADO_PAGO; "tarjeta"/"débito"/"crédito" → TARJETA
- "no vino"/"faltó"/"inasistencia" → INASISTENCIA_INJUSTIFICADA (monto puede ser 0); "avisó"/"canceló con aviso"/"justificada" → INASISTENCIA_JUSTIFICADA
- "cancelé yo"/"no pude atender" → CANCELACION_PROFESIONAL
- Si el monto es en dólares, devolvé el número tal cual (ej: "cobré USD 100" → monto: 100, moneda: "USD")

Ejemplo ARS: {"paciente":"Martín","monto":10000,"es_prepaga":false,"obra_social":null,"fecha":"2025-04-24","medio_pago":"EFECTIVO","tipo_sesion":"SESION","moneda":"ARS","confianza":"alta"}
Ejemplo USD: {"paciente":"Laura","monto":80,"es_prepaga":false,"obra_social":null,"fecha":"2025-04-24","medio_pago":"TRANSFERENCIA","tipo_sesion":"SESION","moneda":"USD","confianza":"alta"}"""

PROMPT_CONSULTA = """Sos el copiloto financiero de PsicoFinance, una app para psicólogos independientes en Argentina.
Respondé la pregunta del psicólogo de forma clara y útil, en español rioplatense (tuteá).
Usá los datos financieros provistos como contexto. Si la pregunta no tiene respuesta en los datos, decilo honestamente.

Si te preguntan qué podés hacer (o cómo usarte), explicá tus dos funciones:
1) Registrar sesiones por chat o audio: "vino Martina, pagó 35 mil en efectivo" — entendés fechas relativas, prepagas, dólares e inasistencias.
2) Responder consultas sobre sus finanzas: facturación, deudores, gastos, utilidad, monotributo.
Aclarales que la agenda, los pacientes y los reportes se manejan desde las otras pantallas de la app.

Si preguntan algo de finanzas que NO está en los datos (proyecciones, consejos de inversión, impuestos que no sean el monotributo), respondé lo que puedas con los datos y aclará el límite. Nunca inventes números.
No inventes datos. Podés responder en hasta 4 oraciones. Sin markdown."""


# ── Función de clasificación ──────────────────────────────────────────────────

# Saludos y cortesías: se responden con un mensaje fijo, sin gastar Gemini
_SALUDOS = {
    "hola", "buenas", "buen dia", "buen día", "buenas tardes", "buenas noches",
    "gracias", "muchas gracias", "ok", "oka", "okey", "dale", "genial",
    "perfecto", "joya", "barbaro", "bárbaro", "buenisimo", "buenísimo", "listo",
    "de nada", "chau", "adios", "adiós", "hasta luego", "nos vemos",
}

# Señales inequívocas de registro: verbos de acción sobre una sesión/pago
_REGISTRO_FUERTE = (
    "registra", "registrá", "anota", "anotá", "carga", "cargá", "cargale",
    "vino ", "vino,", "atendi", "atendí", "pago ", "pagó", "pago,", "me pago",
    "abono", "abonó", "cobre ", "cobré", "transfirio", "transfirió",
    "falto", "faltó", "no vino", "inasistencia",
    "cancelo", "canceló", "cancele", "cancelé", "tuve que cancelar",
    "quedo debiendo", "quedó debiendo", "me debe la", "sesion de", "sesión de",
)

# Señales inequívocas de consulta: interrogativos y vocabulario financiero
_CONSULTA_FUERTE = (
    "cuanto", "cuánto", "cuando", "cuándo", "quien", "quién", "cual", "cuál",
    "como vengo", "cómo vengo", "como voy", "cómo voy", "que podes", "qué podés",
    "que puedo", "qué puedo", "resumen", "gaste", "gasté", "gastos", "egreso",
    "utilidad", "ganancia", "neto", "facture", "facturé", "facturacion",
    "facturación", "mejor mes", "monotributo", "me conviene", "deudores",
    "me deben", "inflacion", "inflación", "dolar", "dólar",
)


def _heuristica_intencion(texto: str) -> str | None:
    """Clasificación determinística, sin gastar cuota de Gemini.
    Devuelve "saludo", "consulta", "registro_turno", o None si es ambiguo
    (y ahí sí vale la pena preguntarle a Gemini)."""
    t = texto.lower().strip()
    if t.strip("!¡¿?. ") in _SALUDOS:
        return "saludo"
    es_registro = any(s in t for s in _REGISTRO_FUERTE)
    es_consulta = "?" in t or any(s in t for s in _CONSULTA_FUERTE)
    # Imperativo de registro ("anotá que...") le gana a palabras de consulta
    # sueltas, salvo que haya un signo de pregunta explícito
    if es_registro and "?" not in t:
        return "registro_turno"
    if es_consulta and not es_registro:
        return "consulta"
    if es_consulta and es_registro:
        return "consulta"  # pregunta explícita sobre un registro → consultar
    return None


def clasificar_intencion(texto: str) -> str:
    """
    Devuelve "registro_turno", "consulta" o "saludo".
    Heurística primero: los casos claros no gastan cuota de Gemini (el tier
    gratis da 5 requests/min y cada mensaje ya consume 1-2 en extracción o
    respuesta — ahorrar la clasificación duplica la capacidad efectiva).
    Gemini solo decide los mensajes genuinamente ambiguos.
    """
    resultado = _heuristica_intencion(texto)
    if resultado is not None:
        return resultado

    cliente = genai.Client(api_key=config.gemini_api_key)
    try:
        resp = cliente.models.generate_content(
            model=config.gemini_model,
            contents=texto,
            config=types.GenerateContentConfig(
                system_instruction=PROMPT_CLASIFICACION,
                temperature=0.0,
                # Margen amplio: los modelos con thinking consumen tokens de
                # salida antes de emitir texto; con 10 devolvían text=None
                max_output_tokens=500,
            ),
        )
        resultado = (resp.text or "").strip().lower()
        if "consulta" in resultado:
            return "consulta"
        return "registro_turno"
    except Exception as e:
        logger.warning("Error al clasificar intención: %s — asumiendo registro", e)
        return "registro_turno"


# ── Función de respuesta a consultas ─────────────────────────────────────────

def responder_consulta(texto: str, contexto: dict) -> str:
    """
    Responde una pregunta financiera usando el contexto del dashboard.
    contexto: dict con métricas actuales (cobrado_mes, deudores, etc.)
    """
    cliente = genai.Client(api_key=config.gemini_api_key)

    # Formatear el contexto como texto legible para Gemini
    meses = contexto.get("ventas_mensuales", [])
    historial = " | ".join(
        f"{m['mes']}: ${m['cobrado']:,.0f}" for m in meses
    ) if meses else "sin datos"

    top_deudores = contexto.get("top_deudores", [])
    deudores_txt = ", ".join(
        f"{d['nombre']} (${d['monto']:,.0f})" for d in top_deudores
    ) if top_deudores else "ninguno"

    medios = contexto.get("medios_pago_mes", {})
    medios_txt = ", ".join(f"{k}: {v}" for k, v in medios.items()) if medios else "sin datos"

    egr_por_cat = contexto.get("egresos_por_categoria", {})
    egr_cat_txt = ", ".join(
        f"{k}: ${v:,.0f}" for k, v in sorted(egr_por_cat.items(), key=lambda x: -x[1])
    ) if egr_por_cat else "sin datos"
    egr_hist = contexto.get("egresos_mensuales", [])
    egr_hist_txt = " | ".join(
        f"{m['mes']}: ${m['egresos']:,.0f}" for m in egr_hist
    ) if egr_hist else "sin datos"

    contexto_txt = f"""Datos financieros actuales (fecha: {hoy_argentina().strftime('%d/%m/%Y')}):
INGRESOS (criterio percibido — turnos cobrados efectivamente):
- Cobrado este mes: ${contexto.get('cobrado_mes', 0):,.0f}
- En camino (prepagas pendientes este mes): ${contexto.get('en_camino_mes', 0):,.0f}
- Sin cobrar (meses anteriores vencido): ${contexto.get('deudores', 0):,.0f}
- Sesiones este mes: {contexto.get('total_turnos_mes', 0)}
- Inasistencias este mes: {contexto.get('inasistencias_mes', 0)}
- Honorario promedio: ${contexto.get('honorario_promedio', 0):,.0f}
- Historial ingresos 6 meses: {historial}
- Pacientes con deuda vencida: {deudores_txt}
- Medios de pago (sesiones del mes): {medios_txt}
EGRESOS (gastos del mes):
- Total egresos este mes: ${contexto.get('egresos_mes', 0):,.0f} (fijos: ${contexto.get('egresos_fijos_mes', 0):,.0f} | variables: ${contexto.get('egresos_variables_mes', 0):,.0f})
- Egresos por categoría: {egr_cat_txt}
- Historial egresos 6 meses: {egr_hist_txt}
RESULTADO:
- Utilidad neta del mes (cobrado − egresos): ${contexto.get('utilidad_neta', contexto.get('cobrado_mes', 0)):,.0f}"""

    prompt = f"{contexto_txt}\n\nPregunta del psicólogo: {texto}"

    try:
        resp = cliente.models.generate_content(
            model=config.gemini_model,
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=PROMPT_CONSULTA,
                temperature=0.3,
                max_output_tokens=600,
            ),
        )
        return resp.text.strip()
    except Exception as e:
        logger.error("Error al responder consulta: %s", e)
        if _es_error_cuota(e):
            return ("Recibí muchos mensajes seguidos y me quedé sin capacidad "
                    "por un momento. Esperá unos 30 segundos y volvé a preguntarme.")
        return "No pude procesar tu consulta en este momento. Intentá de nuevo."


# ── Extracción de datos de turno ──────────────────────────────────────────────

def extraer_datos_turno(texto: str, historial: list[dict] | None = None) -> DatosTurnoNLP:
    """
    Llama a Gemini con el mensaje del psicólogo y devuelve los datos estructurados del turno.
    """
    cliente = genai.Client(api_key=config.gemini_api_key)

    # Incluir historial reciente para dar contexto (máx últimos 4 mensajes)
    contexto_historial = ""
    if historial:
        ultimos = historial[-4:]
        contexto_historial = "Conversación previa:\n" + "\n".join(
            f"{'Psicólogo' if m['rol'] == 'user' else 'Sistema'}: {m['texto']}"
            for m in ultimos
        ) + "\n\n"

    prompt_con_fecha = (
        f"Fecha actual: {hoy_argentina().isoformat()}\n\n"
        f"{contexto_historial}"
        f"Mensaje del psicólogo: {texto}"
    )

    try:
        respuesta = cliente.models.generate_content(
            model=config.gemini_model,
            contents=prompt_con_fecha,
            config=types.GenerateContentConfig(
                system_instruction=PROMPT_EXTRACCION,
                response_mime_type="application/json",
                temperature=0.1,
                max_output_tokens=512,
            ),
        )
        texto_respuesta = respuesta.text.strip()
    except Exception as e:
        if _es_error_cuota(e):
            raise ErrorCuotaNLP(f"Cuota de Gemini agotada: {e}") from e
        raise ErrorNLP(f"Error al llamar a Gemini: {e}") from e

    try:
        datos = json.loads(texto_respuesta)
    except json.JSONDecodeError as e:
        raise ErrorNLP(f"Gemini no devolvió JSON válido: {texto_respuesta[:200]}") from e

    campos_requeridos = {"paciente", "monto", "es_prepaga", "obra_social", "fecha", "confianza"}
    faltantes = campos_requeridos - set(datos.keys())
    if faltantes:
        raise ErrorNLP(f"Gemini omitió campos: {faltantes}")

    try:
        fecha_extraida = date.fromisoformat(str(datos["fecha"]))
    except (ValueError, TypeError):
        fecha_extraida = hoy_argentina()

    try:
        monto = max(float(datos["monto"]), 0.0)
    except (ValueError, TypeError):
        monto = 0.0

    medios_validos = {"EFECTIVO", "TRANSFERENCIA", "MERCADO_PAGO", "TARJETA", "OTRO"}
    medio_raw = str(datos.get("medio_pago") or "").upper().strip()
    medio_pago = medio_raw if medio_raw in medios_validos else None

    tipos_validos = {"SESION", "INASISTENCIA_JUSTIFICADA", "INASISTENCIA_INJUSTIFICADA", "CANCELACION_PROFESIONAL"}
    tipo_raw = str(datos.get("tipo_sesion") or "SESION").upper().strip()
    tipo_sesion = tipo_raw if tipo_raw in tipos_validos else "SESION"

    moneda_raw = str(datos.get("moneda") or "ARS").upper().strip()
    moneda = moneda_raw if moneda_raw in {"ARS", "USD"} else "ARS"

    return DatosTurnoNLP(
        paciente=str(datos["paciente"]).strip(),
        monto=monto,
        es_prepaga=bool(datos["es_prepaga"]),
        obra_social=datos.get("obra_social") or None,
        fecha=fecha_extraida,
        confianza=str(datos.get("confianza", "media")),
        medio_pago=medio_pago,
        tipo_sesion=tipo_sesion,
        moneda=moneda,
    )
