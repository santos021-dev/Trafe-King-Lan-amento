(() => {
  'use strict';
  const carousel = document.querySelector('[data-client-carousel]');
  if (!carousel) return;
  const track = carousel.querySelector('.case-photo-track');
  const slides = [...track.querySelectorAll('.case-photo')];
  if (!slides.length) return;
  const controls = carousel.querySelector('.carousel-controls');
  const previous = carousel.querySelector('[data-carousel-prev]');
  const next = carousel.querySelector('[data-carousel-next]');
  const dots = carousel.querySelector('.carousel-dots');
  const currentLabel = carousel.querySelector('[data-carousel-current]');
  const totalLabel = carousel.querySelector('[data-carousel-total]');
  const status = carousel.querySelector('[data-carousel-status]');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let positions = [];
  let current = 0;
  let visibleCount = 1;
  let queued = false;
  let announcement;

  function description(index) {
    const first = index + 1;
    const last = Math.min(first + visibleCount - 1, slides.length);
    return first === last ? 'Categoria ' + first + ' de ' + slides.length : 'Categorias ' + first + ' a ' + last + ' de ' + slides.length;
  }

  function update() {
    if (!positions.length) return;
    current = positions.reduce((nearest, left, index) => Math.abs(track.scrollLeft - left) < Math.abs(track.scrollLeft - positions[nearest]) ? index : nearest, 0);
    currentLabel.textContent = String(current + 1).padStart(2, '0');
    previous.disabled = current === 0;
    next.disabled = current === positions.length - 1;
    [...dots.children].forEach((dot, index) => {
      if (index === current) dot.setAttribute('aria-current', 'true');
      else dot.removeAttribute('aria-current');
    });
  }

  function goTo(index) {
    const destination = Math.max(0, Math.min(index, positions.length - 1));
    track.scrollTo({ left: positions[destination], behavior: reducedMotion.matches ? 'instant' : 'smooth' });
  }

  function measure() {
    const keepDotFocus = dots.contains(document.activeElement);
    const slideWidth = slides[0].getBoundingClientRect().width;
    const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
    visibleCount = Math.max(1, Math.round((track.clientWidth + gap) / (slideWidth + gap)));
    const maxScroll = Math.max(0, track.scrollWidth - track.clientWidth);
    positions = [];
    slides.forEach(slide => {
      const left = Math.min(slide.offsetLeft - slides[0].offsetLeft, maxScroll);
      if (!positions.length || left - positions[positions.length - 1] > 1) positions.push(left);
    });
    dots.replaceChildren(...positions.map((_, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'carousel-dot';
      button.setAttribute('aria-label', 'Mostrar ' + description(index).toLowerCase());
      button.setAttribute('aria-controls', track.id);
      button.addEventListener('click', () => goTo(index));
      return button;
    }));
    totalLabel.textContent = String(positions.length).padStart(2, '0');
    controls.hidden = positions.length < 2;
    update();
    if (keepDotFocus && !controls.hidden) dots.children[current]?.focus({ preventScroll: true });
  }

  previous.addEventListener('click', () => goTo(current - 1));
  next.addEventListener('click', () => goTo(current + 1));
  track.addEventListener('keydown', event => {
    if (event.target !== track || event.altKey || event.ctrlKey || event.metaKey) return;
    const destination = { ArrowLeft: current - 1, ArrowRight: current + 1, Home: 0, End: positions.length - 1 }[event.key];
    if (destination === undefined) return;
    event.preventDefault();
    goTo(destination);
  });
  track.addEventListener('scroll', () => {
    if (!queued) {
      queued = true;
      requestAnimationFrame(() => { update(); queued = false; });
    }
    clearTimeout(announcement);
    announcement = setTimeout(() => { status.textContent = description(current); }, 180);
  }, { passive: true });
  if ('ResizeObserver' in window) new ResizeObserver(measure).observe(track);
  else window.addEventListener('resize', measure, { passive: true });
  measure();
})();
