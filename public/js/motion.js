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

  function stop() {
    if (observer) observer.disconnect();
    running.forEach(function (animation) { animation.cancel(); });
    running.clear();
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
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        fill: 'none',
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
