-- Update: Login, Gedankenart, Status, feste Kategorien
-- Einmalig in phpMyAdmin (KAS) in der Datenbank der App ausführen.
-- Vorher am besten ein Backup der Tabelle "thoughts" exportieren.

-- 1) Neue Spalten für Art und Status
ALTER TABLE thoughts
    ADD COLUMN `type` VARCHAR(20) NOT NULL DEFAULT 'Notiz',
    ADD COLUMN status VARCHAR(30) NULL DEFAULT NULL;

-- 2) Alte Gedanken: Kategorie "Sonstiges" (Art ist durch Standard "Notiz")
UPDATE thoughts SET category = 'Sonstiges';

-- 3) Angemeldete Geräte
CREATE TABLE IF NOT EXISTS sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    token_hash CHAR(64) NOT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_used_at DATETIME NOT NULL,
    expires_at DATETIME NOT NULL
);

-- 4) Fehlversuche beim Login (Sperre nach 5 Fehlversuchen / 15 Min.)
CREATE TABLE IF NOT EXISTS login_attempts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ip VARCHAR(45) NOT NULL,
    attempted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX (ip, attempted_at)
);

-- Hinweis: Die alte Tabelle "categories" wird nicht mehr benutzt.
-- Sie kann bleiben oder später mit  DROP TABLE categories;  gelöscht werden.

-- 5) App-Einstellungen (Passwort wird beim ersten Öffnen der App festgelegt)
CREATE TABLE IF NOT EXISTS app_settings (
    name VARCHAR(50) PRIMARY KEY,
    value TEXT NOT NULL
);
