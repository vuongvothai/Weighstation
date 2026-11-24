"""Scale Agent — đọc cân Yaohua YH-T7E qua RS232, expose REST ở 127.0.0.1:5000.

Cân gửi frame 8 byte ASCII liên tục (không có \r\n).

Baud rate không cố định: cân có thể cấu hình 1200 / 2400 / 4800 / 9600 ...
Agent tự dò baud (auto-detect) bằng cách đo mật độ byte ASCII in được, nên
1200 và 9600 đều đọc được mà không cần cấu hình tay.
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
# Các hằng số dưới đây có thể override lúc khởi động app (xem create_app),
# nhưng giá trị mặc định phù hợp với cân YH-T7E nối cổng COM3.

DEFAULT_PORT = "COM3"

# Cân có thể đặt nhiều baud khác nhau. Agent tự dò baud bằng cách đo mật độ
# frame ASCII hợp lệ, nên không cần biết trước cân chạy baud nào — miễn là
# dữ liệu là ASCII. AUTO_DETECT_BAUD bật/tắt cơ chế dò này.
DEFAULT_BAUD_RATE = 1200
BAUD_CANDIDATES = [1200, 2400, 4800, 9600, 19200, 38400, 115200]
AUTO_DETECT_BAUD = True

# Số lần đọc giống nhau liên tiếp để coi là "ổn định", và nhịp đọc mỗi vòng.
STABLE_READS_REQUIRED = 3
READ_INTERVAL_S = 0.05

# Chỉ cho frontend ở các origin này gọi API (tránh CORS chặn khi dev).
ALLOWED_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"]

# Một frame cân hợp lệ: "=" + 7 ký tự, trong đó 6 ký tự đầu là số, ký tự
# cuối là chữ số hoặc dấu "-".
FRAME_LEN = 8
DIGITS = "0123456789."


# ── Auto-detect baud ──────────────────────────────────────────────────────────
# Ý tưởng: mở cổng ở từng baud ứng viên trong một khoảng ngắn rồi đếm "byte
# ASCII in được". Baud đúng cho ra xxxx.xxx / = / - nên gần như toàn bộ byte
# đều in được; baud sai khiến UART lấy mẫu lệch bit → phần lớn byte là rác.

PROBE_WINDOW_S = 0.6       # thời gian thử mỗi baud
PROBE_MIN_BYTES = 8        # cần ít nhất chừng này byte ASCII in được để chốt
PROBE_SCORE_MARGIN = 2     # chỉ chốt khi baud thắng gấp đôi baud xếp nhì


def _probe_score(text: str) -> int:
    """Đếm số byte ASCII in được trong buffer — proxy cho 'baud này có đúng không'."""
    return sum(1 for c in text if 32 <= ord(c) <= 126)


def _probe_baud(port: str, baud_rate: int, window_s: float = PROBE_WINDOW_S) -> int:
    """Mở cổng ở `baud_rate`, đếm byte ASCII in được trong `window_s` giây."""
    try:
        ser = serial.Serial(port, baud_rate, timeout=0.1)
    except (serial.SerialException, OSError, ValueError):
        return 0

    score = 0
    deadline = time.monotonic() + window_s
    try:
        while time.monotonic() < deadline:
            n = ser.in_waiting
            chunk = ser.read(n if n else 1)
            if chunk:
                score += _probe_score(chunk.decode("ascii", errors="ignore"))
    except (serial.SerialException, OSError):
        pass
    finally:
        try:
            ser.close()
        except Exception:
            pass
    return score


def detect_baud_rate(port: str, candidates: list[int] | None = None) -> int | None:
    """Dò baud: thử từng giá trị, trả baud có nhiều byte ASCII hợp lệ nhất.

    Trả None nếu không baud nào nhận được dữ liệu (cổng không tồn tại, cân tắt...)
    hoặc không baud nào thắng rõ rệt so với baud xếp nhì.
    """
    scores = {baud: _probe_baud(port, baud) for baud in (candidates or BAUD_CANDIDATES)}
    ranked = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
    best_baud, best_score = ranked[0]

    if best_score < PROBE_MIN_BYTES:
        return None  # không baud nào nhận đủ dữ liệu
    runner_up = ranked[1][1] if len(ranked) > 1 else 0
    if best_score < runner_up * PROBE_SCORE_MARGIN:
        return None  # không baud nào thắng rõ rệt → coi như chưa dò được
    return best_baud


# ── Parse & ổn định ───────────────────────────────────────────────────────────
# Cân xuất số theo kiểu đảo ngược: 7 ký tự số bị viết ngược. parse_frame đảo
# lại để thu giá trị thật; is_stable quyết định số đã "ổn định" để in phiếu.

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
    """Ổn định = frame bắt đầu bằng "=" và 3 lần đọc gần nhất giống hệt nhau."""
    return (
        frame.startswith("=")
        and len(history) >= STABLE_READS_REQUIRED
        and len(set(history[-STABLE_READS_REQUIRED:])) == 1
    )


# ── State ─────────────────────────────────────────────────────────────────────
# WeightState giữ toàn bộ trạng thái cân hiện tại (giá trị, raw, cờ kết nối...)
# và là nguồn dữ liệu cho các endpoint REST. ScaleReader chỉ ghi vào state.

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
    auto_detect: bool = AUTO_DETECT_BAUD
    last_error: Optional[str] = None
    _history: list[float] = field(default_factory=list)

    def update(self, frame: str) -> None:
        """Cập nhật state từ một frame mới: parse, lưu raw, tính cờ ổn định."""
        value = parse_frame(frame)
        self.raw = frame
        self.ts = _now_iso()
        if value is None:
            self.stable = False
            return
        self._history.append(value)
        del self._history[:-STABLE_READS_REQUIRED]  # chỉ giữ 3 giá trị gần nhất
        self.value = value
        self.stable = is_stable(frame, self._history)

    def reset_connection(self, connected: bool, error: Optional[str] = None) -> None:
        """Đánh dấu trạng thái kết nối; khi mất kết nối thì xóa số đang giữ."""
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
            "autoDetect": self.auto_detect,
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
# ScaleReader chạy một thread nền: mở cổng COM, đọc liên tục, tách frame hợp
# lệ rồi đẩy vào WeightState. Cổng có thể cấu hình lại (đổi COM/baud) lúc chạy.

class ScaleReader:
    def __init__(
        self,
        state: WeightState,
        port: str,
        baud_rate: int,
        auto_detect: bool = AUTO_DETECT_BAUD,
    ) -> None:
        self.state = state
        self.port = port
        self.baud_rate = baud_rate
        self.auto_detect = auto_detect
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

    def reconfigure(self, port: str, baud_rate: int, auto_detect: Optional[bool] = None) -> None:
        """Đổi cấu hình cổng lúc chạy: dừng thread cũ, áp cấu hình mới, chạy lại."""
        self.stop()
        self.port = port
        self.baud_rate = baud_rate
        if auto_detect is not None:
            self.auto_detect = auto_detect
        self.state.port = port
        self.state.baud_rate = baud_rate
        self.state.auto_detect = self.auto_detect
        self.start()

    def _close_serial(self) -> None:
        if self._serial:
            try:
                self._serial.close()
            except Exception:
                pass
            self._serial = None

    def _resolve_baud(self) -> int:
        """Baud thực dùng: tự dò nếu bật, ngược lại dùng giá trị cấu hình."""
        if not self.auto_detect:
            return self.baud_rate
        detected = detect_baud_rate(self.port)
        if detected is None:
            return self.baud_rate  # dò không ra → thử lại với baud cấu hình
        self.baud_rate = detected
        self.state.baud_rate = detected
        return detected

    def _open_serial(self) -> bool:
        """Mở cổng COM với baud đã resolve; cập nhật cờ kết nối theo kết quả."""
        baud = self._resolve_baud()
        try:
            self._serial = serial.Serial(self.port, baud, timeout=0.2)
        except (serial.SerialException, OSError, ValueError) as exc:
            self.state.reset_connection(False, str(exc))
            return False
        self.state.reset_connection(True)
        return True

    def _extract_frames(self, buffer: str) -> tuple[list[str], str]:
        """Tách các frame 8 byte hợp lệ khỏi buffer, trả (frames, buffer còn lại).

        Dữ liệu vào có thể lẫn byte rác/nối tiếp nhiều frame, nên vừa quét vừa
        cắt: gặp byte không khớp mẫu thì bỏ 1 ký tự rồi thử lại từ đầu.
        """
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
        """Vòng lặp chính của thread đọc: mở cổng → đọc → tách frame → cập nhật."""
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
# App FastAPI mỏng: chỉ phơi bày state của cân qua các endpoint GET/POST.
# create_app nhận cấu hình ban đầu và gắn reader/state vào app.state để test
# hoặc caller khác truy cập được.

class ConfigRequest(BaseModel):
    port: str = Field(min_length=1, max_length=32)
    baud_rate: int = Field(default=DEFAULT_BAUD_RATE, ge=300, le=256000, alias="baudRate")
    auto_detect: Optional[bool] = Field(default=None, alias="autoDetect")
    model_config = {"populate_by_name": True}


def create_app(
    port: str = DEFAULT_PORT,
    baud_rate: int = DEFAULT_BAUD_RATE,
    auto_detect: bool = AUTO_DETECT_BAUD,
) -> FastAPI:
    state = WeightState(port=port, baud_rate=baud_rate, auto_detect=auto_detect)
    reader = ScaleReader(state, port, baud_rate, auto_detect)

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
        reader.reconfigure(payload.port, payload.baud_rate, payload.auto_detect)
        return state.health()

    app.state.scale_state = state
    app.state.scale_reader = reader
    return app


app = create_app()

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=5000)