// --- Globale Variablen ---
let allThoughts = [];
let currentCategory = null;
const QUEUE_KEY = 'gedanken_offline_queue';

// --- DOM-Elemente ---
const thoughtInput = document.getElementById('thoughtInput');
const addThoughtBtn = document.getElementById('addThoughtBtn');
const speechBtn = document.getElementById('speechBtn');
const thoughtList = document.getElementById('thoughtList');
const categoryList = document.getElementById('categoryList');
const darkModeBtn = document.getElementById('darkModeBtn');
const offlineBanner = document.getElementById('offlineBanner');
const weeklySummaryBtn = document.getElementById('weeklySummaryBtn');
const findPatternsBtn = document.getElementById('findPatternsBtn');
const mistralInsight = document.getElementById('mistralInsight');

// --- Emotion: Emoji-Mapping ---
const emotionEmoji = {
    'freude': '😊', 'freudvoll': '😊', 'glück': '😊', 'glücklich': '😊', 'positiv': '😊',
    'trauer': '😢', 'traurig': '😢', 'sad': '😢',
    'angst': '😨', 'ängstlich': '😨', 'fear': '😨',
    'wut': '😠', 'wütend': '😠', 'ärger': '😠', 'angry': '😠',
    'überrascht': '😲', 'überraschung': '😲',
    'neutral': '😐',
    'stress': '😰', 'gestresst': '😰',
    'entspannt': '😌', 'ruhig': '😌',
    'neugier': '🤔', 'nachdenklich': '🤔',
};

function getEmoji(emotion) {
    if (!emotion) return '😐';
    const key = emotion.toLowerCase().trim();
    return emotionEmoji[key] || '💭';
}

// --- Priorität: CSS-Klasse ---
function priorityClass(priority) {
    if (!priority) return '';
    const p = priority.toLowerCase();
    if (p === 'hoch' || p === 'high') return 'priority-high';
    if (p === 'niedrig' || p === 'low') return 'priority-low';
    return 'priority-medium';
}

// --- HTML escapen (gegen XSS in Gedankentexten) ---
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
}

// =====================================================
// Dark Mode
// =====================================================
function applyDarkMode(enabled) {
    document.body.classList.toggle('dark-mode', enabled);
    darkModeBtn.textContent = enabled ? '☀️' : '🌙';
    localStorage.setItem('darkMode', enabled ? '1' : '0');
}

darkModeBtn.addEventListener('click', () => {
    applyDarkMode(!document.body.classList.contains('dark-mode'));
});

applyDarkMode(localStorage.getItem('darkMode') === '1');

// =====================================================
// Offline-Warteschlange
// =====================================================
function getQueue() {
    try {
        return JSON.parse(localStorage.getItem(QUEUE_KEY)) || [];
    } catch {
        return [];
    }
}

function saveQueue(queue) {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

function queueThought(text) {
    const queue = getQueue();
    queue.push({ tempId: 'pending-' + Date.now() + '-' + Math.random(), text });
    saveQueue(queue);
    renderQueuedThoughts();
}

function renderQueuedThoughts() {
    const queue = getQueue();
    const existing = thoughtList.querySelectorAll('.thought.pending');
    existing.forEach(el => el.remove());

    queue.forEach(item => {
        const div = document.createElement('div');
        div.className = 'thought pending';
        div.innerHTML = `
            <div class="thought-header">
                <span class="thought-category">⏳ Wartet auf Verbindung...</span>
            </div>
            <div class="thought-text">${escapeHtml(item.text)}</div>
        `;
        thoughtList.prepend(div);
    });
}

async function syncQueue() {
    const queue = getQueue();
    if (!queue.length || !navigator.onLine) return;

    const remaining = [...queue];
    while (remaining.length) {
        const item = remaining[0];
        try {
            const response = await fetch('api.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: item.text })
            });
            const data = await response.json();
            if (data.error) throw new Error(data.error);

            allThoughts.unshift(data);
            remaining.shift();
            saveQueue(remaining);
        } catch (e) {
            break; // Noch offline oder Serverfehler — Rest bleibt in der Warteschlange
        }
    }
    renderThoughts(currentCategory);
    renderQueuedThoughts();
    updateCategories();
}

