# Configuración central de la aplicación.
# Lee todas las variables desde el archivo .env usando pydantic-settings.
# Es el único lugar donde se accede a variables de entorno.

from pydantic_settings import BaseSettings, SettingsConfigDict


class Configuracion(BaseSettings):
    # URL de conexión a la base de datos PostgreSQL en Supabase
    database_url: str

    # Clave de API de Supabase
    supabase_key: str

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

    # === SPRINT 2: Copiloto NLP ===
    # Clave de API de Google AI Studio (obtener en aistudio.google.com)
    gemini_api_key: str

    # Modelo de Gemini a usar. Configurable para poder cambiar de versión sin tocar código.
    gemini_model: str = "gemini-2.5-flash-preview-05-20"

    # Indica a pydantic-settings que lea desde el archivo .env
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


# Instancia global: se importa en toda la aplicación con `from app.config import config`
config = Configuracion()
