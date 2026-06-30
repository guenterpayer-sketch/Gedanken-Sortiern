<?php
header('Content-Type: application/json');

// Konfiguration laden (liegt nur auf dem Server, nicht in Git)
$configFile = __DIR__ . '/config.php';
if (!file_exists($configFile)) {
    die(json_encode(['error' => 'config.php fehlt. Bitte config.example.php kopieren und befüllen.']));
}
require_once $configFile;

// Datenbankverbindung
try {
    $pdo = new PDO("mysql:host=" . DB_HOST . ";dbname=" . DB_NAME, DB_USER, DB_PASS);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch (PDOException $e) {
    die(json_encode(['error' => 'Datenbankfehler: ' . $e->getMessage()]));
}

$action = $_GET['action'] ?? $_POST['action'] ?? '';

// --- Generischer Mistral-Aufruf ---
function callMistralChat($prompt, $temperature = 0.3) {
    $url = 'https://api.mistral.ai/v1/chat/completions';
    $data = [
        'model' => 'mistral-medium',
        'messages' => [
            ['role' => 'user', 'content' => $prompt]
        ],
        'temperature' => $temperature,
    ];

    $options = [
        'http' => [
            'header' => "Content-Type: application/json\r\nAuthorization: Bearer " . MISTRAL_API_KEY,
            'method' => 'POST',
            'content' => json_encode($data),
            'timeout' => 30
        ]
    ];

    $context = stream_context_create($options);
    $response = @file_get_contents($url, false, $context);

    if ($response === false) {
        return null;
    }

    $result = json_decode($response, true);
    return $result['choices'][0]['message']['content'] ?? null;
}

// --- Mistral: Gedanken analysieren ---
function callMistralAPI($text) {
    $prompt = "Analysiere diesen Gedanken und gib das Ergebnis als JSON zurück mit den Feldern: category, priority, emotion. Gedanken: '$text'. Antworte nur mit dem JSON-Objekt, ohne zusätzliche Erklärungen.";
    $content = callMistralChat($prompt, 0.1);

    if ($content === null) {
        return ['category' => 'Unkategorisiert', 'priority' => 'Mittel', 'emotion' => 'neutral'];
    }

    if (preg_match('/\{.*\}/s', $content, $matches)) {
        $parsed = json_decode($matches[0], true);
        if ($parsed) return $parsed;
    }
    $parsed = json_decode($content, true);
    return $parsed ?: ['category' => 'Unkategorisiert', 'priority' => 'Mittel', 'emotion' => 'neutral'];
}

// --- Gedanken hinzufügen (POST) ---
if ($_SERVER['REQUEST_METHOD'] === 'POST' && !$action) {
    $input = json_decode(file_get_contents('php://input'), true);
    $text = $input['text'] ?? '';

    if (!$text) {
        echo json_encode(['error' => 'Kein Text angegeben']);
        exit;
    }

    $analysis = callMistralAPI($text);
    $category = $analysis['category'] ?? 'Unkategorisiert';
    $priority = $analysis['priority'] ?? 'Mittel';
    $emotion = $analysis['emotion'] ?? 'neutral';

    $stmt = $pdo->prepare("INSERT IGNORE INTO categories (name) VALUES (?)");
    $stmt->execute([$category]);

    $stmt = $pdo->prepare("INSERT INTO thoughts (text, category, priority, emotion) VALUES (?, ?, ?, ?)");
    $stmt->execute([$text, $category, $priority, $emotion]);

    $id = $pdo->lastInsertId();
    $stmt = $pdo->prepare("SELECT * FROM thoughts WHERE id = ?");
    $stmt->execute([$id]);
    $thought = $stmt->fetch(PDO::FETCH_ASSOC);

    echo json_encode($thought);
    exit;
}

// --- Alle Gedanken abrufen ---
if ($action === 'getThoughts') {
    $stmt = $pdo->query("SELECT * FROM thoughts ORDER BY created_at DESC");
    $thoughts = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo json_encode($thoughts);
    exit;
}

// --- Gedanken löschen ---
if ($action === 'deleteThought' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $id = $input['id'] ?? null;

    if (!$id) {
        echo json_encode(['error' => 'Keine ID angegeben']);
        exit;
    }

    $stmt = $pdo->prepare("DELETE FROM thoughts WHERE id = ?");
    $stmt->execute([$id]);

    echo json_encode(['success' => true, 'id' => $id]);
    exit;
}

// --- Gedanken bearbeiten ---
if ($action === 'updateThought' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $id = $input['id'] ?? null;
    $text = $input['text'] ?? '';

    if (!$id || !$text) {
        echo json_encode(['error' => 'ID oder Text fehlt']);
        exit;
    }

    $stmt = $pdo->prepare("UPDATE thoughts SET text = ? WHERE id = ?");
    $stmt->execute([$text, $id]);

    $stmt = $pdo->prepare("SELECT * FROM thoughts WHERE id = ?");
    $stmt->execute([$id]);
    $thought = $stmt->fetch(PDO::FETCH_ASSOC);

    echo json_encode($thought);
    exit;
}

// --- Wochenrückblick (Mistral fasst die letzten 7 Tage zusammen) ---
if ($action === 'weeklySummary') {
    $stmt = $pdo->query("SELECT text, category, priority, emotion FROM thoughts WHERE created_at >= NOW() - INTERVAL 7 DAY ORDER BY created_at ASC");
    $thoughts = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (!$thoughts) {
        echo json_encode(['summary' => 'Keine Gedanken in den letzten 7 Tagen gefunden.']);
        exit;
    }

    $list = implode("\n", array_map(fn($t) => "- {$t['text']} (Kategorie: {$t['category']}, Emotion: {$t['emotion']}, Priorität: {$t['priority']})", $thoughts));
    $prompt = "Hier sind Gedanken der letzten 7 Tage einer Person:\n\n$list\n\nErstelle einen kurzen, einfühlsamen Wochenrückblick (max. 150 Wörter) auf Deutsch: Was waren die Hauptthemen? Wie war die emotionale Tendenz? Gibt es etwas Auffälliges? Antworte als Fließtext, ohne JSON.";

    $summary = callMistralChat($prompt, 0.4);
    echo json_encode(['summary' => $summary ?? 'Zusammenfassung konnte nicht erstellt werden.']);
    exit;
}

// --- Muster erkennen (wiederkehrende Themen über mehrere Gedanken) ---
if ($action === 'findPatterns') {
    $stmt = $pdo->query("SELECT text, category, priority, emotion FROM thoughts ORDER BY created_at DESC LIMIT 50");
    $thoughts = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (count($thoughts) < 3) {
        echo json_encode(['patterns' => 'Noch zu wenige Gedanken für eine Mustererkennung. Füge mehr Gedanken hinzu.']);
        exit;
    }

    $list = implode("\n", array_map(fn($t) => "- {$t['text']} (Kategorie: {$t['category']}, Emotion: {$t['emotion']})", $thoughts));
    $prompt = "Hier sind die letzten Gedanken einer Person:\n\n$list\n\nErkenne wiederkehrende Themen, Muster oder Zusammenhänge zwischen diesen Gedanken (max. 150 Wörter, Deutsch). Nenne konkrete Beispiele aus den Gedanken. Antworte als Fließtext, ohne JSON.";

    $patterns = callMistralChat($prompt, 0.4);
    echo json_encode(['patterns' => $patterns ?? 'Muster konnten nicht erkannt werden.']);
    exit;
}

// --- Kategorien abrufen ---
if ($action === 'getCategories') {
    $stmt = $pdo->query("SELECT DISTINCT category FROM thoughts WHERE category IS NOT NULL ORDER BY category ASC");
    $categories = $stmt->fetchAll(PDO::FETCH_COLUMN);
    echo json_encode($categories);
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

echo json_encode(['error' => 'Unbekannte Aktion']);
?>
