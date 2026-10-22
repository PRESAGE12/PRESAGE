/* ==========================================================================
   PRESAGE – Écran « Infos du jour »
   JavaScript pur, sans dépendance.
   - Mise à l'échelle du canevas 1080 × 1920
   - Horloge et date
   - Données : fête du jour, qualité de l'air, météo, actus (CSV)
   - Rafraîchissement toutes les 5 min sans clignotement
   - Rechargement complet de la page chaque jour après 3 h
   Toutes les données externes sont affichées via textContent uniquement.
   ========================================================================== */
(function () {
  'use strict';

  /* ---------------------------------------------------------------------- *
   *  CONFIGURATION (à adapter)
   * ---------------------------------------------------------------------- */
  var CONFIG = {
    fuseau: 'Europe/Paris',
    latitude: 50.6292,            // Lille, France (météo + qualité de l'air)
    longitude: 3.0573,
    intervalleMs: 5 * 60 * 1000,  // rafraîchissement des données
    heureRechargement: 3,         // rechargement complet chaque jour après 3 h
    timeoutMs: 10000,             // délai max d'une requête réseau

    // Actus : URL d'un Google Sheet « publié sur le web » au format CSV.
    // Colonnes attendues (1re ligne = en-têtes) : titre, texte, date
    // Laisser vide pour afficher « Aucune actualité ».
    actusUrl: '',
    actusRotationMs: 15000,       // durée d'affichage de chaque actu
    actusMax: 8,

    // Fête du jour : API publique + fichier local de secours (facultatif)
    feteUrl: 'https://nameday.abalin.net/api/V1/today?country=fr&timezone=Europe/Paris',
    feteFichierLocal: 'fetes.json'   // format : { "10-19": "Luc", ... } (clé MM-JJ)
  };

  var STAGE_L = 1080;
  var STAGE_H = 1920;

  /* ---------------------------------------------------------------------- *
   *  Utilitaires
   * ---------------------------------------------------------------------- */
  function $(id) { return document.getElementById(id); }

  var SVG_NS = 'http://www.w3.org/2000/svg';

  var elStage = $('stage');
  var charge = { fete: false, air: false, meteo: false, actus: false };
  var signatures = {};   // dernière donnée affichée, pour éviter les redessins inutiles

  function setText(el, valeur) {
    if (!el) return;
    var v = String(valeur);
    if (el.textContent !== v) el.textContent = v;
  }

  function fetchAvecTimeout(url) {
    var ctrl = new AbortController();
    var t = setTimeout(function () { ctrl.abort(); }, CONFIG.timeoutMs);
    return fetch(url, { cache: 'no-store', signal: ctrl.signal })
      .then(function (r) {
        clearTimeout(t);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r;
      }, function (e) { clearTimeout(t); throw e; });
  }
  function getJson(url) { return fetchAvecTimeout(url).then(function (r) { return r.json(); }); }
  function getTexte(url) { return fetchAvecTimeout(url).then(function (r) { return r.text(); }); }

  function majuscule(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function nombre(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }
  function entier(v) { var n = nombre(v); return n === null ? '--' : String(Math.round(n)); }

  /* Réduit la taille de police jusqu'à ce que le texte tienne dans la largeur. */
  function ajusterTexte(el, tailleMax, tailleMin) {
    var t = tailleMax;
    el.style.fontSize = t + 'px';
    while (el.scrollWidth > el.clientWidth && t > tailleMin) {
      t -= 2;
      el.style.fontSize = t + 'px';
    }
  }

  /* ---------------------------------------------------------------------- *
   *  1. Mise à l'échelle du canevas (centré, sans déformation)
   * ---------------------------------------------------------------------- */
  function ajusterEchelle() {
    var s = Math.min(window.innerWidth / STAGE_L, window.innerHeight / STAGE_H);
    elStage.style.setProperty('--s', String(s));
  }
  // La mise à l’échelle est gérée exclusivement par le wrapper parent.

  /* ---------------------------------------------------------------------- *
   *  2. Horloge, date, clé de jour
   * ---------------------------------------------------------------------- */
  var fmtHeure = new Intl.DateTimeFormat('fr-FR', {
    timeZone: CONFIG.fuseau, hour: '2-digit', minute: '2-digit', hour12: false
  });
  var fmtDate = new Intl.DateTimeFormat('fr-FR', {
    timeZone: CONFIG.fuseau, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
  var fmtISO = new Intl.DateTimeFormat('sv-SE', { timeZone: CONFIG.fuseau }); // AAAA-MM-JJ

  function cleDuJourCalendaire(d) { return fmtISO.format(d); }

  /* Clé de « journée d'affichage » : change à 3 h du matin. */
  function cleDuJourAffichage(d) {
    return fmtISO.format(new Date(d.getTime() - CONFIG.heureRechargement * 3600 * 1000));
  }

  var cleAffichageAuChargement = cleDuJourAffichage(new Date());
  var cleCalendaireCourante = cleDuJourCalendaire(new Date());

  function majHorloge() {
    var now = new Date();
    setText($('heure'), fmtHeure.format(now));
    setText($('date'), majuscule(fmtDate.format(now)));

    // Changement de date calendaire (minuit) : on redemande la fête du jour.
    var cle = cleDuJourCalendaire(now);
    if (cle !== cleCalendaireCourante) {
      cleCalendaireCourante = cle;
      chargerFete();
    }
  }

  /* ---------------------------------------------------------------------- *
   *  3. Fête du jour
   * ---------------------------------------------------------------------- */
  function extraireNomFete(j) {
    if (!j || typeof j !== 'object') return null;
    var n = j.nameday || (j.data && j.data.nameday) || j.data || null;
    if (typeof n === 'string') return n;
    if (n && typeof n === 'object') {
      if (typeof n.fr === 'string') return n.fr;
      var vals = Object.keys(n).map(function (k) { return n[k]; });
      for (var i = 0; i < vals.length; i++) if (typeof vals[i] === 'string' && vals[i]) return vals[i];
    }
    return null;
  }

  function cleMoisJour() {
    return cleDuJourCalendaire(new Date()).slice(5);   // « MM-JJ »
  }

  function fetesLocal() {
    return getJson(CONFIG.feteFichierLocal).then(function (t) {
      var v = t && t[cleMoisJour()];
      return (typeof v === 'string' && v) ? v : null;
    });
  }

  /* « Victor » -> « St Victor » (premier prénom si l'API en renvoie plusieurs). */
  function formaterSaint(nom) {
    var n = String(nom).split(/[,;]/)[0].trim();
    if (!n) return null;
    if (/^(st|ste|saint|sainte)\b/i.test(n)) return n;
    return 'St ' + n;
  }

  function afficherFete(nom) {
    var el = $('fete-nom');
    if (signatures.fete === nom) return;
    signatures.fete = nom;
    el.textContent = nom;
    ajusterTexte(el, 46, 24);
    charge.fete = true;
  }

  function chargerFete() {
    // 1) calendrier local (data/fetes.json) : fiable, sans internet
    // 2) à défaut, API en ligne (le prénom reçu est alors précédé de « St »)
    return fetesLocal()
      .catch(function () { return null; })
      .then(function (nom) {
        if (nom) return nom;
        return getJson(CONFIG.feteUrl).then(extraireNomFete).then(formaterSaint)
          .catch(function () { return null; });
      })
      .then(function (nom) {
        if (nom) afficherFete(nom);
        else if (!charge.fete) setText($('fete-nom'), '—');
      });
  }

  /* ---------------------------------------------------------------------- *
   *  4. Qualité de l'air (Open-Meteo, indice européen)
   * ---------------------------------------------------------------------- */
  var BANDES_AIR = [
    { max: 20,  label: 'Bon',             couleur: '#50F0E6' },
    { max: 40,  label: 'Correct',         couleur: '#50CCAA' },
    { max: 60,  label: 'Moyen',           couleur: '#F0E641' },
    { max: 80,  label: 'Mauvais',         couleur: '#FF5050' },
    { max: 100, label: 'Très mauvais',    couleur: '#960032' },
    { max: Infinity, label: 'Extrêmement mauvais', couleur: '#7D2181' }
  ];

  function chargerAir() {
    var url = 'https://air-quality-api.open-meteo.com/v1/air-quality' +
      '?latitude=' + CONFIG.latitude + '&longitude=' + CONFIG.longitude +
      '&current=european_aqi&timezone=' + encodeURIComponent(CONFIG.fuseau);
    return getJson(url).then(function (j) {
      var aqi = nombre(j && j.current && j.current.european_aqi);
      if (aqi === null) throw new Error('indice absent');
      var idx = 0;
      while (aqi > BANDES_AIR[idx].max) idx++;
      var bande = BANDES_AIR[idx];
      var sig = idx + ':' + Math.round(aqi);
      if (signatures.air === sig) return;
      signatures.air = sig;

      setText($('air-label'), bande.label);
      ajusterTexte($('air-label'), 38, 22);
      setText($('air-detail'), 'Indice européen : ' + Math.round(aqi));
      $('carte-air').style.setProperty('--couleur', bande.couleur);
      var segs = $('air-jauge').children;
      for (var i = 0; i < segs.length; i++) segs[i].classList.toggle('actif', i <= idx);
      charge.air = true;
    }).catch(function () {
      if (!charge.air) {
        setText($('air-label'), 'Indisponible');
        setText($('air-detail'), '');
      }
    });
  }

  /* ---------------------------------------------------------------------- *
   *  5. Météo (Open-Meteo)
   * ---------------------------------------------------------------------- */
  function decrireCode(code, jour) {
    if (code === 0)  return { icone: jour ? 'sun' : 'moon', texte: 'Ciel dégagé' };
    if (code === 1)  return { icone: jour ? 'sun' : 'moon', texte: 'Plutôt dégagé' };
    if (code === 2)  return { icone: jour ? 'partly' : 'cloud', texte: 'Partiellement nuageux' };
    if (code === 3)  return { icone: 'cloud', texte: 'Couvert' };
    if (code === 45 || code === 48) return { icone: 'fog', texte: 'Brouillard' };
    if (code >= 51 && code <= 57)   return { icone: 'rain', texte: 'Bruine' };
    if (code >= 61 && code <= 67)   return { icone: 'rain', texte: 'Pluie' };
    if (code >= 71 && code <= 77)   return { icone: 'snow', texte: 'Neige' };
    if (code >= 80 && code <= 82)   return { icone: 'rain', texte: 'Averses' };
    if (code === 85 || code === 86) return { icone: 'snow', texte: 'Averses de neige' };
    if (code >= 95 && code <= 99)   return { icone: 'storm', texte: 'Orage' };
    return { icone: 'cloud', texte: 'Variable' };
  }

  function creerIcone(nom, classe) {
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'ico' + (classe ? ' ' + classe : ''));
    svg.setAttribute('aria-hidden', 'true');
    var use = document.createElementNS(SVG_NS, 'use');
    use.setAttribute('href', '#i-' + nom);
    svg.appendChild(use);
    return svg;
  }

  function creerEl(tag, classe, texte) {
    var e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texte !== undefined) e.textContent = texte;
    return e;
  }

  var fmtJourSemaine = new Intl.DateTimeFormat('fr-FR', { timeZone: CONFIG.fuseau, weekday: 'long' });

  function chargerMeteo() {
    var url = 'https://api.open-meteo.com/v1/forecast' +
      '?latitude=' + CONFIG.latitude + '&longitude=' + CONFIG.longitude +
      '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
      '&wind_speed_unit=kmh&forecast_days=6&timezone=' + encodeURIComponent(CONFIG.fuseau);

    return getJson(url).then(function (j) {
      var c = j && j.current, d = j && j.daily;
      if (!c || !d || !Array.isArray(d.time)) throw new Error('réponse incomplète');
      var sig = JSON.stringify([c, d]);
      if (signatures.meteo === sig) return;
      signatures.meteo = sig;

      var desc = decrireCode(c.weather_code, c.is_day === 1);

      // Bloc « maintenant »
      var ico = $('m-icone');
      ico.firstElementChild.setAttribute('href', '#i-' + desc.icone);
      setText($('m-temp'), entier(c.temperature_2m) + '°');
      setText($('m-cond'), desc.texte);
      setText($('m-minmax'), 'Min ' + entier(d.temperature_2m_min[0]) + '°  ·  Max ' + entier(d.temperature_2m_max[0]) + '°');
      setText($('m-ressenti'), entier(c.apparent_temperature) + '°');
      setText($('m-vent'), entier(c.wind_speed_10m) + ' km/h');
      setText($('m-humidite'), entier(c.relative_humidity_2m) + ' %');

      // Prévisions : demain + 4 jours (construites hors du DOM, puis remplacées d'un coup)
      var frag = document.createDocumentFragment();
      for (var i = 1; i < d.time.length && i <= 5; i++) {
        var dateJour = new Date(d.time[i] + 'T12:00:00Z');
        var nomJour = (i === 1) ? 'Demain' : majuscule(fmtJourSemaine.format(dateJour));
        var info = decrireCode(d.weather_code[i], true);
        var pluie = nombre(d.precipitation_probability_max && d.precipitation_probability_max[i]);

        var ligne = creerEl('div', 'm-jour');
        ligne.appendChild(creerEl('span', 'nom', nomJour));
        ligne.appendChild(creerIcone(info.icone));
        ligne.appendChild(creerEl('span', 'pluie', pluie === null ? '' : Math.round(pluie) + ' %'));
        var temps = creerEl('span', 'temps', entier(d.temperature_2m_max[i]) + '° ');
        temps.appendChild(creerEl('small', null, entier(d.temperature_2m_min[i]) + '°'));
        ligne.appendChild(temps);
        frag.appendChild(ligne);
      }
      $('m-jours').replaceChildren(frag);
      charge.meteo = true;
    }).catch(function () {
      if (!charge.meteo) {
        setText($('m-cond'), 'Météo indisponible');
        setText($('m-temp'), '--°');
      }
    });
  }

  /* ---------------------------------------------------------------------- *
   *  6. Actus (CSV publié depuis un Google Sheet)
   * ---------------------------------------------------------------------- */
  var actus = [];
  var actuIndex = 0;
  var actuTimer = null;

  /* Analyse CSV minimale (RFC 4180 : guillemets, virgules, retours à la ligne). */
  function analyserCsv(texte) {
    var lignes = [], ligne = [], champ = '', entre = false, i, ch;
    for (i = 0; i < texte.length; i++) {
      ch = texte.charAt(i);
      if (entre) {
        if (ch === '"') {
          if (texte.charAt(i + 1) === '"') { champ += '"'; i++; }
          else entre = false;
        } else champ += ch;
      } else if (ch === '"') entre = true;
      else if (ch === ',') { ligne.push(champ); champ = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && texte.charAt(i + 1) === '\n') i++;
        ligne.push(champ); champ = '';
        lignes.push(ligne); ligne = [];
      } else champ += ch;
    }
    if (champ !== '' || ligne.length) { ligne.push(champ); lignes.push(ligne); }
    return lignes;
  }

  function csvVersActus(texte) {
    var l = analyserCsv(texte);
    if (l.length < 2) return [];
    var en = l[0].map(function (h) { return h.trim().toLowerCase(); });
    var iT = en.indexOf('titre'), iX = en.indexOf('texte'), iD = en.indexOf('date');
    if (iT < 0) return [];
    var res = [];
    for (var i = 1; i < l.length && res.length < CONFIG.actusMax; i++) {
      var titre = (l[i][iT] || '').trim();
      if (!titre) continue;
      res.push({
        titre: titre,
        texte: iX >= 0 ? (l[i][iX] || '').trim() : '',
        date: iD >= 0 ? (l[i][iD] || '').trim() : ''
      });
    }
    return res;
  }

  function afficherActu(animer) {
    var zone = $('actu');
    var maj = function () {
      if (!actus.length) {
        setText($('actu-date'), '');
        setText($('actu-titre'), 'Aucune actualité');
        setText($('actu-texte'), '');
        setText($('actu-compteur'), '');
        return;
      }
      var a = actus[actuIndex % actus.length];
      setText($('actu-date'), a.date);
      setText($('actu-titre'), a.titre);
      setText($('actu-texte'), a.texte);
      setText($('actu-compteur'), actus.length > 1 ? (actuIndex % actus.length + 1) + ' / ' + actus.length : '');
    };
    var reduit = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!animer || reduit) { maj(); return; }
    zone.classList.add('masque');
    setTimeout(function () { maj(); zone.classList.remove('masque'); }, 650);
  }

  function demarrerRotationActus() {
    if (actuTimer) clearInterval(actuTimer);
    actuTimer = null;
    if (actus.length > 1) {
      actuTimer = setInterval(function () {
        actuIndex = (actuIndex + 1) % actus.length;
        afficherActu(true);
      }, CONFIG.actusRotationMs);
    }
  }

  function chargerActus() {
    if (!$('actu')) return Promise.resolve();   // carte gérée par le widget RSS.app
    if (!CONFIG.actusUrl) {
      if (!charge.actus) { charge.actus = true; afficherActu(false); }
      return Promise.resolve();
    }
    return getTexte(CONFIG.actusUrl).then(function (txt) {
      var liste = csvVersActus(txt);
      var sig = JSON.stringify(liste);
      charge.actus = true;
      if (signatures.actus === sig) return;
      signatures.actus = sig;
      actus = liste;
      actuIndex = 0;
      afficherActu(false);
      demarrerRotationActus();
    }).catch(function () {
      if (!charge.actus) { charge.actus = true; afficherActu(false); }
    });
  }

  /* ---------------------------------------------------------------------- *
   *  7. Rafraîchissement + rechargement quotidien
   * ---------------------------------------------------------------------- */
  function rafraichirTout() {
    return Promise.all([chargerFete(), chargerAir(), chargerMeteo(), chargerActus()]);
  }

  function verifierRechargement() {
    if (cleDuJourAffichage(new Date()) !== cleAffichageAuChargement) {
      window.location.reload();
    }
  }

  /* ---------------------------------------------------------------------- *
   *  8. Démarrage
   * ---------------------------------------------------------------------- */
  function lancerAnimation() {
    if (document.documentElement.classList.contains('go')) return;
    document.documentElement.classList.add('go');
  }

  majHorloge();
  setInterval(majHorloge, 1000);
  setInterval(verifierRechargement, 30 * 1000);
  setInterval(rafraichirTout, CONFIG.intervalleMs);

  rafraichirTout();

  // Animation d'entrée : quand la police est prête (ou au bout de 1,5 s au plus).
  var lance = false;
  function go() { if (!lance) { lance = true; lancerAnimation(); } }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(go);
  setTimeout(go, 1500);

  // Les mesures de texte (ajusterTexte) dépendent de la police : on refait l'ajustement une fois chargée.
  window.addEventListener('message', function (event) {
    if (event.source !== window.parent) return;
    if (!event.data || event.data.type !== 'kiosque:replay-actus') return;
    var nodes = document.querySelectorAll('[data-anim]');
    nodes.forEach(function (node) {
      node.classList.remove('rejouer-animation');
      void node.offsetWidth;
      node.classList.add('rejouer-animation');
    });
    document.documentElement.classList.remove('go');
    void document.documentElement.offsetWidth;
    document.documentElement.classList.add('go');
  });

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () {
      if (charge.fete) ajusterTexte($('fete-nom'), 46, 24);
      if (charge.air) ajusterTexte($('air-label'), 38, 22);
    });
  }
})();
