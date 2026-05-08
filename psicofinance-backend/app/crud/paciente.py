# Operaciones de base de datos para la entidad Paciente.
# Solo contiene queries SQLAlchemy, sin lógica de negocio.

import uuid
from datetime import date
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.paciente import Paciente
from app.models.turno import Turno, EstadoTurno
from app.schemas.paciente import PacienteCreate, PacienteUpdate


def crear_paciente(db: Session, nombre: str, apellido: str, email: str | None = None) -> Paciente:
    """Inserta un paciente nuevo en la base de datos."""
    paciente = Paciente(nombre=nombre, apellido=apellido, email=email)
    db.add(paciente)
    db.commit()
    db.refresh(paciente)
    return paciente


def crear_paciente_completo(db: Session, datos: PacienteCreate) -> Paciente:
    """Crea un paciente con todos los campos del schema (incluye honorario)."""
    paciente = Paciente(**datos.model_dump())
    db.add(paciente)
    db.commit()
    db.refresh(paciente)
    return paciente


def obtener_paciente(db: Session, paciente_id: uuid.UUID) -> Paciente | None:
    """Busca un paciente por su ID. Retorna None si no existe."""
    return db.get(Paciente, paciente_id)


def actualizar_paciente(db: Session, paciente_id: uuid.UUID, datos: PacienteUpdate) -> Paciente | None:
    """Actualiza solo los campos enviados (partial update)."""
    paciente = db.get(Paciente, paciente_id)
    if paciente is None:
        return None
    cambios = datos.model_dump(exclude_unset=True)
    for campo, valor in cambios.items():
        setattr(paciente, campo, valor)
    db.commit()
    db.refresh(paciente)
    return paciente


def eliminar_paciente(db: Session, paciente_id: uuid.UUID) -> tuple[bool, str]:
    """
    Elimina un paciente. Retorna (True, '') si OK.
    Retorna (False, motivo) si no se puede eliminar.
    No se permite eliminar pacientes con turnos registrados.
    """
    paciente = db.get(Paciente, paciente_id)
    if paciente is None:
        return False, "no_encontrado"
    tiene_turnos = db.query(Turno).filter(Turno.paciente_id == paciente_id).first() is not None
    if tiene_turnos:
        return False, "tiene_turnos"
    db.delete(paciente)
    db.commit()
    return True, ""


def listar_pacientes(db: Session, offset: int = 0, limit: int = 100) -> list[Paciente]:
    """Retorna la lista paginada de pacientes ordenada por apellido."""
    return (
        db.query(Paciente)
        .order_by(Paciente.apellido, Paciente.nombre)
        .offset(offset).limit(limit).all()
    )


def listar_pacientes_con_stats(db: Session) -> list[dict]:
    """
    Retorna todos los pacientes con estadísticas agregadas en dos queries:
    1. SELECT * FROM pacientes
    2. SELECT agregados FROM turnos GROUP BY paciente_id
    Evita N+1 sin necesitar ORM joins complejos.
    """
    pacientes = (
        db.query(Paciente)
        .order_by(Paciente.apellido, Paciente.nombre)
        .all()
    )

    # Una sola query con todos los agregados
    from sqlalchemy import case as sa_case
    hoy = date.today()

    stats_rows = (
        db.query(
            Turno.paciente_id,
            func.count(Turno.id).label("total_sesiones"),
            func.max(Turno.fecha_turno).label("ultima_sesion"),
            func.coalesce(
                func.sum(sa_case((Turno.estado == EstadoTurno.COBRADO,   Turno.monto), else_=0)), 0
            ).label("cobrado_total"),
            func.coalesce(
                func.sum(sa_case((Turno.estado == EstadoTurno.DIFERIDO,  Turno.monto), else_=0)), 0
            ).label("pendiente"),
            func.coalesce(
                func.sum(
                    sa_case(
                        (
                            (Turno.estado != EstadoTurno.INCOBRABLE) &
                            (func.strftime("%Y-%m", Turno.fecha_turno) == func.strftime("%Y-%m", func.date("now"))),
                            1
                        ),
                        else_=0
                    )
                ), 0
            ).label("sesiones_mes"),
        )
        .group_by(Turno.paciente_id)
        .all()
    )

    stats_map = {str(row.paciente_id): row for row in stats_rows}

    resultado = []
    for p in pacientes:
        s = stats_map.get(str(p.id))
        ultima = s.ultima_sesion if s else None
        # SQLite puede retornar fecha como string
        if isinstance(ultima, str):
            from datetime import date as _date
            ultima = _date.fromisoformat(ultima)
        dias = (hoy - ultima).days if ultima else None

        resultado.append({
            "paciente":       p,
            "total_sesiones": int(s.total_sesiones) if s else 0,
            "ultima_sesion":  ultima,
            "dias_inactivo":  dias,
            "cobrado_total":  float(s.cobrado_total) if s else 0.0,
            "pendiente":      float(s.pendiente)     if s else 0.0,
            "sesiones_mes":   int(s.sesiones_mes)    if s else 0,
        })

    return resultado


