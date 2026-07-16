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


# Cadena de modelos de respaldo: el tier gratis de Gemini tiene cuota DIARIA
# por modelo (¡20 requests/día para 2.5-flash!), pero cada modelo tiene su
# propio balde de cuota. Si el principal se agota, probamos los siguientes —
# multiplica la capacidad gratuita diaria y evita que el copiloto se quede mudo.
# Verificados en vivo el 15/07/2026: estos responden con esta key.
_MODELOS_FALLBACK = [
    "gemini-flash-lite-latest",
    "gemini-3.1-flash-lite",
    "gemini-3.5-flash",
]


def _generar_con_fallback(contents, config_gen: "types.GenerateContentConfig"):
    """Intenta el modelo configurado y cae en cascada a los de respaldo si la
    cuota está agotada (429) o el modelo fue dado de baja (404).
    Otros errores se propagan de inmediato."""
    cliente = genai.Client(api_key=config.gemini_api_key)
    modelos = [config.gemini_model] + [m for m in _MODELOS_FALLBACK if m != config.gemini_model]
    ultimo_error: Exception | None = None
    for modelo in modelos:
        try:
            resp = cliente.models.generate_content(
                model=modelo, contents=contents, config=config_gen,
            )
            if modelo != config.gemini_model:
                logger.info("NLP: %s no disponible — respondió %s", config.gemini_model, modelo)
            return resp
        except Exception as e:
            txt = str(e)
            if _es_error_cuota(e) or "404" in txt or "NOT_FOUND" in txt:
                ultimo_error = e
                continue
            raise
    raise ErrorCuotaNLP(f"Cuota agotada en todos los modelos: {ultimo_error}") from ultimo_error


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

Tenés el panorama financiero COMPLETO del consultorio: totales del mes, historial,
egresos, monotributo, la agenda semanal y la ficha de CADA paciente (honorario,
última sesión, sesiones del mes, deuda). Usalos con confianza: si la respuesta
está en los datos, respondé directo con el número o el dato concreto — nunca
digas "no tengo esa información" si figura en el contexto. Buscá nombres de
pacientes con tolerancia (mayúsculas, solo nombre de pila, apellido).

Si te preguntan qué podés hacer (o cómo usarte), explicá tus dos funciones:
1) Registrar sesiones por chat o audio: "vino Martina, pagó 35 mil en efectivo" — entendés fechas relativas, prepagas, dólares e inasistencias.
2) Responder consultas sobre sus finanzas y pacientes: facturación, deudores, gastos, utilidad, monotributo, honorarios y agenda.

