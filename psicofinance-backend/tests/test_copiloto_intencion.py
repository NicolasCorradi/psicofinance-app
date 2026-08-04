# Tests de la clasificación heurística del copiloto y del matcheo de nombres.
# Son funciones puras: no requieren red, ni Gemini, ni base de datos.
#
# Existen porque estos dos puntos concentraron los bugs reportados en vivo:
#   - mensajes que el copiloto "no sabía responder" (caían a Gemini y, con la
#     cuota agotada, terminaban intentando registrar un turno inventado)
#   - pagos de deuda que no se registraban, o peor, se le acreditaban al
#     paciente equivocado por un matcheo de nombres por substring.

import pytest
from unittest.mock import patch

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.services.nlp_service import _heuristica_intencion
from app.routers import copilot as copilot_router
from app.routers.copilot import _nombres_en, _sin_acentos, _continua_registro_pendiente


class TestHeuristicaIntencion:
    """La heurística debe resolver los casos claros sin gastar cuota de Gemini.
    Devolver None es válido (delega en Gemini), pero para estas frases —todas
    tomadas de uso real— tiene que decidir sola."""

    @pytest.mark.parametrize("mensaje", [
        "Sebastian me pago lo que debia",
        "martina salda su deuda",
        "diego cancelo su deuda",
        "ambos me pagaron lo adeudado",
        "juan pago la deuda en efectivo",
        "sofia me transfirio lo pendiente",
        "me pagaron todo lo atrasado",
        "ya me pagaron los que debian",
        "carlos se puso al dia",
    ])
    def test_saldar_deuda(self, mensaje):
        assert _heuristica_intencion(mensaje) == "saldar_deuda"

    @pytest.mark.parametrize("mensaje", [
        "quien me debe plata",
        "cuanto facture este mes",
        "cuantas sesiones tuve la semana pasada",
        "como vengo con el monotributo",
        "mis honorarios estan atrasados respecto a la inflacion",
        "top 10 de pacientes que mas me pagaron",
        "que dias atiendo mas",
        "me conviene subir los precios",
    ])
    def test_consulta(self, mensaje):
        assert _heuristica_intencion(mensaje) == "consulta"

    @pytest.mark.parametrize("mensaje", [
        "vino martina, pago 35 lucas en efectivo",
        "atendi a diego hoy",
        "carlos falto sin avisar",
        "registra la sesion de ana",
        "anota que juan me debe la de ayer",
        "laura me transfirio 40000 por la sesion del lunes",
        "tuve que cancelar la sesion de ana",
    ])
    def test_registro_turno(self, mensaje):
        assert _heuristica_intencion(mensaje) == "registro_turno"

    @pytest.mark.parametrize("mensaje", ["hola", "gracias", "buenas tardes", "listo"])
    def test_saludo(self, mensaje):
        assert _heuristica_intencion(mensaje) == "saludo"

    def test_pregunta_sobre_un_pago_no_es_saldar_deuda(self):
        """Con signo de pregunta nunca se escribe en la BD: es una consulta."""
        assert _heuristica_intencion("¿juan pago la deuda?") == "consulta"


class TestNombresEn:
    """El matcheo compara secuencias de tokens, no substrings: `"ana gomez" in
    "diana gomez"` es True en Python y saldaría la deuda del paciente equivocado."""

    PACIENTES = [
        {"id": "1", "nombre": "Ana",       "apellido": "Gomez"},
        {"id": "2", "nombre": "Diana",     "apellido": "Gomez"},
        {"id": "3", "nombre": "Sebastian", "apellido": "Torres"},
        {"id": "4", "nombre": "Martina",   "apellido": "Lopez"},
    ]

    def _ids(self, texto):
        return sorted(p["id"] for p in _nombres_en(_sin_acentos(texto.lower()), self.PACIENTES))

    def test_tilde_y_coma_pegada_al_nombre(self):
        """"Sebastián, pagó..." es el fraseo habitual: ni la tilde ni la coma
        deben romper el match contra un "Sebastian" sin tilde en la BD."""
        assert self._ids("Sebastián, pagó lo que debía") == ["3"]

    def test_no_confunde_pacientes_con_apellido_compartido(self):
        assert self._ids("diana gomez me pago lo adeudado") == ["2"]
        assert self._ids("ana gomez salda su deuda") == ["1"]

    def test_varios_nombres(self):
        assert self._ids("Sebastián Torres y Martina López pagaron lo que debían") == ["3", "4"]

    def test_sin_coincidencias(self):
        assert self._ids("nadie mencionado aca") == []


