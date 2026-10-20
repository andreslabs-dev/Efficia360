/* ==========================================================
   EFFICIA 360 — Interacción (JavaScript vainilla, sin dependencias)
   ========================================================== */
(() => {
  'use strict';

  /* ---------- Utilidades ---------- */
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

  /* ---------- 1. Navbar: vidrio al hacer scroll y menú móvil ---------- */
  const navbar = $('#navbar');
  const navMenu = $('#navMenu');
  const menuToggle = $('#menuToggle');

  const onScroll = () => navbar.classList.toggle('is-scrolled', window.scrollY > 24);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  const setMenu = (open) => {
    navMenu.classList.toggle('is-open', open);
    menuToggle.setAttribute('aria-expanded', String(open));
    menuToggle.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
  };

  menuToggle.addEventListener('click', () => setMenu(!navMenu.classList.contains('is-open')));
  $$('a', navMenu).forEach((a) => a.addEventListener('click', () => setMenu(false)));

  /* ---------- 2. Enlace activo según la sección visible (scroll spy) ---------- */
  const navLinks = $$('a[href^="#"]', navMenu);
  const spy = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const href = `#${entry.target.id}`;
      navLinks.forEach((a) => a.classList.toggle('is-active', a.getAttribute('href') === href));
    });
  }, { rootMargin: '-45% 0px -50% 0px' });

  $$('main section[id]').forEach((section) => spy.observe(section));

  /* ---------- 3. Entradas dinámicas al hacer scroll ---------- */
  const reveals = $$('.reveal');

  if (reduceMotion || !('IntersectionObserver' in window)) {
    reveals.forEach((el) => el.classList.add('is-visible', 'is-done'));
  } else {
    const revealObs = new IntersectionObserver((entries, obs) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        el.classList.add('is-visible');
        // Tras la entrada se quita el retardo para no afectar hover ni tilt
        setTimeout(() => el.classList.add('is-done'), 1400);
        obs.unobserve(el);
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

    reveals.forEach((el) => revealObs.observe(el));
  }

  /* ---------- 3b. Escultura 3D: revelado al llegar a "Sobre Nosotros" ---------- */
  // Solo con JS activo se oculta la escultura; sin JS siempre es visible.
  document.documentElement.classList.add('js');

  const sculptureStage = $('#sculptureStage');
  const aboutSection = $('#sobre-nosotros');

  if (sculptureStage && aboutSection) {
    if (reduceMotion || !('IntersectionObserver' in window)) {
      sculptureStage.classList.add('is-revealed');
    } else {
      const sculptureObs = new IntersectionObserver((entries, obs) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          sculptureStage.classList.add('is-revealed');
          obs.unobserve(entry.target);
        });
      }, { threshold: 0.25 });

      sculptureObs.observe(aboutSection);
    }
  }

  /* ---------- 3c. Fondos dinámicos: parallax por sección ---------- */
  // Calcula la posición de cada sección en el viewport (-1 arriba, 0 centro, 1 abajo)
  // y la expone como --p para que las capas se desplacen a distinta profundidad.
  const bgLayers = $$('.sec-bg').map((el) => ({ el, host: el.parentElement }));

  if (!reduceMotion && bgLayers.length) {
    let bgTicking = false;

    const updateBgParallax = () => {
      const vh = window.innerHeight;
      bgLayers.forEach(({ el, host }) => {
        const r = host.getBoundingClientRect();
        if (r.bottom < -vh || r.top > vh * 2) return; // fuera de rango: sin trabajo
        const p = clamp(((vh / 2) - (r.top + r.height / 2)) / (vh / 2 + r.height / 2), -1, 1);
        el.style.setProperty('--p', p.toFixed(3));
      });
      bgTicking = false;
    };

    const requestBgUpdate = () => {
      if (bgTicking) return;
      bgTicking = true;
      requestAnimationFrame(updateBgParallax);
    };

    window.addEventListener('scroll', requestBgUpdate, { passive: true });
    window.addEventListener('resize', requestBgUpdate);
    updateBgParallax();
  }

  /* ---------- 3d. Carrusel de servicios: autoplay infinito, pausa, arrastre y navegación ---------- */
  const svc = $('#svcCarousel');

  if (svc) {
    const viewport = $('#svcViewport', svc);
    const track = $('#svcTrack', svc);
    const allCards = $$('.service-card', track);        // 4 reales + 4 clones (aria-hidden)
    const dots = $$('.svc-dot', svc);
    const prevBtn = $('.svc-prev', svc);
    const nextBtn = $('.svc-next', svc);
    const N = allCards.length / 2;

    const AUTO_SPEED = 42;   // px por segundo (lento, cómodo de leer)
    const EASE = 6.5;        // suavizado hacia el objetivo (sin saltos)

    let x = 0;               // posición actual del track (px)
    let target = 0;          // posición hacia la que se desliza
    let setW = 0;            // ancho de un juego de tarjetas (base del bucle infinito)
    let pad = 0;             // padding horizontal del viewport (la pista empieza tras él)
    let step = 0;            // distancia entre tarjetas consecutivas
    let offsets = [];        // posición de cada tarjeta dentro del track
    let activeIndex = -1;

    let hovering = false;    // cursor sobre el carrusel (mouseenter / mouseleave)
    let dragging = false;    // arrastre táctil o con mouse
    let visible = true;      // carrusel dentro del viewport
    let momentum = 0;        // inercia tras soltar el arrastre (px/ms)

    let dragLastX = 0;
    let dragLastT = 0;
    let dragVel = 0;
    let last = performance.now();

    const measure = () => {
      pad = parseFloat(getComputedStyle(viewport).paddingLeft) || 0;
      offsets = allCards.map((el) => el.offsetLeft);
      setW = offsets[N] - offsets[0];
      step = offsets[1] - offsets[0];
    };

    // Mantiene x dentro de un juego de tarjetas: el bucle nunca se ve interrumpido
    const wrap = () => {
      if (!setW) return;
      while (x <= -setW) { x += setW; target += setW; }
      while (x > 0) { x -= setW; target -= setW; }
    };

    const setActive = (i) => {
      if (i === activeIndex) return;
      activeIndex = i;
      dots.forEach((d, k) => d.setAttribute('aria-current', String(k === i)));
    };

    // Tarjeta centrada en el viewport (índice real 0..N-1)
    const updateActive = () => {
      if (!setW) return;
      // Punto central del viewport expresado en coordenadas de la pista, y tarjeta más cercana a él
      const center = (((viewport.clientWidth / 2 - pad) - x - allCards[0].offsetWidth / 2) % setW + setW) % setW;
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < N; i++) {
        let d = Math.abs(center - offsets[i]);
        d = Math.min(d, setW - d);
        if (d < bestD) { bestD = d; best = i; }
      }
      setActive(best);
    };

    // Centra la tarjeta i en el viewport por el camino más corto (coincide con updateActive)
    const goTo = (i) => {
      const base = (viewport.clientWidth / 2 - pad) - allCards[0].offsetWidth / 2 - offsets[i];
      const k = Math.round((x - base) / setW);
      target = base + k * setW;
    };

    const frame = (now) => {
      const dt = Math.min((now - last) / 1000, 0.25); // tiempo real; el límite solo evita saltos al volver a la pestaña
      last = now;

      if (!dragging) {
        if (momentum) {
          target += momentum * dt * 1000;
          momentum *= Math.exp(-4 * dt);
          if (Math.abs(momentum) < 0.0005) momentum = 0;
        }
        // Autoplay: solo avanza el objetivo; si está pausado, x termina de llegar y se detiene
        const autoOn = !reduceMotion && visible && !hovering;
        if (autoOn) target -= AUTO_SPEED * dt;
        x += (target - x) * (1 - Math.exp(-EASE * dt));
      }

      wrap();
      track.style.transform = `translate3d(${x.toFixed(2)}px, 0, 0)`;
      updateActive();
      requestAnimationFrame(frame);
    };

    /* Pausa al interactuar (hover) y reanudación suave */
    svc.addEventListener('mouseenter', () => { hovering = true; target = x; }); // detiene en seco, sin deriva
    svc.addEventListener('mouseleave', () => { hovering = false; });

    /* Arrastre / swipe con pointer events (mouse y táctil) */
    viewport.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      dragging = true;
      momentum = 0;
      dragLastX = e.clientX;
      dragLastT = performance.now();
      dragVel = 0;
      viewport.setPointerCapture(e.pointerId);
      viewport.classList.add('is-dragging');
    });

    viewport.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const now = performance.now();
      const dx = e.clientX - dragLastX;
      const dt = Math.max(now - dragLastT, 1);
      dragLastX = e.clientX;
      dragLastT = now;
      dragVel = dx / dt;
      x += dx;
      target = x;
    });

    const endDrag = (e) => {
      if (!dragging) return;
      dragging = false;
      momentum = Math.max(-1.5, Math.min(1.5, dragVel));
      viewport.classList.remove('is-dragging');
      if (viewport.hasPointerCapture(e.pointerId)) viewport.releasePointerCapture(e.pointerId);
    };
    viewport.addEventListener('pointerup', endDrag);
    viewport.addEventListener('pointercancel', endDrag);

    /* Navegación manual: flechas, puntos y teclado */
    prevBtn.addEventListener('click', () => { target += step; });
    nextBtn.addEventListener('click', () => { target -= step; });
    dots.forEach((d, i) => d.addEventListener('click', () => goTo(i)));

    svc.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { target += step; e.preventDefault(); }
      if (e.key === 'ArrowRight') { target -= step; e.preventDefault(); }
    });

    /* Solo animar mientras el carrusel está en pantalla */
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; })
        .observe(svc);
    }

    // Evita que el arrastre seleccione o arrastre imágenes nativas
    viewport.addEventListener('dragstart', (e) => e.preventDefault());

    measure();
    window.addEventListener('resize', measure);
    requestAnimationFrame((t) => { last = t; frame(t); });
  }

  /* ---------- 4. Contadores animados ---------- */
  const counters = $$('[data-count]');

  const countUp = (el) => {
    const target = Number(el.dataset.count);
    const prefix = el.dataset.prefix || '';
    const suffix = el.dataset.suffix || '';

    if (reduceMotion) {
      el.textContent = prefix + target + suffix;
      return;
    }

    const duration = 1800;
    const start = performance.now();
    const frame = (now) => {
      const p = clamp((now - start) / duration, 0, 1);
      el.textContent = prefix + Math.round(target * easeOutCubic(p)) + suffix;
      if (p < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  };

  counters.forEach((el) => {
    el.textContent = `${el.dataset.prefix || ''}0${el.dataset.suffix || ''}`;
  });

  const countObs = new IntersectionObserver((entries, obs) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      countUp(entry.target);
      obs.unobserve(entry.target);
    });
  }, { threshold: 0.6 });

  counters.forEach((el) => countObs.observe(el));

  /* ---------- 5. Hero: fondo geométrico en Canvas con parallax ---------- */
  const hero = $('#inicio');
  const canvas = $('#heroCanvas');
  const ctx = canvas.getContext('2d');
  const visual = $('.hero-visual');

  // Polígonos angulares en coordenadas normalizadas (0–1).
  // "depth" controla cuánto se desplaza cada figura con el cursor.
  const SHAPES = [
    { depth: 0.9, fill: 'rgba(44, 18, 196, 0.55)', stroke: 'rgba(182, 195, 249, 0.35)',
      pts: [[0.62, 0.06], [0.95, 0.06], [0.95, 0.42], [0.72, 0.62], [0.62, 0.52]] },
    { depth: 1.6, fill: 'rgba(115, 61, 211, 0.28)', stroke: 'rgba(98, 111, 246, 0.5)',
      pts: [[0.05, 0.55], [0.30, 0.30], [0.48, 0.30], [0.48, 0.46], [0.26, 0.80], [0.05, 0.80]] },
    { depth: 2.4, fill: 'rgba(44, 18, 196, 0.4)', stroke: 'rgba(221, 240, 246, 0.3)',
      pts: [[0.40, 0.70], [0.78, 0.70], [0.92, 0.86], [0.92, 1.05], [0.40, 1.05]] },
    { depth: 1.2, fill: 'rgba(182, 195, 249, 0.12)', stroke: 'rgba(182, 195, 249, 0.35)',
      pts: [[0.70, 0.00], [0.86, 0.00], [0.70, 0.22], [0.55, 0.22]] },
    { depth: 3.0, fill: 'rgba(98, 111, 246, 0.2)', stroke: 'rgba(98, 111, 246, 0.4)',
      pts: [[0.00, 0.00], [0.22, 0.00], [0.00, 0.22]] }
  ];

  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  let width = 0;
  let height = 0;
  let dpr = 1;
  let heroInView = true;
  let resizeTimer = 0;

  const resizeCanvas = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const drawShapes = (time) => {
    ctx.clearRect(0, 0, width, height);

    // Interpolación suave hacia la posición del cursor
    pointer.x += (pointer.tx - pointer.x) * 0.05;
    pointer.y += (pointer.ty - pointer.y) * 0.05;

    SHAPES.forEach((shape, i) => {
      const drift = reduceMotion ? 0 : 1;
      const ox = pointer.x * shape.depth * 30 + Math.sin(time * 0.0004 + i) * 12 * drift;
      const oy = pointer.y * shape.depth * 30 + Math.cos(time * 0.0005 + i * 1.3) * 16 * drift;

      ctx.beginPath();
      shape.pts.forEach(([x, y], k) => {
        const px = x * width + ox;
        const py = y * height + oy;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.closePath();
      ctx.fillStyle = shape.fill;
      ctx.fill();
      ctx.strokeStyle = shape.stroke;
      ctx.lineWidth = 1;
      ctx.stroke();
    });
  };

  const loop = (time) => {
    if (heroInView) drawShapes(time);
    requestAnimationFrame(loop);
  };

  resizeCanvas();
  if (reduceMotion) {
    drawShapes(0);
  } else {
    requestAnimationFrame(loop);
  }

  new IntersectionObserver(([entry]) => { heroInView = entry.isIntersecting; }).observe(hero);

  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resizeCanvas();
      if (reduceMotion) drawShapes(0);
    }, 150);
  });

  const setParallax = (nx, ny) => {
    visual.style.setProperty('--px', nx.toFixed(3));
    visual.style.setProperty('--py', ny.toFixed(3));
  };

  if (!reduceMotion) {
    window.addEventListener('pointermove', (e) => {
      pointer.tx = e.clientX / window.innerWidth - 0.5;
      pointer.ty = e.clientY / window.innerHeight - 0.5;
      setParallax(pointer.tx, pointer.ty);
    }, { passive: true });

    document.documentElement.addEventListener('mouseleave', () => {
      pointer.tx = 0;
      pointer.ty = 0;
      setParallax(0, 0);
    });
  }

  /* ---------- 6. Cristal: reflejo, tilt 3D y magnetismo ---------- */
  const TILT_RESET = ['--rx', '--ry', '--ix', '--iy'];

  const bindGlass = (el) => {
    if (!finePointer || reduceMotion) return;

    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;

      el.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
      el.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);

      // Íconos de misión y visión reaccionan al cursor
      el.style.setProperty('--ix', (x - 0.5).toFixed(3));
      el.style.setProperty('--iy', (y - 0.5).toFixed(3));

      if (el.hasAttribute('data-tilt')) {
        el.style.setProperty('--rx', `${((0.5 - y) * 10).toFixed(2)}deg`);
        el.style.setProperty('--ry', `${((x - 0.5) * 10).toFixed(2)}deg`);
      }
    });

    el.addEventListener('pointerleave', () => {
      TILT_RESET.forEach((prop) => el.style.setProperty(prop, '0'));
    });
  };

  $$('[data-glass], [data-tilt]').forEach(bindGlass);

  if (finePointer && !reduceMotion) {
    $$('.magnetic').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left - r.width / 2) * 0.25;
        const y = (e.clientY - r.top - r.height / 2) * 0.25;
        el.style.translate = `${x.toFixed(1)}px ${y.toFixed(1)}px`;
      });
      el.addEventListener('pointerleave', () => { el.style.translate = '0 0'; });
    });
  }

  /* ---------- 7. Planes: conmutador mensual / anual ---------- */
  const billingToggle = $('#billingToggle');
  const billingLabel = $('#billingLabel');
  const prices = $$('.plan .price');

  billingToggle.addEventListener('click', () => {
    const yearly = billingToggle.getAttribute('aria-checked') !== 'true';
    billingToggle.setAttribute('aria-checked', String(yearly));
    billingToggle.setAttribute('aria-label', yearly ? 'Cambiar a facturación mensual' : 'Cambiar a facturación anual');
    billingLabel.textContent = yearly ? 'Anual' : 'Mensual';

    prices.forEach((el) => {
      el.style.opacity = '0';
      setTimeout(() => {
        el.textContent = yearly ? el.dataset.yearly : el.dataset.monthly;
        el.style.opacity = '1';
      }, reduceMotion ? 0 : 180);
    });
  });

  /* ---------- 8. Equipo: proyectos destacados por integrante ---------- */
  // Datos de ejemplo: reemplazar con los proyectos reales de cada integrante.
  const TEAM = {
    m1: {
      name: 'Nombre Apellido', role: 'Director Creativo',
      projects: [
        { tag: 'Branding', title: 'Identidad para retail', desc: 'Sistema visual completo con manual de marca y piezas para redes.', role: 'Dirección creativa', result: '+35% reconocimiento' },
        { tag: 'Campaña', title: 'Campaña de temporada', desc: 'Concepto creativo y producción audiovisual para lanzamiento.', role: 'Concepto y dirección', result: '2 M impresiones' }
      ]
    },
    m2: {
      name: 'Nombre Apellido', role: 'Estratega de Marketing',
      projects: [
        { tag: 'Performance', title: 'Embudo de captación', desc: 'Rediseño del funnel con segmentación y pauta optimizada.', role: 'Estrategia y analítica', result: '+120% leads' },
        { tag: 'Contenido', title: 'Calendario editorial B2B', desc: 'Plan de contenido trimestral para posicionamiento de marca.', role: 'Planeación', result: '+60% tráfico orgánico' }
      ]
    },
    m3: {
      name: 'Nombre Apellido', role: 'Lead Developer',
      projects: [
        { tag: 'Software', title: 'Portal inmobiliario', desc: 'Búsqueda con filtros avanzados y panel de administración.', role: 'Arquitectura y backend', result: 'Carga < 1.5 s' },
        { tag: 'Automatización', title: 'Integración con CRM', desc: 'Sincronización automática de leads entre la web y el CRM.', role: 'Desarrollo e integración', result: '−70% tiempo manual' }
      ]
    },
    m4: {
      name: 'Nombre Apellido', role: 'Product & UX Designer',
      projects: [
        { tag: 'UX/UI', title: 'App de reservas', desc: 'Flujo de reserva optimizado y sistema de componentes.', role: 'UX research y UI', result: '+25% conversión' },
        { tag: 'Diseño', title: 'Dashboard de métricas', desc: 'Visualización de datos clara para equipos no técnicos.', role: 'Diseño de producto', result: 'NPS +18' }
      ]
    }
  };

  const dialog = $('#teamDialog');
  const dlgName = $('#dlgName');
  const dlgRole = $('#dlgRole');
  const dlgProjects = $('#dlgProjects');
  let lastTrigger = null;

  const createEl = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const renderMember = (id) => {
    const member = TEAM[id];
    if (!member) return false;

    dlgRole.textContent = member.role;
    dlgName.textContent = member.name;
    dlgProjects.replaceChildren();

    member.projects.forEach((p) => {
      const card = createEl('article', 'liquid-glass project-card');
      card.dataset.glass = '';
      card.dataset.tilt = '';

      const meta = createEl('div', 'project-meta');
      meta.append(createEl('span', null, `Rol: ${p.role}`), createEl('span', null, p.result));

      card.append(
        createEl('span', 'project-tag', p.tag),
        createEl('h4', null, p.title),
        createEl('p', null, p.desc),
        meta
      );

      dlgProjects.append(card);
      bindGlass(card);
    });

    return true;
  };

  $$('[data-member]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!renderMember(btn.dataset.member)) return;
      lastTrigger = btn;
      dialog.showModal();
    });
  });

  dialog.addEventListener('close', () => {
    if (lastTrigger) lastTrigger.focus();
    lastTrigger = null;
  });

  $('.dialog-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });

  /* ---------- 9. Formulario con validación y envío ---------- */
  // Si se deja vacío, el formulario abre el correo del visitante (mailto).
  // Para envío directo, pega aquí la URL de tu servicio (Formspree, API propia, etc.).
  const FORM_ENDPOINT = '';
  const EMAIL_TO = 'contacto@efficia360.com';

  const form = $('#contactForm');
  const formStatus = $('#formStatus');
  const submitBtn = $('button[type="submit"]', form);
  const submitLabel = $('span', submitBtn);

  const rules = {
    name: { test: (v) => v.trim().length >= 3, msg: 'Escribe tu nombre (mínimo 3 caracteres).' },
    email: { test: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()), msg: 'Ingresa un correo válido.' },
    message: { test: (v) => v.trim().length >= 10, msg: 'Cuéntanos un poco más (mínimo 10 caracteres).' }
  };

  const fields = Object.keys(rules).map((name) => form.elements[name]);

  const validateField = (field, force = false) => {
    const rule = rules[field.name];
    const value = field.value.trim();
    const ok = rule.test(field.value);
    const show = !ok && (value !== '' || force);

    field.classList.toggle('is-valid', ok && value !== '');
    field.classList.toggle('is-invalid', show);
    field.setAttribute('aria-invalid', String(show));
    field.closest('.field').querySelector('.error').textContent =
      show ? (value === '' ? 'Este campo es obligatorio.' : rule.msg) : '';

    return ok;
  };

  fields.forEach((field) => {
    field.addEventListener('blur', () => { if (field.value !== '') validateField(field); });
    field.addEventListener('input', () => {
      if (field.classList.contains('is-invalid') || field.classList.contains('is-valid')) {
        validateField(field);
      }
    });
  });

  const setStatus = (text, type) => {
    formStatus.textContent = text;
    formStatus.className = `form-status ${type}`;
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const results = fields.map((field) => validateField(field, true));
    const firstInvalid = results.indexOf(false);

    if (firstInvalid !== -1) {
      setStatus('Revisa los campos marcados.', 'is-error');
      fields[firstInvalid].focus();
      return;
    }

    submitBtn.disabled = true;
    submitLabel.textContent = 'Enviando…';

    try {
      if (FORM_ENDPOINT) {
        const res = await fetch(FORM_ENDPOINT, {
          method: 'POST',
          headers: { Accept: 'application/json' },
          body: new FormData(form)
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setStatus('¡Gracias! Te contactaremos en menos de 24 horas hábiles.', 'is-success');
      } else {
        const data = new FormData(form);
        const subject = encodeURIComponent(`Nuevo contacto desde la web: ${data.get('name')}`);
        const body = encodeURIComponent(
          `Nombre: ${data.get('name')}\nEmail: ${data.get('email')}\n\n${data.get('message')}`
        );
        window.location.href = `mailto:${EMAIL_TO}?subject=${subject}&body=${body}`;
        setStatus('Abrimos tu correo para enviar el mensaje.', 'is-success');
      }

      form.reset();
      fields.forEach((field) => field.classList.remove('is-valid', 'is-invalid'));
    } catch (err) {
      setStatus(`No pudimos enviar el mensaje. Escríbenos a ${EMAIL_TO}.`, 'is-error');
    } finally {
      submitBtn.disabled = false;
      submitLabel.textContent = 'Enviar mensaje';
    }
  });

  /* ---------- 10. Widget flotante (globo) ---------- */
  const widget = $('#floatWidget');
  const floatToggle = $('#floatToggle');
  let pinned = false; // true cuando el visitante abre el globo con clic

  const setWidget = (open) => {
    widget.classList.toggle('is-open', open);
    floatToggle.setAttribute('aria-expanded', String(open));
    floatToggle.setAttribute('aria-label', open ? 'Cerrar enlaces de contacto' : 'Abrir enlaces de contacto');
  };

  floatToggle.addEventListener('click', () => {
    pinned = !pinned;
    setWidget(pinned);
  });

  if (finePointer) {
    widget.addEventListener('pointerenter', () => setWidget(true));
    widget.addEventListener('pointerleave', () => { if (!pinned) setWidget(false); });
  }

  widget.addEventListener('focusin', () => setWidget(true));
  widget.addEventListener('focusout', (e) => {
    if (!widget.contains(e.relatedTarget) && !pinned) setWidget(false);
  });

  document.addEventListener('click', (e) => {
    if (!widget.contains(e.target)) {
      pinned = false;
      setWidget(false);
    }
  });

  /* ---------- 11. Teclado: Escape cierra menús y widget ---------- */
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    setMenu(false);
    pinned = false;
    setWidget(false);
  });

  /* ---------- 12. Año dinámico ---------- */
  $('#year').textContent = new Date().getFullYear();
})();
