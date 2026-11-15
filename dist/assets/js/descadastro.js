(() => {
  'use strict';
  const token = location.hash.slice(1);
  // O fragmento não é enviado ao servidor, e é removido do histórico desta página.
  history.replaceState(null, '', location.pathname);
  const form = document.querySelector('[data-unsubscribe]');
  const button = form.querySelector('button');
  const status = document.querySelector('[data-unsubscribe-status]');
  if (!token) {
    status.textContent = 'Use o link recebido por e-mail ou o canal de privacidade.';
    button.disabled = true;
  }
  let pending = false;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (pending || !token) return;
    pending = true; button.disabled = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    status.textContent = 'Confirmando…';
    try {
      const response = await fetch('/api/descadastro', { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({token}), signal:controller.signal });
      const data = await response.json();
      if (!response.ok || data.ok !== true) throw new Error('unconfirmed');
      status.textContent = 'Os avisos foram cancelados. Um e-mail que já estava em processamento ainda poderá chegar.';
    } catch {
      status.textContent = 'Não foi possível confirmar. Tente novamente ou use o canal de privacidade.';
      button.disabled = false;
    } finally { clearTimeout(timeout); pending = false; }
  });
})();
