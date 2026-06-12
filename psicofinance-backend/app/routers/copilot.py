# Router del Copiloto NLP.
# Usa Supabase REST API via SupabaseClient (sin SQLAlchemy).

import logging
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from dateutil.relativedelta import relativedelta

from google import genai
from google.genai import types as genai_types

from app.config import config
from app.supabase_client import SupabaseClient, get_supabase
from app.models.enums import EstadoTurno, OrigenPago, MedioPago, TipoSesion, Moneda
from app.services.dolar_service import get_dolar_blue
from app.schemas.copilot import ChatRequest, ChatResponse, DatosExtraidos, MensajeHistorial
from app.schemas.comprobante import DatosBorrador, AprobarBorradorRequest
from app.schemas.turno import TurnoCreate, TurnoRead
from app.services.nlp_service import extraer_datos_turno, clasificar_intencion, responder_consulta, ErrorNLP
from app.services.nlp_comprobante import extraer_datos_comprobante
from app.crud.paciente import obtener_o_crear_paciente
from app.crud.turno import crear_turno, actualizar_turno
from app.schemas.turno import TurnoUpdate

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/copilot", tags=["Copiloto NLP"])

MESES_ES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"]


def _parse_date(val):
    if val is None:
        return None
    if isinstance(val, date):
        return val
    return date.fromisoformat(str(val)[:10])


