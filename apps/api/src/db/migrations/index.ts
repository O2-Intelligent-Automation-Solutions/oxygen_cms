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


const applicationLogsEntityGuidSql = `ALTER TABLE application_logs
  ADD COLUMN entity_guid CHAR(36) NULL AFTER user_name,
  ADD KEY idx_application_logs_entity_guid (entity_guid);`;

const applicationLogsTenantIdSql = `ALTER TABLE application_logs
  ADD COLUMN tenant_id CHAR(36) NULL AFTER entity_guid,
  ADD KEY idx_application_logs_tenant_id (tenant_id),
  ADD KEY idx_application_logs_tenant_entity (tenant_id, entity_guid);`;

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
  }
];
