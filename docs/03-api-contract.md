# Hợp Đồng API

## Agent nội bộ — FastAPI (`127.0.0.1:5000`)

Chỉ FE trên cùng máy gọi. Không xác thực.

### `GET /health`

```json
{
  "connected": true,
  "port": "COM3",
  "baudRate": 9600,
  "autoDetect": true,
  "lastRaw": "ST,GS,+000124.5kg",
  "lastReadAt": "2026-11-21T19:55:12.482+07:00"
}
```

`connected=false` khi không mở được cổng COM hoặc mất kết nối giữa chừng.

`baudRate` là baud **thực đang dùng** sau khi dò (hoặc giá trị cấu hình nếu tắt auto-detect). `autoDetect` cho biết agent có đang tự dò baud hay không.

### `GET /weight`

Trả về số cân mới nhất đã parse. FE gọi mỗi 100ms.

```json
{
  "value": 124.5,
  "unit": "kg",
  "stable": true,
  "raw": "ST,GS,+000124.5kg",
  "ts": "2026-11-21T19:55:12.482+07:00"
}
```

| Trường | Kiểu | Ghi chú |
|---|---|---|
| `value` | number \| null | `null` khi chưa đọc được số hợp lệ |
| `stable` | boolean | `true` khi chuỗi chứa `ST` **và** 3 lần đọc liên tiếp không đổi |
| `raw` | string | Chuỗi gốc để debug |
| `ts` | ISO-8601 | Thời điểm đọc của agent |

**Quy ước lỗi:** agent không trả 4xx/5xx cho lỗi phần cứng. `connected=false` + `value=null` là trạng thái bình thường khi cân tắt/mất cáp.

### `POST /config`

```json
{ "port": "COM4", "baudRate": 4800, "autoDetect": true }
```

Đóng cổng cũ, mở cổng mới. Trả về `/health` mới. Dùng khi đổi cân hoặc đổi cổng.

| Trường | Kiểu | Ghi chú |
|---|---|---|
| `port` | string | Cổng COM mới (bắt buộc) |
| `baudRate` | number | Baud cấu hình (mặc định 9600). Bị bỏ qua khi `autoDetect=true` và dò ra baud khác |
| `autoDetect` | boolean \| null | Bật/tắt tự dò baud. Bỏ trống = giữ nguyên thiết lập hiện tại |

**Tự dò baud:** khi `autoDetect=true`, agent thử lần lượt các baud trong
`[1200, 2400, 4800, 9600, 19200, 38400, 115200]`, mỗi baud mở cổng ~0.6s và đo
mật độ byte ASCII in được. Baud cho nhiều byte ASCII hợp lệ nhất (và thắng rõ
rệt) được chọn. Nhờ vậy cân cấu hình 1200 hay 9600 đều đọc được mà không cần
cấu hình tay — miễn dữ liệu là ASCII. Dò không ra thì giữ `baudRate` cấu hình.

## Backend nghiệp vụ — Spring Boot (`:8080/api`)

### `POST /api/tickets`

Ghi **một phiếu cân hoàn chỉnh** (nhiều lần cân) vào DB. FE gọi endpoint này khi operator nhấn nút **Lưu phiếu** (sau khi đã ghi nhiều lần cân vào state tạm).

**Request:**

```json
{
  "ticketUuid": "550e8400-e29b-41d4-a716-446655440000",
  "customerName": "Nguyen Van A",
  "records": [
    { "weighSequence": 1, "bagCount": 2, "weightKg": 124.50, "weighedAt": "2026-11-21T19:55:12+07:00" },
    { "weighSequence": 2, "bagCount": 2, "weightKg": 126.00, "weighedAt": "2026-11-21T19:56:30+07:00" },
    { "weighSequence": 3, "bagCount": 2, "weightKg": 122.80, "weighedAt": "2026-11-21T19:57:45+07:00" }
  ]
}
```

| Trường | Bắt buộc | Ràng buộc |
|---|---|---|
| `ticketUuid` | ✅ | UUID hợp lệ; FE sinh khi bắt đầu phiếu |
| `customerName` | ✅ | 1–150 ký tự |
| `records` | ✅ | Mảng ≥ 1 phần tử |
| `records[].weighSequence` | ✅ | ≥ 1, duy nhất trong `ticketUuid` |
| `records[].bagCount` | ✅ | ≥ 1, mặc định FE gửi 2 |
| `records[].weightKg` | ✅ | > 0, tối đa 2 chữ số thập phân |
| `records[].weighedAt` | ✅ | ISO-8601 có offset |

**Response `201 Created`:**

```json
{
  "id": 42,
  "ticketUuid": "550e8400-e29b-41d4-a716-446655440000",
  "ticketCode": "CF-0042",
  "customerName": "Nguyen Van A",
  "records": [
    { "weighSequence": 1, "bagCount": 2, "weightKg": 124.50, "weighedAt": "2026-11-21T19:55:12+07:00" },
    { "weighSequence": 2, "bagCount": 2, "weightKg": 126.00, "weighedAt": "2026-11-21T19:56:30+07:00" },
    { "weighSequence": 3, "bagCount": 2, "weightKg": 122.80, "weighedAt": "2026-11-21T19:57:45+07:00" }
  ],
  "totalBags": 6,
  "totalWeightKg": 373.30
}
```

**Response `400 Bad Request`:**

```json
{
  "timestamp": "2026-11-21T19:55:12+07:00",
  "status": 400,
  "error": "Bad Request",
  "message": "records[0].weightKg must be greater than 0"
}
```

