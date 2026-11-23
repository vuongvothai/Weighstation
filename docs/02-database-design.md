# Thiết Kế CSDL

## Quyết định: MySQL 8

`docker-compose.yml` đã chạy `mysql:8.0` với database `nong_san_db`. `db/init.sql` hiện tại viết theo cú pháp SQLite (`INTEGER PRIMARY KEY AUTOINCREMENT`) nên không chạy được trên MySQL và sẽ làm `ddl-auto=validate` thất bại khi backend khởi động. Cần viết lại theo cú pháp MySQL 8.

## Schema

### Bảng `weigh_record` — một lần cân

Mỗi lần operator nhấn phím `t` tạo 1 bản ghi. Một phiếu cân gồm nhiều `weigh_record`.

```sql
CREATE TABLE weigh_record (
    id              BIGINT       NOT NULL AUTO_INCREMENT,
    ticket_uuid     CHAR(36)     NOT NULL,                    -- UUID nhóm các lần cân của 1 phiếu
    ticket_code     VARCHAR(30)  NOT NULL,                    -- Mã in trên phiếu, VD: CF-0042
    customer_name   VARCHAR(150) NOT NULL,                    -- Tên khách/chủ hàng
    weigh_sequence  INT          NOT NULL,                    -- Lần cân thứ mấy trong phiếu (1,2,3...)
    bag_count       INT          NOT NULL DEFAULT 2,         -- Số bao của lần cân này
    weight_kg       DECIMAL(10,2) NOT NULL,                   -- Số cân (kg)
    operator_name   VARCHAR(150)     NULL,                    -- Người cân (MVP: có thể để trống)
    weighed_at      DATETIME     NOT NULL,                    -- Thời điểm ghi
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uq_ticket_seq (ticket_uuid, weigh_sequence),
    KEY idx_ticket_uuid (ticket_uuid),
    KEY idx_ticket_code (ticket_code),
    KEY idx_weighed_at (weighed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**Ghi chú:**

| Trường | Lý do |
|---|---|
| `ticket_uuid` | Khóa nhóm. FE sinh 1 UUID khi bắt đầu phiếu mới, gửi kèm mọi lần cân. BE không cần state "phiếu đang mở". |
| `ticket_code` | Mã ngắn in trên giấy (`CF-0042`). Sinh ở BE theo thứ tự tăng dần trong ngày. |
| `weigh_sequence` | Thứ tự lần cân. `uq_ticket_seq` bảo đảm không ghi trùng lần 2 lần. |
| `bag_count` default 2 | Theo yêu cầu: mặc định 2 bao/lần, sửa được tại chỗ. |
| `weight_kg DECIMAL(10,2)` | Không dùng `FLOAT`/`DOUBLE` — tránh sai số khi cộng tổng 431.8 kg. |

### Vì sao không có bảng `ticket` / `product` / `customer`

- **1 loại hàng hoá** → không cần `product`, không cần `coffee_type`.
- **Không sửa thông tin khách sau khi in** ở MVP → tên khách nằm trong `weigh_record` là đủ.
- Khi nào tách: khi cần (a) nhiều loại hàng trong 1 phiếu, (b) tra cứu theo khách, (c) sửa phiếu đã in.

### Cột `sync_status` / `synced_at`

Trong `agent.md` có 2 cột này để đánh dấu bản ghi đã đồng bộ về "app chính". **MVP chưa có app chính**, nên không tạo 2 cột này. Khi làm tầng đồng bộ, thêm bằng migration.

## Chỉ mục & truy vấn

| Truy vấn | Chỉ mục dùng |
|---|---|
| Lấy toàn bộ lần cân của 1 phiếu (để in) | `idx_ticket_uuid` |
| Chống ghi trùng lần | `uq_ticket_seq` |
| Tra phiếu theo mã in trên giấy | `idx_ticket_code` |
| Liệt kê theo ngày (báo cáo cuối ngày) | `idx_weighed_at` |

## Sinh mã phiếu (`ticket_code`)

**Đề xuất:** `CF-` + thứ tự tăng trong ngày, 4 chữ số.

```text
CF-0001, CF-0002, ... CF-9999, sang ngày reset
```

BE sinh bằng `SELECT MAX(ticket_code) WHERE ticket_code LIKE 'CF-<yyyyMMdd>%'` trong transaction. Với 1 máy trạm, cách này đủ.

## Migration & khởi tạo

| Nơi | Nội dung |
|---|---|
| `db/init.sql` | Viết lại theo cú pháp MySQL 8 |
| `docker-compose.yml` | Giữ nguyên, đã mount `./db/init.sql` vào `docker-entrypoint-initdb.d` |
| `application.properties` | `ddl-auto=validate` → giữ, để schema là nguồn sự thật |

**Lưu ý:** `docker-entrypoint-initdb.d` chỉ chạy khi volume `mysql_data` rỗng. Đổi `init.sql` rồi phải `docker compose down -v` mới có hiệu lực.
