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

// --- Login ---
// Variante 1 (einfach): Passwort im Klartext. config.php wird vom Server
// nur ausgeführt, nie ausgeliefert, und liegt nicht in Git.
define('LOGIN_PASSWORD', 'dein-app-passwort');

// Variante 2 (sicherer): nur den Hash hinterlegen und LOGIN_PASSWORD oben
// leer lassen bzw. löschen. Hash erzeugen z. B. mit:
//   php -r "echo password_hash('dein-app-passwort', PASSWORD_DEFAULT);"
// Ist LOGIN_PASSWORD_HASH gesetzt, hat es Vorrang.
// define('LOGIN_PASSWORD_HASH', '');
