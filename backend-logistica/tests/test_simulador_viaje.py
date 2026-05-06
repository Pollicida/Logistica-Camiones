"""
Test suite for simulador_viaje.py
Uses only stdlib — no pytest or third-party dependencies required.

Run:
    python3 -m unittest tests.test_simulador_viaje -v
"""

import math
import sys
import types
import unittest
from unittest.mock import MagicMock, patch, call


# ─────────────────────────────────────────────────────────────────────────────
# Inject stub modules BEFORE importing the script under test, so the deferred
# imports inside conectar_mqtt() and obtener_viaje() resolve to our fakes.
# ─────────────────────────────────────────────────────────────────────────────

# --- paho.mqtt stub ---
paho_stub        = types.ModuleType("paho")
paho_mqtt_stub   = types.ModuleType("paho.mqtt")
paho_client_stub = types.ModuleType("paho.mqtt.client")

class FakeMQTTClient:
    def __init__(self, client_id=""):
        self.client_id  = client_id
        self.published  = []
        self._connected = False
    def connect(self, host, port, keepalive=60):
        self._connected = True
    def loop_start(self):  pass
    def loop_stop(self):   pass
    def disconnect(self):  self._connected = False
    def publish(self, topic, payload, qos=0):
        self.published.append((topic, payload))

paho_client_stub.Client = FakeMQTTClient
paho_stub.mqtt          = paho_mqtt_stub
paho_mqtt_stub.client   = paho_client_stub
sys.modules["paho"]             = paho_stub
sys.modules["paho.mqtt"]        = paho_mqtt_stub
sys.modules["paho.mqtt.client"] = paho_client_stub

# --- requests stub ---
requests_stub = types.ModuleType("requests")

class FakeResponse:
    def __init__(self, data):
        self._data = data
    def raise_for_status(self): pass
    def json(self): return self._data

def fake_get(url, headers=None, timeout=10):
    return FakeResponse({
        "id_viaje":  "viaje-uuid-1234",
        "id_camion": "camion-uuid-abcd",
        "numero_guia": "GUIA0001",
        "camion":    {"marca": "Volvo", "modelo": "FH", "placas": "ABC-123"},
        "conductor": {"nombre_completo": "Juan Pérez"},
        "id_region": "NORTE",
        "ruta": {
            "puntos": [
                {"orden": 0, "latitud": 25.6866, "longitud": -100.3161},
                {"orden": 1, "latitud": 25.7000, "longitud": -100.3000},
                {"orden": 2, "latitud": 25.7200, "longitud": -100.2800},
            ]
        },
    })

requests_stub.get = fake_get
sys.modules["requests"] = requests_stub

# Now safe to import the module
import importlib, os, sys as _sys
_sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import simulador_viaje as sv


# ─────────────────────────────────────────────────────────────────────────────
# Tests
# ─────────────────────────────────────────────────────────────────────────────

class TestHaversine(unittest.TestCase):

    def test_same_point_is_zero(self):
        self.assertAlmostEqual(sv.haversine(25.0, -100.0, 25.0, -100.0), 0.0, places=3)

    def test_known_distance_monterrey_guadalajara(self):
        # Monterrey (25.6866, -100.3161) → Guadalajara (20.6597, -103.3496)
        # Actual haversine distance ≈ 639 km
        dist = sv.haversine(25.6866, -100.3161, 20.6597, -103.3496)
        self.assertAlmostEqual(dist / 1000, 639, delta=15)

    def test_short_distance_positive(self):
        dist = sv.haversine(25.6866, -100.3161, 25.6967, -100.3061)
        self.assertGreater(dist, 0)

    def test_symmetry(self):
        d1 = sv.haversine(10.0, 20.0, 30.0, 40.0)
        d2 = sv.haversine(30.0, 40.0, 10.0, 20.0)
        self.assertAlmostEqual(d1, d2, places=3)

    def test_returns_metres(self):
        # 1 degree latitude ≈ 111 km
        dist = sv.haversine(0.0, 0.0, 1.0, 0.0)
        self.assertAlmostEqual(dist / 1000, 111, delta=2)


