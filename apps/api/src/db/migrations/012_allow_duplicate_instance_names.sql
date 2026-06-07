SET @drop_instance_name_index_sql = (
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
DEALLOCATE PREPARE drop_instance_name_index_stmt;