function updateOfflineBanner() {
    offlineBanner.hidden = navigator.onLine;
}

window.addEventListener('online', () => {
    updateOfflineBanner();
    syncQueue();
});
window.addEventListener('offline', updateOfflineBanner);

// =====================================================
// Spracherkennung
// =====================================================
speechBtn.addEventListener('click', () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        alert('Spracherkennung wird von diesem Browser nicht unterstützt.');
        return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'de-DE';

    speechBtn.textContent = '🔴 Aufnahme...';
    speechBtn.disabled = true;

    recognition.onresult = (event) => {
        thoughtInput.value = event.results[0][0].transcript;
    };
    recognition.onerror = () => {
        speechBtn.textContent = '🎤 Sprache';
        speechBtn.disabled = false;
    };
    recognition.onend = () => {
        speechBtn.textContent = '🎤 Sprache';
        speechBtn.disabled = false;
    };
    recognition.start();
});

// =====================================================
// Gedanken hinzufügen
// =====================================================
addThoughtBtn.addEventListener('click', async () => {
    const text = thoughtInput.value.trim();
    if (!text) return;

    if (!navigator.onLine) {
        queueThought(text);
        thoughtInput.value = '';
        return;
    }

    addThoughtBtn.textContent = '⏳ Analysiere...';
    addThoughtBtn.disabled = true;
    thoughtInput.disabled = true;

    try {
        const response = await fetch('api.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
        });
        const data = await response.json();

        if (data.error) {
            alert('Fehler: ' + data.error);
        } else {
            allThoughts.unshift(data);
            renderThoughts(currentCategory);
            updateCategories();
            thoughtInput.value = '';
        }
    } catch (e) {
        // Netzwerk eigentlich da, aber Request schlug fehl -> in Warteschlange
        queueThought(text);
        thoughtInput.value = '';
    } finally {
        addThoughtBtn.textContent = 'Hinzufügen';
        addThoughtBtn.disabled = false;
        thoughtInput.disabled = false;
        thoughtInput.focus();
    }
});

// Enter-Taste zum Absenden
thoughtInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addThoughtBtn.click();
});

// =====================================================
// Wochenrückblick & Muster erkennen
// =====================================================
async function runMistralInsight(action, button, loadingLabel, originalLabel) {
    button.textContent = loadingLabel;
    button.disabled = true;
    mistralInsight.hidden = false;
    mistralInsight.textContent = '⏳ Mistral denkt nach...';

    try {
        const response = await fetch(`api.php?action=${action}`);
        const data = await response.json();
        mistralInsight.textContent = data.summary || data.patterns || data.error || 'Keine Antwort erhalten.';
    } catch (e) {
        mistralInsight.textContent = 'Verbindungsfehler. Bitte erneut versuchen.';
    } finally {
        button.textContent = originalLabel;
        button.disabled = false;
    }
}

weeklySummaryBtn.addEventListener('click', () => {
    runMistralInsight('weeklySummary', weeklySummaryBtn, '⏳ Erstelle...', '📅 Wochenrückblick');
});

findPatternsBtn.addEventListener('click', () => {
    runMistralInsight('findPatterns', findPatternsBtn, '⏳ Analysiere...', '🔍 Muster erkennen');
});

