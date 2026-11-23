"""Scale Agent — đọc cân Yaohua YH-T7E qua RS232, expose REST ở 127.0.0.1:5000.

Cân gửi frame 8 byte ASCII liên tục (không có \r\n), chữ số bị đảo ngược:
    "=0.41000"  →  14.0 kg
    "=00000.2"  →  2.0 kg
"""

from __future__ import annotations

import threading
import time
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

import serial
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# ── Cấu hình ──────────────────────────────────────────────────────────────────

DEFAULT_PORT = "COM3"
DEFAULT_BAUD_RATE = 1200
STABLE_READS_REQUIRED = 3
READ_INTERVAL_S = 0.05
ALLOWED_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"]

FRAME_LEN = 8          # "=" + 7 ký tự
DIGITS = "0123456789."


# ── Parse & ổn định ───────────────────────────────────────────────────────────

def parse_frame(frame: str) -> Optional[float]:
    """Đảo ngược 7 ký tự số trong frame rồi trả float.

    "=0.41000"  →  "0.41000"[::-1] = "00014.0"  →  14.0
    "-=14.0000" →  "14.0000"[::-1] = "0000.41"  →  -0.41
    """
    if len(frame) < FRAME_LEN:
        return None

    if frame[0] == "=":
        digits, sign = frame[1:FRAME_LEN], ""
    elif frame[:2] == "-=":
        digits, sign = frame[2:FRAME_LEN], "-"
    else:
        return None

    try:
        value = float(digits[::-1])
        return -value if sign else value
    except ValueError:
        return None


def is_stable(frame: str, history: list[float]) -> bool:
    """Ổn định = frame bắt đầu bằng "=" và 3 lần đọc giống nhau."""
    return (
        frame.startswith("=")
        and len(history) >= STABLE_READS_REQUIRED
        and len(set(history[-STABLE_READS_REQUIRED:])) == 1
    )


# ── State ─────────────────────────────────────────────────────────────────────

def _now_iso() -> str:
    return datetime.now().astimezone().isoformat(timespec="milliseconds")


@dataclass
class WeightState:
    value: Optional[float] = None
    stable: bool = False
    raw: Optional[str] = None
    ts: Optional[str] = None
    connected: bool = False
    port: str = DEFAULT_PORT
    baud_rate: int = DEFAULT_BAUD_RATE
    last_error: Optional[str] = None
    _history: list[float] = field(default_factory=list)

    def update(self, frame: str) -> None:
        value = parse_frame(frame)
        self.raw = frame
        self.ts = _now_iso()
        if value is None:
            self.stable = False
            return
        self._history.append(value)
        del self._history[:-STABLE_READS_REQUIRED]
        self.value = value
        self.stable = is_stable(frame, self._history)

    def reset_connection(self, connected: bool, error: Optional[str] = None) -> None:
        self.connected = connected
        self.last_error = error
        if not connected:
            self.value = None
            self.stable = False
            self._history.clear()

    def health(self) -> dict:
        return {
            "connected": self.connected,
            "port": self.port,
            "baudRate": self.baud_rate,
            "lastRaw": self.raw,
            "lastReadAt": self.ts,
        }

    def weight(self) -> dict:
        return {
            "value": self.value,
            "unit": "kg",
            "stable": self.stable,
            "raw": self.raw,
            "ts": self.ts,
        }


# ── Đọc cổng COM ──────────────────────────────────────────────────────────────

class ScaleReader:
    def __init__(self, state: WeightState, port: str, baud_rate: int) -> None:
        self.state = state
        self.port = port
        self.baud_rate = baud_rate
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._serial: Optional[serial.Serial] = None

    def start(self) -> None:
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, name="scale-reader", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=2)
            self._thread = None
        self._close_serial()

    def reconfigure(self, port: str, baud_rate: int) -> None:
        self.stop()
        self.port = port
        self.baud_rate = baud_rate
        self.state.port = port
        self.state.baud_rate = baud_rate
        self.start()

    def _close_serial(self) -> None:
        if self._serial:
            try:
                self._serial.close()
            except Exception:
                pass
            self._serial = None

    def _open_serial(self) -> bool:
        try:
            self._serial = serial.Serial(self.port, self.baud_rate, timeout=0.2)
        except (serial.SerialException, OSError, ValueError) as exc:
            self.state.reset_connection(False, str(exc))
            return False
        self.state.reset_connection(True)
        return True

    def _extract_frames(self, buffer: str) -> tuple[list[str], str]:
        """Tách các frame 8 byte hợp lệ khỏi buffer, trả (frames, buffer còn lại)."""
        frames = []
        while len(buffer) >= FRAME_LEN:
            if buffer[0] == "=" and all(c in DIGITS for c in buffer[1:7]) and buffer[7] in "0-":
                frames.append(buffer[:FRAME_LEN])
                buffer = buffer[FRAME_LEN:]
            elif buffer[:2] == "-=" and all(c in DIGITS for c in buffer[2:8]):
                frames.append(buffer[:FRAME_LEN])
                buffer = buffer[FRAME_LEN:]
            else:
                buffer = buffer[1:]
        return frames, buffer

    def _run(self) -> None:
        buffer = ""
        while not self._stop.is_set():
            if self._serial is None and not self._open_serial():
                time.sleep(READ_INTERVAL_S)
                continue

            try:
                chunk = self._serial.read(self._serial.in_waiting or 1)
            except (serial.SerialException, OSError) as exc:
                self._close_serial()
                self.state.reset_connection(False, str(exc))
                continue

            if chunk:
                buffer += chunk.decode("ascii", errors="ignore")
                frames, buffer = self._extract_frames(buffer)
                for frame in frames:
                    self.state.update(frame)

            time.sleep(READ_INTERVAL_S)


# ── REST API ──────────────────────────────────────────────────────────────────

class ConfigRequest(BaseModel):
    port: str = Field(min_length=1, max_length=32)
    baud_rate: int = Field(ge=300, le=256000, alias="baudRate")
    model_config = {"populate_by_name": True}


def create_app(port: str = DEFAULT_PORT, baud_rate: int = DEFAULT_BAUD_RATE) -> FastAPI:
    state = WeightState(port=port, baud_rate=baud_rate)
    reader = ScaleReader(state, port, baud_rate)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        reader.start()
        try:
            yield
        finally:
            reader.stop()

    app = FastAPI(title="Weighstation Scale Agent", version="1.0.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=ALLOWED_ORIGINS,
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )

    @app.get("/health")
    def health() -> dict:
        return state.health()

    @app.get("/weight")
    def weight() -> dict:
        return state.weight()

    @app.post("/config")
    def configure(payload: ConfigRequest) -> dict:
        reader.reconfigure(payload.port, payload.baud_rate)
        return state.health()

    app.state.scale_state = state
    app.state.scale_reader = reader
    return app


app = create_app()

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=5000)