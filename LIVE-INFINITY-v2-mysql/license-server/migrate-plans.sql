-- Execute automatically through: npm run db:migrate-plans
ALTER TABLE licenses
  MODIFY plan ENUM('basic','pro','premium') NOT NULL DEFAULT 'basic';

CREATE TABLE IF NOT EXISTS customer_accounts (
  email VARCHAR(255) PRIMARY KEY,
  plan ENUM('basic','pro','premium') NOT NULL DEFAULT 'basic',
  monthly_price DECIMAL(10,2) NOT NULL DEFAULT 97.00,
  key_limit INT NULL DEFAULT 1,
  subscription_status ENUM('manual','active','past_due','cancelled','refunded','chargeback') NOT NULL DEFAULT 'manual',
  cakto_customer_id VARCHAR(255) NULL,
  cakto_subscription_id VARCHAR(255) NULL,
  current_period_end DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_accounts_plan (plan),
  INDEX idx_accounts_status (subscription_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO customer_accounts (email, plan, monthly_price, key_limit)
SELECT
  email,
  CASE
    WHEN MAX(plan = 'premium') = 1 THEN 'premium'
    WHEN MAX(plan = 'pro') = 1 THEN 'pro'
    ELSE 'basic'
  END,
  CASE
    WHEN MAX(plan = 'premium') = 1 THEN 197.00
    WHEN MAX(plan = 'pro') = 1 THEN 147.00
    ELSE 97.00
  END,
  CASE
    WHEN MAX(plan = 'premium') = 1 THEN NULL
    WHEN MAX(plan = 'pro') = 1 THEN 2
    ELSE 1
  END
FROM licenses
GROUP BY email
ON DUPLICATE KEY UPDATE
  plan = VALUES(plan),
  monthly_price = VALUES(monthly_price),
  key_limit = VALUES(key_limit);