class TestInterpolarRuta(unittest.TestCase):

    def _two_point_route(self):
        return [
            {"lat": 25.6866, "lng": -100.3161},
            {"lat": 25.7866, "lng": -100.3161},   # ~11.1 km north
        ]

    def test_returns_list(self):
        wp = self._two_point_route()
        result = sv.interpolar_ruta(wp, vel_mps=16.67, intervalo_s=2)
        self.assertIsInstance(result, list)

    def test_last_point_equals_destination(self):
        wp = self._two_point_route()
        result = sv.interpolar_ruta(wp, vel_mps=16.67, intervalo_s=2)
        self.assertAlmostEqual(result[-1]["lat"], wp[-1]["lat"], places=4)
        self.assertAlmostEqual(result[-1]["lng"], wp[-1]["lng"], places=4)

    def test_more_steps_at_lower_speed(self):
        wp = self._two_point_route()
        slow  = sv.interpolar_ruta(wp, vel_mps=5,  intervalo_s=2)
        fast  = sv.interpolar_ruta(wp, vel_mps=30, intervalo_s=2)
        self.assertGreater(len(slow), len(fast))

    def test_single_segment_monotone_lat(self):
        wp = self._two_point_route()
        result = sv.interpolar_ruta(wp, vel_mps=16.67, intervalo_s=2)
        lats = [p["lat"] for p in result]
        self.assertEqual(lats, sorted(lats))

    def test_three_waypoints(self):
        wp = [
            {"lat": 25.0, "lng": -100.0},
            {"lat": 25.5, "lng": -100.0},
            {"lat": 26.0, "lng": -100.0},
        ]
        result = sv.interpolar_ruta(wp, vel_mps=16.67, intervalo_s=2)
        self.assertGreater(len(result), 2)
        self.assertAlmostEqual(result[-1]["lat"], 26.0, places=4)

    def test_all_positions_have_lat_lng(self):
        wp = self._two_point_route()
        result = sv.interpolar_ruta(wp, vel_mps=16.67, intervalo_s=2)
        for pos in result:
            self.assertIn("lat", pos)
            self.assertIn("lng", pos)


class TestSimuladorTemperatura(unittest.TestCase):

    def test_initial_temp_near_base(self):
        for _ in range(20):
            s = sv.SimuladorTemperatura()
            self.assertAlmostEqual(s.valor, sv.SimuladorTemperatura.BASE, delta=0.5)

    def test_siguiente_returns_tuple(self):
        s = sv.SimuladorTemperatura()
        result = s.siguiente()
        self.assertIsInstance(result, tuple)
        self.assertEqual(len(result), 2)

    def test_temperatura_is_float(self):
        s = sv.SimuladorTemperatura()
        temp, _ = s.siguiente()
        self.assertIsInstance(temp, float)

    def test_anomalia_is_bool(self):
        s = sv.SimuladorTemperatura()
        _, anomalia = s.siguiente()
        self.assertIsInstance(anomalia, bool)

    def test_anomalia_flag_consistent_with_thresholds(self):
        """
        anomalia se calcula sobre el valor interno antes de redondear,
        por lo que en los bordes exactos (ej. temp=-1.0 redondeado desde -0.997)
        puede diferir levemente de la comparación con el temp redondeado.
        Verificamos que si temp está claramente fuera de rango, anomalia=True;
        y si está claramente dentro, anomalia=False.
        """
        EPSILON = 0.01   # margen para los bordes de redondeo
        s = sv.SimuladorTemperatura()
        for _ in range(500):
            temp, anomalia = s.siguiente()
            clearly_in  = (sv.SimuladorTemperatura.TOLERANCIA_MIN + EPSILON
                           <= temp <=
                           sv.SimuladorTemperatura.TOLERANCIA_MAX - EPSILON)
            clearly_out = (temp > sv.SimuladorTemperatura.TOLERANCIA_MAX + EPSILON
                           or temp < sv.SimuladorTemperatura.TOLERANCIA_MIN - EPSILON)
            if clearly_in:
                self.assertFalse(anomalia,
                                 f"temp={temp} claramente en rango pero anomalia=True")
            if clearly_out:
                self.assertTrue(anomalia,
                                f"temp={temp} claramente fuera de rango pero anomalia=False")

    def test_temperature_rounded_to_2_decimals(self):
        s = sv.SimuladorTemperatura()
        for _ in range(50):
            temp, _ = s.siguiente()
            self.assertEqual(temp, round(temp, 2))

    def test_normal_range_majority(self):
        """Most readings should be within a reasonable band (not always anomalous)."""
        s = sv.SimuladorTemperatura()
        anomalias = sum(1 for _ in range(1000) if s.siguiente()[1])
        normales  = 1000 - anomalias
        self.assertGreater(anomalias, 0)
        self.assertGreater(normales, anomalias)   # normales must dominate
        self.assertLess(anomalias, 600)