// =====================================================
// Gedanken rendern
// =====================================================
function renderThoughts(category = null) {
    const filtered = category
        ? allThoughts.filter(t => t.category === category)
        : allThoughts;

    filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    thoughtList.innerHTML = filtered.length
        ? filtered.map(t => `
            <div class="thought ${priorityClass(t.priority)}" data-id="${t.id}">
                <div class="thought-header">
                    <span class="thought-category">${escapeHtml(t.category) || 'Unkategorisiert'}</span>
                    <span class="thought-emotion">${getEmoji(t.emotion)} ${escapeHtml(t.emotion) || ''}</span>
                    <span class="thought-priority">${escapeHtml(t.priority) || 'Mittel'}</span>
                </div>
                <div class="thought-text">${escapeHtml(t.text)}</div>
                <div class="thought-actions">
                    <button class="edit-btn" data-id="${t.id}">✏️ Bearbeiten</button>
                    <button class="delete-btn" data-id="${t.id}">🗑️ Löschen</button>
                </div>
            </div>
        `).join('')
        : '<div class="thought">Keine Gedanken in dieser Kategorie.</div>';

    attachThoughtActionListeners();
    renderQueuedThoughts();
}

// --- Lösch- und Bearbeiten-Buttons verdrahten ---
function attachThoughtActionListeners() {
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.dataset.id;
            if (!confirm('Diesen Gedanken wirklich löschen?')) return;

            btn.disabled = true;
            try {
                const response = await fetch('api.php?action=deleteThought', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id })
                });
                const data = await response.json();
                if (data.error) {
                    alert('Fehler: ' + data.error);
                    btn.disabled = false;
                    return;
                }
                allThoughts = allThoughts.filter(t => String(t.id) !== String(id));
                renderThoughts(currentCategory);
                updateCategories();
            } catch (e) {
                alert('Verbindungsfehler beim Löschen.');
                btn.disabled = false;
            }
        });
    });

    document.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.dataset.id;
            const thought = allThoughts.find(t => String(t.id) === String(id));
            if (!thought) return;

            const newText = prompt('Gedanken bearbeiten:', thought.text);
            if (newText === null || !newText.trim() || newText.trim() === thought.text) return;

            btn.disabled = true;
            try {
                const response = await fetch('api.php?action=updateThought', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id, text: newText.trim() })
                });
                const data = await response.json();
                if (data.error) {
                    alert('Fehler: ' + data.error);
                    btn.disabled = false;
                    return;
                }
                const idx = allThoughts.findIndex(t => String(t.id) === String(id));
                allThoughts[idx] = data;
                renderThoughts(currentCategory);
            } catch (e) {
                alert('Verbindungsfehler beim Bearbeiten.');
                btn.disabled = false;
            }
        });
    });
}

// --- Kategorien als Buttons anzeigen ---
async function updateCategories() {
    const response = await fetch('api.php?action=getCategories');
    const categories = await response.json();

    categoryList.innerHTML = `
        <button class="category-btn ${!currentCategory ? 'active' : ''}" data-category="">Alle</button>
        ${categories.map(cat => `
            <button class="category-btn ${currentCategory === cat ? 'active' : ''}" data-category="${escapeHtml(cat)}">${escapeHtml(cat)}</button>
        `).join('')}
    `;

    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            currentCategory = btn.dataset.category || null;
            renderThoughts(currentCategory);
            document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });
}

// --- Seite initialisieren ---
async function loadAllThoughts() {
    updateOfflineBanner();
    thoughtList.innerHTML = '<div class="thought">⏳ Lade Gedanken...</div>';
    try {
        const response = await fetch('api.php?action=getThoughts');
        if (!response.ok) throw new Error('Fehler beim Laden');
        allThoughts = await response.json();
        renderThoughts();
        updateCategories();
        syncQueue();
    } catch (error) {
        allThoughts = [];
        thoughtList.innerHTML = '';
        renderQueuedThoughts();
        if (!thoughtList.children.length) {
            thoughtList.innerHTML = '<div class="thought">Offline oder Fehler beim Laden. Neue Gedanken werden zwischengespeichert.</div>';
        }
    }
}

document.addEventListener('DOMContentLoaded', loadAllThoughts);
