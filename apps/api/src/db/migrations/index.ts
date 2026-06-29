import type { SchemaMigration } from '../../setup/schemaMigrations.js';

const securityTenantSchemaSql = `
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

INSERT IGNORE INTO roles (id, name, description, tenant_id, protected) VALUES
  (UUID(), 'SystemAdmin', 'Global CMS system administrator', NULL, 1),
  (UUID(), 'TenantAdmin', 'Global tenant administrator role template', NULL, 1),
  (UUID(), 'PartnerAdmin', 'Partner administrator', NULL, 0),
  (UUID(), 'Operator', 'Operational user', NULL, 0),
  (UUID(), 'Viewer', 'Read-only user', NULL, 0);
`;

const oxygenInstancesSchemaSql = `
CREATE TABLE IF NOT EXISTS oxygen_instances (
  id CHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  hostname VARCHAR(255) NOT NULL,
  base_url VARCHAR(1024) NOT NULL,
  launch_url VARCHAR(1200) NOT NULL,
  username VARCHAR(255) NOT NULL,
  password_secret TEXT NOT NULL,
  group_id CHAR(36) NOT NULL,
  polling_interval_seconds INT NOT NULL DEFAULT 300,
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  status ENUM('unknown', 'up', 'down', 'auth-error', 'ssl-error') NOT NULL DEFAULT 'unknown',
  last_checked_at TIMESTAMP NULL,
  last_error TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_oxygen_instances_group (group_id),
  KEY idx_oxygen_instances_status (status),
  CONSTRAINT fk_oxygen_instances_group FOREIGN KEY (group_id) REFERENCES user_groups(id) ON DELETE RESTRICT
);
`;

const instanceStatusSchemaSql = `
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
  KEY idx_oxygen_instance_check_history_instance_started_id_type (instance_id, started_at, id, check_type),
  KEY idx_oxygen_instance_check_history_started_at (started_at),
  KEY idx_oxygen_instance_check_history_type_status (check_type, status),
  CONSTRAINT fk_oxygen_instance_check_history_instance FOREIGN KEY (instance_id) REFERENCES oxygen_instances(id) ON DELETE CASCADE
);
`;

const instanceAccessModelSql = `
ALTER TABLE users
  ADD COLUMN instance_access_mode ENUM('inherit', 'none', 'all', 'specific') NOT NULL DEFAULT 'inherit' AFTER tenant_id;

ALTER TABLE user_groups
  ADD COLUMN instance_access_mode ENUM('none', 'all', 'specific') NOT NULL DEFAULT 'none' AFTER tenant_id;

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

INSERT IGNORE INTO user_group_instance_access (group_id, instance_id)
SELECT group_id, id
FROM oxygen_instances
WHERE group_id IS NOT NULL;

UPDATE user_groups
SET instance_access_mode = 'specific'
WHERE id IN (SELECT DISTINCT group_id FROM user_group_instance_access);

UPDATE users u
INNER JOIN user_role_assignments ura ON ura.user_id = u.id
INNER JOIN roles r ON r.id = ura.role_id
SET u.instance_access_mode = 'all'
WHERE r.name = 'SystemAdmin';

ALTER TABLE oxygen_instances
  DROP FOREIGN KEY fk_oxygen_instances_group;

ALTER TABLE oxygen_instances
  DROP INDEX idx_oxygen_instances_group;

ALTER TABLE oxygen_instances
  DROP COLUMN group_id;
`;

const gridPreferencesSchemaSql = `CREATE TABLE IF NOT EXISTS grid_preferences (
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
);`;

const removePartnerRoleTerminologySql = `DELETE FROM roles WHERE name = 'PartnerAdmin' AND protected = 0;`;

const appSettingsSchemaSql = `CREATE TABLE IF NOT EXISTS application_settings (
  setting_key VARCHAR(128) NOT NULL PRIMARY KEY,
  value_json JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);`;

