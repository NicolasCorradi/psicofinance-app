# Tests de la clasificación heurística del copiloto y del matcheo de nombres.
# Son funciones puras: no requieren red, ni Gemini, ni base de datos.
#
# Existen porque estos dos puntos concentraron los bugs reportados en vivo:
#   - mensajes que el copiloto "no sabía responder" (caían a Gemini y, con la
#     cuota agotada, terminaban intentando registrar un turno inventado)
#   - pagos de deuda que no se registraban, o peor, se le acreditaban al
#     paciente equivocado por un matcheo de nombres por substring.

import pytest

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.services.nlp_service import _heuristica_intencion
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
