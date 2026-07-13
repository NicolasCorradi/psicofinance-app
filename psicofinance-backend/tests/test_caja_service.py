# Tests de obtener_resumen_caja (app/services/caja_service.py).
# Usa un fake de SupabaseClient que rutea por estado del turno:
# no pega a Supabase real ni a la API del INDEC.

import pytest
from datetime import date

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.config import config
from app.services.caja_service import obtener_resumen_caja


class FakeSupabaseCaja:
    """Fake de SupabaseClient: responde turnos precargados según el filtro de estado."""

    def __init__(self, cobrados=(), diferidos=(), incobrables=()):
        self._por_estado = {
            "eq.COBRADO": list(cobrados),
            "eq.DIFERIDO": list(diferidos),
            "eq.INCOBRABLE": list(incobrables),
        }

    def select(self, tabla: str, params: dict | None = None) -> list[dict]:
        assert tabla == "turnos"
        return self._por_estado.get((params or {}).get("estado"), [])


class TestResumenCaja:

    @pytest.fixture(autouse=True)
    def _entorno_fijo(self, monkeypatch):
        """Fija tasa 5%, sin datos del INDEC (usa el fallback compuesto de config)
        y "hoy" en una fecha conocida para que la licuación sea determinística."""
        monkeypatch.setattr(config, "inflacion_mensual", 0.05)
        monkeypatch.setattr("app.services.caja_service.fetch_ipc_indec", lambda: {"tasas": {}})
        monkeypatch.setattr("app.services.caja_service.hoy_argentina", lambda: date(2025, 2, 1))

    def test_caja_liquida_convierte_usd(self):
        """Cobrados: uno ARS nominal + uno USD con tipo_cambio → suma convertida."""
        sb = FakeSupabaseCaja(cobrados=[
            {"monto": 50_000, "moneda": "ARS"},
            {"monto": 100, "moneda": "USD", "tipo_cambio": 1000},
        ])
        r = obtener_resumen_caja(sb, "test-user")
        assert r.caja_liquida_total == pytest.approx(150_000.0, abs=0.01)
        assert r.cantidad_turnos_cobrados == 2
        assert r.caja_diferida_nominal == 0.0

    def test_caja_diferida_nominal_y_perdida(self):
        """Diferido de $10.000 con 2 meses de retraso al 5% → pérdida $929,71."""
        sb = FakeSupabaseCaja(diferidos=[
            {
                "monto": 10_000,
                "moneda": "ARS",
                "fecha_turno": "2025-01-01",
                "fecha_cobro_estimada": "2025-03-01",
            },
        ])
        r = obtener_resumen_caja(sb, "test-user")
        assert r.caja_diferida_nominal == pytest.approx(10_000.0, abs=0.01)
        # Valor real = 10000 / 1.05^2 = 9070.29 (caso validado por el PM)
        assert r.caja_diferida_real == pytest.approx(9070.29, abs=0.01)
        assert r.perdida_estimada_total == pytest.approx(929.71, abs=0.01)
        assert r.perdida_estimada_total > 0
        assert r.cantidad_turnos_diferidos == 1

    def test_diferido_usd_convierte_antes_de_licuar(self):
        """Un diferido en USD entra a la caja diferida ya convertido a ARS."""
        sb = FakeSupabaseCaja(diferidos=[
            {
                "monto": 100,
                "moneda": "USD",
                "tipo_cambio": 1000,
                "fecha_turno": "2025-01-01",
                "fecha_cobro_estimada": "2025-02-01",
            },
        ])
        r = obtener_resumen_caja(sb, "test-user")
        assert r.caja_diferida_nominal == pytest.approx(100_000.0, abs=0.01)
        assert r.perdida_estimada_total > 0

    def test_diferido_sin_fecha_turno_se_ignora(self):
        """Un diferido sin fecha_turno no puede licuarse: cuenta en cantidad pero no en montos."""
        sb = FakeSupabaseCaja(diferidos=[
            {"monto": 10_000, "moneda": "ARS", "fecha_turno": None},
        ])
        r = obtener_resumen_caja(sb, "test-user")
        assert r.cantidad_turnos_diferidos == 1
        assert r.caja_diferida_nominal == 0.0
        assert r.perdida_estimada_total == 0.0

    def test_sin_turnos_todo_en_cero(self):
        r = obtener_resumen_caja(FakeSupabaseCaja(), "test-user")
        assert r.caja_liquida_total == 0.0
        assert r.caja_diferida_nominal == 0.0
        assert r.caja_diferida_real == 0.0
        assert r.perdida_estimada_total == 0.0
        assert r.porcentaje_licuado_promedio == 0.0
        assert r.cantidad_turnos_cobrados == 0
        assert r.cantidad_turnos_diferidos == 0
        assert r.cantidad_turnos_incobrables == 0
