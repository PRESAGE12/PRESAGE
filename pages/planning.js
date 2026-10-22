/* =========================================================
   PRESAGE – Affichage dynamique (Cenareo)
   Vanilla JS : horloge, parsing CSV, rendu DOM, refresh silencieux,
   rotation des photos du header
   ========================================================= */

/* ---------------- CONFIGURATION ---------------- */
const DATA_SOURCE_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSgV-W6pBTQCBZKHlmkU9Anm20vMZ_TxfNq_4MLgGZK0y1natn3iHHVrSU-oK25zwYCZxGDyrHr7bDk/pub?output=csv";
const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// "portrait" (1080×1920, conforme aux maquettes) ou "landscape" (1920×1080)
const ORIENTATION = "portrait";

// Paramètre d'URL ?zone=Hall Accueil → n'affiche que cette zone (+ "Tous les écrans")
const ZONE_FILTER = new URLSearchParams(location.search).get("zone");

// Masquer les sessions déjà passées ? (false = on les atténue seulement)
const HIDE_PAST_SESSIONS = false;
// Durée (min) pendant laquelle une session reste "en cours" avant d'être atténuée
const SESSION_GRACE_MIN = 60;

// Mode démo : si l'URL n'est pas renseignée, utilise ces données d'exemple
const DEMO_CSV = `Date,Heure de début,Code / Filière,Intitulé de la formation,Emplacement / Salle,Zone / Écran
2026-10-19,08:00:00,MED03,Cardio pneumo,Rendez-vous au sous-sol,Hall Accueil
2026-10-19,08:30:00,ACR01,Arrêt cardio-respiratoire pour les internes,Rendez-vous en F17,RDC
2026-10-19,09:00:00,ATT02,Patient mort encéphalique,C5,RDC`;

const ALL_SCREENS = "tous les écrans";

// Photos du header : chaque photo a sa propre position de cadrage
const HERO_PHOTOS = [
  { src: "../assets/photo1.png", position: "center 75%", size: "220%" },
  { src: "../assets/photo2.png", position: "50% 40%" },
  { src: "../assets/photo3.png", position: "30% 60%" },
  { src: "../assets/photo4.png", position: "30% 45%" },
  { src: "../assets/photo5.png", position: "30% 60%" },
  { src: "../assets/photo6.png", position: "30% 60%" },
  { src: "../assets/photo7.png", position: "30% 30%" },
];
const HERO_INTERVAL_MS = 7 * 1000; // change toutes les 7 secondes

