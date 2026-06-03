-- OxyGen CMS schema migration 003 / version 0.03
-- Expand enrolled OxyGen instances and add latest status/history storage.

ALTER TABLE oxygen_instances
  ADD COLUMN description TEXT NULL AFTER name,
  ADD COLUMN tenant_id CHAR(36) NULL AFTER description,
  ADD COLUMN protocol ENUM('http', 'https') NOT NULL DEFAULT 'https' AFTER tenant_id,
  ADD COLUMN host VARCHAR(255) NULL AFTER protocol,
  ADD COLUMN port INT NULL AFTER host,
  ADD COLUMN api_base_url VARCHAR(1200) NULL AFTER launch_url,
  ADD KEY idx_oxygen_instances_tenant (tenant_id),
  ADD CONSTRAINT fk_oxygen_instances_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;

UPDATE oxygen_instances
SET
  protocol = CASE WHEN LOWER(base_url) LIKE 'http://%' THEN 'http' ELSE 'https' END,
  host = SUBSTRING_INDEX(SUBSTRING_INDEX(REPLACE(REPLACE(base_url, 'https://', ''), 'http://', ''), '/', 1), ':', 1),
  port = CASE
    WHEN SUBSTRING_INDEX(REPLACE(REPLACE(base_url, 'https://', ''), 'http://', ''), '/', 1) LIKE '%:%'
      THEN CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(REPLACE(REPLACE(base_url, 'https://', ''), 'http://', ''), '/', 1), ':', -1) AS UNSIGNED)
    ELSE NULL
  END,
  api_base_url = base_url
WHERE host IS NULL;

ALTER TABLE oxygen_instances
  MODIFY host VARCHAR(255) NOT NULL,
  MODIFY api_base_url VARCHAR(1200) NOT NULL;

CREATE TABLE IF NOT EXISTS oxygen_instance_status (
  instance_id CHAR(36) NOT NULL PRIMARY KEY,
  availability_status ENUM('unknown', 'up', 'down', 'auth-error', 'ssl-error') NOT NULL DEFAULT 'unknown',
  ssl_valid TINYINT(1) NULL,
  ssl_expires_at TIMESTAMP NULL,
  last_checked_at TIMESTAMP NULL,
  last_success_at TIMESTAMP NULL,
  last_failure_at TIMESTAMP NULL,
  uptime_percent_24h DECIMAL(5,2) NULL,
  uptime_percent_7d DECIMAL(5,2) NULL,
  response_time_ms INT NULL,
  last_error TEXT NULL,
  processing_status ENUM('unknown', 'ok', 'warning', 'error') NOT NULL DEFAULT 'unknown',
  emm_queue_status ENUM('unknown', 'ok', 'warning', 'error') NOT NULL DEFAULT 'unknown',
  sms_status ENUM('unknown', 'ok', 'warning', 'error') NOT NULL DEFAULT 'unknown',
  hangfire_status ENUM('unknown', 'ok', 'warning', 'error') NOT NULL DEFAULT 'unknown',
  license_key VARCHAR(255) NULL,
  license_status ENUM('unknown', 'valid', 'expired', 'warning', 'error') NOT NULL DEFAULT 'unknown',
  license_json JSON NULL,
  settings_json JSON NULL,
  workflow_summary_json JSON NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_oxygen_instance_status_instance FOREIGN KEY (instance_id) REFERENCES oxygen_instances(id) ON DELETE CASCADE
);

INSERT IGNORE INTO oxygen_instance_status (instance_id, availability_status, last_checked_at, last_error)
SELECT id, status, last_checked_at, last_error FROM oxygen_instances;

CREATE TABLE IF NOT EXISTS oxygen_instance_check_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  instance_id CHAR(36) NOT NULL,
  check_type ENUM('connectivity', 'ssl', 'auth', 'license', 'settings', 'workflow', 'hangfire', 'processing', 'emm-queue', 'sms') NOT NULL,
  status ENUM('unknown', 'up', 'down', 'ok', 'warning', 'error', 'auth-error', 'ssl-error') NOT NULL DEFAULT 'unknown',
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TIMESTAMP NULL,
  duration_ms INT NULL,
  http_status_code INT NULL,
  error_code VARCHAR(128) NULL,
  error_message TEXT NULL,
  details_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_oxygen_instance_check_history_instance_created (instance_id, created_at),
  KEY idx_oxygen_instance_check_history_type_status (check_type, status),
  CONSTRAINT fk_oxygen_instance_check_history_instance FOREIGN KEY (instance_id) REFERENCES oxygen_instances(id) ON DELETE CASCADE
);
