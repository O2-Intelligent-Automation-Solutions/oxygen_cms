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
