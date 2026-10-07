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

  // Items of a list or grid (or of a container marked data-stagger) enter a moment apart, so a row of cards
  // cascades instead of landing as one block.
  function stagger(element) {
    var parent = element.parentElement;
    if (!parent || (!/^(UL|OL|DL)$/.test(parent.tagName) && !parent.hasAttribute('data-stagger'))) return 0;
    return Math.min(Array.prototype.indexOf.call(parent.children, element), 4) * 70;
  }

  // Where an entrance starts. A block starts smaller the less of the screen it fills, so a card grows from a
  // small footprint while a full-width band only settles. Blocks marked data-motion-from="left|right" arrive from
  // their own side on wide screens, where columns sit side by side; on phones they simply rise, so a sliding
  // block can never push the page wider than the screen.
  function entranceFrom(element, zoom) {
    var side = element.getAttribute('data-motion-from');
    var slides = (side === 'left' || side === 'right') && window.matchMedia('(min-width: 1024px)').matches;
    var move = slides ? 'translateX(' + (side === 'left' ? '-' : '') + '32px)' : 'translateY(24px)';
    if (!zoom) return move;
    var share = element.getBoundingClientRect().width / (window.innerWidth || 1);
    var scale = share >= 0.8 ? 0.96 : share >= 0.4 ? 0.93 : 0.9;
    // On phones nearly every block fills the width, so the width rule alone would barely move anything.
    if ((window.innerWidth || 0) < 640) scale = Math.min(scale, 0.92);
    return move + ' scale(' + scale + ')';
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
        { opacity: 0.72, transform: fadeOnly ? 'none' : entranceFrom(element, zoom) },
        { opacity: 1, transform: 'none' },
      ], {
        duration: fadeOnly ? 240 : 640,
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

// Scroll-linked effects, driven by position and not by time:
//  - data-scroll-expand: a frame (figure, panel) starts slightly smaller and grows to its full size as it
//    scrolls up the screen, so it appears to come from a small space into a larger one. The value is the size it
//    starts at (data-scroll-expand="0.88"; default 0.9).
//  - data-scroll-zoom: a photo grows gently inside its frame as it travels up the screen (data-scroll-zoom="0.1"
//    sets the largest extra size; default 8%).
// Progress is always measured on a frame's layout position with its own expansion removed, so growing can never
// change the measurement that drives it, and a frame clips the enlarged photo. A photo already on screen at load
// starts at its normal size. Nothing runs under reduced motion or while printing, and everything is plain and
// complete when this script does not run.
(function () {
  'use strict';

  if (!window.matchMedia || !window.IntersectionObserver || !window.requestAnimationFrame) return;

  var preference = window.matchMedia('(prefers-reduced-motion: reduce)');

  var expands = Array.prototype.slice.call(document.querySelectorAll('[data-scroll-expand]')).map(function (element) {
    var from = parseFloat(element.getAttribute('data-scroll-expand'));
    return { kind: 'expand', node: element, from: from >= 0.5 && from < 1 ? from : 0.9, scale: 1 };
  });
  var expandByElement = new Map();
  expands.forEach(function (item) { expandByElement.set(item.node, item); });

  var photos = Array.prototype.slice.call(document.querySelectorAll('img[data-scroll-zoom]')).map(function (image) {
    var frame = image.closest('[data-zoom-frame]') || image.parentElement;
    if (frame && frame.tagName === 'PICTURE') frame = frame.parentElement;
    var amount = parseFloat(image.getAttribute('data-scroll-zoom'));
    var owner = frame ? expandByElement.get(frame.closest('[data-scroll-expand]')) : null;
    return { kind: 'photo', node: image, frame: frame, amount: amount > 0 && amount <= 0.3 ? amount : 0.08, base: 0, scale: 1, owner: owner || null };
  }).filter(function (item) { return item.frame; });

  if (!expands.length && !photos.length) return;

  var watch = new Map();   // observed element -> the items that depend on it
  function track(element, item) {
    if (!watch.has(element)) watch.set(element, []);
    watch.get(element).push(item);
  }
  expands.forEach(function (item) { track(item.node, item); });
  photos.forEach(function (item) { track(item.frame, item); });

  var active = new Set();
  var observer = null;
  var queued = false;

  function viewportHeight() { return window.innerHeight || document.documentElement.clientHeight; }
  function clamp01(value) { return Math.min(1, Math.max(0, value)); }

  // Top and height of an element as if its owning frame were not expanded.
  function layout(element, owner) {
    var rect = element.getBoundingClientRect();
    if (!owner || owner.scale === 1) return { top: rect.top, height: rect.height };
    var box = owner.node.getBoundingClientRect();
    var centre = (box.top + box.bottom) / 2;
    return { top: centre + (rect.top - centre) / owner.scale, height: rect.height / owner.scale };
  }

  // 0 when a photo's frame is entering at the bottom of the screen, 1 when it has left at the top.
  function raw(item) {
    var height = viewportHeight();
    var box = layout(item.frame, item.owner);
    return clamp01((height - box.top) / (height + box.height));
  }

  function applyExpand(item) {
    // Full size once the frame's top has risen to 40% of the way down the screen.
    var height = viewportHeight();
    var box = layout(item.node, item);
    var progress = clamp01((height - box.top) / (height * 0.6));
    var scale = item.from + (1 - item.from) * progress * (2 - progress);
    if (scale >= 0.9995) scale = 1;
    if (Math.abs(scale - item.scale) < 0.0004) return;
    item.scale = scale;
    item.node.style.transform = scale === 1 ? '' : 'scale(' + scale.toFixed(4) + ')';
  }

  function applyPhoto(item) {
    var progress = clamp01((raw(item) - item.base) / Math.max(0.05, 1 - item.base));
    var scale = 1 + item.amount * progress;
    if (Math.abs(scale - item.scale) < 0.0004) return;
    item.scale = scale;
    item.node.style.transform = 'scale(' + scale.toFixed(4) + ')';
  }

  function apply(item) { if (item.kind === 'expand') applyExpand(item); else applyPhoto(item); }

  function update() {
    queued = false;
    if (preference.matches || document.hidden) return;
    // Frames first, so a photo measures against the frame's current size.
    active.forEach(function (item) { if (item.kind === 'expand') applyExpand(item); });
    active.forEach(function (item) { if (item.kind === 'photo') applyPhoto(item); });
  }

  function schedule() {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(update);
  }

  function reset() {
    expands.forEach(function (item) {
      item.scale = 1;
      item.node.style.transform = '';
      item.node.style.willChange = '';
    });
    photos.forEach(function (item) {
      item.scale = 1;
      item.node.style.transform = '';
      item.node.style.willChange = '';
      item.frame.style.isolation = '';
    });
    active.clear();
  }

  function start() {
    if (observer) observer.disconnect();
    var height = viewportHeight();
    // Frames take their first size synchronously, so one that is already on screen never visibly jumps.
    expands.forEach(applyExpand);
    photos.forEach(function (item) {
      var box = layout(item.frame, item.owner);
      item.base = box.top + box.height > 0 && box.top < height ? raw(item) : 0;
      // Keeps rounded frames clipping the enlarged photo in every browser.
      item.frame.style.isolation = 'isolate';
    });
    observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        (watch.get(entry.target) || []).forEach(function (item) {
          if (entry.isIntersecting) {
            active.add(item);
            item.node.style.willChange = 'transform';
          } else {
            // Settle on the end it left from: small or normal below the screen, full size above it.
            active.delete(item);
            apply(item);
            item.node.style.willChange = '';
          }
        });
      });
      schedule();
    // A whole screen of margin above and below: after a long jump (Home key, anchor link) the elements being
    // corrected are still well off screen, so a photo is never seen snapping from zoomed back to normal.
    }, { rootMargin: '100% 0px 100% 0px' });
    watch.forEach(function (list, element) { observer.observe(element); });
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
