-- Migracion segura para habilitar roles/perfiles web en produccion.
-- No ejecutar los dumps completos de localhost en produccion.
-- Este script no toca eventos, entregas, trabajadores, beneficiarios ni stock.

START TRANSACTION;

CREATE TABLE IF NOT EXISTS `web_roles` (
  `code` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(160) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `web_role_permissions` (
  `role_code` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `module_key` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `can_view` tinyint(1) NOT NULL DEFAULT '0',
  `can_create` tinyint(1) NOT NULL DEFAULT '0',
  `can_edit` tinyint(1) NOT NULL DEFAULT '0',
  `can_delete` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`role_code`,`module_key`),
  CONSTRAINT `fk_web_role_permissions_role`
    FOREIGN KEY (`role_code`) REFERENCES `web_roles` (`code`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `web_user_roles` (
  `user_email` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `role_code` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_email`,`role_code`),
  KEY `fk_web_user_roles_role` (`role_code`),
  CONSTRAINT `fk_web_user_roles_user`
    FOREIGN KEY (`user_email`) REFERENCES `app_users` (`email`)
    ON DELETE CASCADE,
  CONSTRAINT `fk_web_user_roles_role`
    FOREIGN KEY (`role_code`) REFERENCES `web_roles` (`code`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `web_user_permissions` (
  `user_email` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `module_key` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `can_view` tinyint(1) NOT NULL DEFAULT '0',
  `can_create` tinyint(1) NOT NULL DEFAULT '0',
  `can_edit` tinyint(1) NOT NULL DEFAULT '0',
  `can_delete` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_email`,`module_key`),
  CONSTRAINT `fk_web_user_permissions_user`
    FOREIGN KEY (`user_email`) REFERENCES `app_users` (`email`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `web_roles` (`code`, `name`, `description`, `active`)
VALUES ('super_admin', 'Super Admin', 'Acceso completo al panel web', 1)
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `description` = VALUES(`description`),
  `active` = VALUES(`active`),
  `updated_at` = CURRENT_TIMESTAMP;

INSERT INTO `web_role_permissions` (`role_code`, `module_key`, `can_view`, `can_create`, `can_edit`, `can_delete`)
VALUES
  ('super_admin', 'dashboard', 1, 1, 1, 1),
  ('super_admin', 'eventos', 1, 1, 1, 1),
  ('super_admin', 'beneficiarios', 1, 1, 1, 1),
  ('super_admin', 'entregas', 1, 1, 1, 1),
  ('super_admin', 'trabajadores', 1, 1, 1, 1),
  ('super_admin', 'kits', 1, 1, 1, 1),
  ('super_admin', 'usuarios_pda', 1, 1, 1, 1),
  ('super_admin', 'usuarios_web', 1, 1, 1, 1)
ON DUPLICATE KEY UPDATE
  `can_view` = VALUES(`can_view`),
  `can_create` = VALUES(`can_create`),
  `can_edit` = VALUES(`can_edit`),
  `can_delete` = VALUES(`can_delete`),
  `updated_at` = CURRENT_TIMESTAMP;

INSERT INTO `web_user_roles` (`user_email`, `role_code`)
SELECT `email`, 'super_admin'
FROM `app_users`
WHERE `role` = 'admin'
  AND `active` = 1
ON DUPLICATE KEY UPDATE
  `user_email` = VALUES(`user_email`);

COMMIT;

