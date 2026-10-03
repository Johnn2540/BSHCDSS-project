// Navigation behaviour: mobile menu toggle and desktop dropdowns.
(function () {
  'use strict';

  // Mobile menu
  var menuToggle = document.querySelector('[data-menu-toggle]');
  var mobileMenu = document.getElementById('mobile-menu');

  function setMenuOpen(open) {
    menuToggle.setAttribute('aria-expanded', String(open));
    mobileMenu.classList.toggle('is-open', open);
  }

  if (menuToggle && mobileMenu) {
    menuToggle.addEventListener('click', function () {
      setMenuOpen(menuToggle.getAttribute('aria-expanded') !== 'true');
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menuToggle.getAttribute('aria-expanded') === 'true') {
        setMenuOpen(false);
        menuToggle.focus();
      }
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
