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
- [ ] Dọn `App.jsx` template Vite mặc định, thêm route `/tram-can`
- [ ] Hiển thị số cân realtime + badge trạng thái (🟢/🔴/⚫)
- [ ] Bắt phím `Space` → ghi 1 lần cân vào state tạm, `preventDefault` để không scroll
- [ ] Mặc định `bagCount = 2`, cho sửa tại dòng
- [ ] Nút "Lưu phiếu" → gọi `POST /api/tickets` (batch), nhận `ticketCode`
- [ ] Nút "In phiếu" → điều hướng sang `/in-phieu/:ticketUuid`

### Module: In phiếu
- [ ] Tạo `src/pages/PrintTicket.jsx` — chuyển mẫu HTML trong `agent.md` thành JSX
- [ ] Giữ nguyên `@page { size: A4 portrait; margin: 3mm }` và `.receipt { width: 70mm }`
- [ ] Dữ liệu lấy từ `GET /api/tickets/{ticketUuid}`
- [ ] Ẩn nút "In" khi `@media print`

## Agent

### Module: Core
- [ ] Viết lại `scale_agent.py` (đang rỗng) theo hướng FastAPI + pyserial
- [ ] Background task đọc cổng COM mỗi 50ms, giữ số cuối trong buffer
- [ ] Parse regex `[-+]?\d*\.\d+|\d+` như code mẫu
- [ ] Logic `stable`: chuỗi chứa `ST` **và** 3 lần đọc liên tiếp không đổi
- [ ] Bind `127.0.0.1:5000` (không expose ra LAN)

### Module: API
- [ ] `GET /health` — trạng thái kết nối cổng COM
- [ ] `GET /weight` — số cân mới nhất đã parse
- [ ] `POST /config` — đổi cổng COM / baud rate
- [ ] CORS cho `http://localhost:5173`
- [ ] Xử lý `serial.SerialException` → trả `connected=false`, không crash
