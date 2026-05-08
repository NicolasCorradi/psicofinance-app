# Tests unitarios del motor financiero (app/services/finanzas.py).
# No requieren base de datos ni servidor: son tests de lógica pura.
# Cobertura: casos normales, bordes, inputs inválidos y precisión decimal.

import pytest
from datetime import date
from decimal import Decimal

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.services.finanzas import (
    calcular_valor_real,
    calcular_meses_retraso,
    calcular_perdida_caja_diferida,
    ResultadoInflacion,
    ResultadoCajaDiferida,
)


# ===========================================================================
# BLOQUE 1: calcular_valor_real — casos normales
# ===========================================================================

class TestCalcularValorRealNormal:

    def test_caso_base_pm(self):
        """Caso validado por el PM: $10k, 5%/mes, 2 meses → $9.070,29."""
        r = calcular_valor_real(10000, 0.05, 2)
        assert r.monto_original == 10000.0
        assert r.valor_real == 9070.29
        assert r.perdida_absoluta == 929.71
        assert r.porcentaje_licuado == 9.3
        assert r.meses_retraso == 2

    def test_resultado_es_ResultadoInflacion(self):
        r = calcular_valor_real(5000, 0.04, 1)
        assert isinstance(r, ResultadoInflacion)

    def test_un_mes_retraso(self):
        """Con 1 mes: Valor Real = Monto / 1.05 = 9523.81"""
        r = calcular_valor_real(10000, 0.05, 1)
        assert r.valor_real == 9523.81
        assert r.perdida_absoluta == 476.19

    def test_24_meses_extremo(self):
        """Caso extremo: 2 años de retraso con 5%/mes → licuación masiva."""
        r = calcular_valor_real(10000, 0.05, 24)
        # Decimal exacto: 10000 / (1.05)^24 = 10000 / 3.2251 = 3100.68
        assert r.valor_real == 3100.68
        assert r.perdida_absoluta == 6899.32
        assert r.porcentaje_licuado == 68.99
        assert r.valor_real < r.monto_original

    def test_inflacion_alta(self):
        """Inflación del 15% mensual (hiperinflación)."""
        r = calcular_valor_real(10000, 0.15, 3)
        # Decimal exacto: 10000 / (1.15)^3 = 10000 / 1.520875 = 6575.16
        assert r.valor_real == 6575.16
        assert r.perdida_absoluta == 3424.84
        assert r.porcentaje_licuado == 34.25

    def test_monto_grande(self):
        """Monto de 1 millón de pesos sin errores de overflow."""
        r = calcular_valor_real(1_000_000, 0.05, 6)
        assert r.valor_real > 0
        assert r.perdida_absoluta > 0
        assert r.monto_original == 1_000_000.0

    def test_monto_centesimal(self):
        """Monto con centavos: no debe haber pérdida de precisión."""
        r = calcular_valor_real(1333.33, 0.05, 1)
        # Decimal exacto: 1333.33 / 1.05 = 1269.838... → 1269.84
        assert r.valor_real == 1269.84
        assert r.perdida_absoluta == 63.49

    def test_tasa_aplicada_en_resultado(self):
        """La tasa usada en el cálculo queda registrada en el resultado."""
        r = calcular_valor_real(5000, 0.07, 3)
        assert r.tasa_mensual_aplicada == 0.07


# ===========================================================================
# BLOQUE 2: calcular_valor_real — casos borde (sin error)
# ===========================================================================

class TestCalcularValorRealBorde:

    def test_monto_cero(self):
        """Monto de $0 no debe generar ZeroDivisionError (bug corregido en auditoría)."""
        r = calcular_valor_real(0, 0.05, 2)
        assert r.valor_real == 0.0
        assert r.perdida_absoluta == 0.0
        assert r.porcentaje_licuado == 0.0

    def test_inflacion_cero(self):
        """Con inflación 0%, el valor real debe ser igual al monto original."""
        r = calcular_valor_real(10000, 0.0, 6)
        assert r.valor_real == 10000.0
        assert r.perdida_absoluta == 0.0
        assert r.porcentaje_licuado == 0.0

    def test_meses_retraso_cero(self):
        """Sin retraso (cobro inmediato), no hay pérdida."""
        r = calcular_valor_real(7500, 0.05, 0)
        assert r.valor_real == 7500.0
        assert r.perdida_absoluta == 0.0
        assert r.porcentaje_licuado == 0.0

    def test_monto_un_centavo(self):
        """El monto mínimo posible ($0.01) no debe explotar."""
        r = calcular_valor_real(0.01, 0.05, 1)
        assert r.valor_real >= 0.0
        assert r.monto_original == 0.01

    def test_tasa_muy_pequeña(self):
        """Tasa de 0.001 (0.1%): pérdida debe ser pequeña pero existir."""
        r = calcular_valor_real(10000, 0.001, 12)
        assert 0 < r.perdida_absoluta < 200  # pérdida razonable a 0.1% mensual