def _procesar_chat(mensaje: str, historial: list, sb: SupabaseClient, transcripcion: str | None = None) -> ChatResponse:
    """Lógica central del copiloto. Usada por /chat y /audio."""
    intencion = clasificar_intencion(mensaje)

    if intencion == "consulta":
        hoy = date.today()
        primer_dia = hoy.replace(day=1)
        sig_mes = (hoy + relativedelta(months=1)).replace(day=1)

        turnos = sb.select("turnos", {
            "select": "paciente_id,monto,estado,fecha_turno,fecha_cobro_efectivo,fecha_cobro_estimada,medio_pago,tipo_sesion",
        })
        pacientes_raw = sb.select("pacientes", {"select": "id,nombre,apellido"})
        pac_map = {p["id"]: f"{p.get('nombre','')} {p.get('apellido','')}".strip() for p in pacientes_raw}

        cobrado_mes = sum(
            float(t.get("monto") or 0) for t in turnos
            if t.get("estado") == "COBRADO"
            and _parse_date(t.get("fecha_cobro_efectivo")) is not None
            and primer_dia <= _parse_date(t["fecha_cobro_efectivo"]) < sig_mes
        )
        en_camino = sum(
            float(t.get("monto") or 0) for t in turnos
            if t.get("estado") == "DIFERIDO"
            and _parse_date(t.get("fecha_turno")) is not None
            and primer_dia <= _parse_date(t["fecha_turno"]) < sig_mes
        )
        deudores = sum(
            float(t.get("monto") or 0) for t in turnos
            if t.get("estado") == "DIFERIDO"
            and _parse_date(t.get("fecha_turno")) is not None
            and _parse_date(t["fecha_turno"]) < primer_dia
        )
        total_turnos = sum(
            1 for t in turnos
            if t.get("estado") != "INCOBRABLE"
            and _parse_date(t.get("fecha_turno")) is not None
            and primer_dia <= _parse_date(t["fecha_turno"]) < sig_mes
        )
        inasistencias_mes = sum(
            1 for t in turnos
            if t.get("estado") == "INCOBRABLE"
            and _parse_date(t.get("fecha_turno")) is not None
            and primer_dia <= _parse_date(t["fecha_turno"]) < sig_mes
        )
        cobrados_mes_list = [
            float(t.get("monto") or 0) for t in turnos
            if t.get("estado") == "COBRADO"
            and _parse_date(t.get("fecha_turno")) is not None
            and _parse_date(t["fecha_turno"]) >= primer_dia
        ]
        honorario_prom = (sum(cobrados_mes_list) / len(cobrados_mes_list)) if cobrados_mes_list else 0.0

        ventas = []
        for i in range(5, -1, -1):
            ini = (hoy - relativedelta(months=i)).replace(day=1)
            fin = ini + relativedelta(months=1)
            c = sum(
                float(t.get("monto") or 0) for t in turnos
                if t.get("estado") == "COBRADO"
                and _parse_date(t.get("fecha_cobro_efectivo")) is not None
                and ini <= _parse_date(t["fecha_cobro_efectivo"]) < fin
            )
            ventas.append({"mes": MESES_ES[ini.month - 1], "cobrado": float(c)})

        # Deudores por nombre (turnos DIFERIDO vencidos)
        deudores_detalle: dict[str, float] = {}
        for t in turnos:
            if t.get("estado") == "DIFERIDO":
                ft = _parse_date(t.get("fecha_turno"))
                if ft and ft < primer_dia:
                    nombre = pac_map.get(t.get("paciente_id"), "Desconocido")
                    deudores_detalle[nombre] = deudores_detalle.get(nombre, 0) + float(t.get("monto") or 0)
        top_deudores = sorted(deudores_detalle.items(), key=lambda x: -x[1])[:5]

        # Distribución de medio_pago este mes
        medios: dict[str, int] = {}
        for t in turnos:
            ft = _parse_date(t.get("fecha_turno"))
            if ft and primer_dia <= ft < sig_mes and t.get("estado") != "INCOBRABLE":
                m = t.get("medio_pago") or "SIN_ESPECIFICAR"
                medios[m] = medios.get(m, 0) + 1

        # ── Egresos: mes actual + últimos 6 meses ─────────────────────────────
        inicio_egresos = primer_dia - relativedelta(months=5)
        egresos_rows = sb.select("egresos", {
            "select": "monto,tipo,categoria,fecha",
            "fecha": f"gte.{inicio_egresos.isoformat()}",
            "limit": "2000",
        })
        egresos_rows = [e for e in egresos_rows if (_parse_date(e.get("fecha")) or date.min) < sig_mes]

        egresos_mes_list = [
            e for e in egresos_rows
            if primer_dia <= (_parse_date(e.get("fecha")) or date.min) < sig_mes
        ]
        total_egresos_mes = sum(float(e.get("monto") or 0) for e in egresos_mes_list)
        egresos_fijos_mes = sum(float(e.get("monto") or 0) for e in egresos_mes_list if e.get("tipo") == "FIJO")
        egresos_variables_mes = sum(float(e.get("monto") or 0) for e in egresos_mes_list if e.get("tipo") == "VARIABLE")

        egresos_por_cat: dict[str, float] = {}
        for e in egresos_mes_list:
            cat = e.get("categoria") or "OTRO"
            egresos_por_cat[cat] = egresos_por_cat.get(cat, 0.0) + float(e.get("monto") or 0)

        egresos_mensuales: list[dict] = []
        for i in range(5, -1, -1):
            ini = primer_dia - relativedelta(months=i)
            clave = f"{ini.year:04d}-{ini.month:02d}"
            total_e = sum(
                float(e.get("monto") or 0) for e in egresos_rows
                if str(_parse_date(e.get("fecha")) or date.min)[:7] == clave
            )
            egresos_mensuales.append({"mes": MESES_ES[ini.month - 1], "egresos": float(total_e)})

        contexto = {
            "cobrado_mes":           float(cobrado_mes),
            "en_camino_mes":         float(en_camino),
            "deudores":              float(deudores),
            "total_turnos_mes":      int(total_turnos),
            "inasistencias_mes":     int(inasistencias_mes),
            "honorario_promedio":    float(honorario_prom),
            "perdida_inflacion":     0,
            "ventas_mensuales":      ventas,
            "top_deudores":          [{"nombre": n, "monto": m} for n, m in top_deudores],
            "medios_pago_mes":       medios,
            "egresos_mes":           float(total_egresos_mes),
            "egresos_fijos_mes":     float(egresos_fijos_mes),
            "egresos_variables_mes": float(egresos_variables_mes),
            "egresos_por_categoria": egresos_por_cat,
            "egresos_mensuales":     egresos_mensuales,
            "utilidad_neta":         float(cobrado_mes - total_egresos_mes),
        }

        respuesta_texto = responder_consulta(mensaje, contexto)
        return ChatResponse(confirmacion=respuesta_texto, accion="respuesta", transcripcion=transcripcion)

    # Registro de turno
    try:
        historial_dicts = [m.model_dump() for m in historial] if historial else None
        datos = extraer_datos_turno(mensaje, historial=historial_dicts)
    except ErrorNLP as e:
        logger.error("Error NLP: %s", e)
        return ChatResponse(
            confirmacion="No pude entender el mensaje. Podés ser más específico? (ej: 'Vino Martín, pagó 10000 con OSDE')",
            accion="error_nlp",
            transcripcion=transcripcion,
        )

    if not datos.paciente or datos.paciente == "Sin identificar":
        return ChatResponse(
            confirmacion="No identifiqué el nombre del paciente. Por favor mencionalo en el mensaje.",
            accion="datos_insuficientes",
            datos_extraidos=_a_schema(datos),
            transcripcion=transcripcion,
        )

    if datos.monto <= 0:
        return ChatResponse(
            confirmacion=f"Entendí que atendiste a {datos.paciente}, pero no pude identificar el monto. Podés agregarlo?",
            accion="datos_insuficientes",
            datos_extraidos=_a_schema(datos),
            transcripcion=transcripcion,
        )

    try:
        paciente, fue_creado = obtener_o_crear_paciente(sb, datos.paciente)
    except Exception as e:
        logger.error("Error BD al gestionar paciente: %s", e)
        raise HTTPException(status_code=503, detail="Base de datos no disponible.")

    # Inasistencias y cancelaciones se registran como INCOBRABLE si monto=0
    es_inasistencia = datos.tipo_sesion in ("INASISTENCIA_INJUSTIFICADA", "INASISTENCIA_JUSTIFICADA", "CANCELACION_PROFESIONAL")
    if es_inasistencia and datos.monto == 0:
        estado = EstadoTurno.INCOBRABLE
        origen = OrigenPago.DIRECTO
        fecha_cobro_estimada = None
        fecha_cobro_efectivo = None
    else:
        origen = OrigenPago.PREPAGA if datos.es_prepaga else OrigenPago.DIRECTO
        estado = EstadoTurno.DIFERIDO if datos.es_prepaga else EstadoTurno.COBRADO
        fecha_cobro_estimada = None
        fecha_cobro_efectivo = None
        if datos.es_prepaga:
            fecha_cobro_estimada = datos.fecha + timedelta(days=60)
        else:
            fecha_cobro_efectivo = datos.fecha

    medio = MedioPago(datos.medio_pago) if datos.medio_pago else None
    tipo = TipoSesion(datos.tipo_sesion)
    moneda = Moneda(datos.moneda) if datos.moneda in ("ARS", "USD") else Moneda.ARS

    # Obtener tipo de cambio si es USD
    tipo_cambio: float | None = None
    if moneda == Moneda.USD:
        tipo_cambio = get_dolar_blue()

    datos_turno = TurnoCreate(
        paciente_id=paciente["id"],
        fecha_turno=datos.fecha,
        monto=datos.monto,
        estado=estado,
        origen_pago=origen,
        fecha_cobro_estimada=fecha_cobro_estimada,
        prepaga=datos.obra_social,
        medio_pago=medio,
        tipo_sesion=tipo,
        moneda=moneda,
        tipo_cambio=tipo_cambio,
    )

    try:
        turno = crear_turno(sb, datos_turno)
        # Actualizar fecha_cobro_efectivo si aplica
        if fecha_cobro_efectivo and turno:
            turno = actualizar_turno(sb, turno["id"], TurnoUpdate(fecha_cobro_efectivo=fecha_cobro_efectivo))
    except Exception as e:
        logger.error("Error BD al crear turno: %s", e)
        raise HTTPException(status_code=503, detail="Base de datos no disponible.")

    # Formatear monto según moneda
    if moneda == Moneda.USD:
        monto_fmt = f"USD {datos.monto:,.0f}"
        if tipo_cambio:
            monto_ars = datos.monto * tipo_cambio
            monto_fmt += f" (≈ ${monto_ars:,.0f} al blue)".replace(",", ".")
    else:
        monto_fmt = f"${datos.monto:,.0f}".replace(",", ".")
    fecha_fmt = datos.fecha.strftime("%d/%m/%Y")
    prepaga_txt = f" ({datos.obra_social})" if datos.obra_social else ""
    medio_txt = f" · {datos.medio_pago.replace('_', ' ').title()}" if datos.medio_pago else ""
    nuevo_txt = " (paciente nuevo creado)" if fue_creado else ""

    TIPO_LABELS = {
        "SESION": "registrada como cobrada",
        "INASISTENCIA_JUSTIFICADA": "inasistencia justificada",
        "INASISTENCIA_INJUSTIFICADA": "inasistencia injustificada",
        "CANCELACION_PROFESIONAL": "cancelación del profesional",
    }
    if es_inasistencia and datos.monto == 0:
        estado_txt = TIPO_LABELS.get(datos.tipo_sesion, "registrada")
    elif datos.es_prepaga:
        estado_txt = "pendiente de cobro de la prepaga"
    else:
        estado_txt = "registrada como cobrada"

    confirmacion = (
        f"Listo! Registré la sesión de {datos.paciente}{nuevo_txt}: "
        f"{monto_fmt}{prepaga_txt}{medio_txt} el {fecha_fmt}. "
        f"Estado: {estado_txt}."
    )

    return ChatResponse(
        confirmacion=confirmacion,
        accion="turno_registrado",
        datos_extraidos=_a_schema(datos),
        turno_creado=TurnoRead.model_validate(turno),
        paciente_nuevo=fue_creado,
        transcripcion=transcripcion,
    )