**Response `409 Conflict`** — `ticketUuid` đã tồn tại ( FE gửi lại phiếu đã lưu):

```json
{
  "timestamp": "2026-11-21T19:55:12+07:00",
  "status": 409,
  "error": "Conflict",
  "message": "Ticket 550e8400-... already exists"
}
```

### `GET /api/tickets`

Lấy danh sách phiếu đã lưu — FE dùng cho màn hình **Lịch sử**. Mỗi phiếu 1 dòng, mới nhất trước.

**Response `200 OK`:**

```json
[
  {
    "ticketUuid": "550e8400-e29b-41d4-a716-446655440000",
    "ticketCode": "CF-0042",
    "customerName": "Nguyen Van A",
    "weighedAt": "2026-11-21T19:58:50"
  }
]
```

| Trường | Kiểu | Ghi chú |
|---|---|---|
| `ticketUuid` | string | Dùng để mở `/in-phieu/{ticketUuid}` |
| `ticketCode` | string | Mã in trên giấy |
| `customerName` | string | Tên khách |
| `weighedAt` | ISO-8601 | Giờ lần cân **cuối cùng** của phiếu |

Danh sách rỗng nếu chưa có phiếu nào. Endpoint không trả `records` — FE gọi `GET /api/tickets/{ticketUuid}` khi cần chi tiết.

### `GET /api/tickets/{ticketUuid}`

Lấy toàn bộ lần cân của 1 phiếu — FE dùng để render lại khi mở lại tab hoặc in lại.

**Response `200 OK`:**

```json
{
  "ticketUuid": "550e8400-e29b-41d4-a716-446655440000",
  "ticketCode": "CF-0042",
  "customerName": "Nguyen Van A",
  "records": [
    { "weighSequence": 1, "bagCount": 2, "weightKg": 124.50, "weighedAt": "2026-11-21T19:55:12+07:00" },
    { "weighSequence": 2, "bagCount": 2, "weightKg": 126.00, "weighedAt": "2026-11-21T19:56:30+07:00" },
    { "weighSequence": 3, "bagCount": 2, "weightKg": 122.80, "weighedAt": "2026-11-21T19:57:45+07:00" },
    { "weighSequence": 4, "bagCount": 1, "weightKg": 58.50, "weighedAt": "2026-11-21T19:58:50+07:00" }
  ],
  "totalBags": 7,
  "totalWeightKg": 431.80
}
```

`404 Not Found` nếu `ticketUuid` chưa có bản ghi nào.

### `PUT /api/tickets/{ticketUuid}`

Ghi đè toàn bộ phiếu (dùng cho nút **Sửa phiếu** trên FE — sửa nhiều lần cân cùng lúc).

**Request:**

```json
{
  "customerName": "Nguyen Van A",
  "records": [
    { "weighSequence": 1, "bagCount": 2, "weightKg": 124.50, "weighedAt": "2026-11-21T19:55:12+07:00" },
    { "weighSequence": 2, "bagCount": 1, "weightKg": 126.00, "weighedAt": "2026-11-21T19:56:30+07:00" },
    { "weighSequence": 3, "bagCount": 2, "weightKg": 122.80, "weighedAt": "2026-11-21T19:57:45+07:00" }
  ]
}
```

**Response `200 OK`:** trả về phiếu đã cập nhật (bao gồm `ticketCode`, `totalBags`, `totalWeightKg`).

**Ghi chú:** MVP không có audit log. Nếu cần truy vết "ai sửa lúc nào", thêm bảng `weigh_record_log` ở phiên bản sau.

### `DELETE /api/tickets/{ticketUuid}`

Xóa toàn bộ phiếu (dùng khi muốn làm lại từ đầu).

**Response `204 No Content`.**

## Tổng hợp endpoint

| Nhóm | Method | Path |
|---|---|---|
| Agent | GET | `/health` |
| Agent | GET | `/weight` |
| Agent | POST | `/config` |
| BE | POST | `/api/tickets` |
| BE | GET | `/api/tickets` |
| BE | GET | `/api/tickets/{ticketUuid}` |
| BE | PUT | `/api/tickets/{ticketUuid}` |
| BE | DELETE | `/api/tickets/{ticketUuid}` |

## CORS

FE chạy ở `localhost:5173` (dev) hoặc `:5173` (nginx), BE ở `:8080` → khác origin. Cần cấu hình `WebMvcConfigurer` cho phép:

- `http://localhost:5173`, `http://127.0.0.1:5173`
- `http://localhost:5173` qua nginx proxy (production) — cùng origin nên không cần CORS khi đi qua nginx.

Agent ở `:5000` cũng cần CORS vì FE gọi trực tiếp `http://127.0.0.1:5000/weight`.

## Bảo mật — lưu ý MVP

- Không có xác thực. Bất kỳ tiến trình nào trên máy đều gọi được `:8080/api`.
- Chấp nhận được vì máy trạm không nối Internet ở MVP.
- Khi nào triển khai thật: thêm reverse proxy giới hạn theo IP, hoặc token tĩnh trong header.

## Chuẩn dữ liệu

| Kiểu | Quy ước |
|---|---|
| Decimal | JSON number, tối đa 2 chữ số thập phân, đơn vị kg |
| Datetime | ISO-8601 kèm offset (`2026-11-21T19:55:12+07:00`) |
| UUID | Chuẩn RFC 4122 v4 |
| Mã lỗi | Dùng envelope Spring Boot mặc định (`timestamp/status/error/message`) |
