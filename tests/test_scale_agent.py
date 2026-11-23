"""Test cho scale_agent: parse frame, logic ổn định, REST API."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

import scale_agent
from scale_agent import WeightState, create_app, is_stable, parse_frame


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