@router.post("/chat", response_model=ChatResponse, status_code=status.HTTP_200_OK)
def procesar_mensaje(body: ChatRequest, sb: SupabaseClient = Depends(get_supabase)):
    return _procesar_chat(body.mensaje, body.historial, sb)


AUDIO_TIPOS_PERMITIDOS = {
    "audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg",
    "audio/wav", "audio/x-wav", "audio/m4a", "audio/aac",
}


@router.post("/audio", response_model=ChatResponse, status_code=status.HTTP_200_OK)
async def procesar_audio(
    archivo: UploadFile = File(...),
    sb: SupabaseClient = Depends(get_supabase),
):
    content_type = (archivo.content_type or "audio/webm").split(";")[0].strip()

    MAX_BYTES = 10 * 1024 * 1024
    contenido = await archivo.read()
    if len(contenido) > MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="El audio supera el límite de 10 MB.",
        )

    try:
        client = genai.Client(api_key=config.gemini_api_key)
        response = client.models.generate_content(
            model=config.gemini_model,
            contents=[
                genai_types.Part.from_bytes(data=contenido, mime_type=content_type),
                "Transcribí este audio. El hablante es un psicólogo argentino registrando sesiones con pacientes. "
                "Devolvé únicamente el texto transcripto, sin formato adicional ni explicaciones.",
            ],
        )
        transcripcion = response.text.strip()
    except Exception as e:
        logger.error("Error transcripción audio: %s", e)
        raise HTTPException(status_code=503, detail="No se pudo transcribir el audio.")

    if not transcripcion:
        raise HTTPException(status_code=422, detail="El audio no contiene voz reconocible.")

    return _procesar_chat(transcripcion, [], sb, transcripcion=transcripcion)


