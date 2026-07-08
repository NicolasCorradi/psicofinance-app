# Configuración global de pytest para PsicoFinance.
# Define fixtures reutilizables y marca los tests de integración
# para que se salteen si la BD no está disponible.

import os

# Los tests corren sin autenticación (no dependen de tokens ni del JWKS remoto).
# Debe setearse ANTES de importar la app/config.
os.environ["AUTH_ENABLED"] = "false"

import pytest
import psycopg2
from fastapi.testclient import TestClient


def supabase_disponible() -> bool:
    """Devuelve True si Supabase responde en este momento."""
    try:
        import os
        from dotenv import load_dotenv
        load_dotenv()
        url = os.getenv("DATABASE_URL", "")
        if not url or "XXXXXXXX" in url:
            return False
        conn = psycopg2.connect(url, connect_timeout=5)
        conn.close()
        return True
    except Exception:
        return False


# Marca para saltar tests que requieren BD real
requiere_bd = pytest.mark.skipif(
    not supabase_disponible(),
    reason="Supabase no disponible — se omite test de integración"
)


@pytest.fixture(scope="session")
def cliente():
    """TestClient de FastAPI para tests HTTP (sin BD real necesaria)."""
    import sys, os
    sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
    from main import app
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c


@pytest.fixture(scope="session")
def cliente_con_bd():
    """TestClient que requiere BD activa. Solo usado en tests de integración."""
    if not supabase_disponible():
        pytest.skip("Supabase no disponible")
    import sys, os
    sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
    from main import app
    with TestClient(app) as c:
        yield c
