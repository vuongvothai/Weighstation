"""Test cho scale_agent: parse frame, logic ổn định, REST API."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

import scale_agent
from scale_agent import (
    WeightState,
    create_app,
    detect_baud_rate,
    is_stable,
    parse_frame,
)


@pytest.fixture
def client(monkeypatch):
    app = create_app()
    monkeypatch.setattr(app.state.scale_reader, "start", lambda: None)
    monkeypatch.setattr(app.state.scale_reader, "stop", lambda: None)
    return TestClient(app)


# ── parse_frame ───────────────────────────────────────────────────────────────

@pytest.mark.parametrize(
    ("frame", "expected"),
    [
        ("=00000.0", 0.0),       # "00000.0"[::-1] = "0.00000" → 0.0
        ("=00000.2", 2.0),       # "00000.2"[::-1] = "2.00000" → 2.0
        ("=00000.9", 9.0),       # "00000.9"[::-1] = "9.00000" → 9.0
        ("=00009.1", 1.9),       # "00009.1"[::-1] = "1.90000" → 1.9
        ("=00008.2", 2.8),       # "00008.2"[::-1] = "2.80000" → 2.8
        ("=0.41000", 14.0),      # "0.41000"[::-1] = "00014.0" → 14.0
        ("=14.0000", 0.41),      # "14.0000"[::-1] = "0000.41" → 0.41
        ("=12345.0", 0.54321),   # "12345.0"[::-1] = "0.54321" → 0.54321
        ("-=14.0000", -0.41),    # "-=" + "14.0000"[::-1] = "-0000.41" → -0.41
        ("", None),
        ("ST,GS,+000124.5kg", None),
    ],
)
def test_parse_frame(frame, expected):
    assert parse_frame(frame) == expected


# ── is_stable ─────────────────────────────────────────────────────────────────

def test_is_stable_requires_equals():
    assert is_stable("-=00000.2", [2.0, 2.0, 2.0]) is False
    assert is_stable("00000.2", [2.0, 2.0, 2.0]) is False


def test_is_stable_requires_three_reads():
    assert is_stable("=00000.2", [2.0, 2.0]) is False
    assert is_stable("=00000.2", [2.0, 2.0, 2.0]) is True


def test_is_stable_false_when_differ():
    assert is_stable("=00000.2", [2.0, 3.0, 2.0]) is False


# ── WeightState ───────────────────────────────────────────────────────────────

def test_state_marks_stable():
    state = WeightState()
    for _ in range(3):
        state.update("=00000.2")
    assert state.value == 2.0
    assert state.stable is True


def test_state_not_stable_first_read():
    state = WeightState()
    state.update("=00000.2")
    assert state.value == 2.0
    assert state.stable is False


def test_state_clears_on_disconnect():
    state = WeightState()
    state.update("=00000.2")
    state.reset_connection(False, "COM3 not found")
    assert state.value is None
    assert state.stable is False
    assert state.connected is False


# ── REST API ──────────────────────────────────────────────────────────────────

def test_health_default(client):
    res = client.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["connected"] is False
    assert body["port"] == scale_agent.DEFAULT_PORT
    assert body["baudRate"] == scale_agent.DEFAULT_BAUD_RATE


def test_weight_null_when_no_reading(client):
    res = client.get("/weight")
    assert res.status_code == 200
    body = res.json()
    assert body["value"] is None
    assert body["unit"] == "kg"
    assert body["stable"] is False


def test_weight_parsed_value(client):
    state = client.app.state.scale_state
    for _ in range(3):
        state.update("=00000.2")
    body = client.get("/weight").json()
    assert body["value"] == 2.0
    assert body["stable"] is True
    assert body["raw"] == "=00000.2"


def test_config_changes_port(client):
    res = client.post("/config", json={"port": "COM4", "baudRate": 9600})
    assert res.status_code == 200
    body = res.json()
    assert body["port"] == "COM4"
    assert body["baudRate"] == 9600


def test_config_rejects_invalid_baud(client):
    res = client.post("/config", json={"port": "COM4", "baudRate": 1})
    assert res.status_code == 422


def test_config_rejects_empty_port(client):
    res = client.post("/config", json={"port": "", "baudRate": 9600})
    assert res.status_code == 422


# ── Auto-detect baud ──────────────────────────────────────────────────────────

class _FakeSerial:
    """Serial giả: phát `payload` theo đúng baud được yêu cầu."""

    def __init__(self, port, baud_rate, timeout=None, payloads=None):
        self.port = port
        self.baud_rate = baud_rate
        self._payload = (payloads or {}).get(baud_rate, b"")
        self._sent = False
        self.closed = False

    @property
    def in_waiting(self):
        return len(self._payload) if not self._sent else 0

    def read(self, size=1):
        if self._sent:
            return b""
        self._sent = True
        return self._payload[:size]

    def close(self):
        self.closed = True


def _patch_serial(monkeypatch, payloads):
    monkeypatch.setattr(
        scale_agent.serial,
        "Serial",
        lambda port, baud_rate, timeout=None: _FakeSerial(port, baud_rate, timeout, payloads),
    )


def test_detect_baud_picks_correct_rate(monkeypatch):
    # Cân chạy 9600: chỉ baud 9600 trả ra ASCII hợp lệ, các baud khác là rác.
    _patch_serial(monkeypatch, {9600: b"=0.41000=0.41000=0.41000"})
    assert detect_baud_rate("COM_TEST") == 9600


def test_detect_baud_picks_1200(monkeypatch):
    _patch_serial(monkeypatch, {1200: b"=00000.2=00000.2=00000.2"})
    assert detect_baud_rate("COM_TEST") == 1200


def test_detect_baud_none_when_no_data(monkeypatch):
    _patch_serial(monkeypatch, {})
    assert detect_baud_rate("COM_TEST") is None


def test_detect_baud_none_when_only_garbage(monkeypatch):
    # Chỉ có byte ngoài dải ASCII in được → không baud nào thắng.
    _patch_serial(monkeypatch, {baud: b"\x00\x01\x02" * 20 for baud in scale_agent.BAUD_CANDIDATES})
    assert detect_baud_rate("COM_TEST") is None


def test_reader_uses_detected_baud(monkeypatch):
    _patch_serial(monkeypatch, {9600: b"=0.41000=0.41000=0.41000"})
    state = WeightState()
    reader = scale_agent.ScaleReader(state, "COM_TEST", 1200, auto_detect=True)
    assert reader._resolve_baud() == 9600
    assert state.baud_rate == 9600


def test_reader_keeps_configured_baud_when_autodetect_off(monkeypatch):
    _patch_serial(monkeypatch, {9600: b"=0.41000=0.41000=0.41000"})
    state = WeightState()
    reader = scale_agent.ScaleReader(state, "COM_TEST", 1200, auto_detect=False)
    assert reader._resolve_baud() == 1200
    assert reader.baud_rate == 1200


def test_health_reports_auto_detect(client):
    body = client.get("/health").json()
    assert body["autoDetect"] is scale_agent.AUTO_DETECT_BAUD


def test_config_can_disable_auto_detect(client):
    res = client.post("/config", json={"port": "COM4", "baudRate": 9600, "autoDetect": False})
    assert res.status_code == 200
    body = res.json()
    assert body["port"] == "COM4"
    assert body["baudRate"] == 9600
    assert body["autoDetect"] is False


# ── ESP32 fallback ────────────────────────────────────────────────────────────

def test_weight_forwards_to_esp32_when_disconnected(client, monkeypatch):
    state = client.app.state.scale_state
    state.reset_connection(False, "COM3 not found")

    esp_payload = {"value": 12.5, "unit": "kg", "stable": True, "raw": "=00021.0", "ts": "2026-01-01T00:00:00+07:00"}
    monkeypatch.setattr(scale_agent, "_fetch_from_esp32", lambda: esp_payload)

    body = client.get("/weight").json()
    assert body["value"] == 12.5
    assert body["stable"] is True


def test_weight_returns_null_when_esp32_unreachable(client, monkeypatch):
    state = client.app.state.scale_state
    state.reset_connection(False, "COM3 not found")
    monkeypatch.setattr(scale_agent, "_fetch_from_esp32", lambda: None)

    body = client.get("/weight").json()
    assert body["value"] is None
    assert body["stable"] is False


def test_weight_skips_esp32_when_com_connected(client, monkeypatch):
    state = client.app.state.scale_state
    state.reset_connection(True)
    for _ in range(3):
        state.update("=00000.2")
    called = {"n": 0}
    monkeypatch.setattr(scale_agent, "_fetch_from_esp32", lambda: called.__setitem__("n", called["n"] + 1))

    body = client.get("/weight").json()
    assert body["value"] == 2.0
    assert called["n"] == 0