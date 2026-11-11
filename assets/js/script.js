    // ---------- Theme toggle (remembered across reloads) ----------
    const root = document.documentElement;
    const toggle = document.getElementById('themeToggle');
    const setTheme = (t) => {
      root.dataset.theme = t;
      toggle.textContent = t === 'light' ? '☀️' : '🌙';
      try { localStorage.setItem('theme', t); } catch {}
    };
    let saved = null;
    try { saved = localStorage.getItem('theme'); } catch {}
    setTheme(saved || 'dark');
    toggle.addEventListener('click', () => setTheme(root.dataset.theme === 'light' ? 'dark' : 'light'));

    // ---------- Button ripple ----------
    document.getElementById('ctaBtn')?.addEventListener('click', (e) => {
      const btn = e.currentTarget;
      const rect = btn.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const ripple = document.createElement('span');
      ripple.className = 'ripple';
      ripple.style.width = ripple.style.height = size + 'px';
      ripple.style.left = e.clientX - rect.left - size / 2 + 'px';
      ripple.style.top = e.clientY - rect.top - size / 2 + 'px';
      btn.appendChild(ripple);
      ripple.addEventListener('animationend', () => ripple.remove());
    });

    // ---------- 3D tilt on cards ----------
    document.querySelectorAll('.card').forEach((card) => {
      card.addEventListener('mousemove', (e) => {
        const r = card.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        card.style.transform = `perspective(600px) rotateY(${x * 14}deg) rotateX(${-y * 14}deg) scale(1.03)`;
      });
      card.addEventListener('mouseleave', () => (card.style.transform = ''));
    });

    // ---------- Count-up numbers ----------
    const countUp = (el) => {
      const target = +el.dataset.count;
      const start = performance.now();
      const step = (now) => {
        const p = Math.min((now - start) / 1500, 1);
        el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))).toLocaleString();
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };

    // ---------- Scroll reveal ----------
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry, i) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        setTimeout(() => el.classList.add('visible'), i * 100); // stagger
        el.querySelectorAll('[data-count]').forEach(countUp);
        observer.unobserve(el);
      });
    }, { threshold: 0.2 });
    document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));