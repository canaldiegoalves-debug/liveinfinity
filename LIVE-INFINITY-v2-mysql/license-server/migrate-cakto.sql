CREATE TABLE IF NOT EXISTS cakto_webhook_events (
  event_id VARCHAR(255) PRIMARY KEY,
  event_type VARCHAR(100) NULL,
  offer_id VARCHAR(255) NULL,
  order_id VARCHAR(255) NULL,
  customer_email VARCHAR(255) NULL,
  payment_status VARCHAR(80) NULL,
  mapped_plan ENUM('basic','pro','premium') NULL,
  processed TINYINT(1) NOT NULL DEFAULT 0,
  processing_error TEXT NULL,
  payload JSON NOT NULL,
  received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME NULL,
  INDEX idx_cakto_email (customer_email),
  INDEX idx_cakto_offer (offer_id),
  INDEX idx_cakto_status (payment_status),
  INDEX idx_cakto_received (received_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