const applicationLogsSchemaSql = `CREATE TABLE IF NOT EXISTS application_logs (
  id CHAR(36) NOT NULL PRIMARY KEY,
  log_type ENUM('Audit', 'Service', 'CRUD', 'Connection', 'Security', 'UI') NOT NULL,
  severity ENUM('Critical', 'Error', 'Warning', 'Logging', 'Verbose') NOT NULL,
  source VARCHAR(255) NOT NULL,
  user_name VARCHAR(320) NULL,
  entity_guid CHAR(36) NULL,
  tenant_id CHAR(36) NULL,
  message TEXT NOT NULL,
  details_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_application_logs_created_at (created_at),
  KEY idx_application_logs_type_severity (log_type, severity),
  KEY idx_application_logs_source (source),
  KEY idx_application_logs_user_name (user_name),
  KEY idx_application_logs_entity_guid (entity_guid),
  KEY idx_application_logs_tenant_id (tenant_id),
  KEY idx_application_logs_tenant_entity (tenant_id, entity_guid)
);`;


const applicationLogsEntityGuidSql = `SET @add_application_logs_entity_guid_column_sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE application_logs ADD COLUMN entity_guid CHAR(36) NULL AFTER user_name',
    'SELECT 1'
  )
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'application_logs'
    AND column_name = 'entity_guid'
);
PREPARE add_application_logs_entity_guid_column_stmt FROM @add_application_logs_entity_guid_column_sql;
EXECUTE add_application_logs_entity_guid_column_stmt;
DEALLOCATE PREPARE add_application_logs_entity_guid_column_stmt;

SET @add_application_logs_entity_guid_index_sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE application_logs ADD KEY idx_application_logs_entity_guid (entity_guid)',
    'SELECT 1'
  )
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'application_logs'
    AND index_name = 'idx_application_logs_entity_guid'
);
PREPARE add_application_logs_entity_guid_index_stmt FROM @add_application_logs_entity_guid_index_sql;
EXECUTE add_application_logs_entity_guid_index_stmt;
DEALLOCATE PREPARE add_application_logs_entity_guid_index_stmt;`;

const applicationLogsTenantIdSql = `SET @add_application_logs_tenant_id_column_sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE application_logs ADD COLUMN tenant_id CHAR(36) NULL AFTER entity_guid',
    'SELECT 1'
  )
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'application_logs'
    AND column_name = 'tenant_id'
);
PREPARE add_application_logs_tenant_id_column_stmt FROM @add_application_logs_tenant_id_column_sql;
EXECUTE add_application_logs_tenant_id_column_stmt;
DEALLOCATE PREPARE add_application_logs_tenant_id_column_stmt;

SET @add_application_logs_tenant_id_index_sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE application_logs ADD KEY idx_application_logs_tenant_id (tenant_id)',
    'SELECT 1'
  )
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'application_logs'
    AND index_name = 'idx_application_logs_tenant_id'
);
PREPARE add_application_logs_tenant_id_index_stmt FROM @add_application_logs_tenant_id_index_sql;
EXECUTE add_application_logs_tenant_id_index_stmt;
DEALLOCATE PREPARE add_application_logs_tenant_id_index_stmt;

SET @add_application_logs_tenant_entity_index_sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE application_logs ADD KEY idx_application_logs_tenant_entity (tenant_id, entity_guid)',
    'SELECT 1'
  )
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'application_logs'
    AND index_name = 'idx_application_logs_tenant_entity'
);
PREPARE add_application_logs_tenant_entity_index_stmt FROM @add_application_logs_tenant_entity_index_sql;
EXECUTE add_application_logs_tenant_entity_index_stmt;
DEALLOCATE PREPARE add_application_logs_tenant_entity_index_stmt;`;

