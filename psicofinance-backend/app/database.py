from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from app.config import config

# SQLite necesita check_same_thread=False para funcionar con FastAPI (multi-thread)
is_sqlite = config.database_url.startswith("sqlite")

if is_sqlite:
    connect_args = {"check_same_thread": False}
else:
    # PostgreSQL (Supabase) requiere SSL y ajustes para connection pooler
    connect_args = {
        "sslmode": "require",
        "connect_timeout": 10,
        "keepalives": 1,
        "keepalives_idle": 30,
        "keepalives_interval": 10,
        "keepalives_count": 5,
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
