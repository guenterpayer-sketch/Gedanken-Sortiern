<?php
// Diese Datei als 'config.php' auf den Server kopieren und mit echten Werten befüllen.
// config.php wird NICHT in Git eingecheckt.

define('DB_HOST', 'localhost');
define('DB_NAME', 'dein-datenbankname');
define('DB_USER', 'dein-datenbankbenutzer');
define('DB_PASS', 'dein-datenbankpasswort');

define('MISTRAL_API_KEY', 'dein-mistral-api-key');

// Optional: Mistral-Modell (Standard: mistral-medium)
// define('MISTRAL_MODEL', 'mistral-medium');

// --- Login (optional) ---
// Normalerweise NICHT nötig: Das Passwort wird beim ersten Öffnen der App
// auf der Login-Seite festgelegt und als Hash in der Datenbank gespeichert.
// Nur falls du es lieber hier festlegen willst (hat dann Vorrang):
// define('LOGIN_PASSWORD', 'dein-app-passwort');