const instanceImportColumnsSql = `ALTER TABLE oxygen_instances
  ADD COLUMN check_license TINYINT(1) NOT NULL DEFAULT 1 AFTER is_enabled,
  ADD COLUMN archived TINYINT(1) NOT NULL DEFAULT 0 AFTER check_license,
  ADD COLUMN metadata_json JSON NULL AFTER archived,
  ADD COLUMN notes LONGTEXT NULL AFTER metadata_json,
  ADD KEY idx_oxygen_instances_archived (archived);
`;

const allowDuplicateInstanceNamesSql = `SET @drop_instance_name_index_sql = (
  SELECT IF(
    COUNT(*) > 0,
    'ALTER TABLE oxygen_instances DROP INDEX uq_oxygen_instances_name',
    'SELECT 1'
  )
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'oxygen_instances'
    AND index_name = 'uq_oxygen_instances_name'
);
PREPARE drop_instance_name_index_stmt FROM @drop_instance_name_index_sql;
EXECUTE drop_instance_name_index_stmt;
DEALLOCATE PREPARE drop_instance_name_index_stmt;`;


const checkHistoryDetailIndexSql = `SET @add_check_history_detail_index_sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE oxygen_instance_check_history ADD INDEX idx_oxygen_instance_check_history_instance_started_id_type (instance_id, started_at, id, check_type)',
    'SELECT 1'
  )
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'oxygen_instance_check_history'
    AND index_name = 'idx_oxygen_instance_check_history_instance_started_id_type'
);
PREPARE add_check_history_detail_index_stmt FROM @add_check_history_detail_index_sql;
EXECUTE add_check_history_detail_index_stmt;
DEALLOCATE PREPARE add_check_history_detail_index_stmt;`;


const checkHistoryRetentionIndexSql = `SET @add_check_history_retention_index_sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE oxygen_instance_check_history ADD INDEX idx_oxygen_instance_check_history_started_at (started_at)',
    'SELECT 1'
  )
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'oxygen_instance_check_history'
    AND index_name = 'idx_oxygen_instance_check_history_started_at'
);
PREPARE add_check_history_retention_index_stmt FROM @add_check_history_retention_index_sql;
EXECUTE add_check_history_retention_index_stmt;
DEALLOCATE PREPARE add_check_history_retention_index_stmt;`;


const rolePermissionsSchemaSql = `CREATE TABLE IF NOT EXISTS role_permissions (
  role_id CHAR(36) NOT NULL,
  permission_key VARCHAR(128) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (role_id, permission_key),
  KEY idx_role_permissions_permission_key (permission_key),
  CONSTRAINT fk_role_permissions_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
);

INSERT IGNORE INTO role_permissions (role_id, permission_key)
SELECT id, 'dashboard.view' FROM roles WHERE name IN ('SystemAdmin', 'TenantAdmin', 'Operator', 'Viewer')
UNION ALL SELECT id, 'instances.view' FROM roles WHERE name IN ('SystemAdmin', 'TenantAdmin', 'Operator', 'Viewer')
UNION ALL SELECT id, 'instances.manage' FROM roles WHERE name IN ('SystemAdmin', 'TenantAdmin', 'Operator')
UNION ALL SELECT id, 'instances.importExport' FROM roles WHERE name IN ('SystemAdmin', 'TenantAdmin')
UNION ALL SELECT id, 'users.manage' FROM roles WHERE name IN ('SystemAdmin', 'TenantAdmin')
UNION ALL SELECT id, 'groups.manage' FROM roles WHERE name IN ('SystemAdmin', 'TenantAdmin')
UNION ALL SELECT id, 'roles.manage' FROM roles WHERE name IN ('SystemAdmin', 'TenantAdmin')
UNION ALL SELECT id, 'tenants.view' FROM roles WHERE name IN ('SystemAdmin', 'TenantAdmin')
UNION ALL SELECT id, 'tenants.manage' FROM roles WHERE name = 'SystemAdmin'
UNION ALL SELECT id, 'logs.view' FROM roles WHERE name IN ('SystemAdmin', 'TenantAdmin', 'Operator')
UNION ALL SELECT id, 'logs.maintain' FROM roles WHERE name = 'SystemAdmin'
UNION ALL SELECT id, 'settings.manage' FROM roles WHERE name = 'SystemAdmin'
UNION ALL SELECT id, 'settings.database.view' FROM roles WHERE name = 'SystemAdmin'
UNION ALL SELECT id, 'settings.database.maintain' FROM roles WHERE name = 'SystemAdmin'
UNION ALL SELECT id, 'system.poller.manage' FROM roles WHERE name = 'SystemAdmin'
UNION ALL SELECT id, 'system.version.view' FROM roles WHERE name IN ('SystemAdmin', 'TenantAdmin', 'Operator', 'Viewer')
UNION ALL SELECT id, 'issueTypes.view' FROM roles WHERE name IN ('SystemAdmin', 'TenantAdmin', 'Operator', 'Viewer')
UNION ALL SELECT id, 'gridPreferences.manage' FROM roles WHERE name IN ('SystemAdmin', 'TenantAdmin', 'Operator', 'Viewer');`;

