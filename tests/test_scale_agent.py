"""Test cho `scale_agent`: parse số cân, logic ổn định, và 3 endpoint REST."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

import scale_agent
from scale_agent import WeightState, create_app, is_stable, parse_weight


@pytest.fixture
def client(monkeypatch):
    """App FastAPI với `ScaleReader` giả — không cần cổng COM thật."""
    app = create_app()
    monkeypatch.setattr(app.state.scale_reader, "start", lambda: None)
    monkeypatch.setattr(app.state.scale_reader, "stop", lambda: None)
    return TestClient(app)


# ===== parse_weight =====


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("ST,GS,+000124.5kg", 124.5),
        ("ST,GS,+000058.5kg", 58.5),
        ("-000012.3kg", -12.3),
        ("  42  ", 42.0),
        ("ST,GS,------kg", None),
        ("", None),
    ],
)
def test_parse_weight(raw, expected):
    assert parse_weight(raw) == expected


# ===== is_stable =====


def test_is_stable_requires_st_marker():
    assert is_stable("GS,+000124.5kg", [124.5, 124.5, 124.5]) is False


def test_is_stable_requires_three_identical_reads():
    assert is_stable("ST,GS,+000124.5kg", [124.5, 124.5]) is False
    assert is_stable("ST,GS,+000124.5kg", [124.5, 124.5, 124.5]) is True


def test_is_stable_false_when_values_differ():
    assert is_stable("ST,GS,+000124.5kg", [124.5, 124.6, 124.5]) is False


# ===== WeightState =====


def test_state_marks_stable_after_three_identical_reads():
    state = WeightState()
    for _ in range(3):
        state.update("ST,GS,+000124.5kg")

    assert state.value == 124.5
    assert state.stable is True


def test_state_not_stable_on_first_read():
    state = WeightState()
    state.update("ST,GS,+000124.5kg")

    assert state.value == 124.5
    assert state.stable is False


def test_state_clears_value_when_disconnected():
    state = WeightState()
    state.update("ST,GS,+000124.5kg")
    state.reset_connection(False, "COM3 not found")

    assert state.value is None
    assert state.stable is False
    assert state.connected is False
    assert state.last_error == "COM3 not found"


# ===== REST API =====


def test_health_reports_disconnected_by_default(client):
    res = client.get("/health")

    assert res.status_code == 200
    body = res.json()
    assert body["connected"] is False
    assert body["port"] == scale_agent.DEFAULT_PORT
    assert body["baudRate"] == scale_agent.DEFAULT_BAUD_RATE
    assert body["lastRaw"] is None


def test_weight_returns_null_value_when_no_reading(client):
    res = client.get("/weight")

    assert res.status_code == 200
    body = res.json()
    assert body["value"] is None
    assert body["unit"] == "kg"
    assert body["stable"] is False


def test_weight_returns_parsed_value(client):
    state = client.app.state.scale_state
    state.update("ST,GS,+000124.5kg")
    state.update("ST,GS,+000124.5kg")
    state.update("ST,GS,+000124.5kg")

    body = client.get("/weight").json()

    assert body["value"] == 124.5
    assert body["stable"] is True
    assert body["raw"] == "ST,GS,+000124.5kg"
    assert body["ts"] is not None


def test_config_changes_port_and_returns_health(client):
    res = client.post("/config", json={"port": "COM4", "baudRate": 4800})

    assert res.status_code == 200
    body = res.json()
    assert body["port"] == "COM4"
    assert body["baudRate"] == 4800


def test_config_rejects_invalid_baud_rate(client):
    res = client.post("/config", json={"port": "COM4", "baudRate": 1})

    assert res.status_code == 422


def test_config_rejects_empty_port(client):
    res = client.post("/config", json={"port": "", "baudRate": 9600})

    assert res.status_code == 422


def test_agent_does_not_crash_when_port_missing(client):
    """COM không tồn tại: /health trả connected=false, không 500."""
    res = client.post("/config", json={"port": "COM_NO_SUCH_PORT", "baudRate": 9600})

    assert res.status_code == 200
    assert res.json()["connected"] is False
    assert client.get("/weight").status_code == 200