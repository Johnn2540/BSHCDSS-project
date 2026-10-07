// Navigation behaviour: the public sidebar menu and desktop dropdowns. (The admin panel's own drawer
// and row menus live in admin.js; the Tutor Portal's in tutor.js.)
(function () {
  'use strict';

  // Sidebar menu (public site, phones and tablets)
  var drawer = document.getElementById('site-drawer');
  var drawerOpenBtn = document.querySelector('[data-drawer-open]');
  var drawerBackdrop = document.querySelector('[data-drawer-backdrop]');

  if (drawer && drawerOpenBtn && drawerBackdrop) {
    var drawerCloseBtn = drawer.querySelector('[data-drawer-close]');
    var lastFocused = null;

    var isDrawerOpen = function () {
      return drawer.classList.contains('is-open');
    };
    // Visible, focusable elements inside the drawer (collapsed sub-menus are skipped)
    var drawerFocusables = function () {
      return Array.prototype.filter.call(
        drawer.querySelectorAll('a[href], button:not([disabled])'),
        function (el) { return el.offsetParent !== null; }
      );
    };

    var openDrawer = function () {
      lastFocused = document.activeElement;
      drawer.classList.add('is-open');
      drawerBackdrop.classList.add('is-open');
      drawerOpenBtn.setAttribute('aria-expanded', 'true');
      document.documentElement.classList.add('drawer-locked');
      // Focus the close button once the panel is visible
      window.setTimeout(function () { drawerCloseBtn.focus(); }, 60);
    };

    var closeDrawer = function (restoreFocus) {
      if (!isDrawerOpen()) return;
      drawer.classList.remove('is-open');
      drawerBackdrop.classList.remove('is-open');
      drawerOpenBtn.setAttribute('aria-expanded', 'false');
      document.documentElement.classList.remove('drawer-locked');
      if (restoreFocus !== false && lastFocused && lastFocused.focus) lastFocused.focus();
    };

    drawerOpenBtn.addEventListener('click', openDrawer);
    drawerCloseBtn.addEventListener('click', function () { closeDrawer(); });
    drawerBackdrop.addEventListener('click', function () { closeDrawer(); });
    window.addEventListener('notifications:open', function () { closeDrawer(false); });

    // Choosing a link closes the menu (the page then navigates)
    drawer.addEventListener('click', function (e) {
      if (e.target.closest('a[href]')) closeDrawer(false);
    });

    document.addEventListener('keydown', function (e) {
      if (!isDrawerOpen()) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        closeDrawer();
        return;
      }
      // Keep keyboard focus inside the open menu
      if (e.key === 'Tab') {
        var items = drawerFocusables();
        if (!items.length) return;
        var first = items[0];
        var last = items[items.length - 1];
        if (e.shiftKey && (document.activeElement === first || !drawer.contains(document.activeElement))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (document.activeElement === last || !drawer.contains(document.activeElement))) {
          e.preventDefault();
          first.focus();
        }
      }
    });

    // The sidebar only exists below the desktop breakpoint; close it if the screen widens.
    var desktop = window.matchMedia('(min-width: 80rem)');
    var onBreakpoint = function () { if (desktop.matches) closeDrawer(false); };
    if (desktop.addEventListener) desktop.addEventListener('change', onBreakpoint);
    else if (desktop.addListener) desktop.addListener(onBreakpoint);

    // Returning with the back button can restore a page with the menu open; reset it.
    window.addEventListener('pageshow', function () { closeDrawer(false); });

    // Expandable groups (Project Activities)
    Array.prototype.forEach.call(drawer.querySelectorAll('[data-drawer-group]'), function (btn) {
      var panel = document.getElementById(btn.getAttribute('aria-controls'));
      panel.hidden = btn.getAttribute('aria-expanded') !== 'true'; // start collapsed unless it holds the current page
      btn.addEventListener('click', function () {
        var open = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', String(!open));
        panel.hidden = open;
      });
    });
  }

  // Desktop dropdowns: click/keyboard to toggle, hover on devices that support it.
  var canHover = window.matchMedia('(hover: hover)').matches;

  Array.prototype.forEach.call(document.querySelectorAll('[data-dropdown]'), function (dropdown) {
    var button = dropdown.querySelector('[data-dropdown-toggle]');
    var menu = dropdown.querySelector('[data-dropdown-menu]');
    var openedByHover = false;

    function isOpen() {
      return button.getAttribute('aria-expanded') === 'true';
    }
    function setOpen(open) {
      button.setAttribute('aria-expanded', String(open));
      menu.classList.toggle('is-open', open);
      if (!open) openedByHover = false;
    }

    button.addEventListener('click', function () {
      // A click right after hover-opening should keep the menu open, not close it.
      if (openedByHover) {
        openedByHover = false;
        return;
      }
      setOpen(!isOpen());
    });

    dropdown.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen()) {
        setOpen(false);
        button.focus();
      } else if (e.key === 'ArrowDown' && document.activeElement === button) {
        e.preventDefault();
        setOpen(true);
        var first = menu.querySelector('a');
        if (first) first.focus();
      }
    });

    dropdown.addEventListener('focusout', function (e) {
      if (!dropdown.contains(e.relatedTarget)) setOpen(false);
    });

    if (canHover) {
      dropdown.addEventListener('mouseenter', function () {
        if (!isOpen()) {
          setOpen(true);
          openedByHover = true;
        }
      });
      dropdown.addEventListener('mouseleave', function () {
        setOpen(false);
      });
    }

    document.addEventListener('click', function (e) {
      if (!dropdown.contains(e.target)) setOpen(false);
    });
  });

  // Upload size guard: some hosts (Vercel) reject large requests before the app can show a
  // friendly error, so check the total size of the chosen files before submitting.
  Array.prototype.forEach.call(document.querySelectorAll('form[data-max-upload-bytes]'), function (form) {
    form.addEventListener('submit', function (e) {
      var max = Number(form.getAttribute('data-max-upload-bytes'));
      var total = 0;
      Array.prototype.forEach.call(form.querySelectorAll('input[type="file"]'), function (input) {
        Array.prototype.forEach.call(input.files || [], function (file) { total += file.size; });
      });
      var message = form.querySelector('[data-upload-size-error]');
      if (total <= max) {
        if (message) message.remove();
        return;
      }
      e.preventDefault();
      if (!message) {
        message = document.createElement('p');
        message.setAttribute('role', 'alert');
        message.setAttribute('data-upload-size-error', '');
        message.className = 'form-error';
        var button = form.querySelector('button[type="submit"]');
        button.parentNode.insertBefore(message, button);
      }
      var mb = function (bytes) { return (bytes / 1048576).toFixed(1) + ' MB'; };
      message.textContent = 'The selected files total ' + mb(total) + ', but uploads are limited to ' + mb(max) +
        '. Choose smaller or fewer files and try again.';
    });
  });

  // Show/hide buttons on password fields (hidden without JavaScript)
  Array.prototype.forEach.call(document.querySelectorAll('[data-password-toggle]'), function (btn) {
    var input = document.getElementById(btn.getAttribute('data-password-toggle'));
    if (!input) return;
    btn.hidden = false;
    btn.addEventListener('click', function () {
      var show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.textContent = show ? 'Hide' : 'Show';
      btn.setAttribute('aria-pressed', String(show));
    });
  });

  // Partners strip: Pause/Play button (moving content must be pausable). Hover and keyboard
  // focus also pause it via CSS. Hidden for reduced-motion users, who get a still layout.
  Array.prototype.forEach.call(document.querySelectorAll('[data-marquee-toggle]'), function (btn) {
    var marquee = document.getElementById(btn.getAttribute('aria-controls'));
    var label = btn.querySelector('[data-marquee-label]');
    if (!marquee) return;
    btn.hidden = false;
    btn.addEventListener('click', function () {
      var paused = !marquee.classList.contains('is-paused');
      marquee.classList.toggle('is-paused', paused);
      btn.setAttribute('aria-pressed', String(paused));
      label.textContent = paused ? 'Play' : 'Pause';
    });
  });

  // Click-to-play videos: swap the thumbnail link for the embedded player only when asked,
  // so pages with many videos stay light on slow connections.
  Array.prototype.forEach.call(document.querySelectorAll('[data-video-embed]'), function (link) {
    link.addEventListener('click', function (e) {
      var src = link.getAttribute('data-video-embed');
      if (!/^https:\/\/(www\.youtube-nocookie\.com\/embed\/|player\.vimeo\.com\/video\/)/.test(src)) return;
      e.preventDefault();
      var iframe = document.createElement('iframe');
      iframe.src = src + (src.indexOf('?') === -1 ? '?' : '&') + 'autoplay=1';
      iframe.title = link.getAttribute('data-video-title') || 'Video';
      iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      iframe.allowFullscreen = true;
      iframe.className = 'absolute inset-0 h-full w-full';
      link.parentNode.replaceChild(iframe, link);
      iframe.focus();
    });
  });
})();
