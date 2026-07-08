# Tests de inflacion_acumulada (app/services/inflacion_service.py).
# La función es pura: compone tasas mensuales entre dos fechas.
# No requiere red ni base de datos.

import pytest
from datetime import date
from decimal import Decimal

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.config import config
from app.services.inflacion_service import inflacion_acumulada


class TestInflacionAcumulada:

    def test_rango_cero_meses_devuelve_cero(self):
        """desde == hasta → 0.0, tanto con tasas como sin ellas."""
        d = date(2026, 3, 15)
        assert inflacion_acumulada(d, d, {"2026-02": 0.03}) == 0.0
        assert inflacion_acumulada(d, d, {}) == 0.0

    def test_composicion_tres_meses_conocidos(self):
        """Con tasas completas compone (1.04)(1.03)(1.02) - 1."""
        tasas = {"2025-01": 0.04, "2025-02": 0.03, "2025-03": 0.02}
        esperado = float(
            (Decimal("1.04") * Decimal("1.03") * Decimal("1.02")) - Decimal("1")
        )  # 0.0926224
        r = inflacion_acumulada(date(2025, 1, 1), date(2025, 4, 1), tasas)
        assert r == pytest.approx(esperado, abs=1e-9)

    def test_tasas_vacias_compone_config_12_meses(self):
        """Con tasas={} compone config.inflacion_mensual por la cantidad de meses."""
        esperado = (1 + config.inflacion_mensual) ** 12 - 1
        r = inflacion_acumulada(date(2025, 1, 1), date(2026, 1, 1), {})
        assert r == pytest.approx(esperado, rel=1e-9)

    def test_mes_faltante_usa_tasa_mas_reciente(self):
        """Falta 2025-02: se rellena con la tasa del mes más reciente (2025-03 → 0.02)."""
        tasas = {"2025-01": 0.05, "2025-03": 0.02}
        esperado = float(
            (Decimal("1.05") * Decimal("1.02") * Decimal("1.02")) - Decimal("1")
        )
        r = inflacion_acumulada(date(2025, 1, 1), date(2025, 4, 1), tasas)
        assert r == pytest.approx(esperado, abs=1e-9)

    def test_cruce_de_anio_nov_a_feb(self):
        """De noviembre a febrero compone nov, dic y ene (3 meses cruzando el año)."""
        tasas = {"2024-11": 0.03, "2024-12": 0.025, "2025-01": 0.022}
        esperado = float(
            (Decimal("1.03") * Decimal("1.025") * Decimal("1.022")) - Decimal("1")
        )
        r = inflacion_acumulada(date(2024, 11, 1), date(2025, 2, 1), tasas)
        assert r == pytest.approx(esperado, abs=1e-9)

    def test_nunca_devuelve_negativo(self):
        """Con deflación (tasas negativas) la función acota en 0, nunca devuelve negativo."""
        tasas = {"2025-01": -0.02, "2025-02": -0.01}
        r = inflacion_acumulada(date(2025, 1, 1), date(2025, 3, 1), tasas)
        assert r == 0.0
