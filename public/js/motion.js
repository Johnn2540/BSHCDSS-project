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
    var animation;
    try {
      animation = element.animate([
        { opacity: 0.72, transform: fadeOnly ? 'none' : 'translateY(10px)' },
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
