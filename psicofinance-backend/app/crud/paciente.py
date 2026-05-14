# CRUD de Pacientes usando Supabase REST API.
# Reemplaza SQLAlchemy para evitar problemas de conectividad PostgreSQL en Render free.

import uuid
from datetime import date, datetime
from app.supabase_client import SupabaseClient
from app.schemas.paciente import PacienteCreate, PacienteUpdate


def _parse_date(val) -> date | None:
    if val is None:
        return None
    if isinstance(val, date):
        return val
    return date.fromisoformat(str(val)[:10])


def crear_paciente(sb: SupabaseClient, nombre: str, apellido: str, email: str | None = None) -> dict:
    data = {"id": str(uuid.uuid4()), "nombre": nombre, "apellido": apellido}
    if email:
        data["email"] = email
    return sb.insert("pacientes", data)


def crear_paciente_completo(sb: SupabaseClient, datos: PacienteCreate) -> dict:
    data = {k: (str(v) if isinstance(v, (uuid.UUID, date)) else v)
            for k, v in datos.model_dump().items() if v is not None}
    data["id"] = str(uuid.uuid4())
    return sb.insert("pacientes", data)


def obtener_paciente(sb: SupabaseClient, paciente_id: uuid.UUID) -> dict | None:
    rows = sb.select("pacientes", {"id": f"eq.{paciente_id}"})
    return rows[0] if rows else None


def actualizar_paciente(sb: SupabaseClient, paciente_id: uuid.UUID, datos: PacienteUpdate) -> dict | None:
    cambios = {}
    for k, v in datos.model_dump(exclude_unset=True).items():
        if isinstance(v, date):
            cambios[k] = v.isoformat()
        elif isinstance(v, uuid.UUID):
            cambios[k] = str(v)
        else:
            cambios[k] = v
    if not cambios:
        return obtener_paciente(sb, paciente_id)
    return sb.update("pacientes", {"id": f"eq.{paciente_id}"}, cambios)


def eliminar_paciente(sb: SupabaseClient, paciente_id: uuid.UUID) -> tuple[bool, str]:
    paciente = obtener_paciente(sb, paciente_id)
    if paciente is None:
        return False, "no_encontrado"
    turnos = sb.select("turnos", {"paciente_id": f"eq.{paciente_id}", "limit": "1"})
    if turnos:
        return False, "tiene_turnos"
    sb.delete("pacientes", {"id": f"eq.{paciente_id}"})
    return True, ""


def listar_pacientes_con_stats(sb: SupabaseClient) -> list[dict]:
    pacientes = sb.select("pacientes", {"order": "apellido.asc,nombre.asc"})
    if not pacientes:
        return []

    turnos = sb.select("turnos", {"select": "paciente_id,monto,estado,fecha_turno"})

    hoy = date.today()
    mes_actual = hoy.strftime("%Y-%m")

    stats: dict[str, dict] = {}
    for t in turnos:
        pid = t["paciente_id"]
        if pid not in stats:
            stats[pid] = {"total": 0, "ultima": None, "cobrado": 0.0, "pendiente": 0.0, "mes": 0}
        s = stats[pid]
        if estado != "INCOBRABLE":
            s["total"] += 1
        ft = _parse_date(t.get("fecha_turno"))
        if ft and (s["ultima"] is None or ft > s["ultima"]):
            s["ultima"] = ft
        monto = float(t.get("monto") or 0)
        estado = t.get("estado", "")
        if estado == "COBRADO":
            s["cobrado"] += monto
        elif estado == "DIFERIDO":
            s["pendiente"] += monto
        if estado != "INCOBRABLE" and ft and ft.strftime("%Y-%m") == mes_actual:
            s["mes"] += 1

    resultado = []
    for p in pacientes:
        pid = p["id"]
        s = stats.get(pid, {})
        ultima = s.get("ultima")
        dias = (hoy - ultima).days if ultima else None
        resultado.append({
            "paciente": p,
            "total_sesiones": s.get("total", 0),
            "ultima_sesion": ultima,
            "dias_inactivo": dias,
            "cobrado_total": s.get("cobrado", 0.0),
            "pendiente": s.get("pendiente", 0.0),
            "sesiones_mes": s.get("mes", 0),
        })
    return resultado


def obtener_paciente_con_turnos(sb: SupabaseClient, paciente_id: uuid.UUID) -> dict | None:
    paciente = obtener_paciente(sb, paciente_id)
    if paciente is None:
        return None

    turnos = sb.select("turnos", {
        "paciente_id": f"eq.{paciente_id}",
        "order": "fecha_turno.desc",
    })

    hoy = date.today()
    mes_actual = hoy.strftime("%Y-%m")
    ultima = _parse_date(turnos[0]["fecha_turno"]) if turnos else None
    dias = (hoy - ultima).days if ultima else None

    cobrado = sum(float(t["monto"] or 0) for t in turnos if t.get("estado") == "COBRADO")
    pendiente = sum(float(t["monto"] or 0) for t in turnos if t.get("estado") == "DIFERIDO")
    sesiones_mes = sum(
        1 for t in turnos
        if t.get("estado") != "INCOBRABLE"
        and _parse_date(t.get("fecha_turno")) is not None
        and _parse_date(t["fecha_turno"]).strftime("%Y-%m") == mes_actual
    )
    total_sesiones_reales = sum(1 for t in turnos if t.get("estado") != "INCOBRABLE")

    return {
        "paciente": paciente,
        "total_sesiones": total_sesiones_reales,
        "ultima_sesion": ultima,
        "dias_inactivo": dias,
        "cobrado_total": cobrado,
        "pendiente": pendiente,
        "sesiones_mes": sesiones_mes,
        "turnos": turnos,
    }


def buscar_paciente_por_nombre(sb: SupabaseClient, nombre_completo: str) -> dict | None:
    termino = nombre_completo.strip().lower()
    partes = termino.split()
    if len(partes) == 1:
        rows = sb.select("pacientes", {"or": f"(nombre.ilike.*{partes[0]}*,apellido.ilike.*{partes[0]}*)"})
    else:
        rows = sb.select("pacientes", {
            "nombre": f"ilike.*{partes[0]}*",
            "apellido": f"ilike.*{partes[-1]}*",
        })
    return rows[0] if rows else None


def obtener_o_crear_paciente(sb: SupabaseClient, nombre_completo: str) -> tuple[dict, bool]:
    existente = buscar_paciente_por_nombre(sb, nombre_completo)
    if existente:
        return existente, False
    partes = nombre_completo.strip().split()
    nombre = partes[0] if partes else nombre_completo
    apellido = " ".join(partes[1:]) if len(partes) > 1 else ""
    nuevo = crear_paciente(sb, nombre=nombre, apellido=apellido)
    return nuevo, True