const performanceIndexesSql = `SET @add_check_history_latest_type_instance_id_sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE oxygen_instance_check_history ADD INDEX idx_oxygen_instance_check_history_type_instance_id (check_type, instance_id, id)',
    'SELECT 1'
  )
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'oxygen_instance_check_history'
    AND index_name = 'idx_oxygen_instance_check_history_type_instance_id'
);
PREPARE add_check_history_latest_type_instance_id_stmt FROM @add_check_history_latest_type_instance_id_sql;
EXECUTE add_check_history_latest_type_instance_id_stmt;
DEALLOCATE PREPARE add_check_history_latest_type_instance_id_stmt;

SET @add_application_logs_created_id_sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE application_logs ADD INDEX idx_application_logs_created_id (created_at, id)',
    'SELECT 1'
  )
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'application_logs'
    AND index_name = 'idx_application_logs_created_id'
);
PREPARE add_application_logs_created_id_stmt FROM @add_application_logs_created_id_sql;
EXECUTE add_application_logs_created_id_stmt;
DEALLOCATE PREPARE add_application_logs_created_id_stmt;

SET @add_application_logs_entity_created_id_sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE application_logs ADD INDEX idx_application_logs_entity_created_id (entity_guid, created_at, id)',
    'SELECT 1'
  )
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'application_logs'
    AND index_name = 'idx_application_logs_entity_created_id'
);
PREPARE add_application_logs_entity_created_id_stmt FROM @add_application_logs_entity_created_id_sql;
EXECUTE add_application_logs_entity_created_id_stmt;
DEALLOCATE PREPARE add_application_logs_entity_created_id_stmt;

SET @add_application_logs_tenant_created_id_sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE application_logs ADD INDEX idx_application_logs_tenant_created_id (tenant_id, created_at, id)',
    'SELECT 1'
  )
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'application_logs'
    AND index_name = 'idx_application_logs_tenant_created_id'
);
PREPARE add_application_logs_tenant_created_id_stmt FROM @add_application_logs_tenant_created_id_sql;
EXECUTE add_application_logs_tenant_created_id_stmt;
DEALLOCATE PREPARE add_application_logs_tenant_created_id_stmt;

SET @add_application_logs_severity_created_id_sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE application_logs ADD INDEX idx_application_logs_severity_created_id (severity, created_at, id)',
    'SELECT 1'
  )
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'application_logs'
    AND index_name = 'idx_application_logs_severity_created_id'
);
PREPARE add_application_logs_severity_created_id_stmt FROM @add_application_logs_severity_created_id_sql;
EXECUTE add_application_logs_severity_created_id_stmt;
DEALLOCATE PREPARE add_application_logs_severity_created_id_stmt;`;

