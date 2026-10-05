// Contact form: inline validation, topic from the URL (?topic=pro), submission.
// With data-endpoint set it posts there (Formspree, Basin, your own API);
// otherwise it opens a pre-written email, so no message is silently lost.
(function () {
  'use strict';
  var form = document.querySelector('[data-contact-form]');
  if (!form) return;
  var status = document.querySelector('[data-form-status]');
  var submit = form.querySelector('[type="submit"]');
  var endpoint = form.getAttribute('data-endpoint') || '';
  var email = form.getAttribute('data-email');

  var topic = new URLSearchParams(window.location.search).get('topic');
  if (topic) {
    var radio = form.querySelector('input[name="topic"][value="' + topic.replace(/[^\w-]/g, '') + '"]');
    if (radio) radio.checked = true;
  }

  function fieldOf(input) { return input.closest('.field'); }
  function setError(input, text) {
    var field = fieldOf(input);
    var error = field && field.querySelector('.field__error');
    field.classList.toggle('is-invalid', Boolean(text));
    input.setAttribute('aria-invalid', text ? 'true' : 'false');
    if (error) error.textContent = text || '';
  }
  function check(input) {
    var v = input.value.trim();
    var text = '';
    if (input.required && !v) text = input.getAttribute('data-msg') || 'This field is required.';
    else if (input.type === 'email' && v && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) text = 'That email address looks incomplete.';
    setError(input, text);
    return !text;
  }
  var inputs = Array.prototype.slice.call(form.querySelectorAll('.field__input[required]'));
  inputs.forEach(function (input) {
    input.addEventListener('blur', function () { if (input.value.trim() || fieldOf(input).classList.contains('is-invalid')) check(input); });
    input.addEventListener('input', function () { if (fieldOf(input).classList.contains('is-invalid')) check(input); });
  });

  function show(kind, title, body) {
    status.hidden = false;
    status.className = 'form__status' + (kind === 'error' ? ' form__status--error' : '');
    status.innerHTML = '';
    var h = document.createElement('h2'); h.textContent = title;
    var p = document.createElement('p'); p.textContent = body;
    status.appendChild(h); status.appendChild(p);
    status.setAttribute('tabindex', '-1');
    status.focus();
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (form.querySelector('.hp input').value) return;
    var first = null;
    inputs.forEach(function (i) { if (!check(i) && !first) first = i; });
    if (first) { first.focus(); return; }
    var data = new FormData(form);
    if (!endpoint) {
      var body = ['Name: ' + data.get('name'), 'Email: ' + data.get('email'), 'Topic: ' + data.get('topic'), '', data.get('message')].join('\n');
      window.location.href = 'mailto:' + email + '?subject=' + encodeURIComponent('Folio — ' + data.get('topic')) + '&body=' + encodeURIComponent(body);
      show('ok', 'Your email is ready to send.', 'We have opened your email application with the message written out. If nothing appeared, write to ' + email + '.');
      return;
    }
    submit.disabled = true;
    fetch(endpoint, { method: 'POST', body: data, headers: { Accept: 'application/json' } })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        form.hidden = true;
        show('ok', 'Thank you. Your message has been received.', 'We will reply to ' + data.get('email') + ' within one working day.');
      })
      .catch(function () {
        show('error', 'Your message could not be sent.', 'Nothing has been lost; your text is still in the form. Please try again, or write to ' + email + '.');
      })
      .then(function () { submit.disabled = false; });
  });
})();
