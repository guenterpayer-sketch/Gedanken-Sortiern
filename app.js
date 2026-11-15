// --- Globale Variablen ---
let allThoughts = [];
let currentCategory = null;
let meta = { types: [], categories: [], statuses: {} };
const QUEUE_KEY = 'gedanken_offline_queue';

// --- DOM-Elemente (je nach Seite ist nicht jedes Element vorhanden) ---
const thoughtForm = document.getElementById('thoughtForm');
const thoughtInput = document.getElementById('thoughtInput');
const addThoughtBtn = document.getElementById('addThoughtBtn');
const addStatus = document.getElementById('addStatus');
const speechBtn = document.getElementById('speechBtn');
const thoughtList = document.getElementById('thoughtList');
const categoryList = document.getElementById('categoryList');
const darkModeBtn = document.getElementById('darkModeBtn');
const offlineBanner = document.getElementById('offlineBanner');
const weeklySummaryBtn = document.getElementById('weeklySummaryBtn');
const findPatternsBtn = document.getElementById('findPatternsBtn');
const mistralInsight = document.getElementById('mistralInsight');
const detailOverlay = document.getElementById('detailOverlay');
const detailPanel = document.getElementById('detailPanel');
const logoutAllBtn = document.getElementById('logoutAllBtn');

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

// --- Gedankenart: Symbol ---
const typeIcon = { 'Aufgabe': '✅', 'Idee': '💡', 'Grübelei': '🌀', 'Notiz': '📝' };

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

// --- MySQL-Datum ("2026-11-15 14:32:00") lesbar machen ---
function parseDate(str) {
    return str ? new Date(String(str).replace(' ', 'T')) : null;
}

