/* Preserva validação, honeypot e confirmação somente depois do servidor. */
import copy from './i18n/pt-BR.js';
const form = document.querySelector('[data-contact-form]');
if (form) {
  const status = form.querySelector('[data-form-status]');
  const submit = form.querySelector('[type="submit"]');
  const subjects = ['Suporte', 'Parceria', 'Sugestão', 'Problema na plataforma', 'Privacidade', 'Outro'];
  const valueOf = name => form.elements.namedItem(name).value.trim();
  const rules = {
    nome: value => value.length >= 2 && value.length <= 100 ? '' : copy.contactName,
    email: value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254 ? '' : copy.email,
    assunto: value => subjects.includes(value) ? '' : copy.contactSubject,
    mensagem: value => value.length >= 10 && value.length <= 5000 ? '' : copy.contactMessage
  };
  function validate(name) {
    const field = form.querySelector(`[data-field="${name}"]`);
    const error = rules[name](valueOf(name));
    field.classList.toggle('is-invalid', Boolean(error));
    field.querySelector('.field-error').textContent = error;
    form.elements.namedItem(name).setAttribute('aria-invalid', String(Boolean(error)));
    return !error;
  }
  form.addEventListener('blur', event => { if (rules[event.target.name]) validate(event.target.name); }, true);
  form.addEventListener('change', event => { if (rules[event.target.name]) validate(event.target.name); });
  let pending = false;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (pending) return;
    if (!Object.keys(rules).map(validate).every(Boolean)) {
      status.textContent = copy.reviewFields;
      form.querySelector('[aria-invalid="true"]')?.focus();
      return;
    }
    if (valueOf('website')) { status.textContent = copy.contactBlocked; return; }
    const endpoint = form.getAttribute('data-endpoint');
    if (!endpoint) { status.textContent = copy.contactUnavailable; return; }
    // O endpoint deverá ser servido na mesma origem para não enviar dados a destinos arbitrários.
    const destination = new URL(endpoint, location.href);
    if (destination.origin !== location.origin) { status.textContent = copy.contactUnavailable; return; }
    const payload = Object.fromEntries([...Object.keys(rules), 'website'].map(name => [name, valueOf(name)]));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    pending = true; submit.disabled = true; form.setAttribute('aria-busy', 'true'); status.textContent = copy.contactSending;
    try {
      const response = await fetch(destination, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: controller.signal });
      const result = await response.json();
      if (!response.ok || result.ok !== true) throw new Error('unconfirmed');
      const success = document.querySelector('[data-contact-success]');
      form.reset(); form.hidden = true; success.hidden = false; success.focus(); status.textContent = '';
    } catch { status.textContent = copy.contactFailure; }
    finally { clearTimeout(timeout); pending = false; submit.disabled = false; form.removeAttribute('aria-busy'); }
  });
  submit.disabled = false;
}
