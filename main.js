/* Orchestration du kiosque : 4 iframes (planning / actus / chiffres / visite),
   rotation modulo 4, fondu sans flash, rechargements cachés.
   La page « visite » est une vidéo : elle possède sa propre durée
   (2 min 18 s = 138 000 ms), repart de 0:00 à chaque apparition, se met en
   pause dès qu'elle quitte l'écran et signale sa fin au kiosque.
   Créneaux horaires : le planning reste seul à l'écran pendant les plages
   définies dans CRENEAUX_PLANNING (heure de Paris). */
(function () {
  'use strict';

  const DUREE_PAGE_MS = 30_000;
  const DUREE_VISITE_MS = 138000; // 2 min 18 s (durée de la vidéo « visite »)
  const DUREE_TRANSITION_MS = 800;
  /* Fin « En chiffres » : le panneau bleu s'étend pour couvrir l'écran
     avant le fondu vers la vidéo « visite ». Le message « exit-chiffres »
     part 700 ms avant la fin des 30 s. */
  const CHIFFRES_SORTIE_AVANCE_MS = 700;
  const DELAI_RESEAU_MS = 20_000;
  const DELAI_CHANGEMENT_MS = 5_000;
  const REFRESH_MS = 60 * 60 * 1000;
  const STAGE_L = 1080;
  const STAGE_H = 1920;

  /* CRÉNEAUX : plages « planning seul » [h début, min début, h fin, min fin] */
  const CRENEAUX_PLANNING = [
    [7, 30, 10, 0],
    [12, 30, 14, 0]
  ];
  const INDEX_PLANNING = 0;           /* position de planning.html dans PAGES */
  const CONTROLE_CRENEAU_MS = 15_000; /* vérification toutes les 15 s */

  /* Rotation du kiosque : ordre d'affichage, message de relance et durée
     propre de chaque page (la vidéo « visite » dure 138 000 ms). */
  const PAGES = [
    { id: 'page-a', url: 'pages/planning.html', replay: 'kiosque:replay-planning', duration: 30000 },
    { id: 'page-b', url: 'pages/actus.html',    replay: 'kiosque:replay-actus',    duration: 21000 },
    { id: 'page-c', url: 'pages/chiffres.html', replay: 'kiosque:replay-chiffres', duration: 15000, exit: 'kiosque:exit-chiffres' },
    { id: 'page-d', url: 'pages/visite.html',   replay: 'kiosque:replay-visite',   duration: 117000 }
  ];

  const stage = document.getElementById('stage');
  const frames = PAGES.map(function (page) { return document.getElementById(page.id); });
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reducedMotion = motionQuery.matches;
  let active = 0;
  let pageTimer = 0;
  let exitTimer = 0;
  let refreshTimer = 0;
  let midnightTimer = 0;
  let transitionTimer = 0;
  let creneauTimer = 0;
  let switching = false;
  let pendingSwitch = false;
  let retryTimers = PAGES.map(function () { return 0; });
  let loadTimers = PAGES.map(function () { return 0; });
  let loaded = PAGES.map(function () { return false; });
  let reloadPending = PAGES.map(function () { return false; });
  let lastDay = dayKey();

  function dayKey() {
    return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' }).format(new Date());
  }

  /* CRÉNEAUX : heure actuelle à Paris, en minutes depuis minuit */
  function minutesParis() {
    const parts = new Intl.DateTimeFormat('fr-FR', {
      timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(new Date());
    const h = Number(parts.find(function (p) { return p.type === 'hour'; }).value) % 24;
    const m = Number(parts.find(function (p) { return p.type === 'minute'; }).value);
    return h * 60 + m;
  }

  /* CRÉNEAUX : true si on est dans une plage « planning seul » */
  function planningSeul() {
    const now = minutesParis();
    return CRENEAUX_PLANNING.some(function (c) {
      return now >= c[0] * 60 + c[1] && now < c[2] * 60 + c[3];
    });
  }

  function fitStage() {
    const scale = Math.min(innerWidth / STAGE_L, innerHeight / STAGE_H);
    stage.style.transform = `translate(-50%, -50%) scale(${scale})`;
  }

  function clearTimer(name) {
    if (name === 'page') { clearTimeout(pageTimer); pageTimer = 0; }
    if (name === 'exit') { clearTimeout(exitTimer); exitTimer = 0; }
    if (name === 'refresh') { clearTimeout(refreshTimer); refreshTimer = 0; }
    if (name === 'midnight') { clearTimeout(midnightTimer); midnightTimer = 0; }
  }

  function schedulePage() {
    clearTimer('page');
    clearTimer('exit');
    const page = PAGES[active];
    const duration = (page && page.duration) || DUREE_PAGE_MS;

    /* CRÉNEAUX : sur le planning en plage « planning seul », pas de rotation.
       On revérifie régulièrement pour reprendre la rotation à la fin. */
    if (active === INDEX_PLANNING && planningSeul()) {
      pageTimer = setTimeout(schedulePage, CONTROLE_CRENEAU_MS);
      return;
    }

    if (page && page.exit) {
      const avance = Math.min(CHIFFRES_SORTIE_AVANCE_MS, Math.max(0, duration - 100));
      exitTimer = setTimeout(function () {
        exitTimer = 0;
        const index = PAGES.indexOf(page);
        if (index >= 0) postTo(index, { type: page.exit });
      }, Math.max(0, duration - avance));
    }

    pageTimer = setTimeout(switchPage, duration);
  }

  function scheduleMidnight() {
    clearTimer('midnight');
    const now = Date.now();
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date(now)).reduce(function (out, part) {
      if (part.type !== 'literal') out[part.type] = Number(part.value);
      return out;
    }, {});
    let target = Date.UTC(parts.year, parts.month - 1, parts.day + 1);
    for (let i = 0; i < 3; i++) {
      const local = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
      }).formatToParts(new Date(target)).reduce(function (out, part) {
        if (part.type !== 'literal') out[part.type] = Number(part.value);
        return out;
      }, {});
      target += Date.UTC(parts.year, parts.month - 1, parts.day + 1) -
        Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
    }
    midnightTimer = setTimeout(handleMidnight, Math.max(1000, target - now + 2000));
  }

  function scheduleRefresh() {
    clearTimer('refresh');
    refreshTimer = setTimeout(handleHourlyRefresh, REFRESH_MS);
  }

  function setFrameTransition(frame, value) {
    frame.style.transition = reducedMotion ? 'none' : `opacity ${DUREE_TRANSITION_MS}ms ease`;
    frame.style.zIndex = '1';
    frame.style.opacity = value;
  }

  function postTo(index, message) {
    try {
      const frame = frames[index];
      if (frame && frame.contentWindow) frame.contentWindow.postMessage(message, '*');
    } catch (error) { /* iframe éventuellement non chargée */ }
  }

  function postReplay(frame, type) {
    try {
      if (frame.contentWindow) frame.contentWindow.postMessage({ type: type }, '*');
    } catch (error) { /* iframe éventuellement non chargée */ }
  }

  function pausePage(index) {
    const page = PAGES[index];
    if (!page || page.replay !== 'kiosque:replay-visite') return;
    postTo(index, { type: 'kiosque:pause-visite' });
  }

  function waitForIncoming(index) {
    if (loaded[index]) return Promise.resolve();
    return new Promise(function (resolve) {
      let done = false;
      const finish = function () { if (!done) { done = true; resolve(); } };
      frames[index].addEventListener('load', finish, { once: true });
      setTimeout(finish, DELAI_CHANGEMENT_MS);
    });
  }

  async function switchPage() {
    if (switching) { pendingSwitch = true; return; }
    clearTimer('page');
    switching = true;
    try {
      /* CRÉNEAUX : en plage « planning seul », la cible est toujours le planning */
      const next = planningSeul() ? INDEX_PLANNING : (active + 1) % frames.length;
      if (next === active) {
        /* Déjà sur la bonne page : on reprogramme sans transition. */
        schedulePage();
        return;
      }

      const incoming = frames[next];
      const outgoing = frames[active];
      await waitForIncoming(next);

      setFrameTransition(outgoing, '1');
      setFrameTransition(incoming, '0');
      incoming.style.zIndex = '2';
      postReplay(incoming, (PAGES[next] && PAGES[next].replay) || 'kiosque:replay');
      pausePage(active);

      requestAnimationFrame(function () {
        incoming.style.opacity = '1';
        if (reducedMotion) finishTransition(outgoing, incoming);
        else {
          clearTimeout(transitionTimer);
          transitionTimer = setTimeout(function () { finishTransition(outgoing, incoming); }, DUREE_TRANSITION_MS);
        }
      });
      active = next;
      schedulePage();
    } finally {
      switching = false;
      if (pendingSwitch) {
        pendingSwitch = false;
        switchPage();
      }
    }
  }

  function finishTransition(outgoing, incoming) {
    outgoing.style.opacity = '0';
    outgoing.style.zIndex = '1';
    const other = (active + 1) % frames.length;
    if (other !== active && reloadPending[other]) reloadHidden(other);
  }

  function cacheBustedUrl(index) {
    const page = PAGES[index];
    const url = new URL((page && page.url) || '', location.href);
    url.searchParams.set('_kiosque', String(Date.now()));
    return url.href;
  }

  async function networkAvailable() {
    try {
      const response = await fetch(cacheBustedUrl(0), { method: 'HEAD', cache: 'no-store' });
      return response.ok;
    } catch (error) { return false; }
  }

  async function reloadHidden(index) {
    if (index === active || !reloadPending[index] || loadTimers[index]) return;
    if (!(await networkAvailable())) { scheduleRetry(index); return; }
    clearTimeout(retryTimers[index]);
    retryTimers[index] = 0;
    const frame = frames[index];
    loaded[index] = false;
    clearTimeout(loadTimers[index]);
    loadTimers[index] = setTimeout(function () {
      loadTimers[index] = 0;
      scheduleRetry(index);
    }, DELAI_RESEAU_MS);
    frame.addEventListener('load', function onLoad() {
      frame.removeEventListener('load', onLoad);
      clearTimeout(loadTimers[index]);
      loadTimers[index] = 0;
      loaded[index] = true;
      reloadPending[index] = false;
      frame.style.opacity = '0';
      frame.style.zIndex = '1';
    });
    frame.src = cacheBustedUrl(index);
  }

  function scheduleRetry(index) {
    clearTimeout(retryTimers[index]);
    retryTimers[index] = setTimeout(function () {
      retryTimers[index] = 0;
      reloadHidden(index);
    }, REFRESH_MS);
  }

  function markForReload(index) {
    reloadPending[index] = true;
    if (index !== active) reloadHidden(index);
  }

  async function refreshBoth() {
    frames.forEach(function (_, i) { markForReload(i); });
    scheduleRefresh();
  }

  function handleMidnight() {
    const current = dayKey();
    if (current !== lastDay) {
      lastDay = current;
      frames.forEach(function (_, i) { markForReload(i); });
    }
    scheduleMidnight();
  }

  function handleHourlyRefresh() {
    refreshBoth();
  }

  function handleMotionChange(event) {
    reducedMotion = event.matches;
    frames.forEach(function (frame) { frame.style.transition = reducedMotion ? 'none' : `opacity ${DUREE_TRANSITION_MS}ms ease`; });
    if (reducedMotion && transitionTimer) {
      clearTimeout(transitionTimer);
      transitionTimer = 0;
      finishTransition(frames[active], frames[active]);
    }
  }

  function handleFrameMessage(event) {
    const data = event && event.data;
    if (!data || data.type !== 'kiosque:visite-ended') return;
    const index = PAGES.findIndex(function (page) { return page.replay === 'kiosque:replay-visite'; });
    if (index < 0) return;
    const frame = frames[index];
    if (!frame || event.source !== frame.contentWindow) return;
    if (active !== index) return;
    clearTimer('page');
    switchPage();
  }

  frames.forEach(function (frame, index) {
    frame.addEventListener('load', function () {
      loaded[index] = true;
      if (index !== active) frame.style.opacity = '0';
    });
  });
  window.addEventListener('message', handleFrameMessage);
  if (motionQuery.addEventListener) motionQuery.addEventListener('change', handleMotionChange);
  else motionQuery.addListener(handleMotionChange);

  function init() {
    fitStage();
    window.addEventListener('resize', fitStage, { passive: true });
    frames.forEach(function (frame) { frame.style.transition = reducedMotion ? 'none' : `opacity ${DUREE_TRANSITION_MS}ms ease`; });
    frames[0].style.zIndex = '2';
    frames[0].style.opacity = '1';
    for (let i = 1; i < frames.length; i++) {
      frames[i].style.zIndex = '1';
      frames[i].style.opacity = '0';
    }
    for (let i = 1; i < frames.length; i++) pausePage(i);
    schedulePage();
    scheduleRefresh();
    scheduleMidnight();

    /* CRÉNEAUX : à l'entrée dans une plage « planning seul », on force le
       retour au planning sans attendre la fin de la page en cours. */
    creneauTimer = setInterval(function () {
      if (planningSeul() && active !== INDEX_PLANNING && !switching) {
        switchPage();
      }
    }, CONTROLE_CRENEAU_MS);
  }

  init();
})();