/* ---------------- OUTILS ---------------- */
const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, "0");
const normalize = (s) =>
  String(s ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/* ---------------- LIBELLÉ D'EMPLACEMENT ---------------- */
// Transforme les niveaux R-1 / R+1 en formulation lisible pour le public
function formatPlace(place) {
  if (!place) return "";
  const p = normalize(place).replace(/\s+/g, " ");   // sans accents, minuscules

  if (["r-1", "r -1", "-1", "sous-sol", "sous sol"].includes(p)) {
    return "Rendez-vous au sous-sol";
  }
  if (["r+1", "r +1", "+1", "1er etage", "1er", "premier etage"].includes(p)) {
    return "Rendez-vous au 1er étage";
  }
  if (["AmphiA", "Amphi A", "AMPHI A", "AMPHIA"].includes(p)) {
    return "Rendez-vous en Amphi A";
  }
  if (["AmphiB", "Amphi B", "AMPHI B", "AMPHIB"].includes(p)) {
    return "Rendez-vous en Amphi B";
  }
  return place;                                       // autres emplacements inchangés
}

/* ---------------- MISE À L'ÉCHELLE DU CANEVAS ---------------- */
const STAGE_SIZES = {
  portrait:  { w: 1080, h: 1920 },
  landscape: { w: 1920, h: 1080 },
};

function fitStage() {
  const { w, h } = STAGE_SIZES[ORIENTATION];
  const scale = Math.min(window.innerWidth / w, window.innerHeight / h);
  const stage = $("stage");
  const offsetX = (window.innerWidth - w * scale) / 2;
  const offsetY = (window.innerHeight - h * scale) / 2;
  stage.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
}

/* ---------------- HEADER : DATE, PHOTO ---------------- */
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

let lastDateLabel = "";
function updateDate() {
  const label = capitalize(
    new Date().toLocaleDateString("fr-FR", {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
    })
  );
  if (label !== lastDateLabel) {            // évite des écritures DOM inutiles
    $("date").textContent = label;
    lastDateLabel = label;
  }
}

let heroIndex = -1;
function changerPhotoHero() {
  const el = document.querySelector(".hero__photo");
  if (!el || HERO_PHOTOS.length === 0) return;

  heroIndex = (heroIndex + 1) % HERO_PHOTOS.length;
  const photo = HERO_PHOTOS[heroIndex];

  el.style.backgroundImage = `url("${photo.src}")`;
  el.style.backgroundPosition = photo.position;
}

function tick() {
  updateDate();
  refreshPastState();                        // met à jour les cartes passées/prochaine
}

/* ---------------- PARSING CSV (RFC 4180, guillemets, retours ligne) ---------------- */
function parseCSV(text) {
  // Détection auto du séparateur (virgule ou point-virgule)
  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  const sep = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ";" : ",";

  const rows = [];
  let row = [], cell = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else cell += c;
    } else if (c === '"') inQuotes = true;
    else if (c === sep) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

/* ---------------- NORMALISATION DES DONNÉES ---------------- */
// Retourne "YYYY-MM-DD" depuis plusieurs formats possibles
function toISODate(raw) {
  const s = String(raw ?? "").trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);            // 2026-10-16[ 00:00:00]
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);           // 16/10/2026
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  return "";
}

