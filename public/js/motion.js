// Optional, one-time presentation effects. Content is visible before this file loads,
// and navigation, forms, media and downloads do not depend on it.
(function () {
  'use strict';

  if (!window.matchMedia || !window.IntersectionObserver || !Element.prototype.animate) return;

  var preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  var targets = Array.prototype.slice.call(document.querySelectorAll('[data-motion], main .section-heading, .auth-card > h1'))
    .filter(function (element) { return !element.parentElement.closest('[data-motion]'); });
  var seen = new WeakSet();
  var running = new Map();
  var observer;
  var countObserver;
  var countTargets = Array.prototype.slice.call(document.querySelectorAll('[data-countup]'));
  var counted = new WeakSet();
  var counting = new Map();

  function stop() {
    if (observer) observer.disconnect();
    if (countObserver) countObserver.disconnect();
    running.forEach(function (animation) { animation.cancel(); });
    running.clear();
    // An interrupted count always ends on the real figure, never a half-counted one.
    counting.forEach(function (state, element) {
      cancelAnimationFrame(state.frame);
      element.textContent = state.finalText;
    });
    counting.clear();
  }

  // Items of a list or grid enter a moment apart, so a row of cards cascades instead of landing as one block.
  function stagger(element) {
    var parent = element.parentElement;
    if (!parent || !/^(UL|OL|DL)$/.test(parent.tagName)) return 0;
    return Math.min(Array.prototype.indexOf.call(parent.children, element), 4) * 70;
  }

  // "60,711", "86:1", "46%": whole numbers with optional surrounding text. Anything else is left alone.
  function parseCount(text) {
    var match = /^(\D*)(\d[\d,]*)(.*)$/.exec(text);
    if (!match || /^\.\d/.test(match[3])) return null;
    var value = parseInt(match[2].replace(/,/g, ''), 10);
    if (!isFinite(value) || value < 1) return null;
    return { prefix: match[1], value: value, suffix: match[3], grouped: match[2].indexOf(',') !== -1 };
  }

  function count(element) {
    if (counted.has(element)) return;
    counted.add(element);
    if (preference.matches || document.hidden) return;
    var finalText = element.textContent.trim();
    var parts = parseCount(finalText);
    if (!parts) return;

    // Screen readers get the real figure at once; only the sighted counter is animated.
    var shown = document.createElement('span');
    shown.setAttribute('aria-hidden', 'true');
    var spoken = document.createElement('span');
    spoken.className = 'sr-only';
    spoken.textContent = finalText;
    element.textContent = '';
    element.appendChild(shown);
    element.appendChild(spoken);

    var state = { finalText: finalText, frame: 0 };
    var started = null;
    counting.set(element, state);
    function format(number) {
      return parts.prefix + (parts.grouped ? number.toLocaleString('en-US') : String(number)) + parts.suffix;
    }
    function step(now) {
      if (started === null) started = now;
      var progress = Math.min(1, (now - started) / 1100);
      shown.textContent = format(Math.round(parts.value * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) { state.frame = requestAnimationFrame(step); return; }
      element.textContent = finalText;
      counting.delete(element);
    }
    shown.textContent = format(0);
    state.frame = requestAnimationFrame(step);
  }

  function enter(element) {
    if (seen.has(element)) return;
    seen.add(element);
    // Never move a control someone is focusing, or replay an entrance after navigation.
    if (preference.matches || document.hidden || element.contains(document.activeElement)) return;

    var fadeOnly = element.getAttribute('data-motion') === 'fade' || element.closest('.auth-card');
    // Blocks (cards, figures, panels) also zoom in slightly as they enter. Text elements only rise: scaling a
    // left-aligned heading or paragraph about its centre would make the words drift sideways.
    var zoom = !fadeOnly && element.hasAttribute('data-motion') && !/^(H[1-6]|P|UL|OL|DL)$/.test(element.tagName);
    var animation;
    try {
      animation = element.animate([
        { opacity: 0.72, transform: fadeOnly ? 'none' : 'translateY(10px)' + (zoom ? ' scale(0.965)' : '') },
        { opacity: 1, transform: 'none' },
      ], {
        duration: fadeOnly ? 240 : 460,
        delay: fadeOnly ? 0 : stagger(element),
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        fill: 'backwards',
      });
    } catch (_) { return; }
    running.set(element, animation);
    function release() { if (running.get(element) === animation) running.delete(element); }
    animation.addEventListener('finish', release, { once: true });
    animation.addEventListener('cancel', release, { once: true });
  }

  function observe() {
    if (preference.matches) return;
    observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        enter(entry.target);
      });
    }, { threshold: 0.08 });
    targets.forEach(function (element) { if (!seen.has(element)) observer.observe(element); });

    countObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        countObserver.unobserve(entry.target);
        count(entry.target);
      });
    }, { threshold: 0.6 });
    countTargets.forEach(function (element) { if (!counted.has(element)) countObserver.observe(element); });
  }

  // Keyboard focus is immediate, including focus arriving midway through an entrance.
  document.addEventListener('focusin', function (event) {
    running.forEach(function (animation, element) {
      if (element.contains(event.target)) animation.cancel();
    });
  });
  document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else observe(); });
  window.addEventListener('pagehide', stop);
  window.addEventListener('pageshow', function (event) { if (event.persisted) observe(); });
  window.addEventListener('beforeprint', stop);
  window.addEventListener('afterprint', observe);
  function onPreference() { stop(); observe(); }
  if (preference.addEventListener) preference.addEventListener('change', onPreference);
  else if (preference.addListener) preference.addListener(onPreference);
  observe();
})();

