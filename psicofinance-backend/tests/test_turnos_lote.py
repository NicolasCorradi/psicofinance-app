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

    def test_omite_los_none(self):
        """PostgREST toma el default de la columna si el campo no viaja."""
        sb = _SBFake()
        crear_turnos_lote(sb, _lote().turnos, "user-abc")
        _, filas = sb.llamadas[0]
        assert "fecha_cobro_efectivo" not in filas[1]

    def test_lote_vacio_rechazado(self):
        with pytest.raises(Exception):
            TurnoLoteCreate(turnos=[])

    def test_lote_gigante_rechazado(self):
        """Guarda contra un bug del cliente: una jornada real no pasa de ~15."""
        uno = {"paciente_id": PACIENTE_A, "fecha_turno": "2026-08-05", "monto": 1}
        with pytest.raises(Exception):
            TurnoLoteCreate(turnos=[uno] * 51)
