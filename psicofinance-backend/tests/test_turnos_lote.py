# Tests del alta de turnos en lote (cierre de jornada desde la agenda).
# crear_turnos_lote debe resolverse en UN solo INSERT: si se partiera en N
# llamadas, una jornada podría quedar a medias (3 turnos cargados, 4 no).

import pytest

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.schemas.turno import TurnoLoteCreate
from app.crud.turno import crear_turnos_lote

PACIENTE_A = "11111111-1111-1111-1111-111111111111"
PACIENTE_B = "22222222-2222-2222-2222-222222222222"


class _SBFake:
    """Registra las llamadas para poder afirmar que hubo una sola."""

    def __init__(self):
        self.llamadas = []

    def insert_many(self, tabla, filas):
        self.llamadas.append((tabla, filas))
        return [dict(f) for f in filas]

    def insert(self, tabla, fila):  # no debería usarse en el lote
        raise AssertionError("el lote no debe insertar fila por fila")


def _lote():
    return TurnoLoteCreate(turnos=[
        {
            "paciente_id": PACIENTE_A, "fecha_turno": "2026-08-05", "monto": 25000,
            "estado": "COBRADO", "origen_pago": "DIRECTO", "medio_pago": "EFECTIVO",
            "fecha_cobro_efectivo": "2026-08-05",
        },
        {
            "paciente_id": PACIENTE_B, "fecha_turno": "2026-08-05", "monto": 0,
            "estado": "COBRADO", "origen_pago": "DIRECTO",
            "tipo_sesion": "INASISTENCIA_INJUSTIFICADA",
        },
    ])


class TestCrearTurnosLote:

    def test_un_solo_insert(self):
        sb = _SBFake()
        crear_turnos_lote(sb, _lote().turnos, "user-abc")
        assert len(sb.llamadas) == 1
        tabla, filas = sb.llamadas[0]
        assert tabla == "turnos"
        assert len(filas) == 2

    def test_asigna_user_id_e_ids_unicos(self):
        sb = _SBFake()
        crear_turnos_lote(sb, _lote().turnos, "user-abc")
        _, filas = sb.llamadas[0]
        assert all(f["user_id"] == "user-abc" for f in filas)
        assert len({f["id"] for f in filas}) == 2

    def test_serializa_fechas_y_enums(self):
        sb = _SBFake()
        crear_turnos_lote(sb, _lote().turnos, "user-abc")
        _, filas = sb.llamadas[0]
        assert filas[0]["fecha_turno"] == "2026-08-05"          # date -> ISO
        assert filas[0]["estado"] == "COBRADO"                  # Enum -> valor
        assert filas[0]["medio_pago"] == "EFECTIVO"
        assert filas[1]["tipo_sesion"] == "INASISTENCIA_INJUSTIFICADA"

    def test_todas_las_filas_con_las_mismas_claves(self):
        """PostgREST rechaza el lote con PGRST102 "All object keys must match"
        si las filas difieren en claves. En un cierre de jornada real siempre
        difieren: la cobrada lleva medio_pago y fecha_cobro_efectivo, la que
        quedó debiendo no. Las faltantes viajan como null explícito."""
        sb = _SBFake()
        crear_turnos_lote(sb, _lote().turnos, "user-abc")
        _, filas = sb.llamadas[0]
        assert len({frozenset(f) for f in filas}) == 1, "las filas no tienen las mismas claves"
        # el que no se cobró igual lleva la clave, en null
        assert "fecha_cobro_efectivo" in filas[1]
        assert filas[1]["fecha_cobro_efectivo"] is None
        # y el que sí conserva su valor
        assert filas[0]["fecha_cobro_efectivo"] == "2026-08-05"
        assert filas[0]["medio_pago"] == "EFECTIVO"

    def test_mezcla_de_estados_no_pierde_valores(self):
        """Normalizar claves no debe pisar lo que cada fila sí traía."""
        sb = _SBFake()
        crear_turnos_lote(sb, _lote().turnos, "user-abc")
        _, filas = sb.llamadas[0]
        assert filas[0]["estado"] == "COBRADO"
        assert filas[1]["estado"] == "COBRADO"
        assert filas[1]["tipo_sesion"] == "INASISTENCIA_INJUSTIFICADA"
        assert filas[0]["tipo_sesion"] == "SESION"

    def test_lote_vacio_rechazado(self):
        with pytest.raises(Exception):
            TurnoLoteCreate(turnos=[])

    def test_lote_gigante_rechazado(self):
        """Guarda contra un bug del cliente: una jornada real no pasa de ~15."""
        uno = {"paciente_id": PACIENTE_A, "fecha_turno": "2026-08-05", "monto": 1}
        with pytest.raises(Exception):
            TurnoLoteCreate(turnos=[uno] * 51)
