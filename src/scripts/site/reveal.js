// Reveal: content fades in once as it enters the viewport.
// Elements in the same group (data-reveal-group) are staggered by 60ms.
(function () {
  'use strict';
  var items = document.querySelectorAll('[data-reveal]');
  if (!items.length) return;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !('IntersectionObserver' in window)) {
    items.forEach(function (el) { el.classList.add('is-in'); });
    return;
  }

  document.querySelectorAll('[data-reveal-group]').forEach(function (group) {
    group.querySelectorAll('[data-reveal]').forEach(function (el, i) {
      el.style.setProperty('--delay', Math.min(i, 6) * 60 + 'ms');
    });
  });

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-in');
      io.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

  items.forEach(function (el) {
    // Anything already on screen at load is shown without waiting.
    var r = el.getBoundingClientRect();
    if (r.top < window.innerHeight && r.bottom > 0) {
      window.requestAnimationFrame(function () { el.classList.add('is-in'); });
    } else {
      io.observe(el);
    }
  });

  // Safety net: never leave content hidden (e.g. print, unusual scroll containers).
  window.addEventListener('beforeprint', function () {
    items.forEach(function (el) { el.classList.add('is-in'); });
  });
})();
