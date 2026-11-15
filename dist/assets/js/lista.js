/* Lista de espera e regras completas. Não confirma cadastro sem resposta real do servidor. */
(() => {
  'use strict';

  const dialog = document.querySelector('#rules-dialog');
  const openRules = document.querySelector('[data-rules-open]');
  if (dialog && openRules && typeof dialog.showModal === 'function') {
    openRules.addEventListener('click', () => dialog.showModal());
    dialog.querySelector('[data-rules-close]')?.addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => {
      if (event.target === dialog) dialog.close();
    });
  }

  const form = document.querySelector('[data-waitlist]');
  if (!form) return;
  const status = document.querySelector('#wait-status');
  const emailField = form.querySelector('[data-field="email"]');
  const emailError = document.querySelector('#wait-email-error');
  const emailInput = form.querySelector('#wait-email');
  const nameField = form.querySelector('[data-field="name"]');
  const nameError = document.querySelector('#wait-name-error');
  const nameInput = form.querySelector('#wait-name');
  const submit = form.querySelector('[type="submit"]');

  function setStatus(message, kind) {
    if (!status) return;
    status.textContent = message;
    status.classList.toggle('is-error', kind === 'error');
    status.classList.toggle('is-pending', kind === 'pending');
  }

  let pending = false;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (pending) return;
    const name = nameInput.value.trim();
    const email = emailInput.value.trim();
    const nameValid = name.length > 0 && name.length <= 80 && !/[\p{Cc}\p{Cf}<>]/u.test(name);
    const emailValid = email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    nameField.classList.toggle('is-invalid', !nameValid);
    emailField.classList.toggle('is-invalid', !emailValid);
    nameInput.setAttribute('aria-invalid', String(!nameValid));
    emailInput.setAttribute('aria-invalid', String(!emailValid));
    nameError.textContent = nameValid ? '' : 'Informe um nome válido com até 80 caracteres.';
    emailError.textContent = emailValid ? '' : 'Informe um e-mail válido.';
    if (!nameValid || !emailValid) {
      (nameValid ? emailInput : nameInput).focus();
      setStatus('', '');
      return;
    }
    pending = true;
    submit.disabled = true;
    form.setAttribute('aria-busy', 'true');
    setStatus('Enviando…', 'pending');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch('/api/lista-de-espera', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'accept': 'application/json' },
        body: JSON.stringify({
          name, email,
          website: form.elements.namedItem('website').value,
          consentVersion: form.dataset.consentVersion
        }),
        signal: controller.signal
      });
      let data = {};
      try { data = await response.json(); } catch { data = {}; }
      if (response.ok && data.ok === true) {
        form.reset();
        setStatus('Solicitação recebida. Você receberá os avisos se este e-mail estiver ativo na lista.', '');
      } else {
        const messages = {
          not_configured: 'A lista de espera está temporariamente indisponível. Não foi possível confirmar o cadastro.',
          rate_limited: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
          invalid_name: 'Informe um nome válido com até 80 caracteres.',
          invalid_email: 'Informe um e-mail válido com até 254 caracteres.',
          consent_required: 'Atualize a página e confira o aviso de privacidade antes de se cadastrar.'
        };
        setStatus(messages[data.code] || 'Não foi possível confirmar o cadastro. Tente novamente mais tarde.', 'error');
      }
    } catch {
      // A resposta pode ter se perdido DEPOIS de o banco salvar. Não afirmar o contrário.
      setStatus('Não foi possível confirmar o cadastro agora. Tente novamente; inscrições repetidas não criam outro registro.', 'error');
    } finally {
      clearTimeout(timeout);
      pending = false;
      submit.disabled = false;
      form.removeAttribute('aria-busy');
    }
  });
  submit.disabled = false;
})();
