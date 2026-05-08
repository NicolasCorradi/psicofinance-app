# Servicio de extracción de datos de comprobantes de pago.
# Usa la capacidad multimodal de Gemini 2.5 Flash para analizar imágenes
# de transferencias (MercadoPago, banco) y extraer: emisor, monto, fecha.
# No tiene dependencias de BD ni HTTP — recibe bytes, devuelve DatosBorrador.

import json
import logging
from datetime import date

from google import genai
from google.genai import types

from app.config import config

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Prompt del sistema para análisis de comprobantes
# ---------------------------------------------------------------------------

SYSTEM_PROMPT_COMPROBANTE = """Sos un asistente de extracción de datos para PsicoFinance.
Tu tarea es analizar imágenes o PDFs de comprobantes de pago (transferencias bancarias,
MercadoPago, Mercado Pago, CBU/CVU, etc.) y extraer los datos relevantes.

Respondés ÚNICAMENTE con un objeto JSON válido, sin markdown, sin texto adicional.

Campos a extraer:
- "nombre_emisor": string — nombre de la persona que hizo la transferencia (el paciente)
- "monto": number — monto de la transferencia en pesos argentinos
- "fecha": string — fecha de la operación en formato ISO 8601 (YYYY-MM-DD)
- "confianza": string — "alta" si todos los datos son claros, "media" si alguno fue inferido, "baja" si hay ambigüedad

Reglas:
- Si el nombre no está visible, usá "Sin identificar"
- Si el monto no está claro, usá 0
- Si la fecha no está visible, usá la fecha actual provista
- En MercadoPago, el nombre puede aparecer como "Transferencia de [nombre]" o el alias del CBU/CVU

Ejemplo de respuesta:
{"nombre_emisor": "Martín González", "monto": 10000, "fecha": "2025-04-24", "confianza": "alta"}
"""


# ---------------------------------------------------------------------------
# Función principal de extracción
# ---------------------------------------------------------------------------

def extraer_datos_comprobante(
    archivo_bytes: bytes,
    mime_type: str,
) -> dict:
    """
    Analiza un comprobante de pago con Gemini Vision y extrae los datos.

    Args:
        archivo_bytes: Contenido del archivo (imagen o PDF).
        mime_type: Tipo MIME del archivo (ej: "image/jpeg", "image/png", "application/pdf").

    Returns:
        Dict con: nombre_emisor, monto, fecha, confianza.
    """
    cliente = genai.Client(api_key=config.gemini_api_key)

    prompt_con_fecha = f"Fecha actual: {date.today().isoformat()}\n\nAnalizá este comprobante de pago."

    try:
        respuesta = cliente.models.generate_content(
            model=config.gemini_model,
            contents=[
                # Parte 1: la imagen o PDF
                types.Part.from_bytes(data=archivo_bytes, mime_type=mime_type),
                # Parte 2: instrucción + fecha actual
                prompt_con_fecha,
            ],
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT_COMPROBANTE,
                response_mime_type="application/json",
                temperature=0.1,
                max_output_tokens=256,
            ),
        )
        texto_respuesta = respuesta.text.strip()
        logger.debug("Respuesta Gemini Vision raw: %s", texto_respuesta)
    except Exception as e:
        raise ValueError(f"Error al llamar a Gemini Vision: {e}") from e

    # Parsear y validar el JSON
    try:
        datos = json.loads(texto_respuesta)
    except json.JSONDecodeError as e:
        raise ValueError(f"Gemini no devolvió JSON válido: {texto_respuesta[:200]}") from e

    # Parsear fecha — si falla, default a hoy
    try:
        fecha = date.fromisoformat(str(datos.get("fecha", date.today().isoformat())))
    except (ValueError, TypeError):
        logger.warning("Fecha inválida en comprobante, usando hoy.")
        fecha = date.today()

    # Sanitizar monto
    try:
        monto = max(float(datos.get("monto", 0)), 0.0)
    except (ValueError, TypeError):
        monto = 0.0

    return {
        "nombre_emisor": str(datos.get("nombre_emisor", "Sin identificar")).strip(),
        "monto": monto,
        "fecha": fecha.isoformat(),
        "confianza": str(datos.get("confianza", "baja")),
    }
