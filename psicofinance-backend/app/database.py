import socket as _socket
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from app.config import config

# Forzar IPv4 en todas las conexiones (Render free no soporta IPv6)
_orig_getaddrinfo = _socket.getaddrinfo
def _ipv4_only(host, port, family=0, type=0, proto=0, flags=0):
    return _orig_getaddrinfo(host, port, _socket.AF_INET, type, proto, flags)
_socket.getaddrinfo = _ipv4_only

# SQLite necesita check_same_thread=False para funcionar con FastAPI (multi-thread)
is_sqlite = config.database_url.startswith("sqlite")

if is_sqlite:
    connect_args = {"check_same_thread": False}
else:
    connect_args = {
        "sslmode": "require",
        "connect_timeout": 10,
    }

engine = create_engine(
    config.database_url,
    connect_args=connect_args,
    pool_pre_ping=not is_sqlite,
    pool_size=2,
    max_overflow=3,
    pool_timeout=30,
    pool_recycle=300,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
