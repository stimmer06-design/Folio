// Funnel events for the marketing pages (core/track.js: allow-listed, privacy-safe).
//   seo_page_view + template_view | guide_view | tool_view   on content pages and hubs
//   template_selected       a template chosen (links marked data-track="template_selected")
//   generator_cta_clicked   any link into the generator, named by where it sits
(function () {
  'use strict';
  if (!window.folioTrack) return;
  var body = document.body;
  var type = body.getAttribute('data-page-type');
  var slug = body.getAttribute('data-page-slug') || undefined;
  if (['template', 'guide', 'tool', 'hub', 'landing'].indexOf(type) !== -1) {
    window.folioTrack('seo_page_view', {});
    var view = { template: 'template_view', guide: 'guide_view', tool: 'tool_view' }[type];
    if (view) window.folioTrack(view, type === 'template' ? { template: slug } : type === 'tool' ? { tool: slug } : {});
  }

  function place(a) {
    if (a.getAttribute('data-track-cta')) return a.getAttribute('data-track-cta');
    if (a.closest('.site-header')) return 'header';
    if (a.closest('.mobile-menu')) return 'menu';
    if (a.closest('.site-footer')) return 'footer';
    if (a.closest('.cta')) return 'bottom';
    if (a.closest('.tool')) return 'tool';
    if (a.closest('.article__body')) return 'article';
    return 'content';
  }

  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    var url;
    try { url = new URL(a.getAttribute('href'), location.href); } catch (err) { return; }
    var template = a.getAttribute('data-track-slug') || (/[?&]template=([a-z0-9-]+)/.exec(url.search) || [])[1];
    if (a.getAttribute('data-track') === 'template_selected') {
      window.folioTrack('template_selected', { template: template, cta: place(a) });
    }
    if (url.origin === location.origin && /\/app\/$/.test(url.pathname)) {
      window.folioTrack('generator_cta_clicked', { cta: place(a), template: template, tool: type === 'tool' ? slug : undefined });
    }
  });
})();