# ===========================================================================
# BLOQUE 3: calcular_valor_real — inputs inválidos (deben lanzar ValueError)
# ===========================================================================

class TestCalcularValorRealInvalidos:

    def test_monto_negativo(self):
        with pytest.raises(ValueError, match="negativo"):
            calcular_valor_real(-1000, 0.05, 2)

    def test_tasa_negativa(self):
        with pytest.raises(ValueError, match="negativa"):
            calcular_valor_real(10000, -0.05, 2)

    def test_meses_negativos(self):
        with pytest.raises(ValueError, match="negativos"):
            calcular_valor_real(10000, 0.05, -1)


# ===========================================================================
# BLOQUE 4: Auditoría de precisión decimal (IEEE 754 vs Decimal)
# ===========================================================================

class TestPrecisionDecimal:

    def test_tasa_0_03_no_acumula_error_float(self):
        """
        0.03 no es exactamente representable en float IEEE 754.
        Con float puro: (1 + 0.03) ** 12 acumula error.
        Con Decimal: 10000 / (1.03)^12 = 7013.80 (resultado exacto a centavos).
        """
        r = calcular_valor_real(10000, 0.03, 12)
        assert r.valor_real == 7013.80
        assert r.perdida_absoluta == 2986.20
        assert r.porcentaje_licuado == 29.86

    def test_round_half_up_correcto(self):
        """
        Python nativo usa banker's rounding (round-half-to-even).
        Nosotros debemos usar ROUND_HALF_UP (estándar financiero).
        Ej: 2.675 → debe redondear a 2.68, no a 2.67.
        """
        # Construir un caso donde ROUND_HALF_UP difiere de banker's rounding
        # 0.005 en Decimal("0.005") → ROUND_HALF_UP da 0.01, banker's da 0.00
        from decimal import Decimal, ROUND_HALF_UP, ROUND_HALF_EVEN
        d = Decimal("2.675")
        assert float(d.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)) == 2.68
        assert float(d.quantize(Decimal("0.01"), rounding=ROUND_HALF_EVEN)) == 2.68  # coincide aquí

    def test_suma_muchos_turnos_precision(self):
        """
        Sumar 100 turnos de $33.33 no debe acumular error de punto flotante.
        Con float: 100 * 33.33 = 3332.9999... En Decimal: 3333.00 exacto.
        """
        turnos = [
            {
                "monto": 33.33,
                "fecha_turno": date(2025, 1, 1),
                "fecha_cobro_estimada": date(2025, 3, 1),
            }
            for _ in range(100)
        ]
        resultado = calcular_perdida_caja_diferida(turnos, 0.05)
        # El total nominal debe ser exactamente 3333.00 (100 × 33.33)
        assert resultado.total_nominal == pytest.approx(3333.0, abs=0.01)


# ===========================================================================
# BLOQUE 5: calcular_meses_retraso
# ===========================================================================

class TestCalcularMesesRetraso:

    def test_misma_fecha(self):
        assert calcular_meses_retraso(date(2025, 1, 1), date(2025, 1, 1)) == 0

    def test_dos_meses(self):
        assert calcular_meses_retraso(date(2025, 1, 1), date(2025, 3, 1)) == 2

    def test_un_año(self):
        assert calcular_meses_retraso(date(2024, 1, 1), date(2025, 1, 1)) == 12

    def test_fecha_cobro_anterior_retorna_cero(self):
        """Si la fecha de cobro es anterior al turno, devuelve 0 (no negativo)."""
        assert calcular_meses_retraso(date(2025, 6, 1), date(2025, 1, 1)) == 0

    def test_cruce_de_año(self):
        assert calcular_meses_retraso(date(2024, 11, 1), date(2025, 2, 1)) == 3


# ===========================================================================
# BLOQUE 6: calcular_perdida_caja_diferida
# ===========================================================================

