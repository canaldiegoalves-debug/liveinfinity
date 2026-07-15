ALTER TABLE licenses
  ADD COLUMN account_email VARCHAR(255) NULL AFTER id,
  ADD COLUMN access_email VARCHAR(255) NULL AFTER account_email;

UPDATE licenses
SET
  account_email = COALESCE(account_email, email),
  access_email = COALESCE(access_email, email);

ALTER TABLE licenses
  MODIFY account_email VARCHAR(255) NOT NULL,
  MODIFY access_email VARCHAR(255) NOT NULL;

CREATE UNIQUE INDEX uq_licenses_access_email ON licenses(access_email);
CREATE INDEX idx_licenses_account_email ON licenses(account_email);
