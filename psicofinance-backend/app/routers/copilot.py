# Router del Copiloto NLP.
# Usa Supabase REST API via SupabaseClient (sin SQLAlchemy).

import logging
import re
import unicodedata
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from dateutil.relativedelta import relativedelta

from google import genai
from google.genai import types as genai_types

from app.config import config
from app.supabase_client import SupabaseClient, get_supabase
from app.auth import usuario_id
from app.models.enums import EstadoTurno, OrigenPago, MedioPago, TipoSesion, Moneda
from app.services.dolar_service import get_dolar_blue
from app.schemas.copilot import ChatRequest, ChatResponse, DatosExtraidos
from app.schemas.comprobante import DatosBorrador, AprobarBorradorRequest
from app.schemas.turno import TurnoCreate, TurnoRead, TurnoUpdate
from app.services.nlp_service import (
    extraer_datos_turno, clasificar_intencion, responder_consulta,
    ErrorNLP, ErrorCuotaNLP,
)
from app.services.nlp_comprobante import extraer_datos_comprobante
from app.crud.paciente import obtener_o_crear_paciente
from app.crud.turno import crear_turno, listar_turnos_diferidos, actualizar_turno
from app.utils import hoy_argentina, monto_ars, parse_fecha as _parse_date

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/copilot", tags=["Copiloto NLP"])

MESES_ES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"]


def _sin_acentos(s: str) -> str:
    """Quita tildes/diacríticos para poder comparar nombres sin depender de
    que la IA (o el usuario) escriba los acentos igual que la BD."""
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))


def _tokens(s: str) -> list[str]:
    """Palabras sueltas, sin puntuación. 'Sebastián,' y 'Sebastián' deben
    tokenizar igual — la puntuación pegada al nombre (común: "Martina,
    pagó...") no debe romper el match."""
    return re.findall(r"[a-z0-9]+", s)


def _subsecuencia_contigua(tokens: list[str], sub: list[str]) -> bool:
    n = len(sub)
    if n == 0:
        return False
    return any(tokens[i:i + n] == sub for i in range(len(tokens) - n + 1))


def _nombres_en(fuente: str, pacientes_raw: list[dict]) -> list[dict]:
    """Busca pacientes mencionados por nombre en `fuente` (ya normalizada:
    minúsculas, sin tildes). Compara por tokens exactos, no por substring
    crudo: "ana gomez" in "diana gomez" da True con `in` sobre strings
    (falso positivo), pero como secuencia de tokens ["ana","gomez"] nunca
    aparece dentro de ["diana","gomez"]."""
    tokens = _tokens(fuente)
    tokens_set = set(tokens)
    encontrados = []
    for p in pacientes_raw:
        nombre_solo = _sin_acentos((p.get("nombre") or "").strip().lower())
        if not nombre_solo:
            continue
        apellido = _sin_acentos((p.get("apellido") or "").strip().lower())
        tokens_nombre = nombre_solo.split()
        coincide = _subsecuencia_contigua(tokens, tokens_nombre) or (
            len(tokens_nombre) == 1 and tokens_nombre[0] in tokens_set
        )
        if not coincide and apellido:
            coincide = _subsecuencia_contigua(tokens, tokens_nombre + apellido.split())
        if coincide:
            encontrados.append(p)
    return encontrados


# Frases con las que el copiloto deja un registro de turno a mitad de camino
# (le pidió un dato al psicólogo). Si la respuesta corta que sigue ("20000",
# "efectivo", "sofia") no se clasifica como registro, el turno queda
# abandonado — clasificar_intencion no ve el historial, así que una
# respuesta ambigua de una sola palabra puede caer en "consulta" y confundir
# al usuario justo cuando estaba terminando de cargar la sesión.
_FRASES_REGISTRO_PENDIENTE = (
    "no pude identificar el monto",
    "no identifiqué el nombre del paciente",
    "no pude entender el mensaje",
)


def _continua_registro_pendiente(historial: list, mensaje: str) -> bool:
    if "?" in mensaje or not historial:
        return False
    ultimo = historial[-1]
    if ultimo.rol != "assistant":
        return False
    t = ultimo.texto.lower()
    return any(f in t for f in _FRASES_REGISTRO_PENDIENTE)