function formatDate(str, withTime = true) {
    const d = parseDate(str);
    if (!d || isNaN(d)) return '';
    const opts = { day: '2-digit', month: '2-digit', year: 'numeric' };
    if (withTime) Object.assign(opts, { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleString('de-DE', opts);
}

// =====================================================
// API-Aufrufe mit Login-Prüfung
// =====================================================
class AuthError extends Error {}

function goToLogin() {
    if (!location.pathname.endsWith('login.html')) {
        window.location.replace('login.html');
    }
}

// Wirft AuthError bei 401 (und leitet zur Anmeldung weiter),
// sonst normaler Fehler bei Netzwerkproblemen.
async function apiFetch(url, options = {}) {
    const response = await fetch(url, { credentials: 'same-origin', ...options });
    if (response.status === 401) {
        goToLogin();
        throw new AuthError('Nicht angemeldet');
    }
    return response.json();
}

function apiPost(url, body) {
    return apiFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
}

// =====================================================
// Dark Mode
// =====================================================
function applyDarkMode(enabled) {
    document.body.classList.toggle('dark-mode', enabled);
    if (darkModeBtn) darkModeBtn.textContent = enabled ? '☀️' : '🌙';
    localStorage.setItem('darkMode', enabled ? '1' : '0');
}

if (darkModeBtn) {
    darkModeBtn.addEventListener('click', () => {
        applyDarkMode(!document.body.classList.contains('dark-mode'));
    });
}

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
    if (!thoughtList) return;
    const queue = getQueue();
    const existing = thoughtList.querySelectorAll('.thought.pending');
    existing.forEach(el => el.remove());

    queue.forEach(item => {
        const div = document.createElement('div');
        div.className = 'thought pending';
        div.innerHTML = `
            <div class="thought-header">
                <span class="thought-category">⏳ Wartet auf Versand...</span>
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
            const data = await apiPost('api.php', { text: item.text });
            if (data.error) throw new Error(data.error);

            allThoughts.unshift(data);
            remaining.shift();
            saveQueue(remaining);
        } catch (e) {
            break; // Offline, nicht angemeldet oder Serverfehler — Rest bleibt in der Warteschlange
        }
    }
    renderThoughts(currentCategory);
    updateCategories();
}

function updateOfflineBanner() {
    if (offlineBanner) offlineBanner.hidden = navigator.onLine;
}

window.addEventListener('online', () => {
    updateOfflineBanner();
    syncQueue();
});
window.addEventListener('offline', updateOfflineBanner);

// =====================================================
// Spracherkennung
// =====================================================
if (speechBtn) {
    speechBtn.addEventListener('click', () => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            alert('Spracherkennung wird von diesem Browser nicht unterstützt.');
            return;
        }
        const recognition = new SpeechRecognition();
        recognition.lang = 'de-DE';

        speechBtn.classList.add('recording');
        speechBtn.disabled = true;

        recognition.onresult = (event) => {
            thoughtInput.value = event.results[0][0].transcript;
        };
        recognition.onerror = () => {
            speechBtn.classList.remove('recording');
            speechBtn.disabled = false;
        };
        recognition.onend = () => {
            speechBtn.classList.remove('recording');
            speechBtn.disabled = false;
        };
        recognition.start();
    });
}

// =====================================================
// Gedanken hinzufügen
// =====================================================
async function submitThought(text) {
    if (!navigator.onLine) {
        queueThought(text);
        return { queued: true };
    }
    try {
        const data = await apiPost('api.php', { text });
        if (data.error) return { error: data.error };

        allThoughts.unshift(data);
        renderThoughts(currentCategory);
        updateCategories();
        return { success: true };
    } catch (e) {
        // Nicht angemeldet oder Request schlug fehl -> Gedanke bleibt in der Warteschlange
        queueThought(text);
        return { queued: true, auth: e instanceof AuthError };
    }
}

let isSubmittingThought = false;

if (thoughtForm) {
    thoughtForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (isSubmittingThought) return;

        const text = thoughtInput.value.trim();
        if (!text) return;

        isSubmittingThought = true;
        thoughtInput.disabled = true;
        if (addThoughtBtn) {
            addThoughtBtn.disabled = true;
            addThoughtBtn.textContent = '⏳ Wird gespeichert...';
        }
        if (addStatus) addStatus.hidden = true;

        const result = await submitThought(text);
        isSubmittingThought = false;

        // Bei einem Serverfehler bleibt der Text im Feld, damit nichts verloren geht
        if (!result.error) thoughtInput.value = '';
        thoughtInput.disabled = false;
        thoughtInput.focus();
        if (addThoughtBtn) {
            addThoughtBtn.disabled = false;
            addThoughtBtn.textContent = 'Absenden';
        }

        if (addStatus) {
            addStatus.textContent = result.error
                ? ('Fehler: ' + result.error)
                : result.auth
                    ? '🔒 Nicht angemeldet — Gedanke ist zwischengespeichert.'
                    : result.queued
                        ? '⏳ Gespeichert — wird gesendet, sobald wieder online.'
                        : '✅ Gedanke gespeichert & sortiert.';
            addStatus.hidden = false;
            clearTimeout(addStatus._timer);
            addStatus._timer = setTimeout(() => { addStatus.hidden = true; }, 3000);
        }
    });
}

// =====================================================
// Wochenrückblick & Muster erkennen
// =====================================================
async function runMistralInsight(action, button, loadingLabel, originalLabel) {
    button.textContent = loadingLabel;
    button.disabled = true;
    mistralInsight.hidden = false;
    mistralInsight.textContent = '⏳ Mistral denkt nach...';

    try {
        const data = await apiFetch(`api.php?action=${action}`);
        mistralInsight.textContent = data.summary || data.patterns || data.error || 'Keine Antwort erhalten.';
    } catch (e) {
        mistralInsight.textContent = 'Verbindungsfehler. Bitte erneut versuchen.';
    } finally {
        button.textContent = originalLabel;
        button.disabled = false;
    }
}

if (weeklySummaryBtn) {
    weeklySummaryBtn.addEventListener('click', () => {
        runMistralInsight('weeklySummary', weeklySummaryBtn, '⏳ Erstelle...', '📅 Wochenrückblick');
    });
}

if (findPatternsBtn) {
    findPatternsBtn.addEventListener('click', () => {
        runMistralInsight('findPatterns', findPatternsBtn, '⏳ Analysiere...', '🔍 Muster erkennen');
    });
}

// =====================================================
// Gedanken-Liste
// =====================================================
function isDone(t) {
    return t.status === 'erledigt' || t.status === 'umgesetzt' || t.status === 'verworfen';
}

function renderThoughts(category = null) {
    if (!thoughtList) return;
    const filtered = category
        ? allThoughts.filter(t => t.category === category)
        : allThoughts;

    filtered.sort((a, b) => parseDate(b.created_at) - parseDate(a.created_at));

    thoughtList.innerHTML = filtered.length
        ? filtered.map(t => `
            <div class="thought ${priorityClass(t.priority)} ${isDone(t) ? 'done' : ''}" data-id="${t.id}" role="button" tabindex="0">
                <div class="thought-header">
                    <span class="thought-type">${typeIcon[t.type] || '📝'} ${escapeHtml(t.type || 'Notiz')}</span>
                    ${t.status ? `<span class="thought-status">${escapeHtml(t.status)}</span>` : ''}
                    <span class="thought-category">${escapeHtml(t.category) || 'Sonstiges'}</span>
                    <span class="thought-priority">${escapeHtml(t.priority) || 'Mittel'}</span>
                </div>
                <div class="thought-text">${escapeHtml(t.text)}</div>
                <div class="thought-meta">${formatDate(t.created_at)} · ${getEmoji(t.emotion)} ${escapeHtml(t.emotion) || ''}</div>
            </div>
        `).join('')
        : '<div class="thought">Keine Gedanken in dieser Kategorie.</div>';

    thoughtList.querySelectorAll('.thought[data-id]').forEach(el => {
        el.addEventListener('click', () => openDetail(el.dataset.id));
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') openDetail(el.dataset.id);
        });
    });
    renderQueuedThoughts();
}

// =====================================================
// Detailansicht
// =====================================================
function optionsHtml(list, selected) {
    return list.map(v => `<option value="${escapeHtml(v)}" ${v === selected ? 'selected' : ''}>${escapeHtml(v)}</option>`).join('');
}

function statusFieldHtml(type, status) {
    const list = meta.statuses[type];
    if (!list) return '';
    return `
        <label class="detail-field">Status
            <select id="detailStatus">${optionsHtml(list, status || list[0])}</select>
        </label>`;
}

function openDetail(id) {
    const t = allThoughts.find(x => String(x.id) === String(id));
    if (!t || !detailOverlay) return;

    detailPanel.innerHTML = `
        <div class="detail-top">
            <h2>${typeIcon[t.type] || '📝'} Gedanke</h2>
            <button type="button" class="detail-close" id="detailClose" title="Schließen">✕</button>
        </div>
        <div class="detail-info">
            ${formatDate(t.created_at)} · ${getEmoji(t.emotion)} ${escapeHtml(t.emotion) || ''} · Priorität: ${escapeHtml(t.priority) || 'Mittel'}
        </div>
        <label class="detail-field">Text
            <textarea id="detailText" rows="4">${escapeHtml(t.text)}</textarea>
        </label>
        <label class="detail-field">Art
            <select id="detailType">${optionsHtml(meta.types, t.type)}</select>
        </label>
        <div id="detailStatusWrap">${statusFieldHtml(t.type, t.status)}</div>
        <label class="detail-field">Kategorie
            <select id="detailCategory">${optionsHtml(meta.categories, t.category)}</select>
        </label>
        <div class="detail-actions">
            <button type="button" id="detailSave" class="primary">💾 Speichern</button>
            <button type="button" id="detailDelete" class="danger">🗑️ Löschen</button>
        </div>
        <div class="detail-export">
            <span>Exportieren:</span>
            <button type="button" id="exportMd">Markdown</button>
            <button type="button" id="exportJson">JSON</button>
        </div>
        <div id="detailMsg" class="add-status" hidden></div>
    `;

    const typeSelect = document.getElementById('detailType');
    typeSelect.addEventListener('change', () => {
        document.getElementById('detailStatusWrap').innerHTML = statusFieldHtml(typeSelect.value, null);
    });

    document.getElementById('detailClose').addEventListener('click', closeDetail);
    document.getElementById('detailSave').addEventListener('click', () => saveDetail(t.id));
    document.getElementById('detailDelete').addEventListener('click', () => deleteThought(t.id));
    document.getElementById('exportMd').addEventListener('click', () => exportThought(t.id, 'md'));
    document.getElementById('exportJson').addEventListener('click', () => exportThought(t.id, 'json'));

    detailOverlay.hidden = false;
    document.body.classList.add('no-scroll');
}

function closeDetail() {
    if (!detailOverlay) return;
    detailOverlay.hidden = true;
    detailPanel.innerHTML = '';
    document.body.classList.remove('no-scroll');
}

if (detailOverlay) {
    detailOverlay.addEventListener('click', (e) => {
        if (e.target === detailOverlay) closeDetail();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !detailOverlay.hidden) closeDetail();
    });
}

function showDetailMsg(text) {
    const msg = document.getElementById('detailMsg');
    if (!msg) return;
    msg.textContent = text;
    msg.hidden = false;
}

async function saveDetail(id) {
    const text = document.getElementById('detailText').value.trim();
    if (!text) {
        showDetailMsg('Der Text darf nicht leer sein.');
        return;
    }
    const statusSelect = document.getElementById('detailStatus');
    const body = {
        id,
        text,
        type: document.getElementById('detailType').value,
        category: document.getElementById('detailCategory').value,
        status: statusSelect ? statusSelect.value : null,
    };

    const btn = document.getElementById('detailSave');
    btn.disabled = true;
    try {
        const data = await apiPost('api.php?action=updateThought', body);
        if (data.error) {
            showDetailMsg('Fehler: ' + data.error);
            btn.disabled = false;
            return;
        }
        const idx = allThoughts.findIndex(t => String(t.id) === String(id));
        allThoughts[idx] = data;
        renderThoughts(currentCategory);
        updateCategories();
        closeDetail();
    } catch (e) {
        showDetailMsg('Verbindungsfehler beim Speichern.');
        btn.disabled = false;
    }
}

async function deleteThought(id) {
    if (!confirm('Diesen Gedanken wirklich löschen?')) return;
    const btn = document.getElementById('detailDelete');
    btn.disabled = true;
    try {
        const data = await apiPost('api.php?action=deleteThought', { id });
        if (data.error) {
            showDetailMsg('Fehler: ' + data.error);
            btn.disabled = false;
            return;
        }
        allThoughts = allThoughts.filter(t => String(t.id) !== String(id));
        renderThoughts(currentCategory);
        updateCategories();
        closeDetail();
    } catch (e) {
        showDetailMsg('Verbindungsfehler beim Löschen.');
        btn.disabled = false;
    }
}

// --- Export eines einzelnen Gedankens (Datum, Art, Kategorie, Status, Text) ---
function exportThought(id, format) {
    const t = allThoughts.find(x => String(x.id) === String(id));
    if (!t) return;

    const datePart = (t.created_at || '').slice(0, 10) || 'ohne-datum';
    let content, mime, ext;

    if (format === 'json') {
        content = JSON.stringify({
            datum: t.created_at,
            art: t.type,
            kategorie: t.category,
            status: t.status || null,
            text: t.text,
        }, null, 2);
        mime = 'application/json';
        ext = 'json';
    } else {
        const lines = [
            `# Gedanke vom ${formatDate(t.created_at, false)}`,
            '',
            `- **Datum:** ${formatDate(t.created_at)}`,
            `- **Art:** ${t.type || 'Notiz'}`,
            `- **Kategorie:** ${t.category || 'Sonstiges'}`,
        ];
        if (t.status) lines.push(`- **Status:** ${t.status}`);
        lines.push('', t.text, '');
        content = lines.join('\n');
        mime = 'text/markdown';
        ext = 'md';
    }

    const blob = new Blob([content], { type: mime + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gedanke-${t.id}-${datePart}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// =====================================================
// Kategorien als Filter-Buttons
// =====================================================
async function updateCategories() {
    if (!categoryList) return;
    let categories;
    try {
        categories = await apiFetch('api.php?action=getCategories');
    } catch (e) {
        return;
    }
    if (!Array.isArray(categories)) return;

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

// =====================================================
// Alle Geräte abmelden
// =====================================================
if (logoutAllBtn) {
    logoutAllBtn.addEventListener('click', async () => {
        if (!confirm('Alle Geräte abmelden? Du musst dich danach überall neu anmelden – auch hier.')) return;
        try {
            await apiPost('api.php?action=logoutAll', {});
        } catch (e) { /* Weiterleitung passiert ohnehin */ }
        goToLogin();
    });
}

// =====================================================
// Seite initialisieren
// =====================================================
async function loadAllThoughts() {
    thoughtList.innerHTML = '<div class="thought">⏳ Lade Gedanken...</div>';
    try {
        meta = await apiFetch('api.php?action=getMeta');
        const data = await apiFetch('api.php?action=getThoughts');
        if (!Array.isArray(data)) throw new Error(data.error || 'Fehler beim Laden');
        allThoughts = data;
        renderThoughts();
        updateCategories();
        syncQueue();
    } catch (error) {
        if (error instanceof AuthError) return;
        allThoughts = [];
        thoughtList.innerHTML = '';
        renderQueuedThoughts();
        if (!thoughtList.children.length) {
            thoughtList.innerHTML = '<div class="thought">Offline oder Fehler beim Laden. Neue Gedanken werden zwischengespeichert.</div>';
        }
    }
}

async function checkAuthAndSync() {
    if (!navigator.onLine) return;
    try {
        await apiFetch('api.php?action=checkAuth');
        syncQueue();
    } catch (e) {
        // AuthError leitet bereits weiter; Netzwerkfehler ignorieren (Offline-Betrieb)
    }
}

document.addEventListener('DOMContentLoaded', () => {
    updateOfflineBanner();
    if (thoughtList) {
        loadAllThoughts();
    } else {
        checkAuthAndSync();
    }
    if (thoughtInput) thoughtInput.focus();
});
