// Mobile menu: full-screen sheet with focus containment, Escape to close,
// and scroll lock. Closes automatically if the viewport grows to desktop.
(function () {
  'use strict';
  var toggle = document.querySelector('[data-menu-toggle]');
  var menu = document.querySelector('[data-menu]');
  if (!toggle || !menu) return;
  var label = toggle.querySelector('[data-menu-label]');
  var desktop = window.matchMedia('(min-width: 64rem)');
  var closeTimer = null;

  function focusables() {
    return [toggle].concat(Array.prototype.slice.call(menu.querySelectorAll('a[href], button:not([disabled])')));
  }

  function open() {
    clearTimeout(closeTimer);
    menu.hidden = false;
    // next frame so the opacity transition runs
    window.requestAnimationFrame(function () { menu.classList.add('is-open'); });
    toggle.setAttribute('aria-expanded', 'true');
    if (label) label.textContent = 'Close';
    document.documentElement.style.overflow = 'hidden';
    var first = menu.querySelector('a[href]');
    if (first) first.focus();
    document.addEventListener('keydown', onKeydown);
  }

  function close(returnFocus) {
    menu.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
    if (label) label.textContent = 'Menu';
    document.documentElement.style.overflow = '';
    document.removeEventListener('keydown', onKeydown);
    closeTimer = setTimeout(function () { menu.hidden = true; }, 220);
    if (returnFocus) toggle.focus();
  }

  function isOpen() { return toggle.getAttribute('aria-expanded') === 'true'; }

  function onKeydown(e) {
    if (e.key === 'Escape') { close(true); return; }
    if (e.key !== 'Tab') return;
    var items = focusables();
    var first = items[0];
    var last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  toggle.addEventListener('click', function () { isOpen() ? close(false) : open(); });
  menu.addEventListener('click', function (e) {
    if (e.target.closest('a')) close(false);
  });
  var onChange = function (e) { if (e.matches && isOpen()) close(false); };
  if (desktop.addEventListener) desktop.addEventListener('change', onChange);
  else desktop.addListener(onChange);
})();
