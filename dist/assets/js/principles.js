/* Troca suave do conteúdo em "O que guia a Trafe King.". */
(() => {
  'use strict';

  const stage = document.querySelector('.principles-stage');
  const list = document.querySelector('.principles-list');
  if (!stage || !list) return;

  const title = stage.querySelector('h2');
  const copy = stage.querySelector('.principles-copy');
  const items = [...list.querySelectorAll('.principle')];
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const content = {
  "inicio": {
    "title": "O QUE GUIA<br> A TRAFE KING.",
    "copy": "Uma comunidade só funciona quando as pessoas encontram espaço para perguntar, compartilhar e aprender umas com as outras."
  },
  "troca": {
    "title": "CONHECIMENTO CRESCE<br> QUANDO É COMPARTILHADO.",
    "copy": "Uma experiência que parece simples para você pode ser exatamente a resposta que outra pessoa estava procurando."
  },
  "pratica": {
    "title": "EXPERIÊNCIA TAMBÉM<br> ENSINA.",
    "copy": "Marketing não acontece apenas na teoria. Testes, erros, acertos e situações reais também fazem parte do aprendizado."
  },
  "respeito": {
    "title": "DISCORDAR TAMBÉM<br> FAZ PARTE.",
    "copy": "Pessoas podem enxergar estratégias de formas diferentes. Discussões devem continuar respeitosas, construtivas e focadas no assunto."
  },
  "evolucao": {
    "title": "NINGUÉM PRECISA<br> SABER TUDO.",
    "copy": "A comunidade existe para que cada pessoa consiga aprender algo novo e também contribuir com aquilo que já sabe."
  }
};

  let current = 'inicio';
  let timer = 0;

  function render(key) {
    if (key === current || !content[key]) return;
    current = key;
    const next = content[key];
    const apply = () => {
      title.innerHTML = next.title;
      copy.textContent = next.copy;
      stage.classList.remove('is-changing');
    };
    window.clearTimeout(timer);
    if (reduced.matches) {
      apply();
      return;
    }
    stage.classList.add('is-changing');
    timer = window.setTimeout(apply, 180);
  }

  function setActive(item) {
    items.forEach(entry => {
      const active = entry === item;
      entry.classList.toggle('is-active', active);
      entry.setAttribute('aria-pressed', String(active));
    });
    render(item ? item.dataset.principle : 'inicio');
  }

  items.forEach(item => {
    item.addEventListener('mouseenter', () => setActive(item));
    item.addEventListener('focus', () => setActive(item));
    item.addEventListener('click', () => {
      setActive(item);
      if (window.matchMedia('(max-width: 700px)').matches) {
        stage.scrollIntoView({ behavior: reduced.matches ? 'auto' : 'smooth', block: 'start' });
      }
    });
  });

  list.addEventListener('mouseleave', () => {
    if (!list.contains(document.activeElement)) setActive(null);
  });
  list.addEventListener('focusout', event => {
    if (!list.contains(event.relatedTarget)) setActive(null);
  });
})();
