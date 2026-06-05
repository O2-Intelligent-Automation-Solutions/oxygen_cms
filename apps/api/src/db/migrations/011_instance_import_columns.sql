ALTER TABLE oxygen_instances
  ADD COLUMN check_license TINYINT(1) NOT NULL DEFAULT 1 AFTER is_enabled,
  ADD COLUMN archived TINYINT(1) NOT NULL DEFAULT 0 AFTER check_license,
  ADD COLUMN metadata_json JSON NULL AFTER archived,
  ADD COLUMN notes LONGTEXT NULL AFTER metadata_json,
  ADD KEY idx_oxygen_instances_archived (archived);
