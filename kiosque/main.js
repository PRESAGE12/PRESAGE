/* Orchestration du kiosque : double iframe, fondu sans flash, rechargements cachés. */
(function () {
  'use strict';

  const DUREE_PAGE_MS = 30_000;
  const DUREE_TRANSITION_MS = 800;
  const DELAI_RESEAU_MS = 20_000;
  const DELAI_CHANGEMENT_MS = 5_000;
  const REFRESH_MS = 60 * 60 * 1000;
  const STAGE_L = 1080;
  const STAGE_H = 1920;
  const PAGE_URLS = ['pages/planning.html', 'pages/actus.html'];

  const stage = document.getElementById('stage');
  const frames = [document.getElementById('page-a'), document.getElementById('page-b')];
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reducedMotion = motionQuery.matches;
  let active = 0;
  let pageTimer = 0;
  let refreshTimer = 0;
  let midnightTimer = 0;
  let transitionTimer = 0;
  let retryTimers = [0, 0];
  let loadTimers = [0, 0];
  let loaded = [false, false];
  let reloadPending = [false, false];
  let lastDay = dayKey();

  function dayKey() {
    return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' }).format(new Date());
  }

  function fitStage() {
    const scale = Math.min(innerWidth / STAGE_L, innerHeight / STAGE_H);
    stage.style.transform = `translate(-50%, -50%) scale(${scale})`;
  }

  function clearTimer(name) {
    if (name === 'page') { clearTimeout(pageTimer); pageTimer = 0; }
    if (name === 'refresh') { clearTimeout(refreshTimer); refreshTimer = 0; }
    if (name === 'midnight') { clearTimeout(midnightTimer); midnightTimer = 0; }
  }

  function schedulePage() {
    clearTimer('page');
    pageTimer = setTimeout(switchPage, DUREE_PAGE_MS);
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

function postReplay(frame, type) {
  try {
    if (frame.contentWindow) frame.contentWindow.postMessage({ type: type }, '*');
  } catch (error) { /* iframe éventuellement non chargée */ }
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
    clearTimer('page');
    const next = active ^ 1;
    const incoming = frames[next];
    const outgoing = frames[active];
    await waitForIncoming(next);

    setFrameTransition(outgoing, '1');
    setFrameTransition(incoming, '0');
    incoming.style.zIndex = '2';
    postReplay(incoming, next === 1 ? 'kiosque:replay-actus' : 'kiosque:replay-planning');

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
  }

  function finishTransition(outgoing, incoming) {
    outgoing.style.opacity = '0';
    outgoing.style.zIndex = '1';
    if (reloadPending[active ^ 1]) reloadHidden(active ^ 1);
  }

  function cacheBustedUrl(index) {
    const url = new URL(PAGE_URLS[index], location.href);
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
    markForReload(0);
    markForReload(1);
    scheduleRefresh();
  }

  function handleMidnight() {
    const current = dayKey();
    if (current !== lastDay) {
      lastDay = current;
      markForReload(0);
      markForReload(1);
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
      finishTransition(frames[active ^ 1], frames[active]);
    }
  }

  frames.forEach(function (frame, index) {
    frame.addEventListener('load', function () {
      loaded[index] = true;
      if (index !== active) frame.style.opacity = '0';
    });
  });
  if (motionQuery.addEventListener) motionQuery.addEventListener('change', handleMotionChange);
  else motionQuery.addListener(handleMotionChange);

  function init() {
    fitStage();
    window.addEventListener('resize', fitStage, { passive: true });
    frames.forEach(function (frame) { frame.style.transition = reducedMotion ? 'none' : `opacity ${DUREE_TRANSITION_MS}ms ease`; });
    frames[0].style.zIndex = '2';
    frames[0].style.opacity = '1';
    frames[1].style.zIndex = '1';
    frames[1].style.opacity = '0';
    schedulePage();
    scheduleRefresh();
    scheduleMidnight();
  }

  init();
})();