const issueClassificationCatalogSql = `CREATE TABLE IF NOT EXISTS issue_categories (
  id VARCHAR(32) NOT NULL PRIMARY KEY,
  code VARCHAR(64) NOT NULL,
  name VARCHAR(128) NOT NULL,
  description TEXT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_issue_categories_code (code)
);

CREATE TABLE IF NOT EXISTS issue_severities (
  id VARCHAR(32) NOT NULL PRIMARY KEY,
  code VARCHAR(64) NOT NULL,
  name VARCHAR(128) NOT NULL,
  description TEXT NULL,
  severity_rank INT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_issue_severities_code (code)
);

CREATE TABLE IF NOT EXISTS discovered_issue_types (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  code VARCHAR(128) NOT NULL,
  label VARCHAR(255) NOT NULL,
  description TEXT NULL,
  category_id VARCHAR(32) NOT NULL,
  severity_id VARCHAR(32) NOT NULL,
  match_kind VARCHAR(64) NOT NULL,
  match_value VARCHAR(255) NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_discovered_issue_types_code (code),
  KEY idx_discovered_issue_types_category (category_id),
  KEY idx_discovered_issue_types_severity (severity_id),
  KEY idx_discovered_issue_types_enabled (enabled),
  CONSTRAINT fk_discovered_issue_types_category FOREIGN KEY (category_id) REFERENCES issue_categories(id) ON DELETE RESTRICT,
  CONSTRAINT fk_discovered_issue_types_severity FOREIGN KEY (severity_id) REFERENCES issue_severities(id) ON DELETE RESTRICT
);

INSERT INTO issue_categories (id, code, name, description, sort_order) VALUES
  ('connectivity', 'connectivity', 'Connectivity', 'DNS, TCP, TLS connection, authentication, and remote API reachability failures that block normal CMS utilization.', 10),
  ('ssl', 'ssl', 'SSL', 'Certificate validation warnings after the remote HTTPS endpoint is reachable.', 20),
  ('license', 'license', 'License', 'License status problems after application reachability and license evaluation are available.', 30),
  ('processing', 'processing', 'Processing', 'Workflow, queue, SMS, EMM, and Hangfire processing component warnings or failures.', 40)
ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description), sort_order = VALUES(sort_order);

INSERT INTO issue_severities (id, code, name, description, severity_rank, sort_order) VALUES
  ('critical', 'critical', 'Critical', 'Immediate outage or data-risk condition requiring urgent action.', 10, 10),
  ('error', 'error', 'Error', 'Active failure that requires correction.', 20, 20),
  ('warning', 'warning', 'Warning', 'Degraded, expiring, disabled, or at-risk condition.', 30, 30),
  ('logging', 'logging', 'Logging', 'Informational condition retained for audit/history.', 40, 40),
  ('verbose', 'verbose', 'Verbose', 'Low-level diagnostic condition.', 50, 50)
ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description), severity_rank = VALUES(severity_rank), sort_order = VALUES(sort_order);

INSERT INTO discovered_issue_types (id, code, label, description, category_id, severity_id, match_kind, match_value, sort_order) VALUES
  ('dns-enotfound', 'DNS_ENOTFOUND', 'DNS host not found', 'Hostname resolution failed with ENOTFOUND.', 'connectivity', 'error', 'last-error-contains', 'ENOTFOUND', 10),
  ('tcp-refused', 'ECONNREFUSED', 'TCP connection refused', 'Remote host actively refused the TCP connection.', 'connectivity', 'error', 'last-error-contains', 'ECONNREFUSED', 20),
  ('tcp-timeout', 'CONNECT_TIMEOUT', 'TCP connection timed out', 'Remote host did not accept the TCP connection before timeout.', 'connectivity', 'error', 'last-error-contains', 'CONNECT_TIMEOUT', 30),
  ('tcp-reset', 'ECONNRESET', 'TCP/TLS connection reset', 'Remote host reset the connection before the health check completed.', 'connectivity', 'error', 'last-error-contains', 'ECONNRESET', 40),
  ('tls-connection-failed', 'TLS_CONNECTION_FAILED', 'TLS connection failed', 'TLS failed before certificate validation completed; classify as connectivity, not SSL certificate warning.', 'connectivity', 'error', 'tls-connection-error', NULL, 50),
  ('authentication-failure', 'AUTHENTICATION_FAILURE', 'OxyGen authentication failed', 'CMS reached OxyGen but could not establish an authenticated session.', 'connectivity', 'error', 'instance-status', 'auth-error', 60),
  ('http-502', 'HTTP_502', 'Remote HTTP 502', 'Remote OxyGen endpoint returned HTTP 502 during a health-check phase.', 'connectivity', 'error', 'last-error-contains', 'HTTP 502', 70),
  ('http-500', 'HTTP_500', 'Remote HTTP 500', 'Remote OxyGen endpoint returned HTTP 500 during a health-check phase.', 'connectivity', 'error', 'last-error-contains', 'HTTP 500', 80),
  ('availability-down', 'AVAILABILITY_DOWN', 'Availability down', 'Instance availability is down without a more specific mapped connectivity code.', 'connectivity', 'error', 'instance-status', 'down', 90),
  ('ssl-expired', 'CERT_HAS_EXPIRED', 'SSL certificate expired', 'Remote HTTPS certificate has expired.', 'ssl', 'warning', 'last-error-contains', 'CERT_HAS_EXPIRED', 110),
  ('ssl-untrusted-chain', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'SSL untrusted certificate chain', 'Remote HTTPS certificate chain cannot be verified.', 'ssl', 'warning', 'last-error-contains', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 120),
  ('ssl-invalid', 'SSL_CERTIFICATE_INVALID', 'SSL certificate validation failed', 'Generic SSL certificate warning when no more specific certificate code is mapped.', 'ssl', 'warning', 'ssl-invalid', NULL, 130),
  ('license-expired', 'LICENSE_EXPIRED', 'License expired', 'Instance license status is expired.', 'license', 'error', 'license-status', 'expired', 210),
  ('license-invalid', 'LICENSE_INVALID', 'License invalid', 'Instance license status is error/invalid after reachability was confirmed.', 'license', 'error', 'license-status', 'error', 220),
  ('license-missing', 'LICENSE_MISSING', 'License missing or blank', 'License key is missing, blank, or unavailable after license evaluation.', 'license', 'error', 'license-missing', NULL, 230),
  ('license-warning', 'LICENSE_WARNING', 'License warning', 'Instance license status is warning.', 'license', 'warning', 'license-status', 'warning', 240),
  ('processing-failure', 'PROCESSING_FAILURE', 'Processing component failure', 'One or more monitored processing components are in error.', 'processing', 'error', 'processing-status', 'error', 310),
  ('processing-warning', 'PROCESSING_WARNING', 'Processing component warning', 'One or more monitored processing components are warning or disabled.', 'processing', 'warning', 'processing-warning', NULL, 320)
ON DUPLICATE KEY UPDATE
  label = VALUES(label),
  description = VALUES(description),
  category_id = VALUES(category_id),
  severity_id = VALUES(severity_id),
  match_kind = VALUES(match_kind),
  match_value = VALUES(match_value),
  sort_order = VALUES(sort_order),
  enabled = VALUES(enabled);`;