class TestContinuaRegistroPendiente:
    """Si el copiloto pidió un dato faltante, la respuesta corta que sigue
    ("20000", "efectivo") tiene que seguir siendo un registro y no perderse."""

    class _Msg:
        def __init__(self, rol, texto):
            self.rol, self.texto = rol, texto

    def _hist(self, rol, texto):
        return [self._Msg(rol, texto)]

    def test_responde_el_monto_faltante(self):
        h = self._hist("assistant", "Entendí que atendiste a Martina, pero no pude identificar el monto. Podés agregarlo?")
        assert _continua_registro_pendiente(h, "20000") is True

    def test_responde_el_paciente_faltante(self):
        h = self._hist("assistant", "No identifiqué el nombre del paciente. Por favor mencionalo en el mensaje.")
        assert _continua_registro_pendiente(h, "sofia") is True

    def test_una_pregunta_real_no_es_continuacion(self):
        h = self._hist("assistant", "No pude identificar el monto. Podés agregarlo?")
        assert _continua_registro_pendiente(h, "cuanto facture este mes?") is False

    def test_sin_registro_pendiente(self):
        assert _continua_registro_pendiente(self._hist("assistant", "¡Hola! Contame una sesión"), "20000") is False
        assert _continua_registro_pendiente([], "20000") is False


class TestSaldarDeudaPrepaga:
    """Un turno de prepaga está DIFERIDO porque lo debe la obra social a ~60
    días, no porque el paciente deba plata. "Me pagó" refiere a un pago
    directo: saldar ahí la cuenta por cobrar de OSDE asentaría que la prepaga
    pagó en efectivo, que es falso."""

    PACIENTES = [
        {"id": "p1", "nombre": "Martina", "apellido": "Lopez"},
        {"id": "p2", "nombre": "Sofia",   "apellido": "Herrera"},
    ]
    DIFERIDOS = [
        {"id": "t1", "paciente_id": "p1", "monto": 30000, "moneda": "ARS", "origen_pago": "DIRECTO"},
        {"id": "t2", "paciente_id": "p1", "monto": 25000, "moneda": "ARS", "origen_pago": "PREPAGA"},
        {"id": "t3", "paciente_id": "p2", "monto": 40000, "moneda": "ARS", "origen_pago": "PREPAGA"},
    ]

    class _SB:
        def __init__(self, pacientes):
            self._pacientes = pacientes

        def select(self, tabla, params):
            return self._pacientes

    def _correr(self, mensaje):
        tocados = []
        with patch.object(copilot_router, "listar_turnos_diferidos", lambda sb, uid: self.DIFERIDOS), \
             patch.object(copilot_router, "actualizar_turno", lambda sb, tid, c, uid: tocados.append(tid)):
            resp = copilot_router._procesar_chat(mensaje, [], self._SB(self.PACIENTES), "u1")
        return resp, tocados

    def test_solo_salda_los_directos(self):
        resp, tocados = self._correr("martina me pago lo que debia en efectivo")
        assert tocados == ["t1"]          # el t2 de prepaga queda intacto
        assert resp.accion == "turno_registrado"
        assert "prepaga" in resp.confirmacion.lower()

    def test_paciente_con_deuda_solo_de_prepaga_no_se_toca(self):
        resp, tocados = self._correr("sofia me pago lo que debia")
        assert tocados == []
        # No debe decir "Listo": el frontend refresca con turno_registrado y
        # el psicólogo creería que quedó asentado un cobro inexistente
        assert resp.accion == "datos_insuficientes"

    def test_no_destruye_mayusculas_del_apellido(self):
        """str.capitalize() pasaría "Sofia Herrera" a "Sofia herrera"."""
        resp, _ = self._correr("sofia me pago lo que debia")
        assert "Sofia Herrera" in resp.confirmacion

    def test_paciente_inexistente_pide_aclaracion(self):
        resp, tocados = self._correr("carlos me pago lo que debia")
        assert tocados == []
        assert resp.accion == "datos_insuficientes"


