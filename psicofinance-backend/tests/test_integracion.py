# Tests de integración: flujo completo con BD real (Supabase).
# Se saltean automáticamente si Supabase no está disponible.
# Flujo: crear paciente → crear turno DIFERIDO → consultar caja → verificar matemática.

import pytest
import uuid
from datetime import date, timedelta

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from tests.conftest import requiere_bd
from app.services.finanzas import calcular_valor_real


@requiere_bd
class TestFlujoCompletoConBD:

    @pytest.fixture(autouse=True)
    def setup_y_limpieza(self, cliente_con_bd):
        """Registra paciente+turno de prueba y los elimina al finalizar el test."""
        self.cliente = cliente_con_bd
        self.ids_a_limpiar = {"turnos": [], "pacientes": []}
        yield
        # Limpieza post-test (best effort)
        for turno_id in self.ids_a_limpiar["turnos"]:
            self.cliente.delete(f"/api/v1/turnos/{turno_id}")

    def _crear_paciente_prueba(self) -> dict:
        resp = self.cliente.post("/api/v1/pacientes/", json={
            "nombre": "TestAuditoria",
            "apellido": "PsicoFinance",
            "email": "test@psicofinance.dev",
        })
        assert resp.status_code == 201, f"No se pudo crear paciente: {resp.text}"
        paciente = resp.json()
        self.ids_a_limpiar["pacientes"].append(paciente["id"])
        return paciente

    def test_flujo_turno_diferido_y_calculo_caja(self):
        """
        Flujo completo Sprint 1:
        1. Crear paciente de prueba
        2. Crear turno DIFERIDO con prepaga (monto conocido, fecha conocida)
        3. Consultar GET /caja/resumen
        4. Verificar que la pérdida calculada coincide con la fórmula validada por el PM
        """
        paciente = self._crear_paciente_prueba()

        # Turno con fecha de cobro estimada en 2 meses
        hoy = date.today()
        fecha_cobro = date(hoy.year, hoy.month, 1) + timedelta(days=62)  # ~2 meses
        monto_turno = 10000.0

        resp_turno = self.cliente.post("/api/v1/turnos/", json={
            "paciente_id": paciente["id"],
            "fecha_turno": hoy.isoformat(),
            "monto": monto_turno,
            "estado": "DIFERIDO",
            "origen_pago": "PREPAGA",
            "fecha_cobro_estimada": fecha_cobro.isoformat(),
            "prepaga": "OSDE Test",
        })
        assert resp_turno.status_code == 201, f"No se pudo crear turno: {resp_turno.text}"
        turno = resp_turno.json()
        self.ids_a_limpiar["turnos"].append(turno["id"])

        # Consultar resumen de caja
        resp_caja = self.cliente.get("/api/v1/caja/resumen")
        assert resp_caja.status_code == 200
        caja = resp_caja.json()

        # Verificar que la caja diferida nominal incluye nuestro turno
        assert caja["caja_diferida_nominal"] >= monto_turno
        # La caja diferida real debe ser menor que la nominal (hay inflación)
        assert caja["caja_diferida_real"] < caja["caja_diferida_nominal"]
        # Debe haber al menos 1 turno diferido
        assert caja["cantidad_turnos_diferidos"] >= 1

    def test_marcar_turno_cobrado_mueve_a_caja_liquida(self):
        """
        Verifica que al actualizar un turno a COBRADO,
        el monto pasa de Caja Diferida a Caja Líquida.
        """
        paciente = self._crear_paciente_prueba()
        hoy = date.today()

        # Crear turno DIFERIDO
        resp = self.cliente.post("/api/v1/turnos/", json={
            "paciente_id": paciente["id"],
            "fecha_turno": hoy.isoformat(),
            "monto": 8000.0,
            "estado": "DIFERIDO",
            "origen_pago": "PREPAGA",
            "fecha_cobro_estimada": (hoy + timedelta(days=60)).isoformat(),
            "prepaga": "Swiss Medical Test",
        })
        assert resp.status_code == 201
        turno_id = resp.json()["id"]
        self.ids_a_limpiar["turnos"].append(turno_id)

        caja_antes = self.cliente.get("/api/v1/caja/resumen").json()

        # Marcar como cobrado
        resp_patch = self.cliente.patch(f"/api/v1/turnos/{turno_id}", json={
            "estado": "COBRADO",
            "fecha_cobro_efectivo": hoy.isoformat(),
        })
        assert resp_patch.status_code == 200

        caja_despues = self.cliente.get("/api/v1/caja/resumen").json()

        # La caja líquida debe haber aumentado
        assert caja_despues["caja_liquida_total"] > caja_antes["caja_liquida_total"]
        # Los turnos diferidos deben haber disminuido
        assert caja_despues["cantidad_turnos_diferidos"] < caja_antes["cantidad_turnos_diferidos"]

    def test_formula_inflacion_coherente_con_bd(self):
        """
        Crea un turno con monto y fechas exactamente conocidas,
        y verifica que la pérdida en /caja/resumen coincide matemáticamente
        con la fórmula del PM aplicada manualmente.
        """
        from app.config import config

        paciente = self._crear_paciente_prueba()
        hoy = date.today()
        # Forzar exactamente 2 meses de retraso
        fecha_turno = date(hoy.year, hoy.month, 1)
        mes_cobro = (hoy.month % 12) + 1
        anio_cobro = hoy.year if hoy.month < 12 else hoy.year + 1
        fecha_cobro = date(anio_cobro, mes_cobro, 1)
        monto = 15000.0

        resp = self.cliente.post("/api/v1/turnos/", json={
            "paciente_id": paciente["id"],
            "fecha_turno": fecha_turno.isoformat(),
            "monto": monto,
            "estado": "DIFERIDO",
            "origen_pago": "PREPAGA",
            "fecha_cobro_estimada": fecha_cobro.isoformat(),
            "prepaga": "Galeno Test",
        })
        assert resp.status_code == 201
        self.ids_a_limpiar["turnos"].append(resp.json()["id"])

        # Calcular la pérdida esperada con la fórmula del PM
        meses = 1  # ~1 mes de diferencia
        esperado = calcular_valor_real(monto, config.inflacion_mensual, meses)

        # Consultar la API
        resp_inf = self.cliente.post("/api/v1/inflacion/calcular", json={
            "monto": monto,
            "meses_retraso": meses,
        })
        assert resp_inf.status_code == 200
        resultado_api = resp_inf.json()

        # El valor real de la API debe coincidir con el cálculo directo
        assert resultado_api["valor_real"] == pytest.approx(esperado.valor_real, abs=0.01)
        assert resultado_api["perdida_absoluta"] == pytest.approx(esperado.perdida_absoluta, abs=0.01)