const jobPermissionsSql = `INSERT IGNORE INTO role_permissions (role_id, permission_key)
SELECT id, 'jobs.view' FROM roles WHERE name = 'SystemAdmin'
UNION ALL SELECT id, 'jobs.manage' FROM roles WHERE name = 'SystemAdmin';`;

const processingErrorsPermissionsSql = `INSERT IGNORE INTO role_permissions (role_id, permission_key)
SELECT id, 'processing.errors.view' FROM roles WHERE name IN ('SystemAdmin', 'TenantAdmin', 'Operator', 'Viewer')
UNION ALL SELECT id, 'processing.errors.cancelTrigger' FROM roles WHERE name IN ('SystemAdmin', 'TenantAdmin')
UNION ALL SELECT id, 'processing.errors.recoverWorkflowEvent' FROM roles WHERE name IN ('SystemAdmin', 'TenantAdmin')
UNION ALL SELECT id, 'processing.errors.cancelWorkflowEvent' FROM roles WHERE name IN ('SystemAdmin', 'TenantAdmin')
UNION ALL SELECT id, 'processing.errors.restoreServiceEvent' FROM roles WHERE name IN ('SystemAdmin', 'TenantAdmin')
UNION ALL SELECT id, 'processing.errors.downloadServiceEventFile' FROM roles WHERE name IN ('SystemAdmin', 'TenantAdmin')
UNION ALL SELECT id, 'processing.errors.viewServiceEventMessage' FROM roles WHERE name IN ('SystemAdmin', 'TenantAdmin');`;

