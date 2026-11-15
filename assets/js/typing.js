/* Digitação da última palavra do título da section Sobre. */
(() => {
  'use strict';

  const typed = document.querySelector('.about-copy .typed');
  const mark = document.querySelector('.about-copy .mark');
  if (!typed || !mark) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const words = ['COMUNIDADE', 'TROCA', 'CONHECIMENTO', 'PRÁTICA', 'EVOLUÇÃO', 'CONEXÃO'];
  const typeMs = 78;
  const deleteMs = 46;
  const holdMs = 1700;
  const gapMs = 220;

  const wait = ms => new Promise(resolve => window.setTimeout(resolve, ms));

  function show(text, idle) {
    typed.textContent = text;
    mark.classList.toggle('is-idle', idle);
  }

  async function run() {
    let index = 0;
    show(words[0], true);
    await wait(holdMs);
    while (true) {
      const current = words[index];
      const next = words[(index + 1) % words.length];
      show(current, false);
      for (let length = current.length - 1; length >= 0; length -= 1) {
        show(current.slice(0, length), false);
        await wait(deleteMs);
      }
      await wait(gapMs);
      for (let length = 1; length <= next.length; length += 1) {
        show(next.slice(0, length), false);
        await wait(typeMs);
      }
      show(next, true);
      await wait(holdMs);
      index = (index + 1) % words.length;
    }
  }

  run();
})();
