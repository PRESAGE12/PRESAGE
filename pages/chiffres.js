/* ====================================================================
   PRESAGE – Page « En chiffres » (chiffres.js)
   - Horloge + date FR
   - Données via Google Apps Script (GAS) + cache localStorage
   - Compteurs animés (easeOutExpo) depuis 0
   - Entrée des cartes gauche/droite (classe .go sur <html>)
   - Sortie : classe .chiffres-sortie sur <html>
   - Replay à chaque apparition : { type: 'kiosque:replay-chiffres' }
   ==================================================================== */

(function () {
  'use strict';

  /* ------------------------------------------------------------------
     CONFIGURATION
     ------------------------------------------------------------------ */

  const URL_API = 'https://script.google.com/macros/s/AKfycbwh2BiGYOyqscOc002K1ZP_P3zeYDFhau21dj__x8OGK7BammyH-BJwyaIp5BilHLk/exec';

  const CLE_CACHE    = 'presage_chiffres_v1';
  const TTL_CACHE_MS = 30 * 60 * 1000;
  const TIMEOUT_MS   = 20000;
  const RAFRAICHIR_MS = 10 * 60 * 1000;
  const DELAI_COMPTEURS_MS = 300;
  const DUREE_COMPTEUR_MS  = 1600;

  const DEFAUT = Object.freeze({
    sessions: 129,
    heures:   738,
    salles:   6,
    linkedin: 968,
    maj:      null
  });

  const reduitMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let dernieresDonnees = { ...DEFAUT };

  const root = document.documentElement;
  const MSG_EXIT = 'kiosque:exit-chiffres';
  const MSG_REPLAY = 'kiosque:replay-chiffres';

  /* ------------------------------------------------------------------
     UTILITAIRES
     ------------------------------------------------------------------ */

  const $ = (id) => document.getElementById(id);

  function setText(el, valeur) {
    if (!el) return;
    const v = String(valeur);
    if (el.textContent !== v) el.textContent = v;
  }

  function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  function fmtFR(n) {
    if (typeof n !== 'number' || !isFinite(n)) return '—';
    return new Intl.NumberFormat('fr-FR')
      .format(Math.round(n))
      .replace(/\u202F|\u00A0/g, '\u00A0');
  }

  function fetchAvecTimeout(url, ms) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    return fetch(url, { signal: ctrl.signal, cache: 'no-store' })
      .then(r => {
        clearTimeout(t);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r;
      })
      .catch(e => { clearTimeout(t); throw e; });
  }

  function lireCache() {
    try {
      const raw = localStorage.getItem(CLE_CACHE);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== 'object') return null;
      if (Date.now() - (obj.__ts || 0) > TTL_CACHE_MS) return null;
      return obj;
    } catch (_) { return null; }
  }

  function ecrireCache(d) {
    try { localStorage.setItem(CLE_CACHE, JSON.stringify({ __ts: Date.now(), ...d })); }
    catch (_) { /* ignoré */ }
  }

  /* ------------------------------------------------------------------
     HORLOGE & DATE
     ------------------------------------------------------------------ */

  const fmtHeure = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', hour12: false });
  const fmtDate  = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  function majHorloge() {
    const now = new Date();
    setText($('heure'), fmtHeure.format(now).replace(/\u202F|\u00A0/g, '\u00A0'));
    setText($('date'),  capitalize(fmtDate.format(now)));
  }

  /* ------------------------------------------------------------------
     COMPTEURS ANIMÉS (easeOutExpo)
     ------------------------------------------------------------------ */

  let rafsCompteurs = [];

  function arreterCompteurs() {
    rafsCompteurs.forEach(cancelAnimationFrame);
    rafsCompteurs = [];
  }

  function easeOutExpo(t) {
    return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
  }

  function animerCompteurs(donnees) {
    arreterCompteurs();
    const d = donnees || dernieresDonnees;
    if (!d) return;

    const cibles = [
      ['c-sessions', d.sessions],
      ['c-heures',   d.heures],
      ['c-salles',   d.salles],
      ['c-linkedin', d.linkedin]
    ];

    cibles.forEach(function (paire) {
      const el = $(paire[0]);
      const cible = Number(paire[1]) || 0;
      if (!el) return;

      if (reduitMotion) { setText(el, fmtFR(cible)); return; }

      setText(el, fmtFR(0));
      const debut = performance.now();

      function pas(now) {
        const p = Math.min((now - debut) / DUREE_COMPTEUR_MS, 1);
        setText(el, fmtFR(cible * easeOutExpo(p)));
        if (p < 1) {
          rafsCompteurs.push(requestAnimationFrame(pas));
        } else {
          setText(el, fmtFR(cible));
        }
      }
      rafsCompteurs.push(requestAnimationFrame(pas));
    });
  }

  /* ------------------------------------------------------------------
     ANIMATION D'ENTRÉE DES CARTES (classe .go sur <html>)
     ------------------------------------------------------------------ */

  root.classList.add('js');

  function rejouerEntreeCartes() {
    root.classList.remove('go');
    void root.offsetWidth; // reflow forcé
    root.classList.add('go');
  }

  /* ------------------------------------------------------------------
     BADGE & MENTION DE MISE À JOUR
     ------------------------------------------------------------------ */

  function majBadgeSalles(n) {
    const b = $('badge-salles');
    if (!b) return;
    const texteEl = b.querySelector('.badge-texte');
    if (!n || n <= 0) {
      b.classList.add('is-rest');
      if (texteEl) texteEl.textContent = 'Centre au repos';
    } else {
      b.classList.remove('is-rest');
      if (texteEl) texteEl.textContent = 'Centre actif';
    }
  }

  function majMentionMAJ(donnees) {
    const el = $('maj-date');
    if (!el) return;
    const ts = donnees && donnees.maj ? new Date(donnees.maj) : new Date();
    const fmt = new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
    el.textContent = fmt.format(ts).replace(/\u202F|\u00A0/g, '\u00A0');
  }

  /* ------------------------------------------------------------------
     DONNÉES
     ------------------------------------------------------------------ */

  function normaliserReponse(j) {
    if (!j || typeof j !== 'object') return null;
    return {
      sessions: Number(j.sessions) || 0,
      heures:   Number(j.heures)   || 0,
      salles:   Number(j.salles)   || 0,
      linkedin: Number(j.linkedin) || 0,
      maj:      j.maj || null
    };
  }

  async function chargerDonnees() {
    if (URL_API && !URL_API.includes('REPLACE_WITH')) {
      try {
        const r = await fetchAvecTimeout(URL_API, TIMEOUT_MS);
        const norm = normaliserReponse(await r.json());
        if (norm) { ecrireCache(norm); return norm; }
      } catch (_) { /* fallback */ }
    }
    const cached = lireCache();
    if (cached) {
      const { __ts, ...data } = cached;
      return data;
    }
    return { ...DEFAUT };
  }

  function appliquerDonnees(donnees, animer) {
    dernieresDonnees = { ...donnees };
    if (!animer) {
      setText($('c-sessions'), fmtFR(donnees.sessions));
      setText($('c-heures'),   fmtFR(donnees.heures));
      setText($('c-salles'),   fmtFR(donnees.salles));
      setText($('c-linkedin'), fmtFR(donnees.linkedin));
    }
    majBadgeSalles(donnees.salles);
    majMentionMAJ(donnees);
  }

  /* ------------------------------------------------------------------
     SORTIE DE PAGE + REPLAY
     ------------------------------------------------------------------ */

  let timerCompteurs = 0;

  /** État « cadre nu » + zoom du panneau bleu (via CSS sur html.chiffres-sortie). */
  function sortirChiffres() {
    clearTimeout(timerCompteurs);
    arreterCompteurs();
    root.classList.add('chiffres-sortie');
  }

  /** Remet la page à zéro : cartes + compteurs repartent. */
  function reinitialiserChiffres() {
    clearTimeout(timerCompteurs);
    arreterCompteurs();
    root.classList.remove('chiffres-sortie');
    rejouerEntreeCartes();
    timerCompteurs = setTimeout(function () {
      animerCompteurs(dernieresDonnees);
    }, DELAI_COMPTEURS_MS);
  }

  // UN SEUL écouteur de messages
  window.addEventListener('message', function (e) {
    const data = e && e.data;
    if (!data) return;
    const type = (typeof data === 'string') ? data : data.type;

    if (type === MSG_EXIT) {
      sortirChiffres();
    } else if (type === MSG_REPLAY || type === 'kiosque:replay') {
      reinitialiserChiffres();
    }
  });

  /* ------------------------------------------------------------------
     INITIALISATION
     ------------------------------------------------------------------ */

  async function init() {
    majHorloge();
    setInterval(majHorloge, 1000);

    // QR code : appelé seulement si la fonction existe dans la page
    if (typeof window.genererQRCode === 'function') {
      try { window.genererQRCode(); } catch (_) {}
    }

    const donnees = await chargerDonnees();
    appliquerDonnees(donnees, false);

    const lancer = () => reinitialiserChiffres();
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => setTimeout(lancer, 80));
    } else {
      setTimeout(lancer, 80);
    }

    setInterval(async () => {
      const d = await chargerDonnees();
      appliquerDonnees(d, false);
    }, RAFRAICHIR_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