Si preguntan algo que genuinamente NO está en los datos (proyecciones, consejos
de inversión, impuestos que no sean el monotributo), respondé lo que puedas con
los datos y aclará el límite. Nunca inventes números.
Respondé en hasta 4 oraciones (o una lista corta si piden varios datos). Sin markdown."""


# ── Función de clasificación ──────────────────────────────────────────────────

# Saludos y cortesías: se responden con un mensaje fijo, sin gastar Gemini
_SALUDOS = {
    "hola", "buenas", "buen dia", "buen día", "buenas tardes", "buenas noches",
    "gracias", "muchas gracias", "ok", "oka", "okey", "dale", "genial",
    "perfecto", "joya", "barbaro", "bárbaro", "buenisimo", "buenísimo", "listo",
    "de nada", "chau", "adios", "adiós", "hasta luego", "nos vemos",
}

# Saldar deuda existente (distinto de registrar una sesión nueva): un verbo
# de pago + una referencia explícita a algo YA adeudado. "Juan pagó 30000 hoy"
# es una sesión nueva (registro_turno); "Juan pagó lo que debía" es saldar la
# deuda de sesiones YA registradas como DIFERIDO — no hay que crear un turno
# nuevo, hay que marcar los existentes como cobrados.
_VERBOS_PAGO = (
    "pago", "pagó", "pagaron", "abono", "abonó", "abonaron",
    "cancelo", "canceló", "cancelaron", "cancele", "cancelé",
    "salda", "saldo", "saldó", "saldaron", "cubrio", "cubrió", "cubrieron",
    "transfirio", "transfirió", "transfirieron", "deposito", "depositó",
)
_REFERENCIA_DEUDA = (
    "lo que deb", "lo que me deb", "lo adeudado", "la deuda", "las deudas",
    "lo pendiente", "lo atrasado", "todo lo que deb", "lo que faltaba",
)


def _es_saldar_deuda(t: str) -> bool:
    return any(v in t for v in _VERBOS_PAGO) and any(r in t for r in _REFERENCIA_DEUDA)


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
    Devuelve "saludo", "consulta", "registro_turno", "saldar_deuda", o None
    si es ambiguo (y ahí sí vale la pena preguntarle a Gemini)."""
    t = texto.lower().strip()
    if t.strip("!¡¿?. ") in _SALUDOS:
        return "saludo"
    if _es_saldar_deuda(t) and "?" not in t:
        return "saldar_deuda"
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

    try:
        resp = _generar_con_fallback(
            texto,
            types.GenerateContentConfig(
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

    # Ficha por paciente — permite responder preguntas puntuales.
    # Ordenada por cobrado histórico desc: los rankings ("top de pacientes")
    # salen bien sin que el modelo tenga que ordenar números a mano.
    pacientes = sorted(
        contexto.get("pacientes_detalle", []),
        key=lambda p: -p.get("cobrado_total", 0),
    )
    if pacientes:
        lineas_pac = []
        for p in pacientes:
            hon = (f"USD {p['honorario']:,.0f}" if p.get("moneda") == "USD"
                   else f"${p['honorario']:,.0f}") if p.get("honorario") else "sin honorario cargado"
            deuda = f", debe ${p['deuda']:,.0f}" if p.get("deuda") else ""
            ajuste = f", último ajuste {p['ultimo_ajuste']}" if p.get("ultimo_ajuste") else ""
            atraso = ""
            if p.get("atraso_pct"):
                atraso = (f", atrasado {p['atraso_pct']}% vs inflación"
                          f" (sugerido ${p['sugerido']:,.0f})" if p.get("sugerido") else "")
            ult = p.get("ultima_sesion") or "nunca"
            lineas_pac.append(
                f"- {p['nombre']}: honorario {hon}{ajuste}{atraso} | última sesión {ult} | "
                f"{p['sesiones_mes']} sesiones este mes, {p['sesiones_tot']} en total | "
                f"cobrado histórico ${p.get('cobrado_total', 0):,.0f}{deuda}"
            )
        pacientes_txt = "\n".join(lineas_pac)
    else:
        pacientes_txt = "sin pacientes cargados"

    # Agenda semanal modelo — qué días/horarios atiende a cada uno
    agenda = contexto.get("agenda_semanal", [])
    if agenda:
        dias_nombres = {1: "Lun", 2: "Mar", 3: "Mié", 4: "Jue", 5: "Vie", 6: "Sáb", 7: "Dom"}
        por_dia: dict[int, list[str]] = {}
        for s in agenda:
            por_dia.setdefault(int(s.get("dia", 0)), []).append(
                f"{s.get('hora','?')} {s.get('paciente_nombre','?')}"
            )
        agenda_txt = " | ".join(
            f"{dias_nombres.get(d, d)} ({len(slots)} sesiones): {', '.join(sorted(slots))}"
            for d, slots in sorted(por_dia.items())
        )
    else:
        agenda_txt = "sin agenda semanal configurada"

    ipc_ctx = contexto.get("ipc") or {}
    ipc_txt = (
        f"último IPC mensual publicado (INDEC): {ipc_ctx.get('mensual_pct', 0):.1f}% ({ipc_ctx.get('periodo', 's/d')})"
    ) if ipc_ctx else "sin datos"

    mono = contexto.get("monotributo") or {}
    mono_txt = (
        f"categoría {mono.get('categoria')}, facturado 12m ${mono.get('facturado', 0):,.0f} "
        f"de ${mono.get('tope', 0):,.0f} de tope ({mono.get('porcentaje', 0):.0f}% consumido, "
        f"estado {mono.get('estado', '?')})"
    ) if mono else "sin datos"

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
- Utilidad neta del mes (cobrado − egresos): ${contexto.get('utilidad_neta', contexto.get('cobrado_mes', 0)):,.0f}
MONOTRIBUTO: {mono_txt}
INFLACIÓN: {ipc_txt}
AGENDA SEMANAL (horarios habituales): {agenda_txt}
PACIENTES (ficha completa; "cobrado histórico" = total pagado por ese paciente):
{pacientes_txt}"""

    prompt = f"{contexto_txt}\n\nPregunta del psicólogo: {texto}"

    try:
        resp = _generar_con_fallback(
            prompt,
            types.GenerateContentConfig(
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
                    "por un momento. Esperá un minuto y volvé a preguntarme.")
        return "No pude procesar tu consulta en este momento. Intentá de nuevo."


# ── Extracción de datos de turno ──────────────────────────────────────────────

def extraer_datos_turno(texto: str, historial: list[dict] | None = None) -> DatosTurnoNLP:
    """
    Llama a Gemini con el mensaje del psicólogo y devuelve los datos estructurados del turno.
    """
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
        respuesta = _generar_con_fallback(
            prompt_con_fecha,
            types.GenerateContentConfig(
                system_instruction=PROMPT_EXTRACCION,
                response_mime_type="application/json",
                temperature=0.1,
                max_output_tokens=512,
            ),
        )
        texto_respuesta = respuesta.text.strip()
    except ErrorCuotaNLP:
        raise
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
