/* Interações compartilhadas. Âncoras da Home e menu. */
(() => {
  'use strict';

  const header = document.querySelector('.site-header');
  const toggle = document.querySelector('.menu-toggle');
  const nav = document.querySelector('.main-nav');
  if (!header || !toggle || !nav) return;

  const mobileQuery = window.matchMedia('(max-width: 1000px)');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const navigationLinks = [...nav.querySelectorAll('a:not(.button)')];
  const trackedSections = navigationLinks
    .map(link => sectionFor(link))
    .filter(Boolean);

  function normalizePath(pathname) {
    if (!pathname) return '/';
    const cleaned = pathname.replace(/\/index\.html$/, '').replace(/\/+$/, '');
    return cleaned || '/';
  }

  function sectionFor(link) {
    if (normalizePath(link.pathname) !== normalizePath(location.pathname)) return null;
    if (link.hash) return document.querySelector(link.hash);
    if (document.querySelector('#inicio')) return document.querySelector('#inicio');
    return null;
  }

  function setMenu(open, restoreFocus = false) {
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
    nav.classList.toggle('is-open', open);
    document.body.classList.toggle('menu-open', open);
    if (restoreFocus) toggle.focus();
  }

  toggle.addEventListener('click', () => {
    setMenu(toggle.getAttribute('aria-expanded') !== 'true');
  });

  document.addEventListener('keydown', event => {
    if (toggle.getAttribute('aria-expanded') !== 'true') return;
    if (event.key === 'Escape') {
      setMenu(false, true);
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [toggle, ...nav.querySelectorAll('a')];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  document.addEventListener('click', event => {
    if (toggle.getAttribute('aria-expanded') === 'true' && !header.contains(event.target)) {
      setMenu(false, true);
    }
    const link = event.target.closest('a[href]');
    if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    let url;
    try { url = new URL(link.href, location.href); } catch { return; }
    if (url.origin !== location.origin) return;
    if (normalizePath(url.pathname) !== normalizePath(location.pathname)) return;
    if (!url.hash) {
      if (document.querySelector('#inicio')) {
        event.preventDefault();
        setMenu(false);
        window.scrollTo({ top: 0, behavior: reducedMotion.matches ? 'auto' : 'smooth' });
      }
      return;
    }
    const target = document.querySelector(url.hash);
    if (!target) return;
    event.preventDefault();
    const menuWasOpen = toggle.getAttribute('aria-expanded') === 'true';
    setMenu(false);
    target.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth' });
    if (menuWasOpen) {
      target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
      target.addEventListener('blur', () => target.removeAttribute('tabindex'), { once: true });
    }
  });

  mobileQuery.addEventListener('change', () => setMenu(false));

  if (trackedSections.length) {
    let scrollQueued = false;
    function updateScrollState() {
      header.classList.toggle('is-scrolled', window.scrollY > 12);
      const offset = header.offsetHeight + window.innerHeight * 0.25;
      let current = trackedSections[0];
      for (const section of trackedSections) {
        if (section.getBoundingClientRect().top <= offset) current = section;
      }
      navigationLinks.forEach(link => {
        const section = sectionFor(link);
        if (section && section.id === current.id) link.setAttribute('aria-current', 'location');
        else if (section) link.removeAttribute('aria-current');
      });
      scrollQueued = false;
    }

    window.addEventListener('scroll', () => {
      if (scrollQueued) return;
      scrollQueued = true;
      window.requestAnimationFrame(updateScrollState);
    }, { passive: true });
    window.addEventListener('resize', updateScrollState, { passive: true });
    updateScrollState();
  } else {
    header.classList.toggle('is-scrolled', window.scrollY > 12);
    window.addEventListener('scroll', () => {
      header.classList.toggle('is-scrolled', window.scrollY > 12);
    }, { passive: true });
  }

  // Conteúdo permanece visível mesmo se o observador não estiver disponível.
  if ('IntersectionObserver' in window && !reducedMotion.matches) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('just-entered');
        entry.target.addEventListener('animationend', () => entry.target.classList.remove('just-entered'), { once: true });
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12 });
    document.querySelectorAll('.section h2, .metric, .timeline, .principles-list').forEach(element => observer.observe(element));

    const about = document.querySelector('.about');
    if (about) {
      const aboutObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          about.classList.add('is-in');
          aboutObserver.disconnect();
        });
      }, { threshold: 0.2, rootMargin: '0px 0px -8% 0px' });
      aboutObserver.observe(about);
    }
  }
})();
