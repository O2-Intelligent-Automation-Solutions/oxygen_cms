-- OxyGen CMS canonical current schema snapshot
-- Schema version: 0.11
-- Runtime source of truth: apps/api/src/db/migrations/index.ts

CREATE TABLE IF NOT EXISTS cms_schema_versions (
  version VARCHAR(32) NOT NULL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  checksum VARCHAR(128) NOT NULL,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tenants (
  id CHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_tenants_name (name)
);

CREATE TABLE IF NOT EXISTS roles (
  id CHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  description TEXT NULL,
  tenant_id CHAR(36) NULL,
  protected TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_roles_name_tenant (name, tenant_id),
  CONSTRAINT fk_roles_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS user_groups (
  id CHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  tenant_id CHAR(36) NULL,
  instance_access_mode ENUM('none', 'all', 'specific') NOT NULL DEFAULT 'none',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_groups_name_tenant (name, tenant_id),
  CONSTRAINT fk_user_groups_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) NOT NULL PRIMARY KEY,
  email VARCHAR(320) NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt VARCHAR(64) NOT NULL,
  tenant_id CHAR(36) NULL,
  instance_access_mode ENUM('inherit', 'none', 'all', 'specific') NOT NULL DEFAULT 'inherit',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_email (email),
  CONSTRAINT fk_users_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS user_role_assignments (
  user_id CHAR(36) NOT NULL,
  role_id CHAR(36) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, role_id),
  CONSTRAINT fk_user_role_assignments_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_role_assignments_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS user_group_assignments (
  user_id CHAR(36) NOT NULL,
  group_id CHAR(36) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, group_id),
  CONSTRAINT fk_user_group_assignments_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_group_assignments_group FOREIGN KEY (group_id) REFERENCES user_groups(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sessions (
  token VARCHAR(128) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NULL,
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS oxygen_instances (
  id CHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  tenant_id CHAR(36) NULL,
  protocol ENUM('http', 'https') NOT NULL DEFAULT 'https',
  host VARCHAR(255) NOT NULL,
  port INT NULL,
  hostname VARCHAR(255) NOT NULL,
  base_url VARCHAR(1024) NOT NULL,
  launch_url VARCHAR(1200) NOT NULL,
  api_base_url VARCHAR(1200) NOT NULL,
  username VARCHAR(255) NOT NULL,
  password_secret TEXT NOT NULL,
  polling_interval_seconds INT NOT NULL DEFAULT 300,
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  check_license TINYINT(1) NOT NULL DEFAULT 1,
  archived TINYINT(1) NOT NULL DEFAULT 0,
  metadata_json JSON NULL,
  notes LONGTEXT NULL,
  status ENUM('unknown', 'up', 'down', 'auth-error', 'ssl-error') NOT NULL DEFAULT 'unknown',
  last_checked_at TIMESTAMP NULL,
  last_error TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_oxygen_instances_name (name),
  KEY idx_oxygen_instances_status (status),
  KEY idx_oxygen_instances_tenant (tenant_id),
  KEY idx_oxygen_instances_archived (archived),
  CONSTRAINT fk_oxygen_instances_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT
);

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

CREATE TABLE IF NOT EXISTS user_instance_access (
  user_id CHAR(36) NOT NULL,
  instance_id CHAR(36) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, instance_id),
  CONSTRAINT fk_user_instance_access_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_instance_access_instance FOREIGN KEY (instance_id) REFERENCES oxygen_instances(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_group_instance_access (
  group_id CHAR(36) NOT NULL,
  instance_id CHAR(36) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (group_id, instance_id),
  CONSTRAINT fk_user_group_instance_access_group FOREIGN KEY (group_id) REFERENCES user_groups(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_group_instance_access_instance FOREIGN KEY (instance_id) REFERENCES oxygen_instances(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS grid_preferences (
  user_id CHAR(36) NOT NULL,
  grid_key VARCHAR(128) NOT NULL,
  columns_json JSON NOT NULL,
  sort_json JSON NOT NULL,
  group_json JSON NOT NULL,
  filter_json JSON NULL,
  filters_visible TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, grid_key),
  KEY idx_grid_preferences_grid_key (grid_key),
  CONSTRAINT fk_grid_preferences_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS application_settings (
  setting_key VARCHAR(128) NOT NULL PRIMARY KEY,
  value_json JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);


CREATE TABLE IF NOT EXISTS application_logs (
  id CHAR(36) NOT NULL PRIMARY KEY,
  log_type ENUM('Audit', 'Service', 'CRUD', 'Connection', 'Security', 'UI') NOT NULL,
  severity ENUM('Critical', 'Error', 'Warning', 'Logging', 'Verbose') NOT NULL,
  source VARCHAR(255) NOT NULL,
  user_name VARCHAR(255) NULL,
  entity_guid CHAR(36) NULL,
  message TEXT NOT NULL,
  details_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_application_logs_created_at (created_at),
  KEY idx_application_logs_type (log_type),
  KEY idx_application_logs_severity (severity),
  KEY idx_application_logs_source (source),
  KEY idx_application_logs_user_name (user_name),
  KEY idx_application_logs_entity_guid (entity_guid)
);
