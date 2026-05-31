-- Milestone 1: Local authentication, roles, and group-scoped access.
-- Target database: MySQL 8+

CREATE TABLE cms_roles (
  id CHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(64) NOT NULL UNIQUE,
  description VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
);

CREATE TABLE cms_users (
  id CHAR(36) NOT NULL PRIMARY KEY,
  email VARCHAR(320) NOT NULL UNIQUE,
  display_name VARCHAR(160) NOT NULL,
  password_hash VARCHAR(256) NOT NULL,
  password_salt VARCHAR(64) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_cms_users_email (email),
  INDEX idx_cms_users_is_active (is_active)
);

CREATE TABLE cms_groups (
  id CHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(160) NOT NULL UNIQUE,
  description VARCHAR(500) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_cms_groups_name (name)
);

CREATE TABLE cms_user_roles (
  user_id CHAR(36) NOT NULL,
  role_id CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, role_id),
  CONSTRAINT fk_cms_user_roles_user FOREIGN KEY (user_id) REFERENCES cms_users(id) ON DELETE CASCADE,
  CONSTRAINT fk_cms_user_roles_role FOREIGN KEY (role_id) REFERENCES cms_roles(id) ON DELETE RESTRICT
);

CREATE TABLE cms_user_groups (
  user_id CHAR(36) NOT NULL,
  group_id CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, group_id),
  CONSTRAINT fk_cms_user_groups_user FOREIGN KEY (user_id) REFERENCES cms_users(id) ON DELETE CASCADE,
  CONSTRAINT fk_cms_user_groups_group FOREIGN KEY (group_id) REFERENCES cms_groups(id) ON DELETE CASCADE
);

CREATE TABLE cms_sessions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  token_hash VARCHAR(128) NOT NULL UNIQUE,
  expires_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  revoked_at DATETIME(3) NULL,
  INDEX idx_cms_sessions_user_id (user_id),
  INDEX idx_cms_sessions_expires_at (expires_at),
  CONSTRAINT fk_cms_sessions_user FOREIGN KEY (user_id) REFERENCES cms_users(id) ON DELETE CASCADE
);

INSERT INTO cms_roles (id, name, description) VALUES
  (UUID(), 'SystemAdmin', 'Full CMS administration, including users, roles, groups, and system configuration.'),
  (UUID(), 'PartnerAdmin', 'Partner/customer administration within assigned groups.'),
  (UUID(), 'Operator', 'Operational monitoring and read-only workflow visibility within assigned groups.'),
  (UUID(), 'Viewer', 'Read-only dashboard visibility within assigned groups.');