// Scroll-linked photo zoom. A photo marked data-scroll-zoom grows gently as it travels up through the
// viewport (data-scroll-zoom="0.1" sets the largest extra size; the default is 8%). Progress is measured on
// the photo's fixed frame, never on the photo, so the zoom cannot feed back into its own measurement, and the
// frame clips the enlarged photo. A photo already on screen at load starts at its normal size. Nothing runs
// under reduced motion or while printing, and every photo is plain and complete when this script does not run.
(function () {
  'use strict';

  if (!window.matchMedia || !window.IntersectionObserver || !window.requestAnimationFrame) return;

  var preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  var items = Array.prototype.slice.call(document.querySelectorAll('img[data-scroll-zoom]')).map(function (image) {
    var frame = image.closest('[data-zoom-frame]') || image.parentElement;
    if (frame && frame.tagName === 'PICTURE') frame = frame.parentElement;
    var amount = parseFloat(image.getAttribute('data-scroll-zoom'));
    return { image: image, frame: frame, amount: amount > 0 && amount <= 0.3 ? amount : 0.08, base: 0, scale: 1 };
  }).filter(function (item) { return item.frame; });
  if (!items.length) return;

  var active = new Set();
  var observer = null;
  var queued = false;

  function viewportHeight() { return window.innerHeight || document.documentElement.clientHeight; }

  // 0 when the frame is entering at the bottom of the screen, 1 when it has left at the top.
  function raw(item) {
    var height = viewportHeight();
    var rect = item.frame.getBoundingClientRect();
    return Math.min(1, Math.max(0, (height - rect.top) / (height + rect.height)));
  }

  function apply(item) {
    var progress = Math.min(1, Math.max(0, (raw(item) - item.base) / Math.max(0.05, 1 - item.base)));
    var scale = 1 + item.amount * progress;
    if (Math.abs(scale - item.scale) < 0.0004) return;
    item.scale = scale;
    item.image.style.transform = 'scale(' + scale.toFixed(4) + ')';
  }

  function update() {
    queued = false;
    if (preference.matches || document.hidden) return;
    active.forEach(apply);
  }

  function schedule() {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(update);
  }

  function reset() {
    items.forEach(function (item) {
      item.scale = 1;
      item.image.style.transform = '';
      item.image.style.willChange = '';
      item.frame.style.isolation = '';
    });
    active.clear();
  }

  function start() {
    if (observer) observer.disconnect();
    var height = viewportHeight();
    items.forEach(function (item) {
      var rect = item.frame.getBoundingClientRect();
      item.base = rect.bottom > 0 && rect.top < height ? raw(item) : 0;
      // Keeps rounded frames clipping the enlarged photo in every browser.
      item.frame.style.isolation = 'isolate';
    });
    observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        items.forEach(function (item) {
          if (item.frame !== entry.target) return;
          if (entry.isIntersecting) {
            active.add(item);
            item.image.style.willChange = 'transform';
          } else {
            // Settle on the end it left from: normal size below the screen, fully zoomed above it.
            active.delete(item);
            apply(item);
            item.image.style.willChange = '';
          }
        });
      });
      schedule();
    }, { rootMargin: '12% 0px 12% 0px' });
    items.forEach(function (item) { observer.observe(item.frame); });
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    schedule();
  }

  function stop() {
    if (observer) { observer.disconnect(); observer = null; }
    window.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', schedule);
    reset();
  }

  document.addEventListener('visibilitychange', function () { if (!document.hidden && !preference.matches) schedule(); });
  window.addEventListener('pagehide', stop);
  window.addEventListener('pageshow', function (event) { if (event.persisted && !preference.matches) { stop(); start(); } });
  window.addEventListener('beforeprint', stop);
  window.addEventListener('afterprint', function () { if (!preference.matches) start(); });
  function onPreference() { stop(); if (!preference.matches) start(); }
  if (preference.addEventListener) preference.addEventListener('change', onPreference);
  else if (preference.addListener) preference.addListener(onPreference);
  if (!preference.matches) start();
})();
