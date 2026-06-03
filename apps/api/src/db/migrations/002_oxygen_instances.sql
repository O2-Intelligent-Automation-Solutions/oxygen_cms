-- OxyGen CMS schema migration 002 / version 0.02
-- Persist enrolled remote OxyGen instances.

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
