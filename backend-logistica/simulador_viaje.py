#!/usr/bin/env python3
"""
╔══════════════════════════════════════════════════════════════════════════╗
║            SIMULADOR DE TELEMETRÍA — CAMIÓN EN RUTA                      ║
╚══════════════════════════════════════════════════════════════════════════╝

Simula un camión real siguiendo la ruta calculada por el módulo de ruteo.
Publica mensajes MQTT al broker Mosquitto del backend, que los retransmite
vía WebSocket al dashboard en tiempo real.

DEPENDENCIAS:
    pip install paho-mqtt requests

USO:
    python3 simulador_viaje.py --viaje-id <UUID> --token <JWT>

    Opciones adicionales:
      --api-url   URL del backend       (default: http://localhost:3000)
      --mqtt-url  URL del broker MQTT   (default: mqtt://localhost:1883)
      --intervalo Segundos entre envíos (default: 2)
      --velocidad Velocidad en km/h     (default: 60)

TÓPICO MQTT:
    telemetria/camiones/{id_camion}

PAYLOAD PUBLICADO:
    {
      "id_camion":   string,
      "latitud":     float,
      "longitud":    float,
      "temperatura": float,   ← caja refrigerada, base -4 °C
      "estatus":     bool,    ← true = operativo
      "anomalia":    bool,    ← true = temperatura fuera de rango
      "fecha":       string   ← ISO 8601 UTC
    }
"""

import argparse
import json
import math
import random
import sys
import time
from datetime import datetime, timezone

# Las dependencias de terceros se importan dentro de main() para que
# --help y el argparser funcionen aunque aún no estén instaladas.


# ══════════════════════════════════════════════════════════════════════════════
# GEOMETRÍA
# ══════════════════════════════════════════════════════════════════════════════

