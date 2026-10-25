CREATE DATABASE IF NOT EXISTS ctx_e2e_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;
CREATE DATABASE IF NOT EXISTS ctx_migration_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;
CREATE DATABASE IF NOT EXISTS ctx_restore_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;
GRANT ALL PRIVILEGES ON ctx_e2e_test.* TO 'ctx_test'@'%';
GRANT ALL PRIVILEGES ON ctx_migration_test.* TO 'ctx_test'@'%';
GRANT ALL PRIVILEGES ON ctx_restore_test.* TO 'ctx_test'@'%';
