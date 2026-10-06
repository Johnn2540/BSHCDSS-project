// Portal navigation is enhanced only after its handlers are ready. Without this file
// the sidebar remains an ordinary, usable navigation list on small screens.
(function () {
  'use strict';
  var sidebar = document.querySelector('[data-portal-sidebar]');
  var toggle = document.querySelector('[data-portal-toggle]');
  var close = document.querySelector('[data-portal-close]');
  var backdrop = document.querySelector('[data-portal-backdrop]');
  if (!sidebar || !toggle || !close || !backdrop) return;

  var root = document.documentElement;
  var desktop = window.matchMedia('(min-width: 64rem)');
  var backgrounds = Array.prototype.slice.call(document.querySelectorAll('[data-portal-background]'));
  var previousInert = [];
  var lastFocus;
  var opened = false;

  function focusables() {
    return Array.prototype.filter.call(sidebar.querySelectorAll('a[href], button:not([disabled]), input:not([type="hidden"]):not([disabled])'), function (element) {
      return element.getClientRects().length && getComputedStyle(element).visibility === 'visible';
    });
  }
  function closeMenu(restoreFocus) {
    if (!opened) return;
    opened = false;
    root.classList.remove('portal-menu-open');
    toggle.setAttribute('aria-expanded', 'false');
    sidebar.inert = !desktop.matches;
    sidebar.removeAttribute('role');
    sidebar.removeAttribute('aria-modal');
    sidebar.removeAttribute('aria-labelledby');
    backgrounds.forEach(function (element, index) { element.inert = previousInert[index]; });
    if (restoreFocus !== false && lastFocus) lastFocus.focus();
  }
  function openMenu() {
    if (desktop.matches || opened) return;
    lastFocus = document.activeElement;
    previousInert = backgrounds.map(function (element) { return Boolean(element.inert); });
    opened = true;
    sidebar.inert = false;
    sidebar.setAttribute('role', 'dialog');
    sidebar.setAttribute('aria-modal', 'true');
    sidebar.setAttribute('aria-labelledby', 'portal-menu-title');
    root.classList.add('portal-menu-open');
    toggle.setAttribute('aria-expanded', 'true');
    backgrounds.forEach(function (element) { element.inert = true; });
    close.focus();
  }
  toggle.addEventListener('click', openMenu);
  close.addEventListener('click', function () { closeMenu(); });
  backdrop.addEventListener('click', function () { closeMenu(); });
  sidebar.addEventListener('click', function (event) { if (event.target.closest('a[href]')) closeMenu(false); });
  document.addEventListener('keydown', function (event) {
    if (!opened) return;
    if (event.key === 'Escape') { event.preventDefault(); closeMenu(); return; }
    if (event.key !== 'Tab') return;
    var items = focusables();
    var first = items[0], last = items[items.length - 1];
    if (!first) { event.preventDefault(); close.focus(); return; }
    if (event.shiftKey && (document.activeElement === first || !sidebar.contains(document.activeElement))) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !sidebar.contains(document.activeElement))) {
      event.preventDefault(); first.focus();
    }
  });
  // Focus stays inside the dialog in browsers that do not support inert.
  document.addEventListener('focusin', function (event) { if (opened && !sidebar.contains(event.target)) close.focus(); });
  function onBreakpoint() {
    if (!desktop.matches) {
      var hadSidebarFocus = sidebar.contains(document.activeElement);
      if (!opened) sidebar.inert = true;
      if (!opened && hadSidebarFocus) toggle.focus();
      return;
    }
    var wasCloseFocused = document.activeElement === close;
    closeMenu(false);
    sidebar.inert = false;
    if (wasCloseFocused) {
      var current = sidebar.querySelector('[aria-current="page"]') || sidebar.querySelector('a[href]');
      if (current) current.focus();
    }
  }
  if (desktop.addEventListener) desktop.addEventListener('change', onBreakpoint);
  else if (desktop.addListener) desktop.addListener(onBreakpoint);
  window.addEventListener('pagehide', function () { closeMenu(false); });
  window.addEventListener('pageshow', function () { closeMenu(false); });
  sidebar.inert = !desktop.matches;
  if ('inert' in HTMLElement.prototype) root.classList.add('portal-inert');
  root.classList.add('portal-enhanced');
  // Settle the initial closed state before enabling transitions; no fly-out on load.
  requestAnimationFrame(function () { requestAnimationFrame(function () { root.classList.add('portal-ready'); }); });
})();
