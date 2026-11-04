/* PRESAGE — Orientation 1er étage. Flux CSV, cache et rendu DOM sûr. */
(() => {
  'use strict';
  const DATA_SOURCE_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSgV-W6pBTQCBZKHlmkU9Anm20vMZ_TxfNq_4MLgGZK0y1natn3iHHVrSU-oK25zwYCZxGDyrHr7bDk/pub?output=csv';
  const CACHE_KEY = 'presage:orientation:csv:v1';
  const TIME_ZONE = 'Europe/Paris';
  const REFRESH_MS = 60_000;
  const ROOMS = {
    west: ['F08', 'F09', 'F10', 'F11', 'F12', 'Amphi B'],
    center: ['C3', 'C4', 'F13', 'F14'],
    east: ['F15', 'F16', 'F17', 'F18', 'C5', 'C6', 'C7', 'C8', 'Amphi A']
  };
  const STAGE = { width: 1080, height: 1920 };
  const ROOM_DIRECTIONS = new Map([
    ...ROOMS.west.map((room) => [room, 'left']),
    ...ROOMS.center.map((room) => [room, 'up']),
    ...ROOMS.east.map((room) => [room, 'right'])
  ]);
  const ALL_ROOMS = new Set(ROOM_DIRECTIONS.keys());
  const normalize = (value) => String(value ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const pad = (value) => String(value).padStart(2, '0');
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  function parseCSV(text) {
    const firstLine = String(text).split(/\r?\n/, 1)[0] || '';
    const sep = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
    const rows = []; let row = []; let cell = ''; let quoted = false;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (quoted) {
        if (char === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (char === '"') quoted = false;
        else cell += char;
      } else if (char === '"') quoted = true;
      else if (char === sep) { row.push(cell); cell = ''; }
      else if (char === '\n' || char === '\r') {
        if (char === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += char;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((cells) => cells.some((value) => value.trim() !== ''));
  }

  function parseDate(raw) {
    const value = String(raw ?? '').trim();
    const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (match) return `${match[3]}-${pad(match[2])}-${pad(match[1])}`;
    const iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    return iso ? `${iso[1]}-${pad(iso[2])}-${pad(iso[3])}` : '';
  }
  function parseTime(raw) {
    const match = String(raw ?? '').trim().match(/^(\d{1,2})\s*[:hH]\s*(\d{2})/);
    if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return '';
    return `${pad(match[1])}:${match[2]}`;
  }
  function parisParts(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
    return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]));
  }
  function todayISO(date = new Date()) {
    const parts = parisParts(date);
    return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
  }
  function readSessions(csv) {
    const rows = parseCSV(csv);
    if (rows.length < 2) return [];
    const headers = rows[0].map((header) => normalize(header.replace(/^\uFEFF/, '')));
    const column = (phrase) => headers.findIndex((header) => header.includes(phrase));
    const indexes = {
      date: column('date'), time: column('heure de debut'), code: column('code'),
      title: column('intitule de la formation'), place: column('emplacement')
    };
    if (Object.values(indexes).some((index) => index < 0)) throw new Error('En-têtes CSV requis introuvables.');
    return rows.slice(1).map((cells) => ({
      date: parseDate(cells[indexes.date]), time: parseTime(cells[indexes.time]),
      code: String(cells[indexes.code] ?? '').trim(), title: String(cells[indexes.title] ?? '').trim(),
      place: String(cells[indexes.place] ?? '').trim()
    })).filter((session) => session.date && session.time && session.title);
  }
  function extractRoom(place) {
    const normalizedPlace = normalize(place).replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
    const amphitheatre = normalizedPlace.match(/(?:^| )amphi(?: ?theatre)? ?([ab])(?: |$)/);
    if (amphitheatre) return amphitheatre[1] === 'a' ? 'Amphi A' : 'Amphi B';
    const pattern = /(^|[^A-Z0-9])([FC])\s*0?(\d{1,2})(?![A-Z0-9])/gi;
    let match;
    while ((match = pattern.exec(String(place ?? ''))) !== null) {
      const prefix = match[2].toUpperCase(); const number = Number(match[3]);
      const room = prefix === 'F' && number >= 8 && number <= 18 ? `F${pad(number)}`
        : prefix === 'C' && number >= 3 && number <= 8 ? `C${number}` : '';
      if (ALL_ROOMS.has(room)) return room;
    }
    return '';
  }
  function getVisibleSessions(sessions, now = new Date()) {
    return sessions.filter((session) => session.date === todayISO(now)).map((session) => {
      const room = extractRoom(session.place);
      if (!room) return null;
      return { ...session, room, direction: ROOM_DIRECTIONS.get(room) };
    }).filter(Boolean).sort((a, b) => a.time.localeCompare(b.time));
  }
  function arrowSVG(direction) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'card__arrow-svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('width', '160');
    svg.setAttribute('height', '160');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const paths = {
      left: 'M82 50H18M18 50l28-28M18 50l28 28',
      up: 'M50 82V18M50 18L22 46M50 18l28 28',
      right: 'M18 50h64M82 50 54 22m28 28L54 78'
    };
    path.setAttribute('d', paths[direction]);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', '#f8fafc');
    path.setAttribute('stroke-width', '9');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(path);
    return svg;
  }
  function makeCard(session) {
    const card = el('article', 'card orientation-card');
    card.setAttribute('aria-label', `${session.time}, ${session.code ? `${session.code}, ` : ''}${session.title}, salle ${session.room}`);
    card.dataset.time = session.time;
    const time = el('div', 'card__cell card__time', session.time);
    const main = el('div', 'card__cell card__main');
    if (session.code) main.appendChild(el('span', 'card__code', session.code));
    const title = el('div', 'card__title', session.title);
    if (session.title.length > 58) title.classList.add('card__title--long');
    if (session.title.length > 100) title.classList.add('card__title--very-long');
    main.appendChild(title);
    const place = el('div', 'card__cell card__place');
    place.appendChild(el('span', 'orientation-card__room', session.room));
    place.appendChild(arrowSVG(session.direction));
    card.append(time, main, place);
    return card;
  }
  function densityClass(count) {
    if (count <= 2) return 'is-airy';
    if (count <= 4) return 'is-normal';
    if (count <= 7) return 'is-compact';
    if (count <= 12) return 'is-dense';
    return 'is-ultra';
  }
  function renderInto(container, emptyState, sessions) {
    const fragment = document.createDocumentFragment();
    sessions.forEach((session, index) => {
      const card = makeCard(session);
      card.style.setProperty('--i', Math.min(index, 7));
      fragment.appendChild(card);
    });
    container.className = `orientation__sessions ${densityClass(sessions.length)}`;
    container.replaceChildren(fragment);
    container.hidden = sessions.length === 0;
    if (emptyState) emptyState.hidden = sessions.length !== 0;
  }

  let latestSessions = [];
  function render() {
    const visible = getVisibleSessions(latestSessions, new Date());
    renderInto(document.getElementById('sessions'), document.getElementById('empty-state'), visible);
  }
  // Le JS est l’unique propriétaire de l’échelle : le CSS centre l’ancre du canevas.
  function fitStage() {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const scale = Math.min(viewportWidth / STAGE.width, viewportHeight / STAGE.height);
    const stage = document.getElementById('stage');
    stage.style.transform = `translate(-50%, -50%) scale(${scale})`;
  }
  function updateClock() {
    const now = new Date();
    document.getElementById('heure').textContent = new Intl.DateTimeFormat('fr-FR', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit' }).format(now);
    const date = new Intl.DateTimeFormat('fr-FR', { timeZone: TIME_ZONE, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now);
    document.getElementById('date').textContent = date.charAt(0).toLocaleUpperCase('fr-FR') + date.slice(1);
  }
  function timeLabel(date = new Date()) {
    return new Intl.DateTimeFormat('fr-FR', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit' }).format(date);
  }
  function validCSV(csv) {
    const rows = parseCSV(csv);
    if (rows.length < 2) return false;
    const headers = rows[0].map((value) => normalize(value.replace(/^\uFEFF/, '')));
    return ['date', 'heure de debut', 'code', 'intitule de la formation', 'emplacement'].every((key) => headers.some((header) => header.includes(key)));
  }
  function showCSV(csv) {
    latestSessions = readSessions(csv);
    render();
  }
  async function loadData() {
    let cached = null;
    try { cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (_) { cached = null; }
    try {
      const url = `${DATA_SOURCE_URL}${DATA_SOURCE_URL.includes('?') ? '&' : '?'}_t=${Date.now()}`;
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const csv = await response.text();
      if (!validCSV(csv)) throw new Error('Flux CSV vide ou invalide.');
      const syncedAt = timeLabel();
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ csv, syncedAt })); } catch (_) { /* Cache indisponible : le flux reste affichable. */ }
      showCSV(csv);
    } catch (error) {
      console.warn('[PRESAGE orientation] Synchronisation impossible :', error.message);
      if (cached && typeof cached.csv === 'string' && validCSV(cached.csv)) showCSV(cached.csv);
      else { latestSessions = []; render(); }
    }
  }
  function init() {
    fitStage();
    window.addEventListener('resize', fitStage);
    updateClock(); render(); loadData();
    window.setInterval(updateClock, 1000);
    window.setInterval(render, 30_000);
    window.setInterval(loadData, REFRESH_MS);
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ROOMS, ROOM_DIRECTIONS, STAGE, parseCSV, readSessions, extractRoom, getVisibleSessions, arrowSVG, makeCard, renderInto, densityClass, fitStage };
  }
  if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', init, { once: true });
})();