def _a_schema(datos) -> DatosExtraidos:
    return DatosExtraidos(
        paciente=datos.paciente,
        monto=datos.monto,
        es_prepaga=datos.es_prepaga,
        obra_social=datos.obra_social,
        fecha=datos.fecha,
        confianza=datos.confianza,
        medio_pago=datos.medio_pago,
        tipo_sesion=datos.tipo_sesion,
        moneda=datos.moneda,
    )


# ---------------------------------------------------------------------------
# Endpoints de Conciliación de Comprobantes (Sprint 3)
# ---------------------------------------------------------------------------

MIME_TIPOS_PERMITIDOS = {
    "image/jpeg", "image/jpg", "image/png", "image/webp",
    "image/gif", "application/pdf",
}


@router.post(
    "/comprobante",
    response_model=DatosBorrador,
    status_code=status.HTTP_200_OK,
    summary="Analizar comprobante de pago con Gemini Vision",
)
async def analizar_comprobante(
    archivo: UploadFile = File(...),
):
    content_type = archivo.content_type or ""
    if content_type not in MIME_TIPOS_PERMITIDOS:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Tipo de archivo no soportado: {content_type}. Usá JPG, PNG o PDF.",
        )

    MAX_BYTES = 10 * 1024 * 1024
    contenido = await archivo.read()
    if len(contenido) > MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="El archivo supera el límite de 10 MB.",
        )

    try:
        datos = extraer_datos_comprobante(contenido, content_type)
    except ValueError as e:
        logger.error("Error Vision: %s", e)
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))

    return DatosBorrador(
        nombre_emisor=datos["nombre_emisor"],
        monto=datos["monto"],
        fecha=date.fromisoformat(datos["fecha"]),
        confianza=datos["confianza"],
        advertencia_monto=None,
    )


