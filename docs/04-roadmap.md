# Lộ Trình Triển Khai MVP

## Backend

### Module: Entity & Repository
- [x] Tạo `WeighStation` entity (JPA, map `DECIMAL(10,2)` → `BigDecimal`)
- [x] Tạo `WeighStationRepository` — `findByTicketUuidOrderByWeighSequenceAsc`, `existsByTicketUuid`

### Module: Service
- [x] `TicketService` — sinh `ticket_code` (`CF-0001`...), validate `weightKg > 0`, `bagCount >= 1`
- [x] Tính `totalBags`, `totalWeightKg` từ mảng records
- [x] Xử lý `409` khi `ticketUuid` đã tồn tại

### Module: Controller
- [x] `TicketController` — 4 endpoint theo [03-api-contract.md](./03-api-contract.md)
- [x] `config/CorsConfig` — cho phép `http://localhost:5173`

## Frontend

### Module: Hooks
- [x] `useScaleWeight()` — poll `GET /weight` mỗi 100ms, trả `{value, stable, connected}`
- [x] `useTicketDraft()` — giữ danh sách lần cân + `ticketUuid` + tên khách; lưu `localStorage`

### Module: Màn hình cân
- [x] Dọn `App.jsx` template Vite mặc định, thêm route `/tram-can`
- [x] Hiển thị số cân realtime + badge trạng thái (🟢/🔴/⚫)
- [x] Bắt phím `t` → ghi 1 lần cân vào state tạm, `preventDefault` để không scroll
- [x] Mặc định `bagCount = 2`, cho sửa tại dòng
- [x] Nút "Lưu phiếu" → gọi `POST /api/tickets` (batch), nhận `ticketCode`
- [x] Nút "In phiếu" → điều hướng sang `/in-phieu/:ticketUuid`

### Module: In phiếu
- [x] Tạo `src/pages/PrintTicket.jsx` — chuyển mẫu HTML trong `agent.md` thành JSX
- [x] Giữ nguyên `@page { size: A4 portrait; margin: 3mm }` và `.receipt { width: 70mm }`
- [x] Dữ liệu lấy từ `GET /api/tickets/{ticketUuid}`
- [x] Ẩn nút "In" khi `@media print`

## Agent

### Module: Core
- [x] Viết lại `scale_agent.py` (đang rỗng) theo hướng FastAPI + pyserial
- [x] Background task đọc cổng COM mỗi 50ms, giữ số cuối trong buffer
- [x] Parse regex `[-+]?\d*\.\d+|\d+` như code mẫu
- [x] Logic `stable`: chuỗi chứa `ST` **và** 3 lần đọc liên tiếp không đổi
- [x] Bind `127.0.0.1:5000` (không expose ra LAN)

### Module: API
- [x] `GET /health` — trạng thái kết nối cổng COM
- [x] `GET /weight` — số cân mới nhất đã parse
- [x] `POST /config` — đổi cổng COM / baud rate
- [x] CORS cho `http://localhost:5173`
- [x] Xử lý `serial.SerialException` → trả `connected=false`, không crash

---

## Ghi chú triển khai

### Cấu trúc file đã thêm

| Thành phần | File |
|---|---|
| BE entity | `backend/vuong/src/main/java/com/vuong/vo/entity/WeighRecord.java` |
| BE repository | `backend/vuong/src/main/java/com/vuong/vo/repository/WeighRecordRepository.java` |
| BE service | `backend/vuong/src/main/java/com/vuong/vo/service/TicketService.java` |
| BE controller | `backend/vuong/src/main/java/com/vuong/vo/controller/TicketController.java` |
| BE CORS + lỗi | `backend/vuong/src/main/java/com/vuong/vo/config/CorsConfig.java`, `ApiExceptionHandler.java` |
| FE hooks | `frontend-react/src/hooks/useScaleWeight.js`, `useTicketDraft.js` |
| FE API client | `frontend-react/src/api/tickets.js` |
| FE màn hình cân | `frontend-react/src/pages/WeighScreen.jsx` |
| FE in phiếu | `frontend-react/src/pages/PrintTicket.jsx` + `PrintTicket.css` |
| Agent | `scale_agent.py` |

### Quyết định trong lúc triển khai

| Hạng mục | Chốt |
|---|---|
| Tên entity | `WeighRecord` (roadmap ghi `WeighStation`, nhưng bảng là `weigh_record` và mỗi bản ghi là **một lần cân**, không phải một trạm) |
| `ticket_code` | `CF-0001`, tăng theo `COUNT(*) + 1`. Mã chỉ để in trên giấy; khóa nghiệp vụ là `ticketUuid` |
| `created_at` / `updated_at` | Set bằng `@PrePersist` / `@PreUpdate` thay vì dựa vào `DEFAULT CURRENT_TIMESTAMP` của MySQL, để H2 test cũng chạy được |
| Test BE | Dùng H2 (`MODE=MySQL`) qua profile `test`, không cần MySQL khi chạy `mvnw test` |
| Test FE | Vitest + Testing Library (jsdom) |
| Test Agent | pytest + `TestClient`, thay `ScaleReader` bằng stub để không cần cổng COM |
| `POST /config` | Nhận cả `baudRate` (contract) và `baud_rate` (tên Python) qua alias của Pydantic |

### Cách chạy thử

**1. MySQL** (docker-compose hoặc MySQL local):

```bash
docker compose up -d mysql
```

**2. Backend** (cần `application-local.properties` với credentials MySQL):

```bash
cd backend/vuong
./mvnw.cmd spring-boot:run
```

**3. Agent** (bỏ qua nếu chưa có cân thật — FE sẽ báo ⚫ mất kết nối):

```bash
python -m venv scale-agent/venv
scale-agent/venv/Scripts/python -m pip install -r requirements.txt
scale-agent/venv/Scripts/python scale_agent.py
```

**4. Frontend**:

```bash
cd frontend-react
npm install
npm run dev
```

Mở `http://localhost:5173/tram-can`.

### Lệnh kiểm thử

| Thành phần | Lệnh | Kết quả |
|---|---|---|
| Backend | `cd backend/vuong && ./mvnw.cmd test` | 24 test pass |
| Frontend | `cd frontend-react && npm test` | 35 test pass |
| Frontend lint | `cd frontend-react && npm run lint` | sạch |
| Agent | `scale-agent/venv/Scripts/python -m pytest tests -q` | 19 test pass |

### Biến môi trường FE

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `VITE_AGENT_BASE_URL` | `http://127.0.0.1:5000` | URL agent |
| `VITE_API_BASE_URL` | `http://localhost:8080` | URL BE; để trống khi chạy qua nginx |

### Ngoài phạm vi MVP (đã chốt trong `01-architecture.md`)

- Không có xác thực — máy trạm không nối Internet.
- Không có app chính / tầng đồng bộ — `sync_status` chưa cần.
- Chưa có audit log cho `PUT` (xem ghi chú trong `03-api-contract.md`).
