// Template library: a one-line category filter (the full list shows without JS).
(function () {
  'use strict';
  var bar = document.querySelector('[data-tpl-filter]');
  var list = document.querySelector('[data-tpl-list]');
  if (!bar || !list) return;
  bar.hidden = false;
  bar.addEventListener('click', function (e) {
    var b = e.target.closest('[data-filter]');
    if (!b) return;
    var id = b.getAttribute('data-filter');
    bar.querySelectorAll('[data-filter]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
    list.querySelectorAll('[data-category]').forEach(function (li) {
      li.hidden = id !== 'all' && li.getAttribute('data-category') !== id;
      if (!li.hidden) li.classList.add('is-in');
    });
  });
})();
