/* Carrousel photo PRESAGE, sans dépendance. Les images absentes sont retirées. */
(function () {
  'use strict';
  const AUTOPLAY_MS = 10000;
  var containers = document.querySelectorAll('[data-photos-carousel]');
  containers.forEach(function (root) { init(root); });

  function init(root) {
    var base = root.getAttribute('data-base');
    var dataUrl = new URL((base || '../') + 'data/photos.json', document.baseURI);
    var items = [];
    var index = 0;
    var autoplayTimer = null;
    var motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    var region = document.createElement('div');
    region.className = 'photos-carousel';
    region.setAttribute('role', 'region');
    region.setAttribute('aria-roledescription', 'carrousel');
    region.setAttribute('aria-label', '');
    var title = document.createElement('h2');
    title.className = 'photos-carousel__title';
    title.textContent = '';
    var viewport = document.createElement('div');
    viewport.className = 'photos-carousel__viewport';
    var track = document.createElement('div');
    track.className = 'photos-carousel__track';
    var controls = document.createElement('div');
    var prev = button('Photo précédente', '');
    var next = button('Photo suivante', '');
    var status = document.createElement('span');
    status.className = 'photos-carousel__status';
    status.setAttribute('aria-live', 'polite');
    status.setAttribute('aria-atomic', 'true');
    controls.append(prev, status, next);
    viewport.appendChild(track);
    region.append(title, viewport, controls);
    root.replaceChildren(region);

    function button(label, symbol) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'photos-carousel__button';
      b.setAttribute('aria-label', label);
      b.textContent = symbol;
      return b;
    }
    function render() {
      var slides = track.querySelectorAll('.photos-carousel__slide');
      slides.forEach(function (slide, i) {
        slide.hidden = i !== index;
        slide.setAttribute('aria-hidden', i === index ? 'false' : 'true');
      });
      status.textContent = slides.length ? (index + 1) + ' / ' + slides.length : '';
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
      var count = track.querySelectorAll('.photos-carousel__slide').length;
      if (count < 2 || document.hidden || motionPreference.matches) return;
      autoplayTimer = window.setTimeout(function () {
        autoplayTimer = null;
        move(1, false);
      }, AUTOPLAY_MS);
    }
    function move(delta) {
      var count = track.querySelectorAll('.photos-carousel__slide').length;
      if (count < 2) { scheduleAutoplay(); return; }
      index = (index + delta + count) % count;
      render();
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
    }).then(function (data) {
      if (!Array.isArray(data)) throw new Error('Le JSON doit être une liste.');
      data.slice(0, 7).forEach(function (photo) {
        if (!photo || typeof photo.src !== 'string' || typeof photo.alt !== 'string') return;
        var slide = document.createElement('div');
        slide.className = 'photos-carousel__slide';
        var image = document.createElement('img');
        image.alt = photo.alt;
        image.loading = 'lazy';
        image.src = new URL(photo.src, dataUrl).href;
        image.addEventListener('error', function () {
          slide.remove();
          var slides = track.querySelectorAll('.photos-carousel__slide');
          if (!slides.length) {
            scheduleAutoplay();
            title.hidden = true;
            viewport.hidden = true;
            controls.hidden = true;
          } else {
            index = Math.min(index, slides.length - 1);
            render();
            scheduleAutoplay();
          }
        }, { once: true });
        slide.appendChild(image);
        track.appendChild(slide);
      });
      render();
      scheduleAutoplay();
      if (!track.children.length) {
        title.hidden = true;
        viewport.hidden = true;
        controls.hidden = true;
      }
    }).catch(function (error) {
      console.warn('[PRESAGE] Photos non chargées :', error.message);
      title.hidden = true;
      viewport.hidden = true;
      controls.hidden = true;
    });
  }
})();