@router.post(
    "/comprobante/aprobar",
    response_model=ChatResponse,
    status_code=status.HTTP_200_OK,
    summary="Aprobar borrador de comprobante y crear turno",
)
def aprobar_comprobante(
    body: AprobarBorradorRequest,
    sb: SupabaseClient = Depends(get_supabase),
):
    try:
        paciente, fue_creado = obtener_o_crear_paciente(sb, body.nombre_emisor)
    except Exception as e:
        logger.error("Error BD al gestionar paciente (comprobante): %s", e)
        raise HTTPException(status_code=503, detail="Base de datos no disponible.")

    datos_turno = TurnoCreate(
        paciente_id=paciente["id"],
        fecha_turno=body.fecha,
        monto=body.monto,
        estado=EstadoTurno.COBRADO,
        origen_pago=OrigenPago.DIRECTO,
        fecha_cobro_estimada=None,
        fecha_cobro_efectivo=body.fecha,
    )

    try:
        turno = crear_turno(sb, datos_turno)
    except Exception as e:
        logger.error("Error BD al crear turno (comprobante): %s", e)
        raise HTTPException(status_code=503, detail="Base de datos no disponible.")

    monto_fmt = f"${body.monto:,.0f}".replace(",", ".")
    fecha_fmt = body.fecha.strftime("%d/%m/%Y")
    nuevo_txt = " (paciente nuevo)" if fue_creado else ""

    confirmacion = (
        f"Comprobante conciliado. Turno de {body.nombre_emisor}{nuevo_txt}: "
        f"{monto_fmt} el {fecha_fmt}. Cobrado."
    )

    return ChatResponse(
        confirmacion=confirmacion,
        accion="turno_registrado",
        datos_extraidos=None,
        turno_creado=TurnoRead.model_validate(turno),
        paciente_nuevo=fue_creado,
    )
