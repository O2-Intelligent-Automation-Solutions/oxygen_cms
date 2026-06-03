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
  UNIQUE KEY uq_oxygen_instances_name (name),
  KEY idx_oxygen_instances_group (group_id),
  KEY idx_oxygen_instances_status (status),
  CONSTRAINT fk_oxygen_instances_group FOREIGN KEY (group_id) REFERENCES user_groups(id) ON DELETE RESTRICT
);
`;

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
  }
];
