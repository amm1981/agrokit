CREATE DATABASE IF NOT EXISTS agrokit CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE agrokit;

DROP TABLE IF EXISTS delivery_evidences;
DROP TABLE IF EXISTS delivery_items;
DROP TABLE IF EXISTS deliveries;
DROP TABLE IF EXISTS product_sector_stocks;
DROP TABLE IF EXISTS product_stocks;
DROP TABLE IF EXISTS event_kit_products;
DROP TABLE IF EXISTS event_kits;
DROP TABLE IF EXISTS event_beneficiaries;
DROP TABLE IF EXISTS user_event_sectors;
DROP TABLE IF EXISTS app_users;
DROP TABLE IF EXISTS workers;
DROP TABLE IF EXISTS gerencias;
DROP TABLE IF EXISTS event_sectors;
DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS sectors;

-- Limpieza de tablas legadas del modelo anterior.
DROP TABLE IF EXISTS settings_delivery_window;
DROP TABLE IF EXISTS kits;

CREATE TABLE IF NOT EXISTS sectors (
  id VARCHAR(60) NOT NULL,
  name VARCHAR(120) NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sectors_name (name)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS events (
  id VARCHAR(60) NOT NULL,
  name VARCHAR(160) NOT NULL,
  start_at DATE NOT NULL,
  end_at DATE NOT NULL,
  status ENUM('draft','published','closed','archived') NOT NULL DEFAULT 'published',
  updated_by VARCHAR(200) NOT NULL DEFAULT 'system',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_events_window (start_at, end_at),
  KEY idx_events_status (status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS gerencias (
  name VARCHAR(120) NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (name)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS event_sectors (
  event_id VARCHAR(60) NOT NULL,
  sector_id VARCHAR(60) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (event_id, sector_id),
  CONSTRAINT fk_event_sectors_event
    FOREIGN KEY (event_id)
    REFERENCES events (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_event_sectors_sector
    FOREIGN KEY (sector_id)
    REFERENCES sectors (id)
    ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS workers (
  dni VARCHAR(20) NOT NULL,
  nombre_completo VARCHAR(200) NOT NULL,
  area VARCHAR(120) NOT NULL DEFAULT '',
  centro_costo VARCHAR(120) NOT NULL,
  sector_id VARCHAR(60) NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (dni),
  KEY idx_workers_gerencia (centro_costo),
  KEY idx_workers_sector (sector_id),
  CONSTRAINT fk_workers_gerencia
    FOREIGN KEY (centro_costo)
    REFERENCES gerencias (name)
    ON DELETE RESTRICT,
  CONSTRAINT fk_workers_sector
    FOREIGN KEY (sector_id)
    REFERENCES sectors (id)
    ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS app_users (
  email VARCHAR(200) NOT NULL,
  password VARCHAR(120) NOT NULL,
  full_name VARCHAR(200) NOT NULL DEFAULT '',
  assigned_pda_id VARCHAR(120) NOT NULL DEFAULT '',
  role ENUM('admin','pda') NOT NULL DEFAULT 'pda',
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (email)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS web_roles (
  code VARCHAR(80) NOT NULL,
  name VARCHAR(160) NOT NULL,
  description VARCHAR(255) NOT NULL DEFAULT '',
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (code)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS web_role_permissions (
  role_code VARCHAR(80) NOT NULL,
  module_key VARCHAR(80) NOT NULL,
  can_view TINYINT(1) NOT NULL DEFAULT 0,
  can_create TINYINT(1) NOT NULL DEFAULT 0,
  can_edit TINYINT(1) NOT NULL DEFAULT 0,
  can_delete TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (role_code, module_key),
  CONSTRAINT fk_web_role_permissions_role
    FOREIGN KEY (role_code)
    REFERENCES web_roles (code)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS web_user_roles (
  user_email VARCHAR(200) NOT NULL,
  role_code VARCHAR(80) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_email, role_code),
  KEY fk_web_user_roles_role (role_code),
  CONSTRAINT fk_web_user_roles_user
    FOREIGN KEY (user_email)
    REFERENCES app_users (email)
    ON DELETE CASCADE,
  CONSTRAINT fk_web_user_roles_role
    FOREIGN KEY (role_code)
    REFERENCES web_roles (code)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS web_user_permissions (
  user_email VARCHAR(200) NOT NULL,
  module_key VARCHAR(80) NOT NULL,
  can_view TINYINT(1) NOT NULL DEFAULT 0,
  can_create TINYINT(1) NOT NULL DEFAULT 0,
  can_edit TINYINT(1) NOT NULL DEFAULT 0,
  can_delete TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_email, module_key),
  CONSTRAINT fk_web_user_permissions_user
    FOREIGN KEY (user_email)
    REFERENCES app_users (email)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_event_sectors (
  id BIGINT NOT NULL AUTO_INCREMENT,
  user_email VARCHAR(200) NOT NULL,
  event_id VARCHAR(60) NOT NULL,
  sector_id VARCHAR(60) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_event_sector (user_email, event_id, sector_id),
  KEY idx_user_event_sectors_user_event (user_email, event_id),
  CONSTRAINT fk_user_event_sectors_user
    FOREIGN KEY (user_email)
    REFERENCES app_users (email)
    ON DELETE CASCADE,
  CONSTRAINT fk_user_event_sectors_event
    FOREIGN KEY (event_id)
    REFERENCES events (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_user_event_sectors_sector
    FOREIGN KEY (sector_id)
    REFERENCES sectors (id)
    ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS event_beneficiaries (
  id BIGINT NOT NULL AUTO_INCREMENT,
  event_id VARCHAR(60) NOT NULL,
  worker_dni VARCHAR(20) NOT NULL,
  sector_id VARCHAR(60) NOT NULL,
  status ENUM('active','excluded') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_event_worker (event_id, worker_dni),
  KEY idx_event_beneficiaries_sector (event_id, sector_id),
  CONSTRAINT fk_event_beneficiaries_event
    FOREIGN KEY (event_id)
    REFERENCES events (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_event_beneficiaries_worker
    FOREIGN KEY (worker_dni)
    REFERENCES workers (dni)
    ON DELETE CASCADE,
  CONSTRAINT fk_event_beneficiaries_sector
    FOREIGN KEY (sector_id)
    REFERENCES sectors (id)
    ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS event_kits (
  id BIGINT NOT NULL AUTO_INCREMENT,
  event_id VARCHAR(60) NOT NULL,
  code VARCHAR(60) NOT NULL,
  name VARCHAR(160) NOT NULL,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_event_kit_code (event_id, code),
  KEY idx_event_kits_event (event_id),
  CONSTRAINT fk_event_kits_event
    FOREIGN KEY (event_id)
    REFERENCES events (id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS event_kit_products (
  id BIGINT NOT NULL AUTO_INCREMENT,
  event_id VARCHAR(60) NOT NULL,
  kit_code VARCHAR(60) NOT NULL,
  product_code VARCHAR(80) NOT NULL,
  product_name VARCHAR(180) NOT NULL,
  quantity DECIMAL(10,2) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_event_kit_product (event_id, kit_code, product_code),
  CONSTRAINT fk_event_kit_products_kit
    FOREIGN KEY (event_id, kit_code)
    REFERENCES event_kits (event_id, code)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS deliveries (
  id VARCHAR(80) NOT NULL,
  event_id VARCHAR(60) NOT NULL,
  worker_dni VARCHAR(20) NOT NULL,
  sector_id VARCHAR(60) NOT NULL,
  kit_ids_json LONGTEXT NOT NULL,
  product_items_json LONGTEXT NOT NULL,
  event_timestamp BIGINT NOT NULL,
  photo_path VARCHAR(500) NOT NULL DEFAULT '',
  pda_id VARCHAR(120) NOT NULL DEFAULT '',
  user_email VARCHAR(200) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_deliveries_event (event_id, event_timestamp),
  KEY idx_deliveries_worker (event_id, worker_dni),
  KEY idx_deliveries_sector (event_id, sector_id),
  CONSTRAINT fk_deliveries_event
    FOREIGN KEY (event_id)
    REFERENCES events (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_deliveries_worker
    FOREIGN KEY (worker_dni)
    REFERENCES workers (dni)
    ON DELETE RESTRICT,
  CONSTRAINT fk_deliveries_sector
    FOREIGN KEY (sector_id)
    REFERENCES sectors (id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_deliveries_user
    FOREIGN KEY (user_email)
    REFERENCES app_users (email)
    ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS product_stocks (
  event_id VARCHAR(60) NOT NULL,
  product_code VARCHAR(80) NOT NULL,
  stock_quantity DECIMAL(12,2) NOT NULL DEFAULT 0,
  updated_by VARCHAR(200) NOT NULL DEFAULT '',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (event_id, product_code),
  CONSTRAINT fk_product_stocks_event
    FOREIGN KEY (event_id)
    REFERENCES events (id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS product_sector_stocks (
  event_id VARCHAR(60) NOT NULL,
  product_code VARCHAR(80) NOT NULL,
  sector_id VARCHAR(60) NOT NULL,
  stock_quantity DECIMAL(12,2) NOT NULL DEFAULT 0,
  updated_by VARCHAR(200) NOT NULL DEFAULT '',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (event_id, product_code, sector_id),
  KEY idx_product_sector_stocks_sector (event_id, sector_id),
  CONSTRAINT fk_product_sector_stocks_event
    FOREIGN KEY (event_id)
    REFERENCES events (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_product_sector_stocks_sector
    FOREIGN KEY (sector_id)
    REFERENCES sectors (id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS delivery_items (
  id BIGINT NOT NULL AUTO_INCREMENT,
  delivery_id VARCHAR(80) NOT NULL,
  event_id VARCHAR(60) NOT NULL,
  kit_code VARCHAR(60) NOT NULL,
  product_code VARCHAR(80) NOT NULL,
  product_name VARCHAR(180) NOT NULL,
  quantity DECIMAL(10,2) NOT NULL DEFAULT 1,
  delivered TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_delivery_item (delivery_id, kit_code, product_code),
  KEY idx_delivery_items_event (event_id),
  CONSTRAINT fk_delivery_items_delivery
    FOREIGN KEY (delivery_id)
    REFERENCES deliveries (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_delivery_items_event
    FOREIGN KEY (event_id)
    REFERENCES events (id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS delivery_evidences (
  id BIGINT NOT NULL AUTO_INCREMENT,
  delivery_id VARCHAR(80) NOT NULL,
  storage_path VARCHAR(500) NOT NULL,
  public_url VARCHAR(500) NOT NULL,
  mime_type VARCHAR(120) NOT NULL,
  size_bytes BIGINT NOT NULL,
  sha256 CHAR(64) NOT NULL,
  uploaded_by VARCHAR(200) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_delivery_evidences_delivery (delivery_id),
  CONSTRAINT fk_delivery_evidences_delivery
    FOREIGN KEY (delivery_id)
    REFERENCES deliveries (id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

INSERT INTO sectors (id, name, active)
VALUES
  ('calera_i', 'Calera I', 1),
  ('calera_ii', 'Calera II', 1),
  ('pisco', 'Pisco', 1),
  ('san_gabriel', 'San Gabriel', 1)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  active = VALUES(active);

INSERT INTO gerencias (name, active)
VALUES
  ('Gerencia Administrativa', 1),
  ('Gerencia General', 1),
  ('Gerencia Cítrico', 1),
  ('Gerencia Palto', 1)
ON DUPLICATE KEY UPDATE
  active = VALUES(active);

INSERT INTO events (id, name, start_at, end_at, status, updated_by)
VALUES
  ('evento_2026_trabajador', 'Dia del Trabajador 2026', '2026-04-01', '2026-05-31', 'published', 'system')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  start_at = VALUES(start_at),
  end_at = VALUES(end_at),
  status = VALUES(status),
  updated_by = VALUES(updated_by);

INSERT INTO event_sectors (event_id, sector_id)
SELECT 'evento_2026_trabajador', s.id
FROM sectors s
ON DUPLICATE KEY UPDATE
  event_id = VALUES(event_id);

INSERT INTO app_users (email, password, full_name, assigned_pda_id, role, active)
VALUES
  ('admin@gmail.com', 'admin123456', 'Administrador AgroKit', 'ADMIN_WEB', 'admin', 1),
  ('pda.calera1@gmail.com', 'pda123456', 'PDA Calera I', 'PDA_CALERA_1', 'pda', 1)
ON DUPLICATE KEY UPDATE
  full_name = VALUES(full_name),
  assigned_pda_id = VALUES(assigned_pda_id),
  role = VALUES(role),
  active = VALUES(active);

INSERT INTO web_roles (code, name, description, active)
VALUES ('super_admin', 'Super Admin', 'Acceso completo al panel web', 1)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  active = VALUES(active);

INSERT INTO web_role_permissions (role_code, module_key, can_view, can_create, can_edit, can_delete)
VALUES
  ('super_admin', 'dashboard', 1, 1, 1, 1),
  ('super_admin', 'eventos', 1, 1, 1, 1),
  ('super_admin', 'beneficiarios', 1, 1, 1, 1),
  ('super_admin', 'entregas', 1, 1, 1, 1),
  ('super_admin', 'trabajadores', 1, 1, 1, 1),
  ('super_admin', 'kits', 1, 1, 1, 1),
  ('super_admin', 'maestros', 1, 1, 1, 1),
  ('super_admin', 'usuarios_pda', 1, 1, 1, 1),
  ('super_admin', 'usuarios_web', 1, 1, 1, 1)
ON DUPLICATE KEY UPDATE
  can_view = VALUES(can_view),
  can_create = VALUES(can_create),
  can_edit = VALUES(can_edit),
  can_delete = VALUES(can_delete);

INSERT INTO web_user_roles (user_email, role_code)
SELECT email, 'super_admin'
FROM app_users
WHERE role = 'admin'
  AND active = 1
ON DUPLICATE KEY UPDATE
  user_email = VALUES(user_email);

INSERT INTO user_event_sectors (user_email, event_id, sector_id)
SELECT 'admin@gmail.com', 'evento_2026_trabajador', s.id
FROM sectors s
ON DUPLICATE KEY UPDATE
  user_email = VALUES(user_email);

INSERT INTO user_event_sectors (user_email, event_id, sector_id)
VALUES ('pda.calera1@gmail.com', 'evento_2026_trabajador', 'calera_i')
ON DUPLICATE KEY UPDATE
  user_email = VALUES(user_email);
