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

logger = logging.getLogger(__name__)


# ── Tipos de retorno ──────────────────────────────────────────────────────────

@dataclass
class DatosTurnoNLP:
    paciente:   str
    monto:      float
    es_prepaga: bool
    obra_social: str | None
    fecha:      date
    confianza:  str  # "alta" | "media" | "baja"


class ErrorNLP(Exception):
    pass


# ── Prompts ───────────────────────────────────────────────────────────────────

PROMPT_CLASIFICACION = """Sos un clasificador de intenciones para PsicoFinance,
una app de finanzas para psicólogos.

Clasificá el mensaje en UNA de estas dos categorías:
- "registro_turno": el psicólogo quiere registrar una sesión, turno o atención con un paciente
- "consulta": el psicólogo hace una pregunta sobre sus finanzas, ingresos, estadísticas o pide información

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
- "confianza": "alta" si todos los datos son claros, "media" si algo fue inferido, "baja" si hay ambigüedad

Reglas:
- Si no hay monto, devolvé monto: 0
- Si no hay fecha, usá la fecha actual
- Si no se menciona paciente, devolvé paciente: "Sin identificar"
- Jerga argentina: "lucas"=miles, "palo"=millón, "k"=miles

Ejemplo: {"paciente":"Martín","monto":10000,"es_prepaga":false,"obra_social":null,"fecha":"2025-04-24","confianza":"alta"}"""

PROMPT_CONSULTA = """Sos el copiloto financiero de PsicoFinance, una app para psicólogos independientes en Argentina.
Respondé la pregunta del psicólogo de forma clara y útil, en español rioplatense (tuteá).
Usá los datos financieros provistos como contexto. Si la pregunta no tiene respuesta en los datos, decilo honestamente.
No inventes datos. Podés responder en hasta 4 oraciones. Sin markdown."""


# ── Función de clasificación ──────────────────────────────────────────────────

def clasificar_intencion(texto: str) -> str:
    """
    Devuelve "registro_turno" o "consulta".
    En caso de error, defaultea a "registro_turno" para no romper el flujo.
    """
    cliente = genai.Client(api_key=config.gemini_api_key)
    try:
        resp = cliente.models.generate_content(
            model=config.gemini_model,
            contents=texto,
            config=types.GenerateContentConfig(
                system_instruction=PROMPT_CLASIFICACION,
                temperature=0.0,
                max_output_tokens=10,
            ),
        )
        resultado = resp.text.strip().lower()
        if "consulta" in resultado:
            return "consulta"
        return "registro_turno"
    except Exception as e:
        logger.warning("Error al clasificar intención: %s — defaulteando a registro_turno", e)
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

    contexto_txt = f"""Datos financieros actuales (fecha: {date.today().strftime('%d/%m/%Y')}):
- Cobrado este mes: ${contexto.get('cobrado_mes', 0):,.0f}
- En camino (prepagas pendientes): ${contexto.get('en_camino_mes', 0):,.0f}
- Sin cobrar (vencido): ${contexto.get('deudores', 0):,.0f}
- Sesiones este mes: {contexto.get('total_turnos_mes', 0)}
- Honorario promedio: ${contexto.get('honorario_promedio', 0):,.0f}
- Pérdida por inflación (DIFERIDO): ${contexto.get('perdida_inflacion', 0):,.0f}
- Historial 6 meses: {historial}"""

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
        f"Fecha actual: {date.today().isoformat()}\n\n"
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
        fecha_extraida = date.today()

    try:
        monto = max(float(datos["monto"]), 0.0)
    except (ValueError, TypeError):
        monto = 0.0

    return DatosTurnoNLP(
        paciente=str(datos["paciente"]).strip(),
        monto=monto,
        es_prepaga=bool(datos["es_prepaga"]),
        obra_social=datos.get("obra_social") or None,
        fecha=fecha_extraida,
        confianza=str(datos.get("confianza", "media")),
    )
