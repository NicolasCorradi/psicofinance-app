# Router del Copiloto NLP.
# Sprint 2: texto libre → Gemini → turno en BD.
# Sprint 3: imagen/PDF de comprobante → Gemini Vision → borrador → aprobar → turno.

import logging
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.copilot import ChatRequest, ChatResponse, DatosExtraidos
from app.schemas.comprobante import DatosBorrador, AprobarBorradorRequest
from app.schemas.turno import TurnoCreate, TurnoRead
from app.services.nlp_service import extraer_datos_turno, clasificar_intencion, responder_consulta, ErrorNLP
from app.services.nlp_comprobante import extraer_datos_comprobante
from app.crud.paciente import obtener_o_crear_paciente
from app.crud.turno import crear_turno
from app.models.turno import Turno, EstadoTurno, OrigenPago
from sqlalchemy import func as sa_func
from dateutil.relativedelta import relativedelta

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/copilot", tags=["Copiloto NLP"])


@router.post("/chat", response_model=ChatResponse, status_code=status.HTTP_200_OK)
def procesar_mensaje(body: ChatRequest, db: Session = Depends(get_db)):
    """
    Endpoint principal del Copiloto.

    Recibe un mensaje de texto libre del psicólogo y ejecuta el flujo completo:
    1. Extrae datos con Gemini (paciente, monto, prepaga, fecha)
    2. Busca el paciente en la BD o lo crea si es nuevo
    3. Inserta el turno en Supabase
    4. Devuelve confirmación en lenguaje natural + el turno creado

    Ejemplo de input:
        {"mensaje": "Vino Martín, pagó 10k con OSDE"}
    """
    # --- Paso 0: Clasificar intención ---
    intencion = clasificar_intencion(body.mensaje)

    if intencion == "consulta":
        # Construir contexto financiero real desde la BD
        hoy = date.today()
        primer_dia = hoy.replace(day=1)
        sig_mes    = (hoy + relativedelta(months=1)).replace(day=1)

        cobrado_mes = db.query(sa_func.coalesce(sa_func.sum(Turno.monto), 0)).filter(
            Turno.estado == EstadoTurno.COBRADO,
            Turno.fecha_cobro_efectivo >= primer_dia,
            Turno.fecha_cobro_efectivo < sig_mes,
        ).scalar()

        en_camino = db.query(sa_func.coalesce(sa_func.sum(Turno.monto), 0)).filter(
            Turno.estado == EstadoTurno.DIFERIDO,
            Turno.fecha_cobro_estimada >= primer_dia,
            Turno.fecha_cobro_estimada < sig_mes,
        ).scalar()

        deudores = db.query(sa_func.coalesce(sa_func.sum(Turno.monto), 0)).filter(
            Turno.estado == EstadoTurno.DIFERIDO,
            Turno.fecha_cobro_estimada < primer_dia,
        ).scalar()

        total_turnos = db.query(sa_func.count(Turno.id)).filter(
            Turno.fecha_turno >= primer_dia,
            Turno.fecha_turno < sig_mes,
        ).scalar() or 0

        honorario_prom = db.query(sa_func.coalesce(sa_func.avg(Turno.monto), 0)).filter(
            Turno.estado == EstadoTurno.COBRADO,
            Turno.fecha_turno >= primer_dia,
        ).scalar()

        # Ventas últimos 6 meses
        MESES_ES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"]
        ventas = []
        for i in range(5, -1, -1):
            ini = (hoy - relativedelta(months=i)).replace(day=1)
            fin = ini + relativedelta(months=1)
            c = db.query(sa_func.coalesce(sa_func.sum(Turno.monto), 0)).filter(
                Turno.estado == EstadoTurno.COBRADO,
                Turno.fecha_cobro_efectivo >= ini,
                Turno.fecha_cobro_efectivo < fin,
            ).scalar()
            ventas.append({"mes": MESES_ES[ini.month - 1], "cobrado": float(c)})

        contexto = {
            "cobrado_mes":       float(cobrado_mes),
            "en_camino_mes":     float(en_camino),
            "deudores":          float(deudores),
            "total_turnos_mes":  int(total_turnos),
            "honorario_promedio": float(honorario_prom or 0),
            "perdida_inflacion": 0,  # simplificado para la respuesta conversacional
            "ventas_mensuales":  ventas,
        }

        respuesta_texto = responder_consulta(body.mensaje, contexto)
        return ChatResponse(
            confirmacion=respuesta_texto,
            accion="respuesta",
        )

    # --- Paso 1: Extracción NLP (registro de turno) ---
    try:
        datos = extraer_datos_turno(body.mensaje)
    except ErrorNLP as e:
        logger.error("Error NLP: %s", e)
        return ChatResponse(
            confirmacion=f"No pude entender el mensaje. Podés ser más específico? (ej: 'Vino Martín, pagó 10000 con OSDE')",
            accion="error_nlp",
        )

    # --- Paso 2: Validar datos mínimos ---
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

    # --- Paso 3: Buscar o crear paciente ---
    try:
        paciente, fue_creado = obtener_o_crear_paciente(db, datos.paciente)
    except Exception as e:
        logger.error("Error BD al gestionar paciente: %s", e)
        raise HTTPException(
            status_code=503,
            detail="Base de datos no disponible. El servidor está listo pero Supabase aún no conectó.",
        )

    # --- Paso 4: Armar y guardar el turno ---
    origen = OrigenPago.PREPAGA if datos.es_prepaga else OrigenPago.DIRECTO
    estado = EstadoTurno.DIFERIDO if datos.es_prepaga else EstadoTurno.COBRADO

    # Para prepagas diferidas: estimamos cobro en 60 días como default del MVP
    fecha_cobro_estimada = None
    fecha_cobro_efectivo = None
    if datos.es_prepaga:
        fecha_cobro_estimada = datos.fecha + timedelta(days=60)
    else:
        fecha_cobro_efectivo = datos.fecha

    datos_turno = TurnoCreate(
        paciente_id=paciente.id,
        fecha_turno=datos.fecha,
        monto=datos.monto,
        estado=estado,
        origen_pago=origen,
        fecha_cobro_estimada=fecha_cobro_estimada,
        prepaga=datos.obra_social,
    )

    try:
        turno = crear_turno(db, datos_turno)
        # Guardar la fecha de cobro efectivo en el turno si aplica
        if fecha_cobro_efectivo and turno:
            turno.fecha_cobro_efectivo = fecha_cobro_efectivo
            db.commit()
            db.refresh(turno)
    except Exception as e:
        logger.error("Error BD al crear turno: %s", e)
        raise HTTPException(
            status_code=503,
            detail="Base de datos no disponible. El servidor está listo pero Supabase aún no conectó.",
        )

    # --- Paso 5: Construir respuesta en lenguaje natural ---
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
    """Convierte el dataclass interno al schema Pydantic de respuesta."""
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