const sslExpiringSoonIssueTypeSql = `INSERT INTO discovered_issue_types (id, code, label, description, category_id, severity_id, match_kind, match_value, sort_order) VALUES
  ('ssl-expiring-soon', 'SSL_EXPIRING_SOON', 'SSL certificate expiring soon', 'Remote HTTPS certificate is valid but within the global expiration warning threshold.', 'ssl', 'warning', 'ssl-expiring-soon', NULL, 125)
ON DUPLICATE KEY UPDATE
  label = VALUES(label),
  description = VALUES(description),
  category_id = VALUES(category_id),
  severity_id = VALUES(severity_id),
  match_kind = VALUES(match_kind),
  match_value = VALUES(match_value),
  sort_order = VALUES(sort_order),
  enabled = VALUES(enabled);`;

const licenseExpiringSoonIssueTypeSql = `INSERT INTO discovered_issue_types (id, code, label, description, category_id, severity_id, match_kind, match_value, sort_order) VALUES
  ('license-expiring-soon', 'LICENSE_EXPIRING_SOON', 'License expiring soon', 'Instance license is valid but within the global expiration warning threshold.', 'license', 'warning', 'license-expiring-soon', NULL, 235)
ON DUPLICATE KEY UPDATE
  label = VALUES(label),
  description = VALUES(description),
  category_id = VALUES(category_id),
  severity_id = VALUES(severity_id),
  match_kind = VALUES(match_kind),
  match_value = VALUES(match_value),
  sort_order = VALUES(sort_order),
  enabled = VALUES(enabled);`;

