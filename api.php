<?php
header('Content-Type: application/json');

// Datenbankverbindung
$host = 'localhost';
$dbname = 'd0477c5b';
$user = 'd0477c5b';
$pass = 'FroschMonitor01?';

try {
    $pdo = new PDO("mysql:host=$host;dbname=$dbname", $user, $pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch (PDOException $e) {
    die(json_encode(['error' => 'Datenbankfehler: ' . $e->getMessage()]));
}

$action = $_GET['action'] ?? $_POST['action'] ?? '';

// --- Mistral API ---
function callMistralAPI($text) {
    $apiKey = 'R68I7W39t9W0ZRWR3IYZteFC45OJR1q2';
    $url = 'https://api.mistral.ai/v1/chat/completions';
    $data = [
        'model' => 'mistral-medium',
        'messages' => [
            [
                'role' => 'user',
                'content' => "Analysiere diesen Gedanken und gib das Ergebnis als JSON zurück mit den Feldern: category, priority, emotion. Gedanken: '$text'. Antworte nur mit dem JSON-Objekt, ohne zusätzliche Erklärungen."
            ]
        ],
        'temperature' => 0.1,
    ];

    $options = [
        'http' => [
            'header' => "Content-Type: application/json\r\nAuthorization: Bearer $apiKey",
            'method' => 'POST',
            'content' => json_encode($data),
            'timeout' => 15
        ]
    ];

    $context = stream_context_create($options);
    $response = @file_get_contents($url, false, $context);

    if ($response === false) {
        return ['category' => 'Unkategorisiert', 'priority' => 'Mittel', 'emotion' => 'neutral'];
    }

    $result = json_decode($response, true);
    if (isset($result['choices'][0]['message']['content'])) {
        $content = $result['choices'][0]['message']['content'];
        if (preg_match('/\{.*\}/s', $content, $matches)) {
            return json_decode($matches[0], true);
        }
        return json_decode($content, true);
    }

    return ['category' => 'Unkategorisiert', 'priority' => 'Mittel', 'emotion' => 'neutral'];
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