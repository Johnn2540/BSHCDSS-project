(function () {
  'use strict';
  var triggers = Array.prototype.slice.call(document.querySelectorAll('[data-notification-trigger]'));
  var panel = document.querySelector('[data-notification-panel]');
  if (!triggers.length || !panel) return;

  var storageKey = 'bshcdss.notifications.readAt.v1';
  var list = panel.querySelector('[data-notification-list]');
  var status = panel.querySelector('[data-notification-status]');
  var markRead = panel.querySelector('[data-notification-read-all]');
  var readAt = null;
  var pending = null, refreshAgain = false, timer = null, controller = null;
  var latest = null, signature = '', lastTrigger = null, outsidePress = false;
  var canOpen = typeof panel.showModal === 'function';
  var dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

  function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
    var date = new Date(value);
    return Number.isFinite(date.getTime()) && date.toISOString() === value;
  }
  function loadReadAt() {
    try { var value = localStorage.getItem(storageKey); return validDate(value) ? value : null; }
    catch (_) { return null; }
  }
  readAt = loadReadAt();

  function setCount(count) {
    triggers.forEach(function (trigger) {
      trigger.querySelector('[data-notification-count]').textContent = count > 99 ? '99+' : String(count);
      trigger.setAttribute('aria-label', 'Notifications: ' + count + ' new');
      trigger.removeAttribute('aria-busy');
      trigger.classList.toggle('has-new', count > 0);
    });
    panel.querySelector('[data-notification-unread]').textContent = count ? count + ' new' : 'No new notifications';
    markRead.disabled = count === 0 || !latest;
  }
  function paintReadState() {
    list.querySelectorAll('[data-notification-item]').forEach(function (item) {
      var isNew = !readAt || item.getAttribute('data-notification-version') > readAt;
      item.classList.toggle('is-new', isNew);
      item.querySelector('[data-notification-new]').hidden = !isNew;
    });
  }
  function node(tag, className, text) {
    var element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }
  function makeItem(item, isOpen) {
    var details = node('details', 'notification-item');
    details.setAttribute('data-notification-item', '');
    details.setAttribute('data-notification-id', item.id);
    details.setAttribute('data-notification-version', item.versionAt);
    details.open = isOpen;
    var summary = node('summary', 'notification-item-summary');
    var dot = node('span', 'notification-item-dot'); dot.setAttribute('aria-hidden', 'true');
    var text = node('span', 'min-w-0 flex-1');
    text.appendChild(node('span', 'block text-sm font-semibold leading-snug text-neutral-900', item.title));
    var date = node('span', 'mt-1 block text-xs text-neutral-600');
    var time = node('time', '', dateFormat.format(new Date(item.publishedAt)));
    time.dateTime = item.publishedAt; date.appendChild(time); text.appendChild(date);
    var badge = node('span', 'notification-new', 'New'); badge.setAttribute('data-notification-new', '');
    var chevron = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    chevron.setAttribute('class', 'notification-item-chevron h-4 w-4 shrink-0 text-neutral-500');
    chevron.setAttribute('viewBox', '0 0 24 24'); chevron.setAttribute('fill', 'none');
    chevron.setAttribute('stroke', 'currentColor'); chevron.setAttribute('stroke-width', '1.8'); chevron.setAttribute('aria-hidden', 'true');
    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', 'm9 5 7 7-7 7'); chevron.appendChild(path);
    summary.append(dot, text, badge, chevron);
    var body = node('div', 'notification-item-body');
    item.body.split(/\r?\n\s*\r?\n/).map(function (paragraph) { return paragraph.trim(); }).filter(Boolean)
      .forEach(function (paragraph) { body.appendChild(node('p', '', paragraph)); });
    details.append(summary, body);
    return details;
  }
  function render(data, force) {
    latest = data;
    setCount(data.unreadCount);
    panel.querySelector('[data-notification-summary]').textContent = data.total + ' public announcement' + (data.total === 1 ? '' : 's');
    var nextSignature = JSON.stringify(data.items.map(function (item) { return [item.id, item.versionAt]; }));
    if (signature !== nextSignature) {
      // A background refresh must not interrupt someone reading with the keyboard.
      if (!force && panel.open && list.contains(document.activeElement)) {
        status.textContent = 'The notification list has been updated. Use Refresh to show the latest notices.';
        paintReadState();
        return;
      }
      var expanded = Array.prototype.map.call(list.querySelectorAll('details[open]'), function (item) { return item.dataset.notificationId; });
      var scrollTop = list.scrollTop;
      var fragment = document.createDocumentFragment();
      if (data.items.length) data.items.forEach(function (item) { fragment.appendChild(makeItem(item, expanded.indexOf(item.id) !== -1)); });
      else {
        var empty = node('div', 'notification-empty');
        var icon = node('span', 'notification-empty-icon');
        var bell = panel.querySelector('.notification-heading-icon svg').cloneNode(true);
        bell.setAttribute('class', 'h-7 w-7'); icon.appendChild(bell); empty.appendChild(icon);
        empty.appendChild(node('h3', 'mt-4 font-semibold text-neutral-900', 'No notifications yet'));
        empty.appendChild(node('p', 'mt-2 text-sm leading-relaxed text-neutral-600', 'New public announcements will appear here when they are published.'));
        fragment.appendChild(empty);
      }
      list.replaceChildren(fragment);
      list.scrollTop = scrollTop;
      signature = nextSignature;
    }
    paintReadState();
  }
  function refresh(manual) {
    if (pending) { refreshAgain = refreshAgain || Boolean(manual); return pending; }
    var requestReadAt = readAt;
    var url = '/api/public/notifications' + (readAt ? '?since=' + encodeURIComponent(readAt) : '');
    controller = new AbortController();
    var timeout = window.setTimeout(function () { if (controller) controller.abort(); }, 15000);
    if (manual) status.textContent = 'Checking for new notifications…';
    pending = fetch(url, { credentials: 'omit', cache: 'no-store', signal: controller.signal })
      .then(function (response) { if (!response.ok) throw new Error('Unavailable'); return response.json(); })
      .then(function (data) {
        if (!Array.isArray(data.items) || !Number.isSafeInteger(data.unreadCount) || data.unreadCount < 0 || !validDate(data.asOf)) throw new Error('Invalid feed');
        if (requestReadAt !== readAt) { refreshAgain = true; return; }
        status.textContent = '';
        render(data, Boolean(manual));
      }).catch(function (error) {
        if (error.name !== 'AbortError' || document.visibilityState === 'visible') {
          if (panel.open || !latest) status.textContent = 'Notifications could not be refreshed. Please try Refresh again.';
          triggers.forEach(function (trigger) { trigger.removeAttribute('aria-busy'); });
        }
      }).finally(function () {
        window.clearTimeout(timeout); pending = null; controller = null;
        if (refreshAgain && document.visibilityState === 'visible') { refreshAgain = false; refresh(); }
      });
    return pending;
  }
  function positionPanel() {
    if (!panel.open || !lastTrigger) return;
    var top = Math.max(16, Math.min(lastTrigger.getBoundingClientRect().bottom + 12, window.innerHeight - 320));
    panel.style.setProperty('--notifications-top', top + 'px');
  }
  if (canOpen) {
    triggers.forEach(function (trigger) {
      trigger.setAttribute('aria-haspopup', 'dialog');
      trigger.setAttribute('aria-controls', panel.id);
      trigger.setAttribute('aria-expanded', 'false');
      trigger.addEventListener('click', function (event) {
        // Preserve opening the announcements page in a new tab.
        if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        lastTrigger = trigger;
        window.dispatchEvent(new Event('notifications:open'));
        if (!panel.open) panel.showModal();
        triggers.forEach(function (button) { button.setAttribute('aria-expanded', 'true'); });
        document.documentElement.classList.add('notifications-open');
        positionPanel();
        if (latest) render(latest, true);
        panel.querySelector('[data-notification-close]').focus();
        refresh(true);
      });
    });
    panel.querySelector('[data-notification-close]').addEventListener('click', function () { panel.close(); });
    panel.addEventListener('keydown', function (event) {
      if (event.key !== 'Tab') return;
      var items = Array.prototype.filter.call(panel.querySelectorAll('a[href], button:not([disabled]), summary'), function (item) { return item.getClientRects().length; });
      var first = items[0], last = items[items.length - 1];
      if (!first) return;
      if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    });
    function outside(event) {
      var bounds = panel.getBoundingClientRect();
      return event.target === panel && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom);
    }
    panel.addEventListener('pointerdown', function (event) { outsidePress = outside(event); });
    panel.addEventListener('click', function (event) { if (outsidePress && outside(event)) panel.close(); outsidePress = false; });
    panel.addEventListener('close', function () {
      document.documentElement.classList.remove('notifications-open');
      triggers.forEach(function (trigger) { trigger.setAttribute('aria-expanded', 'false'); });
      var target = lastTrigger && lastTrigger.getClientRects().length ? lastTrigger : triggers.find(function (trigger) { return trigger.getClientRects().length; });
      if (target) target.focus({ preventScroll: true });
    });
    window.addEventListener('resize', positionPanel);
  }
  markRead.addEventListener('click', function () {
    if (!latest || !validDate(latest.asOf)) return;
    readAt = latest.asOf;
    var saved = true;
    try { localStorage.setItem(storageKey, readAt); } catch (_) { saved = false; }
    latest = Object.assign({}, latest, { unreadCount: 0 });
    render(latest, true);
    status.textContent = saved ? 'All notifications marked as read.' : 'Marked as read for this visit. Your browser could not save the read status.';
  });
  panel.querySelector('[data-notification-refresh]').addEventListener('click', function () { refresh(true); });
  window.addEventListener('storage', function (event) {
    if (event.key === storageKey || event.key === null) { readAt = loadReadAt(); paintReadState(); refresh(); }
  });
  function startPolling() {
    if (timer) window.clearInterval(timer);
    if (document.visibilityState !== 'visible') return;
    refresh();
    timer = window.setInterval(function () { refresh(); }, 60000);
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') startPolling();
    else { window.clearInterval(timer); timer = null; if (controller) controller.abort(); }
  });
  window.addEventListener('pagehide', function () { window.clearInterval(timer); timer = null; if (controller) controller.abort(); if (panel.open) panel.close(); });
  window.addEventListener('pageshow', function (event) { if (event.persisted) startPolling(); });
  if (readAt) triggers.forEach(function (trigger) { trigger.setAttribute('aria-busy', 'true'); });
  paintReadState();
  startPolling();
})();
