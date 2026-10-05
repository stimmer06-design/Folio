// Scales sample invoice documents to the width of their frame (marketing pages).
(function () {
  'use strict';
  var frames = document.querySelectorAll('[data-doc-fit]');
  if (!frames.length) return;
  function fit(frame) {
    var inner = frame.firstElementChild;
    var doc = inner && inner.firstElementChild;
    if (!doc) return;
    var s = Math.min(1, frame.clientWidth / doc.offsetWidth);
    inner.style.transform = 'scale(' + s + ')';
    frame.style.height = doc.offsetHeight * s + 'px';
    frame.classList.add('is-fit');
  }
  function all() { frames.forEach(fit); }
  if ('ResizeObserver' in window) {
    var ro = new ResizeObserver(function (entries) { entries.forEach(function (e) { fit(e.target); }); });
    frames.forEach(function (f) { ro.observe(f); });
  } else {
    window.addEventListener('resize', all);
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(all);
  all();
})();
