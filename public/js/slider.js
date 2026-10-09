// Photo slideshows (partials/photo-slider.hbs): the next photo slides in over the current one.
// Autoplay runs only while the slideshow is on screen, the tab is visible and nobody is hovering over it or using
// its controls; the pause button stops it for good. With reduced motion it starts paused and photos swap instantly.
(function () {
  'use strict';

  var INTERVAL = 6500;
  var DURATION = 950; // a little longer than the 900 ms CSS slide
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  Array.prototype.forEach.call(document.querySelectorAll('[data-slider]'), function (root) {
    var slides = Array.prototype.slice.call(root.querySelectorAll('[data-slider-slide]'));
    if (slides.length < 2) return;

    var frame = root.querySelector('[data-slider-frame]');
    var dots = Array.prototype.slice.call(root.querySelectorAll('[data-slider-dot]'));
    var toggle = root.querySelector('[data-slider-toggle]');
    var status = root.querySelector('[data-slider-status]');
    var current = 0;
    var cleanup = null;
    var timer = null;
    var userPaused = reduced;
    var hovering = false;
    var focusInside = false;
    var onScreen = true;

    var load = function (index) {
      var image = slides[(index + slides.length) % slides.length].querySelector('img');
      if (image && image.loading === 'lazy') image.loading = 'eager';
    };

    var finish = function () {
      if (!cleanup) return;
      window.clearTimeout(cleanup.timer);
      cleanup.slide.setAttribute('data-state', 'idle');
      cleanup.slide.removeAttribute('data-dir');
      cleanup.slide.removeAttribute('data-from');
      cleanup = null;
    };

    var markDot = function () {
      dots.forEach(function (dot, i) {
        if (i === current) dot.setAttribute('aria-current', 'true');
        else dot.removeAttribute('aria-current');
      });
    };

    var show = function (index, back, announce) {
      index = (index + slides.length) % slides.length;
      if (index === current) return;
      finish();
      var leaving = slides[current];
      var entering = slides[index];
      entering.removeAttribute('data-dir');
      if (back) entering.setAttribute('data-from', 'left');
      else entering.removeAttribute('data-from');
      entering.getBoundingClientRect(); // commit the start position before the slide begins
      leaving.setAttribute('data-state', 'leaving');
      if (back) leaving.setAttribute('data-dir', 'back');
      entering.setAttribute('data-state', 'active');
      cleanup = { slide: leaving, timer: window.setTimeout(finish, reduced ? 0 : DURATION) };
      current = index;
      markDot();
      load(index + 1);
      if (announce && status) status.textContent = 'Photo ' + (index + 1) + ' of ' + slides.length;
    };

    var canPlay = function () {
      return !userPaused && !hovering && !focusInside && onScreen && !document.hidden;
    };

    var queue = function () {
      window.clearTimeout(timer);
      timer = window.setTimeout(function () {
        var nextImage = slides[(current + 1) % slides.length].querySelector('img');
        if (canPlay() && nextImage.complete) show(current + 1, false, false);
        queue();
      }, INTERVAL);
    };

    var manual = function (index, back) {
      show(index, back, true);
      queue();
    };

    var setToggle = function () {
      if (!toggle) return;
      toggle.setAttribute('aria-label', userPaused ? 'Play slideshow' : 'Pause slideshow');
      toggle.querySelector('[data-slider-icon="pause"]').classList.toggle('hidden', userPaused);
      toggle.querySelector('[data-slider-icon="play"]').classList.toggle('hidden', !userPaused);
    };

    root.querySelector('[data-slider-next]').addEventListener('click', function () { manual(current + 1, false); });
    root.querySelector('[data-slider-prev]').addEventListener('click', function () { manual(current - 1, true); });
    dots.forEach(function (dot, i) {
      dot.addEventListener('click', function () { manual(i, i < current); });
    });
    if (toggle) {
      toggle.addEventListener('click', function () {
        userPaused = !userPaused;
        setToggle();
      });
    }

    root.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowRight') { manual(current + 1, false); event.preventDefault(); }
      else if (event.key === 'ArrowLeft') { manual(current - 1, true); event.preventDefault(); }
    });
    root.addEventListener('mouseenter', function () { hovering = true; });
    root.addEventListener('mouseleave', function () { hovering = false; });
    root.addEventListener('focusin', function () { focusInside = true; });
    root.addEventListener('focusout', function (event) {
      if (!root.contains(event.relatedTarget)) focusInside = false;
    });

    // Swipe on touch screens (vertical scrolling stays native: the frame has touch-action: pan-y).
    var startX = null;
    var startY = null;
    frame.addEventListener('pointerdown', function (event) {
      if (event.pointerType === 'mouse') return;
      startX = event.clientX;
      startY = event.clientY;
    });
    frame.addEventListener('pointerup', function (event) {
      if (startX === null) return;
      var dx = event.clientX - startX;
      var dy = event.clientY - startY;
      startX = null;
      if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) manual(current + (dx < 0 ? 1 : -1), dx > 0);
    });
    frame.addEventListener('pointercancel', function () { startX = null; });

    // Fetch the second photo once the slideshow is near the screen, and play only while it is on screen.
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        onScreen = entries[entries.length - 1].isIntersecting;
        if (onScreen) load(1);
      }, { rootMargin: '200px 0px' }).observe(root);
    } else {
      load(1);
    }

    markDot();
    setToggle();
    queue();
  });
})();
