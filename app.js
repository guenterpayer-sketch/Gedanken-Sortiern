// --- Globale Variablen ---
let allThoughts = [];
let currentCategory = null;

// --- DOM-Elemente ---
const thoughtInput = document.getElementById('thoughtInput');
const addThoughtBtn = document.getElementById('addThoughtBtn');
const speechBtn = document.getElementById('speechBtn');
const thoughtList = document.getElementById('thoughtList');
const categoryList = document.getElementById('categoryList');

// --- Spracherkennung ---
speechBtn.addEventListener('click', () => {
    const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    recognition.lang = 'de-DE';
    recognition.onresult = (event) => {
        thoughtInput.value = event.results[0][0].transcript;
    };
    recognition.start();
});

// --- Gedanken hinzufügen ---
addThoughtBtn.addEventListener('click', async () => {
    const text = thoughtInput.value.trim();
    if (!text) return;

    const response = await fetch('/api.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
    });
    const data = await response.json();

    // Gedanken zur globalen Liste hinzufügen
    allThoughts.unshift(data);
    renderThoughts(currentCategory); // Aktualisiere die Anzeige
    updateCategories(); // Kategorien aktualisieren
    thoughtInput.value = '';
});

// --- Gedanken rendern (mit Filter nach Kategorie) ---
function renderThoughts(category = null) {
    const filteredThoughts = category
        ? allThoughts.filter(thought => thought.category === category)
        : allThoughts;

    // Sortiere Gedanken nach Erstellungsdatum (neueste zuerst)
    filteredThoughts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    thoughtList.innerHTML = filteredThoughts.length
        ? filteredThoughts.map(thought => `
            <div class="thought">
                <strong>${thought.category || 'Unkategorisiert'}</strong>:
                ${thought.text} (Priorität: ${thought.priority || 'Mittel'})
            </div>
        `).join('')
        : '<div class="thought">Keine Gedanken in dieser Kategorie.</div>';
}

// --- Kategorien als Buttons anzeigen ---
async function updateCategories() {
    const response = await fetch('/api.php?action=getCategories');
    const categories = await response.json();

    // Füge "Alle anzeigen"-Button hinzu
    categoryList.innerHTML = `
        <button class="category-btn active" data-category="">Alle anzeigen</button>
        ${categories.map(cat => `
            <button class="category-btn" data-category="${cat}">${cat}</button>
        `).join('')}
    `;

    // Event-Listener für Kategorien-Buttons hinzufügen
    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            currentCategory = btn.dataset.category;
            renderThoughts(currentCategory);

            // Visuelles Feedback: Aktiven Button markieren
            document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });
}

// --- Alle Gedanken beim Laden der Seite abrufen ---
// --- Alle Gedanken beim Laden der Seite abrufen ---
async function loadAllThoughts() {
    try {
        const response = await fetch('/api.php?action=getThoughts');
        if (!response.ok) {
            throw new Error('Fehler beim Laden der Gedanken');
        }
        allThoughts = await response.json();
        console.log("Geladene Gedanken:", allThoughts); // Debugging
        renderThoughts(); // Zeige alle Gedanken an
        updateCategories(); // Lade Kategorien
    } catch (error) {
        console.error("Fehler:", error);
        // Fallback: Zeige eine Fehlermeldung an
        thoughtList.innerHTML = '<div class="thought">Fehler beim Laden der Gedanken. Bitte lade die Seite neu.</div>';
    }
}
// --- Seite initialisieren ---
document.addEventListener('DOMContentLoaded', loadAllThoughts);