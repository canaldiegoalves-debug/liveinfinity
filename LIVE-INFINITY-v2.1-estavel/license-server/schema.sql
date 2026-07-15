CREATE TABLE IF NOT EXISTS licenses (
  id CHAR(36) PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  license_key VARCHAR(100) NOT NULL UNIQUE,
  plan ENUM('basic','pro') NOT NULL DEFAULT 'basic',
  duration_days INT NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  status ENUM('pending','active','revoked','expired') NOT NULL DEFAULT 'pending',
  device_id VARCHAR(255) NULL,
  note TEXT NULL,
  amount_paid DECIMAL(10,2) NOT NULL DEFAULT 0,
  payment_method VARCHAR(80) NULL,
  activated_at DATETIME NULL,
  expires_at DATETIME NULL,
  last_validation_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_licenses_email (email),
  INDEX idx_licenses_status (status),
  INDEX idx_licenses_expires (expires_at),
  INDEX idx_licenses_last_validation (last_validation_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS support_tickets (
  id CHAR(36) PRIMARY KEY,
  subject VARCHAR(255) NOT NULL,
  customer_email VARCHAR(255) NULL,
  message TEXT NOT NULL,
  priority ENUM('low','normal','high') NOT NULL DEFAULT 'normal',
  status ENUM('open','in_progress','resolved') NOT NULL DEFAULT 'open',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_tickets_status (status),
  INDEX idx_tickets_email (customer_email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_type VARCHAR(80) NOT NULL,
  license_id CHAR(36) NULL,
  email VARCHAR(255) NULL,
  details JSON NULL,
  ip_address VARCHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_logs_event (event_type),
  INDEX idx_logs_license (license_id),
  INDEX idx_logs_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