// Retourne "HH:MM" depuis "08:30:00", "8:30", "08h30"…
function toHHMM(raw) {
  const m = String(raw ?? "").trim().match(/(\d{1,2})\s*[:hH]\s*(\d{2})/);
  return m ? `${pad(m[1])}:${m[2]}` : "";
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function rowsToSessions(rows) {
  if (rows.length < 2) return [];
  // Mapping tolérant sur les en-têtes
  const headers = rows[0].map(normalize);
  const idx = (needle) => headers.findIndex((h) => h.includes(needle));
  const col = {
    date:  idx("date"),
    time:  idx("heure"),
    code:  idx("code"),
    title: idx("intitule"),
    place: idx("emplacement"),
    zone:  idx("zone"),
  };

  return rows.slice(1).map((r) => ({
    date:  toISODate(r[col.date]),
    time:  toHHMM(r[col.time]),
    code:  (r[col.code]  ?? "").trim(),
    title: (r[col.title] ?? "").trim(),
    place: (r[col.place] ?? "").trim(),
    zone:  (r[col.zone]  ?? "").trim(),
  })).filter((s) => s.date && s.time && s.title);
}

function filterForToday(sessions) {
  const today = todayISO();
  const zoneWanted = ZONE_FILTER ? normalize(ZONE_FILTER) : null;

  return sessions
    .filter((s) => s.date === today)
    .filter((s) => {
      if (!zoneWanted) return true;                       // pas de filtre d'écran
      const z = normalize(s.zone);
      return z === "" || z === ALL_SCREENS || z === zoneWanted;
    })
    .sort((a, b) => a.time.localeCompare(b.time));
}

/* ---------------- RENDU DOM ---------------- */
function densityClass(n) {
  if (n <= 4) return "is-airy";
  if (n <= 6) return "is-normal";
  if (n <= 8) return "is-compact";
  return "is-dense";
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;   // textContent = pas d'injection HTML
  return node;
}

function buildCard(s) {
  const card = el("article", "card");
  card.dataset.time = s.time;

  const time = el("div", "card__cell card__time", s.time);

  const main = el("div", "card__cell card__main");
  if (s.code) main.appendChild(el("span", "card__code", s.code));
  main.appendChild(el("div", "card__title", s.title));

  const place = el("div", "card__cell card__place", formatPlace(s.place) || "—");

  card.append(time, main, place);
  return card;
}

function buildEmpty() {
  const box = el("div", "empty");
  box.append(
    el("div", "empty__icon", "🩺"),
    el("div", "empty__title", "Aucune session de simulation programmée pour le moment"),
    el("div", "empty__text", "Merci de vous adresser à l'accueil pour toute information.")
  );
  return box;
}

let lastSignature = "";
function render(sessions) {
  // Signature : on ne touche au DOM que si les données ont changé (refresh silencieux)
  const signature = JSON.stringify(sessions);
  if (signature === lastSignature) return;
  lastSignature = signature;

  const container = $("planning");
  const frag = document.createDocumentFragment();

  if (sessions.length === 0) {
    frag.appendChild(buildEmpty());
    container.className = "planning is-airy";
  } else {
    sessions.forEach((s, i) => {
      const card = buildCard(s);
      card.style.setProperty("--i", Math.min(i, 8)); // décalage d'entrée : 150 ms × rang
  frag.appendChild(card);
});
    container.className = `planning ${densityClass(sessions.length)}`;
  }
  container.replaceChildren(frag);
  refreshPastState();
}

/* Rejoue l'animation d'entrée des cartes (appelée par le wrapper à chaque réapparition) */
function rejouerAnimation() {
  const cartes = document.querySelectorAll("#planning .card");
  cartes.forEach((c) => { c.style.animation = "none"; });
  void document.body.offsetWidth; // force le recalcul du style
  cartes.forEach((c) => { c.style.animation = ""; });
}

window.addEventListener("message", (e) => {
  if (e.data && e.data.type === "kiosque:replay-planning") rejouerAnimation();
});

/* Atténue les sessions passées / marque la prochaine */
function refreshPastState() {
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  let nextMarked = false;

  document.querySelectorAll("#planning .card").forEach((card) => {
    const [h, m] = card.dataset.time.split(":").map(Number);
    const start = h * 60 + m;
    const isPast = nowMin >= start + SESSION_GRACE_MIN;

    card.classList.toggle("is-past", isPast);
    if (HIDE_PAST_SESSIONS) card.hidden = isPast;

    card.classList.remove("is-next");
    if (!isPast && !nextMarked && start + SESSION_GRACE_MIN > nowMin) {
      nextMarked = true;
    }
  });
}

/* ---------------- CHARGEMENT DES DONNÉES ---------------- */
async function fetchCSV() {
  if (!DATA_SOURCE_URL || DATA_SOURCE_URL.includes("URL_GOOGLE_SHEET")) {
    return DEMO_CSV;                                        // mode démo
  }
  // Anti-cache : paramètre unique à chaque requête
  const url = `${DATA_SOURCE_URL}${DATA_SOURCE_URL.includes("?") ? "&" : "?"}_=${Date.now()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function loadData() {
  try {
    const csv = await fetchCSV();
    const sessions = filterForToday(rowsToSessions(parseCSV(csv)));
    render(sessions);
  } catch (err) {
    // En cas d'erreur réseau : on conserve l'affichage actuel (pas de flash d'erreur)
    console.warn("[PRESAGE] Échec du rafraîchissement :", err);
    if (!lastSignature) render([]);                         // 1er chargement raté → état vide
  }
}

/* ---------------- INITIALISATION ---------------- */
function init() {
  document.body.dataset.orientation = ORIENTATION;
  // La mise à l’échelle est gérée exclusivement par le wrapper parent.

  tick();
  setInterval(tick, 1000);

  // Photo du header : affichée immédiatement, puis changée toutes les 30 secondes
  changerPhotoHero();
  setInterval(changerPhotoHero, HERO_INTERVAL_MS);

  loadData();
  setInterval(loadData, REFRESH_INTERVAL_MS);

  // Bascule de jour à minuit : rechargement des données dès que la date change
  let currentDay = todayISO();
  setInterval(() => {
    const d = todayISO();
    if (d !== currentDay) { currentDay = d; lastSignature = ""; loadData(); }
  }, 30 * 1000);
}

document.addEventListener("DOMContentLoaded", init);
