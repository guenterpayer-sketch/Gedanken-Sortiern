<?php
header('Content-Type: application/json');

// Datenbankverbindung
$host = 'localhost';
$dbname = 'd0477c5b'; // Ersetze mit deinem Datenbanknamen
$user = 'd0477c5b'; // Ersetze mit deinem MySQL-Benutzernamen
$pass = '***REMOVED-PASSWORD***'; // Ersetze mit deinem MySQL-Passwort

try {
    $pdo = new PDO("mysql:host=$host;dbname=$dbname", $user, $pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch (PDOException $e) {
    die(json_encode(['error' => 'Datenbankfehler: ' . $e->getMessage()]));
}

// Aktion abrufen
$action = $_GET['action'] ?? $_POST['action'] ?? '';

// --- Mistral API-Funktion ---
function callMistralAPI($text) {
    $apiKey = '***REMOVED-API-KEY***'; // 👈 Hier deinen API-Key eintragen!

    $url = 'https://api.mistral.ai/v1/chat/completions';
    $data = [
        'model' => 'mistral-medium',
        'messages' => [
            [
                'role' => 'user',
                'content' => "Analysiere diesen Gedanken und gib das Ergebnis als JSON zurück mit den Feldern: category, priority, emotion. Gedanken: '$text'. Antworte nur mit dem JSON-Objekt, ohne zusätzliche Erklärungen."
            ]
        ],
        'temperature' => 0.1, // Niedrige Temperatur für deterministischere Ergebnisse
    ];

    $options = [
        'http' => [
            'header' => "Content-Type: application/json\r\nAuthorization: Bearer $apiKey",
            'method' => 'POST',
            'content' => json_encode($data),
            'timeout' => 10 // Timeout in Sekunden
        ]
    ];

    $context = stream_context_create($options);
    $response = @file_get_contents($url, false, $context);

    if ($response === false) {
        return ['category' => 'Unkategorisiert', 'priority' => 'Mittel', 'emotion' => null];
    }

    $result = json_decode($response, true);
    if (isset($result['choices'][0]['message']['content'])) {
        $content = $result['choices'][0]['message']['content'];
        // Extrahiere das JSON-Objekt aus der Antwort (falls Mistral z. B. Markdown zurückgibt)
        if (preg_match('/\{.*\}/s', $content, $matches)) {
            return json_decode($matches[0], true);
        }
        return json_decode($content, true);
    }

    // Fallback, falls die API nicht antwortet
    return ['category' => 'Unkategorisiert', 'priority' => 'Mittel', 'emotion' => null];
}

// --- Gedanken hinzufügen (POST) ---
if ($_SERVER['REQUEST_METHOD'] === 'POST' && !$action) {
    $input = json_decode(file_get_contents('php://input'), true);
    $text = $input['text'] ?? '';

    if (!$text) {
        echo json_encode(['error' => 'Kein Text angegeben']);
        exit;
    }

    // 👇 Hier wird die Mistral API aufgerufen
    $analysis = callMistralAPI($text);
    $category = $analysis['category'] ?? 'Unkategorisiert';
    $priority = $analysis['priority'] ?? 'Mittel';
    $emotion = $analysis['emotion'] ?? null;

    // Kategorie in Datenbank speichern (falls neu)
    $stmt = $pdo->prepare("INSERT IGNORE INTO categories (name) VALUES (?)");
    $stmt->execute([$category]);

    // Gedanken speichern
    $stmt = $pdo->prepare("INSERT INTO thoughts (text, category, priority, emotion) VALUES (?, ?, ?, ?)");
    $stmt->execute([$text, $category, $priority, $emotion]);

    echo json_encode([
        'text' => $text,
        'category' => $category,
        'priority' => $priority,
        'emotion' => $emotion
    ]);
    exit;
}

// --- Gedanken nach Kategorie abrufen ---
if ($action === 'getThoughtsByCategory') {
    $category = $_GET['category'] ?? '';
    if ($category) {
        $stmt = $pdo->prepare("SELECT * FROM thoughts WHERE category = ? ORDER BY created_at DESC");
        $stmt->execute([$category]);
    } else {
        $stmt = $pdo->query("SELECT * FROM thoughts ORDER BY created_at DESC");
    }
    $thoughts = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo json_encode($thoughts);
    exit;
}

// --- Alle Gedanken abrufen (fürs initiale Laden) ---
if ($action === 'getThoughts') {
    $stmt = $pdo->query("SELECT * FROM thoughts ORDER BY created_at DESC");
    $thoughts = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo json_encode($thoughts);
    exit;
}
// Standardantwort
echo json_encode(['error' => 'Unbekannte Aktion']);
?>