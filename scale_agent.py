"""Đọc cân điện tử qua RS232 và expose REST ở 127.0.0.1:5000.

Agent chỉ phục vụ FE trên cùng máy (xem `docs/01-architecture.md`):

- `GET /health` — trạng thái kết nối cổng COM
- `GET /weight` — số cân mới nhất đã parse
- `POST /config` — đổi cổng COM / baud rate

Quy ước lỗi: agent **không** trả 4xx/5xx cho lỗi phần cứng. `connected=false`
kèm `value=null` là trạng thái bình thường khi cân tắt hoặc mất cáp.
"""

from __future__ import annotations

import re
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

# Cân gửi chuỗi như "ST,GS,+000124.5kg" — số có dấu, có phần thập phân.
NUMBER_PATTERN = re.compile(r"[-+]?\d*\.\d+|\d+")

DEFAULT_PORT = "COM3"
DEFAULT_BAUD_RATE = 9600

# Cần 3 lần đọc liên tiếp giống nhau mới coi là ổn định.
STABLE_READS_REQUIRED = 3

# Khoảng nghỉ giữa 2 lần đọc cổng, giây.
READ_INTERVAL_S = 0.05

# Chuỗi cân báo "đã ổn định".
STABLE_MARKER = "ST"

# FE gọi /weight mỗi 100ms.
ALLOWED_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"]


def parse_weight(raw: str) -> Optional[float]:
    """Rút số cân từ chuỗi thô. Trả `None` nếu không tìm thấy số hợp lệ."""
    if not raw:
        return None
    match = NUMBER_PATTERN.search(raw)
    if not match:
        return None
    try:
        return float(match.group())
    except ValueError:
        return None


def is_stable(raw: str, previous_values: list[float]) -> bool:
    """Ổn định khi chuỗi chứa `ST` **và** 3 lần đọc liên tiếp không đổi."""
    if STABLE_MARKER not in raw:
        return False
    if len(previous_values) < STABLE_READS_REQUIRED:
        return False
    recent = previous_values[-STABLE_READS_REQUIRED:]
    return len(set(recent)) == 1


def _now_iso() -> str:
    return datetime.now().astimezone().isoformat(timespec="milliseconds")


@dataclass
class WeightState:
    """Buffer số cân mới nhất, dùng chung giữa thread đọc cổng và request handler."""

    value: Optional[float] = None
    stable: bool = False
    raw: Optional[str] = None
    ts: Optional[str] = None
    connected: bool = False
    port: str = DEFAULT_PORT
    baud_rate: int = DEFAULT_BAUD_RATE
    last_error: Optional[str] = None
    _history: list[float] = field(default_factory=list)

    def update(self, raw: str) -> None:
        value = parse_weight(raw)
        self.raw = raw
        self.ts = _now_iso()
        if value is None:
            self.stable = False
            return

        self._history.append(value)
        # Chỉ giữ đúng số lần đọc cần cho logic ổn định.
        del self._history[:-STABLE_READS_REQUIRED]

        self.value = value
        self.stable = is_stable(raw, self._history)

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


class ScaleReader:
    """Đọc cổng COM trong background task, giữ số cuối trong `WeightState`.

    Nếu không mở được cổng (chưa cắm cân, COM bị chiếm) thì agent vẫn chạy và
    báo `connected=false` — không crash.
    """

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
        if self._thread is not None:
            self._thread.join(timeout=2)
            self._thread = None
        self._close_serial()

    def reconfigure(self, port: str, baud_rate: int) -> None:
        """Đóng cổng cũ, mở cổng mới. Dùng khi đổi cân hoặc đổi cổng."""
        self.stop()
        self.port = port
        self.baud_rate = baud_rate
        self.state.port = port
        self.state.baud_rate = baud_rate
        self.start()

    def _close_serial(self) -> None:
        if self._serial is None:
            return
        try:
            self._serial.close()
        except Exception:  # noqa: BLE001 - đóng cổng lỗi thì bỏ qua
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

    def _run(self) -> None:
        while not self._stop.is_set():
            if self._serial is None and not self._open_serial():
                # Chưa cắm cân hoặc COM bận — thử lại sau 1 nhịp.
                time.sleep(READ_INTERVAL_S)
                continue

            try:
                line = self._serial.readline()
            except (serial.SerialException, OSError) as exc:
                self._close_serial()
                self.state.reset_connection(False, str(exc))
                continue

            if line:
                self.state.update(line.decode("ascii", errors="ignore").strip())

            time.sleep(READ_INTERVAL_S)


class ConfigRequest(BaseModel):
    """Body của `POST /config`.

    Nhận cả `baudRate` (theo `docs/03-api-contract.md`) và `baud_rate` (tên
    Python) để FE gửi kiểu camelCase vẫn chạy.
    """

    port: str = Field(min_length=1, max_length=32)
    baud_rate: int = Field(ge=300, le=256000, alias="baudRate")

    model_config = {"populate_by_name": True}


def create_app(
    port: str = DEFAULT_PORT,
    baud_rate: int = DEFAULT_BAUD_RATE,
) -> FastAPI:
    """Tạo app FastAPI.

    Tách hàm này ra để test inject được `ScaleReader` giả mà không cần cổng COM.
    """
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

    # Expose để test thay reader mà không cần cổng COM thật.
    app.state.scale_state = state
    app.state.scale_reader = reader
    return app


app = create_app()


if __name__ == "__main__":
    # Chỉ bind localhost — không expose ra LAN.
    uvicorn.run(app, host="127.0.0.1", port=5000)