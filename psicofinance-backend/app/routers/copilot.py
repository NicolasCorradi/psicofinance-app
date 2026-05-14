# Router del Copiloto NLP.
# Usa Supabase REST API via SupabaseClient (sin SQLAlchemy).

import logging
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from dateutil.relativedelta import relativedelta

from app.supabase_client import SupabaseClient, get_supabase
from app.models.enums import EstadoTurno, OrigenPago
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


@router.post("/chat", response_model=ChatResponse, status_code=status.HTTP_200_OK)
def procesar_mensaje(body: ChatRequest, sb: SupabaseClient = Depends(get_supabase)):
    intencion = clasificar_intencion(body.mensaje)

    if intencion == "consulta":
        hoy = date.today()
        primer_dia = hoy.replace(day=1)
        sig_mes = (hoy + relativedelta(months=1)).replace(day=1)

        turnos = sb.select("turnos", {
            "select": "monto,estado,fecha_turno,fecha_cobro_efectivo,fecha_cobro_estimada",
        })

        cobrado_mes = sum(
            float(t.get("monto") or 0) for t in turnos
            if t.get("estado") == "COBRADO"
            and _parse_date(t.get("fecha_cobro_efectivo")) is not None
            and primer_dia <= _parse_date(t["fecha_cobro_efectivo"]) < sig_mes
        )
        en_camino = sum(
            float(t.get("monto") or 0) for t in turnos
            if t.get("estado") == "DIFERIDO"
            and _parse_date(t.get("fecha_cobro_estimada")) is not None
            and primer_dia <= _parse_date(t["fecha_cobro_estimada"]) < sig_mes
        )
        deudores = sum(
            float(t.get("monto") or 0) for t in turnos
            if t.get("estado") == "DIFERIDO"
            and _parse_date(t.get("fecha_cobro_estimada")) is not None
            and _parse_date(t["fecha_cobro_estimada"]) < primer_dia
        )
        total_turnos = sum(
            1 for t in turnos
            if _parse_date(t.get("fecha_turno")) is not None
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

        contexto = {
            "cobrado_mes":       float(cobrado_mes),
            "en_camino_mes":     float(en_camino),
            "deudores":          float(deudores),
            "total_turnos_mes":  int(total_turnos),
            "honorario_promedio": float(honorario_prom),
            "perdida_inflacion": 0,
            "ventas_mensuales":  ventas,
        }

        respuesta_texto = responder_consulta(body.mensaje, contexto)
        return ChatResponse(confirmacion=respuesta_texto, accion="respuesta")

    # Registro de turno
    try:
        historial_dicts = [m.model_dump() for m in body.historial] if body.historial else None
        datos = extraer_datos_turno(body.mensaje, historial=historial_dicts)
    except ErrorNLP as e:
        logger.error("Error NLP: %s", e)
        return ChatResponse(
            confirmacion="No pude entender el mensaje. Podés ser más específico? (ej: 'Vino Martín, pagó 10000 con OSDE')",
            accion="error_nlp",
        )

    if not datos.paciente or datos.paciente == "Sin identificar":
        return ChatResponse(
            confirmacion="No identifiqué el nombre del paciente. Por favor mencionalo en el mensaje.",
            accion="datos_insuficientes",
            datos_extraidos=_a_schema(datos),
        )

    if datos.monto <= 0:
        return ChatResponse(
            confirmacion=f"Entendí que atendiste a {datos.paciente}, pero no pude identificar el monto. Podés agregarlo?",
            accion="datos_insuficientes",
            datos_extraidos=_a_schema(datos),
        )

    try:
        paciente, fue_creado = obtener_o_crear_paciente(sb, datos.paciente)
    except Exception as e:
        logger.error("Error BD al gestionar paciente: %s", e)
        raise HTTPException(status_code=503, detail="Base de datos no disponible.")

    origen = OrigenPago.PREPAGA if datos.es_prepaga else OrigenPago.DIRECTO
    estado = EstadoTurno.DIFERIDO if datos.es_prepaga else EstadoTurno.COBRADO

    fecha_cobro_estimada = None
    fecha_cobro_efectivo = None
    if datos.es_prepaga:
        fecha_cobro_estimada = datos.fecha + timedelta(days=60)
    else:
        fecha_cobro_efectivo = datos.fecha

    datos_turno = TurnoCreate(
        paciente_id=paciente["id"],
        fecha_turno=datos.fecha,
        monto=datos.monto,
        estado=estado,
        origen_pago=origen,
        fecha_cobro_estimada=fecha_cobro_estimada,
        prepaga=datos.obra_social,
    )

    try:
        turno = crear_turno(sb, datos_turno)
        # Actualizar fecha_cobro_efectivo si aplica
        if fecha_cobro_efectivo and turno:
            turno = actualizar_turno(sb, turno["id"], TurnoUpdate(fecha_cobro_efectivo=fecha_cobro_efectivo))
    except Exception as e:
        logger.error("Error BD al crear turno: %s", e)
        raise HTTPException(status_code=503, detail="Base de datos no disponible.")

    monto_fmt = f"${datos.monto:,.0f}".replace(",", ".")
    fecha_fmt = datos.fecha.strftime("%d/%m/%Y")
    prepaga_txt = f" ({datos.obra_social})" if datos.obra_social else ""
    estado_txt = "pendiente de cobro de la prepaga" if datos.es_prepaga else "registrado como cobrado"
    nuevo_txt = " (paciente nuevo creado)" if fue_creado else ""

    confirmacion = (
        f"Listo! Registre el turno de {datos.paciente}{nuevo_txt}: "
        f"{monto_fmt}{prepaga_txt} el {fecha_fmt}. "
        f"Estado: {estado_txt}."
    )

    return ChatResponse(
        confirmacion=confirmacion,
        accion="turno_registrado",
        datos_extraidos=_a_schema(datos),
        turno_creado=TurnoRead.model_validate(turno),
        paciente_nuevo=fue_creado,
    )


def _a_schema(datos) -> DatosExtraidos:
    return DatosExtraidos(
        paciente=datos.paciente,
        monto=datos.monto,
        es_prepaga=datos.es_prepaga,
        obra_social=datos.obra_social,
        fecha=datos.fecha,
        confianza=datos.confianza,
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