def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distancia en metros entre dos coordenadas WGS-84."""
    R = 6_371_000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def interpolar_ruta(waypoints: list, vel_mps: float, intervalo_s: float) -> list:
    """
    Genera la secuencia de posiciones GPS que recorre el camión.
    Avanza `vel_mps * intervalo_s` metros por tick.
    """
    metros_por_tick = vel_mps * intervalo_s
    posiciones = []

    for i in range(len(waypoints) - 1):
        A, B = waypoints[i], waypoints[i + 1]
        dist = haversine(A["lat"], A["lng"], B["lat"], B["lng"])
        n = max(1, int(dist / metros_por_tick))

        for step in range(n):
            t = step / n
            posiciones.append({
                "lat": A["lat"] + t * (B["lat"] - A["lat"]),
                "lng": A["lng"] + t * (B["lng"] - A["lng"]),
            })

    posiciones.append(waypoints[-1])   # punto final exacto
    return posiciones


# ══════════════════════════════════════════════════════════════════════════════
# SENSORES SIMULADOS
# ══════════════════════════════════════════════════════════════════════════════

class SimuladorTemperatura:
    """
    Simula la temperatura de una caja refrigerada con deriva lenta.
    Base: -4 °C (carne/mariscos congelados).
    Anomalía: temperatura supera -1 °C o baja de -8 °C.
    """
    BASE = -4.0
    TOLERANCIA_MAX = -1.0
    TOLERANCIA_MIN = -8.0

    def __init__(self):
        self.valor = self.BASE + random.uniform(-0.3, 0.3)

    def siguiente(self) -> tuple[float, bool]:
        # Deriva ±0.15 °C por tick; corrección suave hacia la base
        self.valor += random.uniform(-0.15, 0.15)
        self.valor += (self.BASE - self.valor) * 0.08

        # Evento de anomalía espontánea (~3 % de probabilidad)
        if random.random() < 0.03:
            self.valor = random.uniform(0.0, 5.0)   # temperatura fuera de rango

        anomalia = not (self.TOLERANCIA_MIN <= self.valor <= self.TOLERANCIA_MAX)
        return round(self.valor, 2), anomalia


# ══════════════════════════════════════════════════════════════════════════════
# OBTENCIÓN DE DATOS DEL BACKEND
# ══════════════════════════════════════════════════════════════════════════════

def obtener_viaje(api_url: str, viaje_id: str, token: str) -> dict:
    import requests   # importación diferida — ya validada en main()
    url = f"{api_url}/api/v1/operaciones/viajes/{viaje_id}"
    try:
        resp = requests.get(
            url,
            headers={"Authorization": f"Bearer {token}"},
            timeout=10,
        )
        resp.raise_for_status()
    except Exception as e:
        print(f"\n❌  No se pudo obtener el viaje desde {url}\n    {e}\n")
        sys.exit(1)

    data = resp.json()
    return data.get("viaje") or data


def completar_viaje(api_url: str, viaje_id: str, token: str) -> None:
    """Marca el viaje como COMPLETADO en el backend al finalizar la ruta."""
    import requests   # importación diferida — ya validada en main()
    url = f"{api_url}/api/v1/operaciones/viajes/{viaje_id}/completar"
    try:
        resp = requests.patch(
            url,
            headers={"Authorization": f"Bearer {token}"},
            timeout=10,
        )
        resp.raise_for_status()
        print(f"\n  ✅  Viaje {viaje_id[:8]}… marcado como COMPLETADO en el backend.")
    except Exception as e:
        print(f"\n  ⚠️   No se pudo completar el viaje en el backend: {e}")


def extraer_waypoints(viaje: dict) -> list | None:
    """Extrae y ordena los waypoints de la ruta del viaje."""
    ruta   = viaje.get("ruta") or {}
    puntos = ruta.get("puntos") or ruta.get("puntos_ruta") or []

    if not puntos:
        return None

    puntos.sort(key=lambda p: p.get("orden", 0))

    wp = [
        {"lat": float(p["latitud"]), "lng": float(p["longitud"])}
        for p in puntos
        if p.get("latitud") is not None and p.get("longitud") is not None
    ]
    return wp if len(wp) >= 2 else None


def ruta_sintetica(lat0=25.6866, lng0=-100.3161, n=10) -> list:
    """
    Genera una ruta aleatoria alrededor de Monterrey cuando el viaje
    no tiene ruta calculada (sin API Key de Google Maps).
    """
    puntos = [{"lat": lat0, "lng": lng0}]
    lat, lng = lat0, lng0
    for _ in range(n - 1):
        lat  += random.uniform(-0.018, 0.018)
        lng  += random.uniform(-0.018, 0.018)
        puntos.append({"lat": round(lat, 6), "lng": round(lng, 6)})
    return puntos


# ══════════════════════════════════════════════════════════════════════════════
# MQTT
# ══════════════════════════════════════════════════════════════════════════════

def conectar_mqtt(mqtt_url: str, client_id: str):
    """Parsea la URL y conecta al broker. Requiere que paho-mqtt esté importado."""
    import paho.mqtt.client as mqtt   # importación diferida — ya validada en main()

    url = mqtt_url.replace("mqtt://", "").replace("mqtts://", "")
    host, port = (url.rsplit(":", 1) + ["1883"])[:2]   # default port 1883
    port = int(port)

    client = mqtt.Client(client_id=client_id)
    try:
        client.connect(host, port, keepalive=60)
        client.loop_start()
    except Exception as e:
        print(f"\n❌  No se pudo conectar al broker MQTT {host}:{port}\n    {e}\n")
        print("    Asegúrate de que Mosquitto esté corriendo:\n"
              "    Windows : net start mosquitto\n"
              "    Linux   : sudo systemctl start mosquitto\n"
              "    Docker  : docker run -p 1883:1883 eclipse-mosquitto\n")
        sys.exit(1)

    return client


# ══════════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description="Simulador de telemetría de camión en ruta",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("--viaje-id",  required=True,
                        help="UUID del viaje a simular")
    parser.add_argument("--token",     required=True,
                        help="JWT Bearer token (se obtiene del login)")
    parser.add_argument("--api-url",   default="http://localhost:3000",
                        help="URL base del backend")
    parser.add_argument("--mqtt-url",  default="mqtt://localhost:1883",
                        help="URL del broker MQTT")
    parser.add_argument("--intervalo", type=float, default=2.0,
                        help="Segundos entre lecturas")
    parser.add_argument("--velocidad", type=float, default=60.0,
                        help="Velocidad simulada del camión (km/h)")
    args = parser.parse_args()

    # ── Validar dependencias (después de parsear args, así --help siempre funciona)
    _faltantes = []
    try:
        import paho.mqtt.client  # noqa: F401
    except ImportError:
        _faltantes.append("paho-mqtt")
    try:
        import requests  # noqa: F401
    except ImportError:
        _faltantes.append("requests")
    if _faltantes:
        print(f"\n❌  Dependencias faltantes: {', '.join(_faltantes)}")
        print(f"    Instálalas con:\n    pip install {' '.join(_faltantes)}\n")
        sys.exit(1)

    # ── Banner ────────────────────────────────────────────────────────────────
    print("\n" + "═" * 60)
    print("  🚛  SIMULADOR DE TELEMETRÍA — CAMIÓN EN RUTA")
    print("═" * 60)
    print(f"  Viaje    : {args.viaje_id}")
    print(f"  API      : {args.api_url}")
    print(f"  MQTT     : {args.mqtt_url}")
    print(f"  Intervalo: {args.intervalo} s")
    print(f"  Velocidad: {args.velocidad} km/h")
    print("─" * 60)

    # ── Obtener datos del viaje ───────────────────────────────────────────────
    print("  Obteniendo datos del viaje desde el backend...")
    viaje = obtener_viaje(args.api_url, args.viaje_id, args.token)

    id_camion = (
        viaje.get("id_camion")
        or (viaje.get("camion") or {}).get("id_camion")
    )
    if not id_camion:
        print("❌  No se pudo extraer id_camion del viaje.")
        sys.exit(1)

    conductor     = viaje.get("conductor") or {}
    nombre        = (
        conductor.get("nombre_completo")
        or f"{conductor.get('nombres', '')} {conductor.get('apellido_paterno', '')}".strip()
        or "—"
    )
    numero_guia   = viaje.get("numero_guia") or viaje.get("id_viaje", "")[:8]
    camion_info   = viaje.get("camion") or {}
    modelo_camion = f"{camion_info.get('marca', '')} {camion_info.get('modelo', '')}".strip() or "—"
    placas        = camion_info.get("placas") or "—"
    region        = viaje.get("id_region") or "LOCAL"

    print(f"  Guía     : {numero_guia}")
    print(f"  Camión   : {modelo_camion} ({placas})")
    print(f"  Conductor: {nombre}")
    print(f"  Región   : {region}")
    print(f"  ID camión: {id_camion}")

    # ── Waypoints ─────────────────────────────────────────────────────────────
    waypoints = extraer_waypoints(viaje)
    if waypoints:
        print(f"  Ruta     : {len(waypoints)} waypoints obtenidos de Google Maps ✅")
    else:
        print("  Ruta     : Sin ruta calculada — usando ruta sintética en Monterrey ⚠️")
        waypoints = ruta_sintetica()

    vel_mps    = args.velocidad / 3.6
    posiciones = interpolar_ruta(waypoints, vel_mps, args.intervalo)
    total      = len(posiciones)
    distancia_km = sum(
        haversine(waypoints[i]["lat"], waypoints[i]["lng"],
                  waypoints[i+1]["lat"], waypoints[i+1]["lng"])
        for i in range(len(waypoints) - 1)
    ) / 1000
    tiempo_min = total * args.intervalo / 60

    print(f"  Pasos    : {total} ({distancia_km:.1f} km, ~{tiempo_min:.0f} min a {args.velocidad} km/h)")
    print("─" * 60)

    # ── Conectar MQTT ─────────────────────────────────────────────────────────
    client_id = f"sim_{id_camion[:8]}_{int(time.time())}"
    print(f"  Conectando al broker MQTT...")
    client = conectar_mqtt(args.mqtt_url, client_id)
    print(f"  Broker   : conectado ✅")
    print("═" * 60)
    print("  Iniciando transmisión. Ctrl+C para detener.\n")

    topico = f"telemetria/camiones/{id_camion}"
    sensor = SimuladorTemperatura()
    anomalias_count = 0
    i = 0
    ruta_completada = False   # se pone True solo si el for termina sin interrupciones

    try:
        for i, pos in enumerate(posiciones):
            temperatura, anomalia = sensor.siguiente()
            if anomalia:
                anomalias_count += 1

            payload = {
                "id_camion":   id_camion,
                "latitud":     round(pos["lat"], 6),
                "longitud":    round(pos["lng"], 6),
                "temperatura": temperatura,
                "estatus":     True,
                "anomalia":    anomalia,
                "fecha":       datetime.now(timezone.utc).isoformat(),
            }

            client.publish(topico, json.dumps(payload), qos=1)

            # ── Barra de progreso ─────────────────────────────────────────
            pct      = int((i + 1) / total * 100)
            filled   = int(pct / 3)
            barra    = "█" * filled + "░" * (34 - filled)
            icono    = "⚠️ " if anomalia else "✅"
            eta_min  = int((total - i - 1) * args.intervalo / 60)
            eta_seg  = int((total - i - 1) * args.intervalo % 60)

            print(
                f"\r  {icono} [{barra}] {pct:3d}%  "
                f"🌡️ {temperatura:+.1f}°C  "
                f"📍 {pos['lat']:.4f},{pos['lng']:.4f}  "
                f"ETA {eta_min:02d}:{eta_seg:02d}",
                end="", flush=True,
            )

            time.sleep(args.intervalo)

        # El for terminó naturalmente → ruta completa
        ruta_completada = True

    except KeyboardInterrupt:
        print(f"\n\n  ⏹️  Simulación interrumpida manualmente en el paso {i+1}/{total}.")

    finally:
        client.loop_stop()
        client.disconnect()
        sep = "═" * 60
        thin = "─" * 60
        print("\n\n" + sep)
        print("  📊 Resumen de simulación")
        print(thin)
        print(f"  Pasos completados : {i + 1} / {total}")
        print(f"  Anomalías emitidas: {anomalias_count}")
        print(f"  Tópico MQTT usado : {topico}")
        print(f"  Camión            : {id_camion}")
        print(sep + "\n")

        # ── Marcar viaje como completado si la ruta terminó ──────────
        if ruta_completada:
            completar_viaje(args.api_url, args.viaje_id, args.token)


if __name__ == "__main__":
    main()
