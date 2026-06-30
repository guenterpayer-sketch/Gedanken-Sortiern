// --- Globale Variablen ---
let allThoughts = [];
let currentCategory = null;

// --- DOM-Elemente ---
const thoughtInput = document.getElementById('thoughtInput');
const addThoughtBtn = document.getElementById('addThoughtBtn');
const speechBtn = document.getElementById('speechBtn');
const thoughtList = document.getElementById('thoughtList');
const categoryList = document.getElementById('categoryList');

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

// --- Spracherkennung ---
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

// --- Gedanken hinzufügen ---
addThoughtBtn.addEventListener('click', async () => {
    const text = thoughtInput.value.trim();
    if (!text) return;

    addThoughtBtn.textContent = '⏳ Analysiere...';
    addThoughtBtn.disabled = true;
    thoughtInput.disabled = true;

    try {
        const response = await fetch('/api.php', {
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
        alert('Verbindungsfehler. Bitte erneut versuchen.');
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

// --- HTML escapen (gegen XSS in Gedankentexten) ---
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
}

// --- Gedanken rendern ---
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
                <div class="thought-text" data-text="${escapeHtml(t.text)}">${escapeHtml(t.text)}</div>
                <div class="thought-actions">
                    <button class="edit-btn" data-id="${t.id}">✏️ Bearbeiten</button>
                    <button class="delete-btn" data-id="${t.id}">🗑️ Löschen</button>
                </div>
            </div>
        `).join('')
        : '<div class="thought">Keine Gedanken in dieser Kategorie.</div>';

    attachThoughtActionListeners();
}

// --- Lösch- und Bearbeiten-Buttons verdrahten ---
function attachThoughtActionListeners() {
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.dataset.id;
            if (!confirm('Diesen Gedanken wirklich löschen?')) return;

            btn.disabled = true;
            try {
                const response = await fetch('/api.php?action=deleteThought', {
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
                const response = await fetch('/api.php?action=updateThought', {
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
    const response = await fetch('/api.php?action=getCategories');
    const categories = await response.json();

    categoryList.innerHTML = `
        <button class="category-btn ${!currentCategory ? 'active' : ''}" data-category="">Alle</button>
        ${categories.map(cat => `
            <button class="category-btn ${currentCategory === cat ? 'active' : ''}" data-category="${cat}">${cat}</button>
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
    thoughtList.innerHTML = '<div class="thought">⏳ Lade Gedanken...</div>';
    try {
        const response = await fetch('/api.php?action=getThoughts');
        if (!response.ok) throw new Error('Fehler beim Laden');
        allThoughts = await response.json();
        renderThoughts();
        updateCategories();
    } catch (error) {
        thoughtList.innerHTML = '<div class="thought">Fehler beim Laden. Bitte Seite neu laden.</div>';
    }
}

document.addEventListener('DOMContentLoaded', loadAllThoughts);
