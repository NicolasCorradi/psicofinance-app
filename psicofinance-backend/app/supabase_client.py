# Cliente HTTP para la REST API de Supabase (PostgREST).
# Reemplaza la conexión directa PostgreSQL (psycopg2) que no funciona en Render free.

import httpx
from app.config import config

SUPABASE_URL = "https://dhtlxsodjpbiuvfhkxhx.supabase.co/rest/v1"


class SupabaseClient:
    def __init__(self):
        self.base = SUPABASE_URL
        self.h = {
            "apikey": config.supabase_key,
            "Authorization": f"Bearer {config.supabase_key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        }

    def select(self, table: str, params: dict | None = None) -> list[dict]:
        r = httpx.get(f"{self.base}/{table}", headers=self.h, params=params, timeout=15)
        r.raise_for_status()
        return r.json()

    def insert(self, table: str, data: dict) -> dict:
        r = httpx.post(f"{self.base}/{table}", headers=self.h, json=data, timeout=15)
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
