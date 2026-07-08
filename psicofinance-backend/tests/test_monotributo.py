# Tests del Semáforo Monotributo (app/services/monotributo_service.py)
# y de sumar_facturado_ultimos_12_meses (app/crud/turno.py).
# No pegan a Supabase real: usan un fake client + monkeypatch.

import pytest
from datetime import date

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.config import config
from app.services.monotributo_service import (
    obtener_semaforo,
    EstadoSemaforo,
    TOPES_SERVICIOS,
    _tope_categoria,
)
from app.crud.turno import sumar_facturado_ultimos_12_meses


class FakeSupabase:
    """Fake de SupabaseClient: devuelve filas precargadas por tabla y registra las llamadas.

    Para `configuracion` respeta el filtro `clave=eq.X` (el servicio consulta
    varias claves distintas: categoría y escala de topes)."""

    def __init__(self, tablas: dict | None = None):
        self.tablas = tablas or {}
        self.llamadas: list[tuple[str, dict | None]] = []

    def select(self, tabla: str, params: dict | None = None) -> list[dict]:
        self.llamadas.append((tabla, params))
        rows = self.tablas.get(tabla, [])
        clave = (params or {}).get("clave", "")
        if tabla == "configuracion" and clave.startswith("eq."):
            buscada = clave[3:]
            return [r for r in rows if r.get("clave") == buscada]
        return rows


def _fake_con_categoria(categoria: str) -> FakeSupabase:
    """Fake que responde la categoría guardada en la tabla `configuracion`."""
    return FakeSupabase({
        "configuracion": [{"clave": "monotributo_categoria", "valor": categoria}],
    })


def _mock_facturado(monkeypatch, valor: float) -> None:
    """Mockea la suma de facturación (evita el select real a `turnos`)."""
    monkeypatch.setattr(
        "app.services.monotributo_service.sumar_facturado_ultimos_12_meses",
        lambda sb, hasta, criterio="DEVENGADO": valor,
    )


TOPE_D = TOPES_SERVICIOS["D"]


# ===========================================================================
# BLOQUE 1: Transiciones del semáforo
# ===========================================================================

class TestSemaforoTransiciones:

    @pytest.fixture(autouse=True)
    def _umbral_fijo(self, monkeypatch):
        """Fija el umbral amarillo en 80% para que el test no dependa del .env."""
        monkeypatch.setattr(config, "monotributo_umbral_amarillo", 0.80)

    def test_verde_debajo_del_80(self, monkeypatch):
        _mock_facturado(monkeypatch, TOPE_D * 0.50)
        r = obtener_semaforo(_fake_con_categoria("D"))
        assert r.estado == EstadoSemaforo.VERDE
        assert r.categoria_actual == "D"
        assert r.tope_anual == round(TOPE_D, 2)
        assert r.porcentaje_consumido == pytest.approx(50.0, abs=0.01)

    def test_amarillo_entre_80_y_100(self, monkeypatch):
        _mock_facturado(monkeypatch, TOPE_D * 0.90)
        r = obtener_semaforo(_fake_con_categoria("D"))
        assert r.estado == EstadoSemaforo.AMARILLO
        assert r.margen_disponible > 0

    def test_rojo_al_superar_tope(self, monkeypatch):
        _mock_facturado(monkeypatch, TOPE_D * 1.10)
        r = obtener_semaforo(_fake_con_categoria("D"))
        assert r.estado == EstadoSemaforo.ROJO
        assert r.margen_disponible == 0.0  # el margen nunca es negativo

    def test_borde_facturado_igual_tope_es_rojo(self, monkeypatch):
        """facturado == tope exacto → ROJO (el >= incluye el borde)."""
        _mock_facturado(monkeypatch, TOPE_D)
        r = obtener_semaforo(_fake_con_categoria("D"))
        assert r.estado == EstadoSemaforo.ROJO
        assert r.porcentaje_consumido == pytest.approx(100.0, abs=0.01)

    def test_borde_facturado_igual_80_es_amarillo(self, monkeypatch):
        """facturado == 80% exacto del tope → AMARILLO (no VERDE)."""
        _mock_facturado(monkeypatch, TOPE_D * 0.80)
        r = obtener_semaforo(_fake_con_categoria("D"))
        assert r.estado == EstadoSemaforo.AMARILLO

    def test_justo_debajo_del_80_es_verde(self, monkeypatch):
        _mock_facturado(monkeypatch, TOPE_D * 0.80 - 0.01)
        r = obtener_semaforo(_fake_con_categoria("D"))
        assert r.estado == EstadoSemaforo.VERDE


