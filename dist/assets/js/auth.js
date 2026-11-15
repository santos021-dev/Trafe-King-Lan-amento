import copy from './i18n/pt-BR.js';
import { getFirebaseServices } from './firebase-client.js';

const form = document.querySelector('[data-auth-form]');
if (form) {
  const status = form.querySelector('[data-auth-status]');
  const submit = form.querySelector('[type="submit"]');
  const isRegister = form.dataset.authForm === 'register';
  const input = name => form.elements.namedItem(name);
  const value = name => input(name)?.value || '';
  let pending = false;
  const rules = {
    email: () => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value('email').trim()) && value('email').length <= 254 ? '' : copy.email,
    password: () => isRegister ? (value('password').length >= 8 && value('password').length <= 128 ? '' : copy.newPassword) : (value('password') ? '' : copy.password)
  };
  if (isRegister) Object.assign(rules, {
    displayName: () => value('displayName').trim().length >= 2 && value('displayName').trim().length <= 60 ? '' : copy.displayName,
    username: () => /^[a-zA-Z0-9_]{3,30}$/.test(value('username')) ? '' : copy.username,
    confirmPassword: () => value('confirmPassword') && value('confirmPassword') === value('password') ? '' : copy.confirmPassword,
    terms: () => input('terms').checked ? '' : copy.terms
  });
  function validate(name) {
    const field = form.querySelector(`[data-field="${name}"]`);
    const message = rules[name]();
    field.classList.toggle('is-invalid', Boolean(message));
    field.querySelector('.field-error').textContent = message;
    input(name).setAttribute('aria-invalid', String(Boolean(message)));
    return !message;
  }
  function clearPasswords() {
    for (const name of ['password', 'confirmPassword']) {
      if (input(name)) { input(name).value = ''; input(name).type = 'password'; }
    }
    form.querySelectorAll('[data-password-toggle]').forEach(button => {
      button.textContent = copy.showPassword;
      button.setAttribute('aria-pressed', 'false');
      const label = form.querySelector(`label[for="${button.dataset.passwordToggle}"]`).textContent.toLowerCase();
      button.setAttribute('aria-label', `${copy.showPassword} ${label}`);
    });
  }
  form.querySelectorAll('[data-password-toggle]').forEach(button => {
    button.addEventListener('click', () => {
      const control = input(button.dataset.passwordToggle);
      const show = control.type === 'password';
      control.type = show ? 'text' : 'password';
      button.setAttribute('aria-pressed', String(show));
      button.textContent = show ? copy.hidePassword : copy.showPassword;
      const label = form.querySelector(`label[for="${control.id}"]`).textContent.toLowerCase();
      button.setAttribute('aria-label', `${show ? copy.hidePassword : copy.showPassword} ${label}`);
    });
    button.disabled = false;
  });
  form.addEventListener('blur', event => { if (rules[event.target.name]) validate(event.target.name); }, true);
  form.addEventListener('change', event => { if (rules[event.target.name]) validate(event.target.name); });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (pending) return;
    // A validação local serve à experiência; a autorização futura depende do Firebase e das Rules.
    const valid = Object.keys(rules).map(validate).every(Boolean);
    if (!valid) {
      status.textContent = copy.reviewFields;
      form.querySelector('[aria-invalid="true"]')?.focus();
      return;
    }
    pending = true; submit.disabled = true;
    try {
      const services = await getFirebaseServices();
      if (!services) { status.textContent = copy.authUnavailable; return; }
      status.textContent = copy.authWorking;
      // Só chega aqui quando existir um adaptador Firebase real. Sem armazenamento manual.
      if (isRegister) await services.register({ displayName: value('displayName').trim(), username: value('username').toLowerCase(), email: value('email').trim(), password: value('password'), termsAccepted: input('terms').checked });
      else await services.signIn({ email: value('email').trim(), password: value('password') });
      window.location.assign(new URL('../comunidade/index.html', location.href).href);
    } catch {
      // Não publicar erros brutos do provedor nem permitir enumeração de contas.
      status.textContent = copy.authFailure;
    } finally {
      clearPasswords(); pending = false; submit.disabled = false;
    }
  });
  const reset = form.querySelector('[data-password-reset]');
  if (reset) {
    reset.addEventListener('click', async () => {
      if (pending) return;
      pending = true; reset.disabled = true;
      try {
        const services = await getFirebaseServices();
        if (!services) { status.textContent = copy.authUnavailable; return; }
        if (!validate('email')) { input('email').focus(); return; }
        await services.resetPassword(value('email').trim());
        status.textContent = copy.resetSent;
      } catch { status.textContent = copy.authFailure; }
      finally { pending = false; reset.disabled = false; }
    });
    reset.disabled = false;
  }
  // Evita reter senhas em uma página restaurada pelo histórico de navegação.
  window.addEventListener('pagehide', clearPasswords);
  window.addEventListener('pageshow', event => { if (event.persisted) clearPasswords(); });
  submit.disabled = false;
}