class TestSesionConFechaFutura:
    """"Mañana viene Martina" extrae una fecha futura. Registrarla como
    COBRADA con fecha_cobro_efectivo en el futuro inventa plata cobrada en un
    día que todavía no llegó, e infla el "cobrado de este mes"."""

    PACIENTE = {
        "id": "11111111-1111-1111-1111-111111111111",
        "nombre": "Martina", "apellido": "Lopez",
        "honorario_actual": 30000, "moneda": "ARS",
    }

    class _SB:
        def select(self, tabla, params):
            return []

    def _correr(self, datos):
        from app.routers import copilot as C
        creados = []

        def _fake_crear(sb, d, uid):
            creados.append(d)
            return {
                "id": "00000000-0000-0000-0000-000000000001",
                "paciente_id": d.paciente_id, "fecha_turno": d.fecha_turno,
                "monto": d.monto, "estado": d.estado, "origen_pago": d.origen_pago,
                "fecha_cobro_estimada": d.fecha_cobro_estimada,
                "fecha_cobro_efectivo": d.fecha_cobro_efectivo,
                "prepaga": d.prepaga, "medio_pago": d.medio_pago,
                "tipo_sesion": d.tipo_sesion, "moneda": d.moneda,
                "tipo_cambio": d.tipo_cambio,
                "created_at": "2026-08-04T10:00:00Z", "updated_at": "2026-08-04T10:00:00Z",
            }

        with patch.object(C, "clasificar_intencion", lambda m: "registro_turno"), \
             patch.object(C, "extraer_datos_turno", lambda m, historial=None: datos), \
             patch.object(C, "obtener_o_crear_paciente", lambda sb, n, u: (self.PACIENTE, False)), \
             patch.object(C, "crear_turno", _fake_crear):
            resp = C._procesar_chat("mensaje", [], self._SB(), "u1")
        return resp, creados

    def _datos(self, fecha, monto, medio=None):
        from app.services.nlp_service import DatosTurnoNLP
        return DatosTurnoNLP("Martina", monto, False, None, fecha, "alta", medio, "SESION", "ARS")

    def test_futura_sin_pago_no_registra_nada(self):
        from datetime import timedelta
        from app.utils import hoy_argentina
        manana = hoy_argentina() + timedelta(days=1)
        # monto 0 => se asume el honorario de ficha => el mensaje no habla de pago
        resp, creados = self._correr(self._datos(manana, 0))
        assert creados == []
        assert resp.accion == "datos_insuficientes"

    def test_pago_adelantado_cobra_hoy_no_en_la_fecha_de_la_sesion(self):
        from datetime import timedelta
        from app.utils import hoy_argentina
        hoy = hoy_argentina()
        manana = hoy + timedelta(days=1)
        resp, creados = self._correr(self._datos(manana, 30000, "EFECTIVO"))
        assert resp.accion == "turno_registrado"
        assert creados[0].fecha_turno == manana        # la sesión es mañana
        assert creados[0].fecha_cobro_efectivo == hoy  # pero la plata entró hoy

    def test_sesion_de_hoy_no_cambia(self):
        from app.utils import hoy_argentina
        hoy = hoy_argentina()
        resp, creados = self._correr(self._datos(hoy, 30000, "EFECTIVO"))
        assert resp.accion == "turno_registrado"
        assert creados[0].fecha_cobro_efectivo == hoy