# ===========================================================================
# BLOQUE 2: Conversión USD en sumar_facturado_ultimos_12_meses
# ===========================================================================

class TestSumarFacturadoUSD:

    def test_turno_usd_convierte_con_tipo_cambio(self):
        """100 USD con tipo_cambio 1000 debe sumar 100.000 ARS."""
        sb = FakeSupabase({
            "turnos": [
                {"monto": 100, "moneda": "USD", "tipo_cambio": 1000,
                 "fecha_turno": "2026-05-10"},
            ],
        })
        total = sumar_facturado_ultimos_12_meses(sb, hasta=date(2026, 7, 1))
        assert total == pytest.approx(100_000.0, abs=0.01)

    def test_mezcla_ars_y_usd(self):
        """Turno ARS nominal + turno USD convertido: la suma combina ambos."""
        sb = FakeSupabase({
            "turnos": [
                {"monto": 50_000, "moneda": "ARS", "fecha_turno": "2026-06-01"},
                {"monto": 100, "moneda": "USD", "tipo_cambio": 1000,
                 "fecha_turno": "2026-05-10"},
            ],
        })
        total = sumar_facturado_ultimos_12_meses(sb, hasta=date(2026, 7, 1))
        assert total == pytest.approx(150_000.0, abs=0.01)

    def test_filtro_devengado_usa_fecha_turno(self):
        """Criterio DEVENGADO (default): filtra por fecha_turno y excluye INCOBRABLE."""
        sb = FakeSupabase({"turnos": []})
        sumar_facturado_ultimos_12_meses(sb, hasta=date(2026, 7, 1))
        tabla, params = sb.llamadas[0]
        assert tabla == "turnos"
        assert params["estado"] == "neq.INCOBRABLE"
        assert params["and"] == "(fecha_turno.gte.2025-07-01,fecha_turno.lte.2026-07-01)"

    def test_filtro_percibido_usa_fecha_cobro(self):
        """Criterio PERCIBIDO: filtra por fecha_cobro_efectivo, solo COBRADO, con and=()."""
        sb = FakeSupabase({"turnos": []})
        sumar_facturado_ultimos_12_meses(sb, hasta=date(2026, 7, 1), criterio="PERCIBIDO")
        tabla, params = sb.llamadas[0]
        assert tabla == "turnos"
        assert params["estado"] == "eq.COBRADO"
        assert params["and"] == "(fecha_cobro_efectivo.gte.2025-07-01,fecha_cobro_efectivo.lte.2026-07-01)"

    def test_sin_turnos_devuelve_cero(self):
        sb = FakeSupabase({"turnos": []})
        assert sumar_facturado_ultimos_12_meses(sb, hasta=date(2026, 7, 1)) == 0


# ===========================================================================
# BLOQUE 3: Categoría inválida y tope cero
# ===========================================================================

class TestCategoriaYTope:

    def test_categoria_invalida_cae_al_tope_de_config(self, monkeypatch):
        """Categoría "Z" no existe en la tabla ARCA → usa config.monotributo_tope_anual sin explotar."""
        _mock_facturado(monkeypatch, 0.0)
        r = obtener_semaforo(_fake_con_categoria("Z"))
        assert r.categoria_actual == "Z"
        assert r.tope_anual == round(config.monotributo_tope_anual, 2)
        assert _tope_categoria("Z", TOPES_SERVICIOS) == config.monotributo_tope_anual

    def test_tope_cero_no_divide_por_cero(self, monkeypatch):
        """Con tope 0 el porcentaje es 0 y no hay ZeroDivisionError."""
        monkeypatch.setattr(config, "monotributo_tope_anual", 0.0)
        _mock_facturado(monkeypatch, 500_000.0)
        r = obtener_semaforo(_fake_con_categoria("Z"))  # "Z" → tope de config → 0
        assert r.tope_anual == 0.0
        assert r.porcentaje_consumido == 0.0
        assert r.margen_disponible == 0.0