def obtener_paciente_con_turnos(db: Session, paciente_id: uuid.UUID) -> dict | None:
    """Retorna el paciente + sus turnos ordenados por fecha desc + estadísticas."""
    paciente = db.get(Paciente, paciente_id)
    if paciente is None:
        return None

    turnos = (
        db.query(Turno)
        .filter(Turno.paciente_id == paciente_id)
        .order_by(Turno.fecha_turno.desc())
        .all()
    )

    hoy = date.today()
    ultima = turnos[0].fecha_turno if turnos else None
    if isinstance(ultima, str):
        from datetime import date as _date
        ultima = _date.fromisoformat(ultima)
    dias = (hoy - ultima).days if ultima else None

    cobrado  = sum(float(t.monto) for t in turnos if t.estado == EstadoTurno.COBRADO)
    pendiente = sum(float(t.monto) for t in turnos if t.estado == EstadoTurno.DIFERIDO)
    mes_actual = hoy.strftime("%Y-%m")
    sesiones_mes = sum(
        1 for t in turnos
        if t.estado != EstadoTurno.INCOBRABLE and t.fecha_turno.strftime("%Y-%m") == mes_actual
    )

    return {
        "paciente":       paciente,
        "total_sesiones": len(turnos),
        "ultima_sesion":  ultima,
        "dias_inactivo":  dias,
        "cobrado_total":  cobrado,
        "pendiente":      pendiente,
        "sesiones_mes":   sesiones_mes,
        "turnos":         turnos,
    }


def buscar_paciente_por_nombre(db: Session, nombre_completo: str) -> Paciente | None:
    """
    Busca un paciente por nombre completo (case-insensitive).
    Estrategia: intenta coincidir contra nombre+apellido concatenados.
    Si el input tiene un solo token, busca en nombre O apellido.
    Retorna el primer resultado o None.
    Usado por el Copiloto NLP para evitar duplicar pacientes.
    """
    termino = nombre_completo.strip().lower()
    partes = termino.split()

    if len(partes) == 1:
        return (
            db.query(Paciente)
            .filter(
                func.lower(Paciente.nombre).contains(partes[0]) |
                func.lower(Paciente.apellido).contains(partes[0])
            )
            .first()
        )

    return (
        db.query(Paciente)
        .filter(
            func.lower(Paciente.nombre).contains(partes[0]) &
            func.lower(Paciente.apellido).contains(partes[-1])
        )
        .first()
    )


def obtener_o_crear_paciente(db: Session, nombre_completo: str) -> tuple[Paciente, bool]:
    """
    Busca el paciente por nombre. Si no existe, lo crea.
    Retorna (paciente, fue_creado).
    Usado por el Copiloto para garantizar que el turno siempre tenga un paciente.
    """
    existente = buscar_paciente_por_nombre(db, nombre_completo)
    if existente:
        return existente, False

    partes = nombre_completo.strip().split()
    nombre  = partes[0] if partes else nombre_completo
    apellido = " ".join(partes[1:]) if len(partes) > 1 else ""

    nuevo = crear_paciente(db, nombre=nombre, apellido=apellido)
    return nuevo, True
