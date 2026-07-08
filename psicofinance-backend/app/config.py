# Configuración central de la aplicación.
# Lee todas las variables desde el archivo .env usando pydantic-settings.
# Es el único lugar donde se accede a variables de entorno.

from pydantic_settings import BaseSettings, SettingsConfigDict


class Configuracion(BaseSettings):
    # URL de conexión a la base de datos PostgreSQL en Supabase
    database_url: str

    # Clave de API de Supabase
    supabase_key: str

    # URL del proyecto Supabase (sin /rest/v1)
    supabase_url: str = "https://dhtlxsodjpbiuvfhkxhx.supabase.co"

    # JWT Secret HS256 (Settings → JWT Keys → Legacy JWT Secret).
    # Solo se usa como fallback si el proyecto todavía firma con secreto compartido.
    # Los proyectos nuevos firman con clave asimétrica (ES256): en ese caso se
    # deja vacío y la API valida contra el JWKS público (ver app/auth.py).
    supabase_jwt_secret: str = ""

    # Interruptor de autenticación. True (default) = exige token válido.
    # AUTH_ENABLED=false desactiva la auth para desarrollo local y tests.
    auth_enabled: bool = True

    # Clave secreta para firmar tokens JWT (uso futuro)
    secret_key: str

    # Tasa de inflación mensual cargada por el PM (ej: 0.05 = 5%)
    # Se actualiza en el .env según el contexto macroeconómico del mes
    inflacion_mensual: float

    # Categoría actual del Monotributo del psicólogo (ej: "D")
    # El PM la actualiza cuando cambia de categoría
    monotributo_categoria: str = "D"

    # Tope de facturación anual de la categoría actual (en pesos)
    # Fuente: AFIP/ARCA. El PM actualiza este valor cuando AFIP publica nuevos topes
    monotributo_tope_anual: float

    # % del tope en el que se activa la alerta amarilla (ej: 0.80 = 80%)
    monotributo_umbral_amarillo: float = 0.80

    # Criterio de cómputo del facturado 12m del semáforo:
    # DEVENGADO = por fecha de sesión (proxy de facturación emitida, criterio ARCA)
    # PERCIBIDO = por fecha de cobro efectivo
    monotributo_criterio: str = "DEVENGADO"

    # Tipo de cambio de emergencia si falla la API del dólar sin caché previo.
    # El PM lo actualiza periódicamente para que el fallback no quede irreal.
    dolar_fallback: float = 1000.0

    # === SPRINT 2: Copiloto NLP ===
    # Clave de API de Google AI Studio (obtener en aistudio.google.com)
    gemini_api_key: str

    # Modelo de Gemini a usar. Configurable para poder cambiar de versión sin tocar código.
    gemini_model: str = "gemini-2.5-flash-preview-05-20"

    # Indica a pydantic-settings que lea desde el archivo .env.
    # extra="ignore": variables solo usadas por scripts (ej. SUPABASE_SERVICE_ROLE_KEY
    # que lee el seed vía os.environ) no deben romper la carga del config.
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )


# Instancia global: se importa en toda la aplicación con `from app.config import config`
config = Configuracion()