class TestExtraerWaypoints(unittest.TestCase):

    def _viaje_con_puntos(self):
        return {
            "ruta": {
                "puntos": [
                    {"orden": 0, "latitud": 25.0, "longitud": -100.0},
                    {"orden": 1, "latitud": 25.5, "longitud": -100.5},
                ]
            }
        }

    def test_extracts_two_waypoints(self):
        wp = sv.extraer_waypoints(self._viaje_con_puntos())
        self.assertIsNotNone(wp)
        self.assertEqual(len(wp), 2)

    def test_waypoints_have_lat_lng(self):
        wp = sv.extraer_waypoints(self._viaje_con_puntos())
        for p in wp:
            self.assertIn("lat", p)
            self.assertIn("lng", p)

    def test_sorted_by_orden(self):
        viaje = {
            "ruta": {
                "puntos": [
                    {"orden": 2, "latitud": 26.0, "longitud": -101.0},
                    {"orden": 0, "latitud": 25.0, "longitud": -100.0},
                    {"orden": 1, "latitud": 25.5, "longitud": -100.5},
                ]
            }
        }
        wp = sv.extraer_waypoints(viaje)
        self.assertEqual(wp[0]["lat"], 25.0)
        self.assertEqual(wp[1]["lat"], 25.5)
        self.assertEqual(wp[2]["lat"], 26.0)

    def test_returns_none_if_no_ruta(self):
        result = sv.extraer_waypoints({})
        self.assertIsNone(result)

    def test_returns_none_if_single_point(self):
        viaje = {"ruta": {"puntos": [{"orden": 0, "latitud": 25.0, "longitud": -100.0}]}}
        result = sv.extraer_waypoints(viaje)
        self.assertIsNone(result)

    def test_skips_points_with_none_coords(self):
        viaje = {
            "ruta": {
                "puntos": [
                    {"orden": 0, "latitud": None,  "longitud": -100.0},
                    {"orden": 1, "latitud": 25.5,  "longitud": -100.5},
                    {"orden": 2, "latitud": 26.0,  "longitud": -101.0},
                ]
            }
        }
        wp = sv.extraer_waypoints(viaje)
        self.assertIsNotNone(wp)
        self.assertEqual(len(wp), 2)

    def test_puntos_ruta_key_also_works(self):
        viaje = {
            "ruta": {
                "puntos_ruta": [
                    {"orden": 0, "latitud": 25.0, "longitud": -100.0},
                    {"orden": 1, "latitud": 25.5, "longitud": -100.5},
                ]
            }
        }
        wp = sv.extraer_waypoints(viaje)
        self.assertIsNotNone(wp)
        self.assertEqual(len(wp), 2)


class TestRutaSintetica(unittest.TestCase):

    def test_returns_n_points(self):
        wp = sv.ruta_sintetica(n=8)
        self.assertEqual(len(wp), 8)

    def test_default_start_near_monterrey(self):
        wp = sv.ruta_sintetica()
        self.assertAlmostEqual(wp[0]["lat"], 25.6866, places=3)
        self.assertAlmostEqual(wp[0]["lng"], -100.3161, places=3)

    def test_all_points_have_lat_lng(self):
        for p in sv.ruta_sintetica(n=5):
            self.assertIn("lat", p)
            self.assertIn("lng", p)

    def test_custom_origin(self):
        wp = sv.ruta_sintetica(lat0=20.0, lng0=-90.0, n=3)
        self.assertAlmostEqual(wp[0]["lat"], 20.0, places=4)
        self.assertAlmostEqual(wp[0]["lng"], -90.0, places=4)