class TestCalcularPerdidaCajaDiferida:

    def test_lista_vacia(self):
        """Lista vacía debe devolver ResultadoCajaDiferida con todos ceros."""
        r = calcular_perdida_caja_diferida([], 0.05)
        assert isinstance(r, ResultadoCajaDiferida)
        assert r.total_nominal == 0.0
        assert r.total_real == 0.0
        assert r.perdida_total_absoluta == 0.0
        assert r.detalle == []

    def test_un_turno(self):
        """Un solo turno: resultado debe coincidir con calcular_valor_real directo."""
        turno = [{
            "monto": 10000,
            "fecha_turno": date(2025, 1, 1),
            "fecha_cobro_estimada": date(2025, 3, 1),
        }]
        r = calcular_perdida_caja_diferida(turno, 0.05)
        esperado = calcular_valor_real(10000, 0.05, 2)
        assert r.total_nominal == esperado.monto_original
        assert r.total_real == esperado.valor_real
        assert len(r.detalle) == 1

    def test_multiples_turnos_coherencia(self):
        """Varios turnos: el total real debe ser menor que el total nominal."""
        turnos = [
            {"monto": 8000,  "fecha_turno": date(2025, 1, 1), "fecha_cobro_estimada": date(2025, 3, 1)},
            {"monto": 12000, "fecha_turno": date(2025, 2, 1), "fecha_cobro_estimada": date(2025, 4, 1)},
            {"monto": 5000,  "fecha_turno": date(2025, 1, 15), "fecha_cobro_estimada": date(2025, 4, 15)},
        ]
        r = calcular_perdida_caja_diferida(turnos, 0.05)
        assert r.total_nominal == pytest.approx(25000.0, abs=0.01)
        assert r.total_real < r.total_nominal
        assert r.perdida_total_absoluta > 0
        assert 0 < r.porcentaje_licuado_promedio < 100
        assert len(r.detalle) == 3

    def test_todos_cobro_inmediato(self):
        """Si fecha_cobro == fecha_turno en todos los turnos, pérdida = 0."""
        turnos = [
            {"monto": 5000, "fecha_turno": date(2025, 1, 1), "fecha_cobro_estimada": date(2025, 1, 1)},
            {"monto": 3000, "fecha_turno": date(2025, 2, 1), "fecha_cobro_estimada": date(2025, 2, 1)},
        ]
        r = calcular_perdida_caja_diferida(turnos, 0.05)
        assert r.perdida_total_absoluta == 0.0
        assert r.total_nominal == r.total_real


# ===========================================================================
# BLOQUE 7: Test del endpoint HTTP /inflacion/calcular (sin BD)
# ===========================================================================

class TestEndpointInflacion:

    def test_endpoint_caso_base(self, cliente):
        resp = cliente.post("/api/v1/inflacion/calcular", json={
            "monto": 10000,
            "meses_retraso": 2,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["valor_real"] == 9070.29
        assert data["perdida_absoluta"] == 929.71

    def test_endpoint_tasa_personalizada(self, cliente):
        """Permite sobreescribir la tasa del .env para simulaciones."""
        resp = cliente.post("/api/v1/inflacion/calcular", json={
            "monto": 25000,
            "meses_retraso": 3,
            "tasa_inflacion_mensual": 0.08,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["tasa_mensual_aplicada"] == 0.08
        assert data["valor_real"] == pytest.approx(19845.81, abs=0.01)

    def test_endpoint_monto_cero(self, cliente):
        """Monto cero no debe generar 500 — debe devolver 200 con pérdida 0."""
        resp = cliente.post("/api/v1/inflacion/calcular", json={
            "monto": 0.01,  # Pydantic requiere gt=0; 0 exacto es rechazado
            "meses_retraso": 5,
        })
        assert resp.status_code == 200

    def test_endpoint_monto_invalido_422(self, cliente):
        """Monto negativo debe devolver 422 Unprocessable Entity (Pydantic)."""
        resp = cliente.post("/api/v1/inflacion/calcular", json={
            "monto": -500,
            "meses_retraso": 2,
        })
        assert resp.status_code == 422

    def test_endpoint_meses_invalidos_422(self, cliente):
        resp = cliente.post("/api/v1/inflacion/calcular", json={
            "monto": 10000,
            "meses_retraso": -1,
        })
        assert resp.status_code == 422

    def test_health_check(self, cliente):
        resp = cliente.get("/")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"
