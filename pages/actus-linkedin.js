/* Actus LinkedIn : source JSON éditée manuellement, aucune collecte automatique. */
(function () {
  'use strict';
  const AUTOPLAY_MS = 7000;
  var host = document.querySelector('[data-linkedin-carousel]');
  if (!host) return;
  var dataUrl = new URL((host.getAttribute('data-base') || '../') + 'data/linkedin-posts.json', document.baseURI);
  var region = document.createElement('section');
  region.className = 'linkedin-carousel__region';
  region.setAttribute('role', 'region');
  region.setAttribute('aria-roledescription', 'carrousel');
  region.setAttribute('aria-label', 'Actus LinkedIn');
  var viewport = document.createElement('div');
  viewport.className = 'linkedin-carousel__viewport';
  var track = document.createElement('div');
  track.className = 'linkedin-carousel__track';
  var controls = document.createElement('div');
  controls.className = 'linkedin-carousel__controls';
  var prev = makeButton('Post précédent', '');
  var next = makeButton('Post suivant', '');
  var live = document.createElement('span');
  live.className = 'linkedin-carousel__live';
  live.setAttribute('aria-live', 'polite');
  live.setAttribute('aria-atomic', 'true');
  controls.append(prev, live, next);
  viewport.appendChild(track);
  region.append(viewport, controls);
  host.replaceChildren(region);
  var index = 0;
  var autoplayTimer = null;
  var motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');

  function makeButton(label, glyph) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'linkedin-carousel__button';
    button.setAttribute('aria-label', label);
    button.textContent = glyph;
    return button;
  }
  function inlineMarkdown(text, parent) {
    // Construire des nœuds DOM (jamais d'injection HTML) : **gras**, *italique*, [lien](https://...).
    var pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\(https:\/\/[^\s)]+\))/g;
    var cursor = 0, match;
    while ((match = pattern.exec(text))) {
      parent.appendChild(document.createTextNode(text.slice(cursor, match.index)));
      var token = match[0], node;
      if (token.slice(0, 2) === '**') {
        node = document.createElement('strong'); node.textContent = token.slice(2, -2);
      } else if (token.charAt(0) === '*') {
        node = document.createElement('em'); node.textContent = token.slice(1, -1);
      } else {
        var split = token.match(/^\[([^\]]+)\]\((https:\/\/[^\s)]+)\)$/);
        node = document.createElement('a'); node.textContent = split[1]; node.href = split[2];
        node.rel = 'noopener noreferrer'; node.target = '_blank';
      }
      parent.appendChild(node); cursor = pattern.lastIndex;
    }
    parent.appendChild(document.createTextNode(text.slice(cursor)));
  }
  function addText(text, parent) {
    String(text || '').split(/\r?\n/).forEach(function (line, i) {
      if (i) parent.appendChild(document.createElement('br'));
      inlineMarkdown(line, parent);
    });
  }
  function update() {
    var slides = Array.prototype.slice.call(track.children);
    slides.forEach(function (slide, i) {
      slide.hidden = i !== index;
      slide.setAttribute('aria-hidden', i === index ? 'false' : 'true');
    });
    live.textContent = slides.length ? (index + 1) + ' / ' + slides.length : '';
    prev.disabled = next.disabled = slides.length < 2;
  }
  function clearAutoplay() {
    if (autoplayTimer !== null) {
      window.clearTimeout(autoplayTimer);
      autoplayTimer = null;
    }
  }
  function scheduleAutoplay() {
    clearAutoplay();
    if (track.children.length < 2 || document.hidden || motionPreference.matches) return;
    autoplayTimer = window.setTimeout(function () {
      autoplayTimer = null;
      move(1);
    }, AUTOPLAY_MS);
  }
  function move(delta) {
    var count = track.children.length;
    if (count < 2) { scheduleAutoplay(); return; }
    index = (index + delta + count) % count;
    update();
    // Toute navigation réinitialise le délai, manuelle ou automatique.
    scheduleAutoplay();
  }
  prev.addEventListener('click', function () { move(-1); });
  next.addEventListener('click', function () { move(1); });
  region.addEventListener('keydown', function (event) {
    if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); move(1); }
  });
  document.addEventListener('visibilitychange', scheduleAutoplay);
  if (typeof motionPreference.addEventListener === 'function') {
    motionPreference.addEventListener('change', scheduleAutoplay);
  } else if (typeof motionPreference.addListener === 'function') {
    motionPreference.addListener(scheduleAutoplay);
  }
  fetch(dataUrl.href).then(function (response) {
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return response.json();
  }).then(function (posts) {
    if (!Array.isArray(posts)) throw new Error('Format JSON incorrect.');
    posts.slice(0, 5).forEach(function (post) {
      if (!post || typeof post.text !== 'string') return;
      var slide = document.createElement('article');
      slide.className = 'linkedin-carousel__slide';
      if (typeof post.image === 'string' && post.image.trim()) {
        var image = document.createElement('img');
        image.className = 'linkedin-carousel__image';
        image.alt = typeof post.alt === 'string' ? post.alt : '';
        image.src = new URL(post.image, dataUrl).href;
        image.addEventListener('error', function () { image.remove(); }, { once: true });
        slide.appendChild(image);
      }
      var excerpt = document.createElement('div');
      excerpt.className = 'linkedin-carousel__excerpt';
      addText(post.text, excerpt);
      slide.appendChild(excerpt);
      track.appendChild(slide);
    });
    if (!track.children.length) throw new Error('Aucun post exploitable.');
    update();
    scheduleAutoplay();
  }).catch(function (error) {
    console.warn('[PRESAGE] Actus LinkedIn indisponibles :', error.message);
    var message = document.createElement('p');
    message.className = 'linkedin-carousel__error';
    message.textContent = 'Actualités momentanément indisponibles.';
    viewport.replaceChildren(message);
    controls.hidden = true;
  });
})();
