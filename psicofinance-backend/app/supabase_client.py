# Cliente HTTP para la REST API de Supabase (PostgREST).
# Reemplaza la conexión directa PostgreSQL (psycopg2) que no funciona en Render free.

import httpx
from app.config import config


class SupabaseClient:
    def __init__(self):
        self.base = f"{config.supabase_url}/rest/v1"
        self.h = {
            "apikey": config.supabase_key,
            "Authorization": f"Bearer {config.supabase_key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        }

    # Tamaño de página: PostgREST corta silenciosamente en max-rows (default 1000)
    # aunque se pida un limit mayor, así que paginamos con el header Range.
    _PAGINA = 1000

    # PK de cada tabla, para un orden estable al paginar (configuracion no tiene id)
    _PK = {"configuracion": "clave"}

    def select(self, table: str, params: dict | None = None) -> list[dict]:
        params = dict(params) if params else {}
        limite = int(params.pop("limit", 0) or 0)  # 0 = sin límite (traer todo)
        offset = int(params.pop("offset", 0) or 0)
        # Orden estable requerido para paginar sin duplicar/saltear filas
        params.setdefault("order", f"{self._PK.get(table, 'id')}.asc")

        filas: list[dict] = []
        while True:
            tam = min(self._PAGINA, limite - len(filas)) if limite else self._PAGINA
            desde = offset + len(filas)
            headers = {**self.h, "Range-Unit": "items", "Range": f"{desde}-{desde + tam - 1}"}
            r = httpx.get(f"{self.base}/{table}", headers=headers, params=params, timeout=15)
            r.raise_for_status()
            pagina = r.json()
            filas.extend(pagina)
            if len(pagina) < tam or (limite and len(filas) >= limite):
                return filas

    def insert(self, table: str, data: dict) -> dict:
        r = httpx.post(f"{self.base}/{table}", headers=self.h, json=data, timeout=15)
        r.raise_for_status()
        result = r.json()
        return result[0] if isinstance(result, list) else result

    def upsert(self, table: str, data: dict, on_conflict: str) -> dict:
        """Insert-or-update atómico de PostgREST.

        Evita el patrón "update, si no existe insert" que duplica filas
        con requests concurrentes. `on_conflict` es la columna única/PK.
        """
        headers = {**self.h, "Prefer": "resolution=merge-duplicates,return=representation"}
        r = httpx.post(
            f"{self.base}/{table}",
            headers=headers,
            params={"on_conflict": on_conflict},
            json=data,
            timeout=15,
        )
        r.raise_for_status()
        result = r.json()
        return result[0] if isinstance(result, list) else result

    def update(self, table: str, filters: dict, data: dict) -> dict | None:
        r = httpx.patch(f"{self.base}/{table}", headers=self.h, json=data, params=filters, timeout=15)
        r.raise_for_status()
        result = r.json()
        return result[0] if result else None

    def delete(self, table: str, filters: dict) -> None:
        r = httpx.delete(f"{self.base}/{table}", headers=self.h, params=filters, timeout=15)
        r.raise_for_status()


def get_supabase() -> SupabaseClient:
    return SupabaseClient()