def _procesar_chat(mensaje: str, historial: list, sb: SupabaseClient, user_id: str, transcripcion: str | None = None) -> ChatResponse:
    """Lógica central del copiloto. Usada por /chat y /audio."""
    intencion = clasificar_intencion(mensaje)
    if intencion == "consulta" and _continua_registro_pendiente(historial, mensaje):
        intencion = "registro_turno"

    # Saludos/cortesías: respuesta fija, sin gastar cuota de Gemini
    if intencion == "saludo":
        return ChatResponse(
            confirmacion=(
                "¡Hola! Contame una sesión para registrarla (ej: \"vino Martina, "
                "pagó 35 mil en efectivo\") o preguntame por tus finanzas "
                "(ej: \"¿cuánto facturé este mes?\")."
            ),
            accion="respuesta",
            transcripcion=transcripcion,
        )

    # Saldar deuda existente: "Sebastián pagó lo que debía" / "ambos me
    # pagaron lo adeudado". A diferencia de un registro nuevo, esto NO crea
    # un turno: busca los turnos DIFERIDO ya cargados de ese/esos paciente(s)
    # y los marca COBRADO. Antes esto se clasificaba como "consulta" y el
    # copiloto respondía como si hubiera procesado el pago sin tocar la BD.
    if intencion == "saldar_deuda":
        try:
            pacientes_raw = sb.select("pacientes", {
                "user_id": f"eq.{user_id}", "select": "id,nombre,apellido",
            })
        except Exception as e:
            logger.error("Error BD al listar pacientes para saldar deuda: %s", e)
            raise HTTPException(status_code=503, detail="Base de datos no disponible.")

        texto_norm = _sin_acentos(mensaje.lower())

        # 1) Nombres mencionados directamente en el mensaje actual — la fuente
        #    más confiable, porque los escribió el propio usuario
        coincidencias = _nombres_en(texto_norm, pacientes_raw)

        # 2) "ambos"/"los dos" implica EXACTAMENTE 2 personas: si el mensaje no
        #    nombró a nadie, se buscan en el último mensaje del asistente
        #    (típicamente la respuesta a "¿quién me debe?"), pero si esa
        #    búsqueda encuentra más o menos de 2 (puede haber otros nombres
        #    de contexto ahí, ej. otro "ambos" interno), NO se adivina: se
        #    pide que los nombre para no saldarle la deuda a quien no debía.
        PRONOMBRE_PAR = ("ambos", "los dos", "las dos", "entrambos")
        es_todos = any(p in texto_norm for p in ("todos", "todas"))
        if not coincidencias and any(p in texto_norm for p in PRONOMBRE_PAR) and historial:
            for m in reversed(historial[-4:]):
                if m.rol != "user":
                    candidatos = _nombres_en(_sin_acentos(m.texto.lower()), pacientes_raw)
                    if len(candidatos) == 2:
                        coincidencias = candidatos
                    else:
                        nombres_candidatos = ", ".join(f"{c.get('nombre','')} {c.get('apellido','')}".strip() for c in candidatos) or "nadie reconocible"
                        return ChatResponse(
                            confirmacion=(
                                f"No quiero equivocarme de paciente: en el mensaje anterior encontré "
                                f"{len(candidatos)} nombres ({nombres_candidatos}), no 2. "
                                "Decime los nombres exactos (ej: \"Sebastián Torres y Martina López pagaron lo que debían\")."
                            ),
                            accion="datos_insuficientes",
                            transcripcion=transcripcion,
                        )
                    break
        elif not coincidencias and es_todos and historial:
            for m in reversed(historial[-4:]):
                if m.rol != "user":
                    coincidencias = _nombres_en(_sin_acentos(m.texto.lower()), pacientes_raw)
                    break

        if not coincidencias:
            return ChatResponse(
                confirmacion=(
                    "No identifiqué a qué paciente te referís. Decime el nombre "
                    "(ej: \"Sebastián Torres pagó lo que debía\")."
                ),
                accion="datos_insuficientes",
                transcripcion=transcripcion,
            )

        # Medio de pago mencionado (opcional, mismo criterio que la extracción normal)
        medio_pago = None
        if any(k in texto_norm for k in ("efectivo", "cash", "en mano")):
            medio_pago = MedioPago.EFECTIVO
        elif any(k in texto_norm for k in ("transferencia", "transfe")):
            medio_pago = MedioPago.TRANSFERENCIA
        elif "mercado pago" in texto_norm or " mp " in f" {texto_norm} ":
            medio_pago = MedioPago.MERCADO_PAGO
        elif any(k in texto_norm for k in ("tarjeta", "débito", "debito", "crédito", "credito")):
            medio_pago = MedioPago.TARJETA

        hoy = hoy_argentina()
        try:
            diferidos = listar_turnos_diferidos(sb, user_id)
        except Exception as e:
            logger.error("Error BD al buscar deudas pendientes: %s", e)
            raise HTTPException(status_code=503, detail="Base de datos no disponible.")

        partes = []
        for p in coincidencias:
            nombre = f"{p.get('nombre','')} {p.get('apellido','')}".strip()
            propios = [t for t in diferidos if t.get("paciente_id") == p["id"]]
            if not propios:
                partes.append(f"{nombre} no tenía deuda pendiente registrada")
                continue
            total = 0.0
            for t in propios:
                cambios = TurnoUpdate(estado=EstadoTurno.COBRADO, fecha_cobro_efectivo=hoy)
                if medio_pago:
                    cambios.medio_pago = medio_pago
                try:
                    actualizar_turno(sb, t["id"], cambios, user_id)
                except Exception as e:
                    logger.error("Error BD al saldar turno %s: %s", t.get("id"), e)
                    raise HTTPException(status_code=503, detail="Base de datos no disponible.")
                total += monto_ars(t)
            n = len(propios)
            monto_fmt = f"${total:,.0f}".replace(",", ".")
            partes.append(f"{nombre}: {n} sesión{'es' if n != 1 else ''} marcada{'s' if n != 1 else ''} como cobrada ({monto_fmt})")

        return ChatResponse(
            confirmacion="Listo. " + "; ".join(partes) + ".",
            accion="turno_registrado",
            transcripcion=transcripcion,
        )

    if intencion == "consulta":
        hoy = hoy_argentina()
        primer_dia = hoy.replace(day=1)
        sig_mes = (hoy + relativedelta(months=1)).replace(day=1)

        turnos = sb.select("turnos", {
            "user_id": f"eq.{user_id}",
            "select": "paciente_id,monto,estado,fecha_turno,fecha_cobro_efectivo,fecha_cobro_estimada,medio_pago,tipo_sesion,moneda,tipo_cambio",
        })
        try:
            pacientes_raw = sb.select("pacientes", {
                "user_id": f"eq.{user_id}",
                "select": "id,nombre,apellido,honorario_actual,moneda,telefono,fecha_ultimo_ajuste_honorario",
            })
        except Exception:
            # Compatibilidad: si la columna `moneda` aún no se migró en la BD
            pacientes_raw = sb.select("pacientes", {
                "user_id": f"eq.{user_id}",
                "select": "id,nombre,apellido,honorario_actual,telefono,fecha_ultimo_ajuste_honorario",
            })
        pac_map = {p["id"]: f"{p.get('nombre','')} {p.get('apellido','')}".strip() for p in pacientes_raw}

        cobrado_mes = sum(
            monto_ars(t) for t in turnos
            if t.get("estado") == "COBRADO"
            and _parse_date(t.get("fecha_cobro_efectivo")) is not None
            and primer_dia <= _parse_date(t["fecha_cobro_efectivo"]) < sig_mes
        )
        en_camino = sum(
            monto_ars(t) for t in turnos
            if t.get("estado") == "DIFERIDO"
            and _parse_date(t.get("fecha_turno")) is not None
            and primer_dia <= _parse_date(t["fecha_turno"]) < sig_mes
        )
        deudores = sum(
            monto_ars(t) for t in turnos
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
            monto_ars(t) for t in turnos
            if t.get("estado") == "COBRADO"
            and _parse_date(t.get("fecha_turno")) is not None
            and primer_dia <= _parse_date(t["fecha_turno"]) < sig_mes
        ]
        honorario_prom = (sum(cobrados_mes_list) / len(cobrados_mes_list)) if cobrados_mes_list else 0.0

        ventas = []
        for i in range(5, -1, -1):
            ini = (hoy - relativedelta(months=i)).replace(day=1)
            fin = ini + relativedelta(months=1)
            c = sum(
                monto_ars(t) for t in turnos
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
                    deudores_detalle[nombre] = deudores_detalle.get(nombre, 0) + monto_ars(t)
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
            "user_id": f"eq.{user_id}",
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

        # ── Ficha por paciente: para responder preguntas puntuales ───────────
        # ("¿cuánto le cobro a Martina?", "¿cuándo vino Diego por última vez?")
        stats_pac: dict[str, dict] = {}
        for t in turnos:
            pid = t.get("paciente_id")
            if not pid:
                continue
            s = stats_pac.setdefault(pid, {"ultima": None, "sesiones_mes": 0, "total": 0, "deuda": 0.0, "cobrado": 0.0})
            ft = _parse_date(t.get("fecha_turno"))
            if t.get("estado") != "INCOBRABLE" and ft:
                s["total"] += 1
                if s["ultima"] is None or ft > s["ultima"]:
                    s["ultima"] = ft
                if primer_dia <= ft < sig_mes:
                    s["sesiones_mes"] += 1
            if t.get("estado") == "DIFERIDO":
                s["deuda"] += monto_ars(t)
            elif t.get("estado") == "COBRADO":
                s["cobrado"] += monto_ars(t)

        # Inflación acumulada desde el último ajuste de honorario de cada
        # paciente (misma lógica que las alertas de honorarios del dashboard)
        from app.services.inflacion_service import fetch_ipc_indec, inflacion_acumulada
        ipc = fetch_ipc_indec()
        tasas_ipc = ipc.get("tasas", {})

        _stats_vacias = {"ultima": None, "sesiones_mes": 0, "total": 0, "deuda": 0.0, "cobrado": 0.0}
        pacientes_detalle = []
        for p in pacientes_raw:
            s = stats_pac.get(p["id"], _stats_vacias)
            honorario = float(p.get("honorario_actual") or 0)
            moneda_pac = p.get("moneda") or "ARS"
            ajuste_str = str(p.get("fecha_ultimo_ajuste_honorario") or "")[:10] or None
            # Desactualización vs inflación (solo honorarios en pesos)
            atraso_pct = None
            sugerido = None
            if honorario and ajuste_str and moneda_pac == "ARS":
                try:
                    acum = inflacion_acumulada(date.fromisoformat(ajuste_str), hoy, tasas_ipc)
                    atraso_pct = round(acum * 100)
                    sugerido = round(honorario * (1 + acum))
                except Exception:
                    pass
            pacientes_detalle.append({
                "nombre":        pac_map[p["id"]],
                "honorario":     honorario,
                "moneda":        moneda_pac,
                "ultimo_ajuste": ajuste_str,
                "atraso_pct":    atraso_pct,
                "sugerido":      sugerido,
                "telefono":      bool(p.get("telefono")),
                "ultima_sesion": s["ultima"].isoformat() if s["ultima"] else None,
                "sesiones_mes":  s["sesiones_mes"],
                "sesiones_tot":  s["total"],
                "deuda":         float(s["deuda"]),
                "cobrado_total": float(s["cobrado"]),
            })

        # ── Agenda semanal modelo ("¿qué días atiendo a Sofía?") ─────────────
        agenda_semanal: list[dict] = []
        try:
            rows_modelo = sb.select("configuracion", {
                "clave": "eq.semana_modelo", "user_id": f"eq.{user_id}", "select": "valor",
            })
            if rows_modelo:
                import json as _json
                agenda_semanal = _json.loads(rows_modelo[0]["valor"])
        except Exception as exc:
            logger.warning("No se pudo leer semana modelo para el copiloto: %s", exc)

        # ── Monotributo ("¿cómo vengo con el tope?") ──────────────────────────
        monotributo_ctx: dict = {}
        try:
            from app.services.monotributo_service import obtener_semaforo
            sem = obtener_semaforo(sb, user_id)
            monotributo_ctx = {
                "categoria":  sem.categoria_actual,
                "facturado":  float(sem.facturado_12m),
                "tope":       float(sem.tope_anual),
                "porcentaje": float(sem.porcentaje_consumido),
                "estado":     str(sem.estado.value if hasattr(sem.estado, "value") else sem.estado),
            }
        except Exception as exc:
            logger.warning("No se pudo calcular el semáforo para el copiloto: %s", exc)

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
            "pacientes_detalle":     pacientes_detalle,
            "agenda_semanal":        agenda_semanal,
            "monotributo":           monotributo_ctx,
            "ipc": {
                "mensual_pct": float(ipc.get("ultimo_valor_pct") or 0),
                "periodo":     ipc.get("ultimo_real_periodo") or ipc.get("ultimo_periodo"),
            },
        }

        respuesta_texto = responder_consulta(mensaje, contexto)
        return ChatResponse(confirmacion=respuesta_texto, accion="respuesta", transcripcion=transcripcion)

    # Registro de turno
    try:
        historial_dicts = [m.model_dump() for m in historial] if historial else None
        datos = extraer_datos_turno(mensaje, historial=historial_dicts)
    except ErrorCuotaNLP as e:
        # Cuota de Gemini agotada (tier gratis: 5 req/min) — no es culpa del
        # mensaje del usuario, avisarle que reintente en unos segundos
        logger.warning("Cuota NLP agotada: %s", e)
        return ChatResponse(
            confirmacion=(
                "Recibí muchos mensajes seguidos y me quedé sin capacidad por un "
                "momento. Esperá unos 30 segundos y mandámelo de nuevo — no hace "
                "falta que lo reescribas."
            ),
            accion="error_nlp",
            transcripcion=transcripcion,
        )
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

    try:
        paciente, fue_creado = obtener_o_crear_paciente(sb, datos.paciente, user_id)
    except Exception as e:
        logger.error("Error BD al gestionar paciente: %s", e)
        raise HTTPException(status_code=503, detail="Base de datos no disponible.")

    # Si el mensaje no trae el monto, usar el honorario habitual del paciente
    # (ya cargado en su ficha) en vez de pedirlo — salvo que sea un paciente
    # recién creado (sin honorario de referencia todavía) o una inasistencia
    # justificada/cancelación del profesional, que siempre van sin cobro.
    sin_cobro = datos.tipo_sesion in ("INASISTENCIA_JUSTIFICADA", "CANCELACION_PROFESIONAL")
    monto_asumido = False
    if datos.monto <= 0 and not fue_creado and not sin_cobro:
        honorario = paciente.get("honorario_actual")
        if honorario and float(honorario) > 0:
            datos.monto = float(honorario)
            # El honorario habitual está en la moneda de la ficha del paciente,
            # no necesariamente en la que el mensaje mencionó (o no mencionó nada)
            datos.moneda = paciente.get("moneda") or "ARS"
            monto_asumido = True

    if datos.monto <= 0:
        return ChatResponse(
            confirmacion=f"Entendí que atendiste a {datos.paciente}, pero no pude identificar el monto. Podés agregarlo?",
            accion="datos_insuficientes",
            datos_extraidos=_a_schema(datos),
            transcripcion=transcripcion,
        )

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

    # TurnoCreate acepta fecha_cobro_efectivo: un solo insert evita el turno
    # duplicado que generaba el patrón crear + actualizar si el update fallaba
    datos_turno = TurnoCreate(
        paciente_id=paciente["id"],
        fecha_turno=datos.fecha,
        monto=datos.monto,
        estado=estado,
        origen_pago=origen,
        fecha_cobro_estimada=fecha_cobro_estimada,
        fecha_cobro_efectivo=fecha_cobro_efectivo,
        prepaga=datos.obra_social,
        medio_pago=medio,
        tipo_sesion=tipo,
        moneda=moneda,
        tipo_cambio=tipo_cambio,
    )

    try:
        turno = crear_turno(sb, datos_turno, user_id)
    except Exception as e:
        logger.error("Error BD al crear turno: %s", e)
        raise HTTPException(status_code=503, detail="Base de datos no disponible.")

    # Formatear monto según moneda
    if moneda == Moneda.USD:
        monto_fmt = f"USD {datos.monto:,.0f}"
        if tipo_cambio:
            equivalente_ars = datos.monto * tipo_cambio
            monto_fmt += f" (≈ ${equivalente_ars:,.0f} al blue)".replace(",", ".")
    else:
        monto_fmt = f"${datos.monto:,.0f}".replace(",", ".")
    fecha_fmt = datos.fecha.strftime("%d/%m/%Y")
    prepaga_txt = f" ({datos.obra_social})" if datos.obra_social else ""
    medio_txt = f" · {datos.medio_pago.replace('_', ' ').title()}" if datos.medio_pago else ""
    nuevo_txt = " (paciente nuevo creado)" if fue_creado else ""
    asumido_txt = " (tomé su honorario habitual, avisame si cambió)" if monto_asumido else ""

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
        f"{monto_fmt}{asumido_txt}{prepaga_txt}{medio_txt} el {fecha_fmt}. "
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
def procesar_mensaje(body: ChatRequest, sb: SupabaseClient = Depends(get_supabase), usuario_id: str = Depends(usuario_id)):
    return _procesar_chat(body.mensaje, body.historial, sb, usuario_id)


AUDIO_TIPOS_PERMITIDOS = {
    "audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg",
    "audio/wav", "audio/x-wav", "audio/m4a", "audio/aac",
}


@router.post("/audio", response_model=ChatResponse, status_code=status.HTTP_200_OK)
async def procesar_audio(
    archivo: UploadFile = File(...),
    sb: SupabaseClient = Depends(get_supabase),
    usuario_id: str = Depends(usuario_id),
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

    return _procesar_chat(transcripcion, [], sb, usuario_id, transcripcion=transcripcion)


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
    usuario_id: str = Depends(usuario_id),
):
    try:
        paciente, fue_creado = obtener_o_crear_paciente(sb, body.nombre_emisor, usuario_id)
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
        turno = crear_turno(sb, datos_turno, usuario_id)
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