# Tipos MIME aceptados para comprobantes
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
    archivo: UploadFile = File(..., description="Imagen o PDF del comprobante de transferencia"),
):
    """
    Recibe una imagen o PDF de un comprobante de pago.
    Gemini Vision extrae: nombre del emisor, monto y fecha.
    No guarda nada en la BD — devuelve un borrador para que el psicólogo apruebe.

    Flujo: imagen → Gemini Vision → DatosBorrador → [psicólogo aprueba] → POST /comprobante/aprobar
    """
    # Validar tipo de archivo
    content_type = archivo.content_type or ""
    if content_type not in MIME_TIPOS_PERMITIDOS:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Tipo de archivo no soportado: {content_type}. Usá JPG, PNG o PDF.",
        )

    # Limitar tamaño: máximo 10 MB
    MAX_BYTES = 10 * 1024 * 1024
    contenido = await archivo.read()
    if len(contenido) > MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="El archivo supera el límite de 10 MB.",
        )

    # Extraer datos con Gemini Vision
    try:
        datos = extraer_datos_comprobante(contenido, content_type)
    except ValueError as e:
        logger.error("Error Vision: %s", e)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(e),
        )

    return DatosBorrador(
        nombre_emisor=datos["nombre_emisor"],
        monto=datos["monto"],
        fecha=date.fromisoformat(datos["fecha"]),
        confianza=datos["confianza"],
        advertencia_monto=None,  # Futuro: cruzar con honorario esperado del paciente
    )


@router.post(
    "/comprobante/aprobar",
    response_model=ChatResponse,
    status_code=status.HTTP_200_OK,
    summary="Aprobar borrador de comprobante y crear turno",
)
def aprobar_comprobante(
    body: AprobarBorradorRequest,
    db: Session = Depends(get_db),
):
    """
    El psicólogo revisó el borrador y lo aprueba.
    Crea el turno en la BD: el nombre del emisor se usa para buscar/crear el paciente.
    El turno se marca como COBRADO (el pago ya fue recibido).
    """
    # Buscar o crear paciente por el nombre del emisor
    try:
        paciente, fue_creado = obtener_o_crear_paciente(db, body.nombre_emisor)
    except Exception as e:
        logger.error("Error BD al gestionar paciente (comprobante): %s", e)
        raise HTTPException(
            status_code=503,
            detail="Base de datos no disponible.",
        )

    # El comprobante confirma que el pago ya fue recibido → COBRADO + DIRECTO
    datos_turno = TurnoCreate(
        paciente_id=paciente.id,
        fecha_turno=body.fecha,
        monto=body.monto,
        estado=EstadoTurno.COBRADO,
        origen_pago=OrigenPago.DIRECTO,
        fecha_cobro_estimada=None,
    )

    try:
        turno = crear_turno(db, datos_turno)
        turno.fecha_cobro_efectivo = body.fecha
        db.commit()
        db.refresh(turno)
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
