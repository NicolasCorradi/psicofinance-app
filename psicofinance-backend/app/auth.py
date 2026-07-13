# Autenticación de la API.
# Valida el JWT que emite Supabase Auth y que el frontend manda en cada request.
#
# Supabase migró a claves de firma ASIMÉTRICAS (ES256/RS256): los tokens ya no
# se validan con un secreto compartido sino contra el JWKS público del proyecto
# (https://<proyecto>.supabase.co/auth/v1/.well-known/jwks.json). El JWKS lista
# todas las claves vigentes, así que la rotación de claves se maneja sola.
#
# Fallback: si SUPABASE_JWT_SECRET está seteado (proyectos legacy con HS256),
# se valida con ese secreto compartido.
#
# Con AUTH_ENABLED=false la validación se desactiva (desarrollo local y tests).

import logging

import jwt
from jwt import PyJWKClient
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import config

logger = logging.getLogger("psicofinance.auth")

# auto_error=False para devolver un 401 con mensaje propio
_bearer = HTTPBearer(auto_error=False)

_jwks_client: PyJWKClient | None = None


def _get_jwks_client() -> PyJWKClient:
    """Cliente JWKS del proyecto (cachea las claves públicas entre requests)."""
    global _jwks_client
    if _jwks_client is None:
        url = f"{config.supabase_url}/auth/v1/.well-known/jwks.json"
        _jwks_client = PyJWKClient(url, cache_keys=True)
    return _jwks_client


if not config.auth_enabled:
    logger.warning(
        "AUTH_ENABLED=false: la API corre SIN autenticación. "
        "Solo para desarrollo local y tests — activarla en producción."
    )


def _no_autorizado(detalle: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detalle,
        headers={"WWW-Authenticate": "Bearer"},
    )


def requerir_usuario(
    credenciales: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> dict:
    """Dependencia global: exige un JWT de Supabase válido y devuelve sus claims."""
    if not config.auth_enabled:
        return {"sub": "dev", "role": "authenticated"}

    if credenciales is None:
        raise _no_autorizado("Falta el token de autenticación")

    token = credenciales.credentials
    try:
        if config.supabase_jwt_secret:
            # Proyecto legacy con secreto compartido HS256
            claims = jwt.decode(
                token,
                config.supabase_jwt_secret,
                algorithms=["HS256"],
                audience="authenticated",
            )
        else:
            # Clave asimétrica: validar contra la clave pública del JWKS
            signing_key = _get_jwks_client().get_signing_key_from_jwt(token)
            claims = jwt.decode(
                token,
                signing_key.key,
                algorithms=["ES256", "RS256"],
                audience="authenticated",
            )
    except jwt.ExpiredSignatureError:
        raise _no_autorizado("Sesión expirada, volvé a iniciar sesión")
    except jwt.InvalidTokenError:
        raise _no_autorizado("Token inválido")
    except Exception as exc:  # error de red al traer el JWKS, etc.
        logger.error("Error validando token: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="No se pudo validar la sesión. Intentá de nuevo.",
        )

    return claims


def usuario_id(claims: dict = Depends(requerir_usuario)) -> str:
    """Dependencia de conveniencia: devuelve solo el ID del usuario (claim 'sub').

    Es lo que separa los datos de cada psicólogo — toda query a Supabase
    debe filtrar por este valor para que un usuario no vea los datos de otro.
    """
    return claims["sub"]
