// rotate.js : ?rotate=90 ou ?rotate=-90
(function () {
  const r = new URLSearchParams(location.search).get('rotate');
  if (r !== '90' && r !== '-90') return;
  const deg = parseInt(r, 10);

  const STAGE_L = 1080;
  const STAGE_H = 1920;
  let applying = false;

  function compute() {
    const stage = document.getElementById('stage');
    if (!stage) return;

    // Le stage est déjà portrait (1080x1920) : on le fait pivoter
    // pour qu'il remplisse un écran physique paysage.
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Après rotation de 90°, le stage occupe (STAGE_H x STAGE_L) à l'écran
    const scale = Math.min(vw / STAGE_H, vh / STAGE_L);

    applying = true;
    stage.style.transform =
      `translate(-50%, -50%) rotate(${deg}deg) scale(${scale})`;
    applying = false;
  }

  function init() {
    const stage = document.getElementById('stage');
    if (!stage) return;

    // Dès que main.js réécrit le transform (fitStage), on repasse derrière lui
    new MutationObserver(function () {
      if (!applying) compute();
    }).observe(stage, { attributes: true, attributeFilter: ['style'] });

    compute();
    window.addEventListener('resize', compute);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();