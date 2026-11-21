-- Database is created by MYSQL_DATABASE env var.
-- Tables below are created inside that database automatically.

CREATE TABLE weighstation (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_uuid VARCHAR(64) NOT NULL UNIQUE,
    ticket_code VARCHAR(30) NOT NULL,
    weighed_at DATETIME NOT NULL,
    customer_name VARCHAR(150) NOT NULL,
    coffee_type VARCHAR(100) NOT NULL,
    weigh_sequence INTEGER NOT NULL,
    bag_count INTEGER NOT NULL DEFAULT 0,
    weight_kg DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    operator_name VARCHAR(150),
    sync_status INTEGER NOT NULL DEFAULT 0, -- 0: not synced, 1: synced
    synced_at DATETIME
);