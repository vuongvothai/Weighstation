-- Database is created by MYSQL_DATABASE env var.
-- Tables below are created inside that database automatically.

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