export const schemaMigrations: SchemaMigration[] = [
  {
    version: '0.01',
    name: 'security tenant schema',
    checksum: 'c371f4d491c6c41ae91f743d846398a5737c3cc07de187bef8bcb55ac8f09dd8',
    upSql: securityTenantSchemaSql
  },
  {
    version: '0.02',
    name: 'oxygen instance enrollment schema',
    checksum: '1f8ce37ad19a27083d57eed7da05be244ac5972ed340aa3977f6c565823f7852',
    upSql: oxygenInstancesSchemaSql
  },
  {
    version: '0.03',
    name: 'expanded instance status schema',
    checksum: '7dc4489da1220b305529f26536eed3fbbefa87339d1d0920fb07339bd1ccae30',
    upSql: instanceStatusSchemaSql
  },
  {
    version: '0.04',
    name: 'user and group instance access model',
    checksum: '39be26bad2158ac9d39dd4b8c48a9ea13d404f3fa1d346469897d2803cb5017b',
    upSql: instanceAccessModelSql
  },
  {
    version: '0.05',
    name: 'grid preferences schema',
    checksum: '7d6575f92431394ac17c17f34d67bc7e34b7fee3e737a5b103da44fe8e89aa8a',
    upSql: gridPreferencesSchemaSql
  },
  {
    version: '0.06',
    name: 'remove partner role terminology',
    checksum: '84acd388199f9ef9cb2775ac29e270cc25d7dd921b9b594b7902ca1d0200ce2d',
    upSql: removePartnerRoleTerminologySql
  },
  {
    version: '0.07',
    name: 'application settings schema',
    checksum: '372a5e1d2eaf111c92b0076658f39563a7e8c92994bdae1fe0f0cc1da0b0cf83',
    upSql: appSettingsSchemaSql
  },
  {
    version: '0.08',
    name: 'application logs schema',
    checksum: 'e36e7aa435bf2784666bc601f827a0a6f0c9117c183ae3cbc9c60ad51bb1e882',
    upSql: applicationLogsSchemaSql
  },
  {
    version: '0.09',
    name: 'application log entity guid index',
    checksum: 'd3d8c20df5df27af58090d7e0e5750cd3e2e8a46b9a64f470e495eb64065fa25',
    upSql: applicationLogsEntityGuidSql
  },
  {
    version: '0.10',
    name: 'application log tenant metadata',
    checksum: '4f1a5d930c5c51d0de7a0b7b5d066e7f26843d137b4eb8e3dc3b24ef2e37f9cb',
    upSql: applicationLogsTenantIdSql
  },
  {
    version: '0.11',
    name: 'instance import metadata columns',
    checksum: '391966ee3f814e3d2d8a983d55a196f77de24f490dd496abb5f7ba2873aa44ed',
    upSql: instanceImportColumnsSql
  },
  {
    version: '0.12',
    name: 'allow duplicate instance names',
    checksum: '4723114813a87869f22839e078a2542c262f092c17bf50e759b3e25ddbdcdb2a',
    upSql: allowDuplicateInstanceNamesSql
  },
  {
    version: '0.13',
    name: 'instance check history detail index',
    checksum: 'ad2d4c236e2b818a83975e33c826f851c4dc74c8b7902efc584edb373314d095',
    upSql: checkHistoryDetailIndexSql
  },
  {
    version: '0.14',
    name: 'instance check history retention index',
    checksum: 'd96e12e58cb7cc3a00f2daf3b9336fe4de9326531ccfba4be86d7bb39e3f666a',
    upSql: checkHistoryRetentionIndexSql
  },
  {
    version: '0.15',
    name: 'issue classification catalog',
    checksum: '0d54ae1077b9b48c87a3c5188c4b2acafc36b4a0fa6f83b319e717bac8b2378c',
    upSql: issueClassificationCatalogSql
  },
  {
    version: '0.16',
    name: 'role permission catalog assignments',
    checksum: '32f2ea9cf2621d6770a5fbd63122a1ae2906661762d2fb9433635b4419f3f16c',
    upSql: rolePermissionsSchemaSql
  },
  {
    version: '0.17',
    name: 'performance indexes for activity dashboards',
    checksum: '2610b56bd2335f469dfacaef0c1e85a1ea81f0df1cd7075eaecae0c3de0ad013',
    upSql: performanceIndexesSql
  },
  {
    version: '0.18',
    name: 'license expiring soon issue type',
    checksum: 'f7d973dc9841ab00524e62bc210ea01a0daaa2e974e1d6f81871c1377042839e',
    upSql: licenseExpiringSoonIssueTypeSql
  },
  {
    version: '0.19',
    name: 'ssl expiring soon issue type',
    checksum: 'bed21d29aee398b6bbce1afdca389ad03f6a15fdddd7e90edf74ad2766396c0f',
    upSql: sslExpiringSoonIssueTypeSql
  },
  {
    version: '0.20',
    name: 'queue job permissions',
    checksum: '7308402be9fd8b384c80e020d1dffae160a96768591fb6b0b32db8136ec3a671',
    upSql: jobPermissionsSql
  },
  {
    version: '0.21',
    name: 'processing errors permissions',
    checksum: '7f57f9501bc10c243ffef341e2d5b4d2c7fc86efc19e130e5e2452ef9d7a88d9',
    upSql: processingErrorsPermissionsSql
  }
];