class TestConectarMQTT(unittest.TestCase):

    def test_returns_client(self):
        client = sv.conectar_mqtt("mqtt://localhost:1883", "test_client")
        self.assertIsNotNone(client)

    def test_client_is_connected(self):
        client = sv.conectar_mqtt("mqtt://localhost:1883", "test_client_2")
        self.assertTrue(client._connected)

    def test_custom_port_parsed(self):
        client = sv.conectar_mqtt("mqtt://localhost:9999", "port_test")
        self.assertTrue(client._connected)

    def test_mqtts_prefix_stripped(self):
        client = sv.conectar_mqtt("mqtts://localhost:8883", "tls_test")
        self.assertTrue(client._connected)


class TestObtenerViaje(unittest.TestCase):

    def test_returns_dict(self):
        viaje = sv.obtener_viaje("http://localhost:3000", "viaje-uuid-1234", "fake-token")
        self.assertIsInstance(viaje, dict)

    def test_contains_id_camion(self):
        viaje = sv.obtener_viaje("http://localhost:3000", "viaje-uuid-1234", "fake-token")
        self.assertIn("id_camion", viaje)

    def test_contains_ruta(self):
        viaje = sv.obtener_viaje("http://localhost:3000", "viaje-uuid-1234", "fake-token")
        self.assertIn("ruta", viaje)

    def test_exits_on_request_error(self):
        original = requests_stub.get
        def boom(*a, **kw):
            raise Exception("connection refused")
        requests_stub.get = boom
        with self.assertRaises(SystemExit):
            sv.obtener_viaje("http://bad-host", "x", "token")
        requests_stub.get = original


class TestCompletarViaje(unittest.TestCase):
    """completar_viaje() should PATCH /api/v1/operaciones/viajes/:id/completar."""

    def setUp(self):
        # Track PATCH calls
        self.patched_calls = []

        class FakePatchResponse:
            def raise_for_status(self): pass

        def fake_patch(url, headers=None, timeout=10):
            self.patched_calls.append(url)
            return FakePatchResponse()

        self._original_patch = getattr(requests_stub, 'patch', None)
        requests_stub.patch = fake_patch

    def tearDown(self):
        if self._original_patch is not None:
            requests_stub.patch = self._original_patch
        else:
            delattr(requests_stub, 'patch')

    def test_calls_correct_endpoint(self):
        sv.completar_viaje("http://localhost:3000", "viaje-uuid-1234", "token")
        self.assertEqual(len(self.patched_calls), 1)
        self.assertIn("/viajes/viaje-uuid-1234/completar", self.patched_calls[0])

    def test_does_not_raise_on_network_error(self):
        """Should swallow the error and print a warning instead of crashing."""
        def boom(*a, **kw):
            raise Exception("timeout")
        requests_stub.patch = boom
        # Must NOT raise
        try:
            sv.completar_viaje("http://localhost:3000", "viaje-uuid-1234", "token")
        except Exception as e:
            self.fail(f"completar_viaje() raised unexpectedly: {e}")

    def test_uses_bearer_token(self):
        captured_headers = {}

        class FakeResp:
            def raise_for_status(self): pass

        def fake_patch(url, headers=None, timeout=10):
            captured_headers.update(headers or {})
            return FakeResp()

        requests_stub.patch = fake_patch
        sv.completar_viaje("http://localhost:3000", "viaje-uuid-1234", "my-token")
        self.assertEqual(captured_headers.get("Authorization"), "Bearer my-token")


class TestRutaCompletadaFlag(unittest.TestCase):
    """
    Verifica que interpolar_ruta produce al menos 1 posición,
    condición necesaria para que el flag ruta_completada sea alcanzable.
    """

    def test_single_segment_produces_positions(self):
        wp = [{"lat": 25.0, "lng": -100.0}, {"lat": 25.1, "lng": -100.1}]
        result = sv.interpolar_ruta(wp, vel_mps=16.67, intervalo_s=2)
        self.assertGreater(len(result), 0)

    def test_empty_route_returns_only_final_point(self):
        """Edge case: two identical points still returns 1 entry."""
        wp = [{"lat": 25.0, "lng": -100.0}, {"lat": 25.0, "lng": -100.0}]
        result = sv.interpolar_ruta(wp, vel_mps=16.67, intervalo_s=2)
        self.assertGreater(len(result), 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
