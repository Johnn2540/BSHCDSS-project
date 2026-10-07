// Admin panel enhancements. Without this file the sidebar is an ordinary navigation list above the page and
// every row-actions menu is a native <details> disclosure, so nothing depends on it.

// ── Navigation drawer (below 1024px) ─────────────────────────────────────────────────────────────────────
(function () {
  'use strict';
  var sidebar = document.querySelector('[data-admin-sidebar]');
  var toggle = document.querySelector('[data-admin-toggle]');
  var close = document.querySelector('[data-admin-close]');
  var backdrop = document.querySelector('[data-admin-backdrop]');
  if (!sidebar || !toggle || !close || !backdrop) return;

  var root = document.documentElement;
  var desktop = window.matchMedia('(min-width: 64rem)');
  var backgrounds = Array.prototype.slice.call(document.querySelectorAll('[data-admin-background]'));
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
    root.classList.remove('admin-menu-open');
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
    sidebar.setAttribute('aria-labelledby', 'admin-menu-title');
    root.classList.add('admin-menu-open');
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
  if ('inert' in HTMLElement.prototype) root.classList.add('admin-inert');
  root.classList.add('admin-enhanced');
  // Settle the initial closed state before enabling transitions; no fly-out on load.
  requestAnimationFrame(function () { requestAnimationFrame(function () { root.classList.add('admin-ready'); }); });
})();

// ── Row-actions menus ────────────────────────────────────────────────────────────────────────────────────
// Markup: <details data-row-menu><summary>…</summary><div class="row-menu-panel" role="menu">…</div></details>.
// The panel is positioned in the viewport (flipping upward near the bottom), so a scrolling table cannot clip it.
(function () {
  'use strict';
  var menus = Array.prototype.slice.call(document.querySelectorAll('[data-row-menu]'));
  if (!menus.length) return;

  var current = null;
  var focusTarget = 'first';

  function summaryOf(menu) { return menu.querySelector('summary'); }
  function panelOf(menu) { return menu.querySelector('.row-menu-panel'); }
  function itemsOf(menu) { return Array.prototype.slice.call(panelOf(menu).querySelectorAll('[role="menuitem"]')); }

  function place(menu) {
    var panel = panelOf(menu);
    var box = summaryOf(menu).getBoundingClientRect();
    var margin = 8, gap = 6;
    var viewportWidth = document.documentElement.clientWidth;
    var viewportHeight = window.innerHeight;
    panel.style.maxHeight = '';
    panel.style.top = '0px';
    panel.style.left = '0px';
    var width = panel.offsetWidth, height = panel.offsetHeight;
    var left = Math.min(Math.max(margin, box.right - width), Math.max(margin, viewportWidth - width - margin));
    var below = viewportHeight - box.bottom - gap - margin;
    var above = box.top - gap - margin;
    var top, room;
    if (height <= below || below >= above) { top = box.bottom + gap; room = below; }
    else { room = above; top = Math.max(margin, box.top - gap - Math.min(height, above)); }
    panel.style.maxHeight = Math.max(160, room) + 'px';
    panel.style.left = left + 'px';
    panel.style.top = top + 'px';
    panel.setAttribute('data-ready', '');
  }

  function closeMenu(menu, restoreFocus) {
    if (!menu || !menu.open) return;
    menu.open = false;
    if (restoreFocus) summaryOf(menu).focus();
  }

  menus.forEach(function (menu) {
    var summary = summaryOf(menu);
    var panel = panelOf(menu);
    if (!summary || !panel) return;
    summary.setAttribute('aria-expanded', 'false');

    menu.addEventListener('toggle', function () {
      summary.setAttribute('aria-expanded', String(menu.open));
      if (menu.open) {
        if (current && current !== menu) closeMenu(current, false);
        current = menu;
        place(menu);
        var list = itemsOf(menu);
        var target = focusTarget === 'last' ? list[list.length - 1] : list[0];
        focusTarget = 'first';
        if (target) target.focus();
      } else {
        panel.removeAttribute('data-ready');
        if (current === menu) current = null;
      }
    });

    menu.addEventListener('keydown', function (event) {
      var list = itemsOf(menu);
      var index = list.indexOf(document.activeElement);
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (!menu.open) menu.open = true;
        else if (list.length) list[index < 0 || index === list.length - 1 ? 0 : index + 1].focus();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (!menu.open) { focusTarget = 'last'; menu.open = true; }
        else if (list.length) list[index <= 0 ? list.length - 1 : index - 1].focus();
      } else if (menu.open && event.key === 'Home' && list.length) {
        event.preventDefault(); list[0].focus();
      } else if (menu.open && event.key === 'End' && list.length) {
        event.preventDefault(); list[list.length - 1].focus();
      } else if (menu.open && event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation(); closeMenu(menu, true);
      }
    });

    // Tabbing out of the menu closes it.
    menu.addEventListener('focusout', function (event) {
      if (menu.open && event.relatedTarget && !menu.contains(event.relatedTarget)) closeMenu(menu, false);
    });
  });

  document.addEventListener('pointerdown', function (event) {
    if (current && !current.contains(event.target)) closeMenu(current, false);
  });
  // A fixed panel would drift away from its row, so any scroll outside the panel or a resize closes it.
  window.addEventListener('scroll', function (event) {
    if (current && !panelOf(current).contains(event.target)) closeMenu(current, false);
  }, true);
  window.addEventListener('resize', function () { closeMenu(current, false); });
  window.addEventListener('pageshow', function () { menus.forEach(function (menu) { closeMenu(menu, false); }); });
})();
