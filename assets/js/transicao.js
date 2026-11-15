/* Troca de página: navegação real entre as páginas da Trafe King.. */
(() => {
  'use strict';

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const KEY = 'page-transition';

  function normalizePath(pathname) {
    if (!pathname) return '/';
    const cleaned = pathname.replace(/\/index\.html$/, '').replace(/\/+$/, '');
    return cleaned || '/';
  }

  function isContact(pathname) {
    const path = normalizePath(pathname);
    return path === '/contato' || path.endsWith('/contato');
  }

  function messageFor(url) {
    const path = normalizePath(url.pathname);
    if (path.endsWith('/entrar')) return 'BEM-VINDO DE VOLTA.';
    if (path.endsWith('/cadastro')) return 'COMEÇA AQUI.';
    if (path.endsWith('/comunidade')) return 'ENTRE NA CONVERSA.';
    if (path.endsWith('/diretrizes')) return 'COMUNIDADE PRIMEIRO.';
    if (path.endsWith('/contato')) return 'QUASE LÁ!';
    if (path.endsWith('/sobre')) return 'CONHEÇA A HISTÓRIA.';
    if (path.endsWith('/privacidade')) return 'TRANSPARÊNCIA PRIMEIRO.';
    if (path.endsWith('/termos')) return 'TUDO CLARO.';
    return 'INÍCIO DE TUDO';
  }

  function directionFor(url) {
    const path = normalizePath(url.pathname);
    const inward = ['/contato', '/sobre', '/privacidade', '/termos', '/entrar', '/cadastro', '/comunidade', '/diretrizes'];
    return inward.some(item => path.endsWith(item)) ? 'left' : 'right';
  }

  function ensureOverlay() {
    let overlay = document.querySelector('.page-transition');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.className = 'page-transition';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = [
      '<div class="page-transition-bg" aria-hidden="true">',
      '<span class="pt-grid"></span>',
      '<span class="pt-line pt-line-a"></span>',
      '<span class="pt-line pt-line-b"></span>',
      '<span class="pt-word pt-word-a">TROCA</span>',
      '<span class="pt-word pt-word-b">PRÁTICA</span>',
      '<span class="pt-word pt-word-c">COMUNIDADE</span>',
      '<span class="pt-num pt-num-a">01</span>',
      '<span class="pt-num pt-num-b">02</span>',
      '<span class="pt-num pt-num-c">↑</span>',
      '</div>',
      '<div class="page-transition-inner">',
      '<p class="page-transition-text"></p>',
      '</div>'
    ].join('');
    document.body.appendChild(overlay);
    return overlay;
  }

  function applyDirection(overlay, direction) {
    overlay.classList.toggle('from-right', direction === 'right');
  }

  function play(message, direction) {
    const overlay = ensureOverlay();
    overlay.querySelector('.page-transition-text').textContent = message;
    overlay.classList.remove('is-leaving', 'is-hold', 'is-active');
    applyDirection(overlay, direction);
    overlay.setAttribute('aria-hidden', 'false');
    void overlay.offsetWidth;
    overlay.classList.add('is-active');
    return new Promise(resolve => window.setTimeout(resolve, reducedMotion.matches ? 280 : 640));
  }

  function reveal() {
    let pending = null;
    try { pending = sessionStorage.getItem(KEY); } catch (error) {}
    if (!pending) {
      document.documentElement.classList.remove('is-transitioning');
      return;
    }
    try { sessionStorage.removeItem(KEY); } catch (error) {}
    const [message, direction] = pending.split('|');
    const overlay = ensureOverlay();
    overlay.querySelector('.page-transition-text').textContent = message || '';
    applyDirection(overlay, direction);
    overlay.classList.add(reducedMotion.matches ? 'is-active' : 'is-hold');
    overlay.setAttribute('aria-hidden', 'false');
    window.requestAnimationFrame(() => {
      document.documentElement.classList.remove('is-transitioning');
      window.setTimeout(() => {
        overlay.classList.remove('is-hold', 'is-active');
        overlay.classList.add('is-leaving');
        window.setTimeout(() => {
          overlay.classList.remove('is-leaving');
          overlay.setAttribute('aria-hidden', 'true');
        }, reducedMotion.matches ? 180 : 440);
      }, reducedMotion.matches ? 80 : 120);
    });
  }

  // Voltar/avançar pode restaurar a página com a cortina ainda aberta no cache.
  window.addEventListener('pageshow', event => {
    if (!event.persisted) return;
    document.documentElement.classList.remove('is-transitioning');
    const overlay = document.querySelector('.page-transition');
    if (overlay) {
      overlay.classList.remove('is-active', 'is-hold', 'is-leaving');
      overlay.setAttribute('aria-hidden', 'true');
    }
    try { sessionStorage.removeItem(KEY); } catch (error) {}
  });

  document.addEventListener('click', event => {
    const link = event.target.closest('a[href]');
    if (event.defaultPrevented || !link || link.hasAttribute('download') || link.target || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
    let url;
    try { url = new URL(link.href, location.href); } catch { return; }
    if (!['http:', 'https:', 'file:'].includes(url.protocol) || url.origin !== location.origin) return;
    if (normalizePath(url.pathname) === normalizePath(location.pathname)) return;
    event.preventDefault();
    const destination = url.href;
    const message = messageFor(url);
    const direction = directionFor(url);
    play(message, direction).then(() => {
      try { sessionStorage.setItem(KEY, message + '|' + direction); } catch (error) {}
      location.href = destination;
    });
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', reveal);
  } else {
    reveal();
  }
})();
