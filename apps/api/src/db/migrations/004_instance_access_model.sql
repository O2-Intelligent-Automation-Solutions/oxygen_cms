-- OxyGen CMS schema migration 004 / version 0.04
-- Correct instance access ownership: instances are neutral resources;
-- users and user groups grant access to all, none, or specific instances.

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
