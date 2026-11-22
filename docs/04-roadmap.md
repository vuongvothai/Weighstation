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
- [x] Bắt phím `Space` → ghi 1 lần cân vào state tạm, `preventDefault` để không scroll
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
