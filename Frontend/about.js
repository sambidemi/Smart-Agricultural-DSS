/**
 * about.js — AgroSense About Page
 * Handles preloader, navigation, particles, scroll animations,
 * animated counters, FAQ accordion, tilt effect, and back-to-top.
 */

document.addEventListener('DOMContentLoaded', () => {
    initPreloader();
    initNavigation();
    initParticles('aboutParticles');
    initScrollAnimations();
    initTiltEffect();
    initFAQ();
    initCounters();
    initBackToTop();
    initSmoothScroll();
});

/* ===========================
   Preloader
=========================== */
function initPreloader() {
    const preloader = document.querySelector('.preloader');
    if (preloader) {
        setTimeout(() => preloader.classList.add('hidden'), 500);
    }
}

/* ===========================
   Navigation
=========================== */
function initNavigation() {
    const hamburger = document.getElementById('hamburger');
    const navMenu   = document.getElementById('navMenu');
    const navLinks  = document.querySelectorAll('.nav-link');
    const navbar    = document.getElementById('navbar');

    if (hamburger && navMenu) {
        hamburger.addEventListener('click', () => {
            const expanded = hamburger.getAttribute('aria-expanded') === 'true';
            hamburger.setAttribute('aria-expanded', String(!expanded));
            hamburger.classList.toggle('active');
            navMenu.classList.toggle('active');
            document.body.classList.toggle('menu-open');
        });
    }

    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            hamburger?.classList.remove('active');
            hamburger?.setAttribute('aria-expanded', 'false');
            navMenu?.classList.remove('active');
            document.body.classList.remove('menu-open');
        });
    });

    window.addEventListener('scroll', () => {
        if (!navbar) return;
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    }, { passive: true });
}

/* ===========================
   Floating Particles (Hero)
=========================== */
function initParticles(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const count = 40;

    for (let i = 0; i < count; i++) {
        const p = document.createElement('div');
        const size = Math.random() * 4 + 2;
        const duration = Math.random() * 20 + 10;
        const delay = Math.random() * 5;

        p.style.cssText = `
            position: absolute;
            width: ${size}px;
            height: ${size}px;
            background: rgba(43, 156, 108, ${Math.random() * 0.3 + 0.08});
            border-radius: 50%;
            left: ${Math.random() * 100}%;
            top: ${Math.random() * 100}%;
            pointer-events: none;
            animation: floatParticle ${duration}s ease-in-out ${delay}s infinite;
            z-index: 1;
        `;
        container.appendChild(p);
    }

    if (!document.querySelector('#floatParticleKeyframes')) {
        const style = document.createElement('style');
        style.id = 'floatParticleKeyframes';
        style.textContent = `
            @keyframes floatParticle {
                0%, 100% { transform: translate(0, 0); }
                25%       { transform: translate(10px, -10px); }
                50%       { transform: translate(-5px, 15px); }
                75%       { transform: translate(-10px, -5px); }
            }
        `;
        document.head.appendChild(style);
    }
}

/* ===========================
   Scroll-Reveal Animations
=========================== */
function initScrollAnimations() {
    const elements = document.querySelectorAll(
        '.fade-in-left, .fade-in-right, .fade-in-up, ' +
        '.about-feature-card, .about-tech-card, .about-benefit-card, .about-stat-card'
    );

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translate(0, 0)';
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.12, rootMargin: '0px' });

    elements.forEach(el => {
        // Preserve animation classes; only reset non-animated elements
        if (!el.classList.contains('fade-in-left') &&
            !el.classList.contains('fade-in-right') &&
            !el.classList.contains('fade-in-up')) {
            el.style.opacity = '0';
            el.style.transform = 'translateY(40px)';
            el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        } else {
            // Pause CSS animations and play on intersect
            el.style.animationPlayState = 'paused';
            observer.observe(el);
            return;
        }
        observer.observe(el);
    });

    // Also resume paused CSS animations on intersect
    const cssAnimated = document.querySelectorAll('.fade-in-left, .fade-in-right, .fade-in-up');
    const cssObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.animationPlayState = 'running';
                cssObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.15 });

    cssAnimated.forEach(el => {
        el.style.animationPlayState = 'paused';
        cssObserver.observe(el);
    });
}

/* ===========================
   3D Tilt Effect on Cards
=========================== */
function initTiltEffect() {
    const cards = document.querySelectorAll('[data-tilt]');

    cards.forEach(card => {
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const cx = rect.width  / 2;
            const cy = rect.height / 2;
            const rotX =  (y - cy) / 12;
            const rotY = -(x - cx) / 12;
            card.style.transform = `perspective(1000px) rotateX(${rotX}deg) rotateY(${rotY}deg) scale3d(1.03,1.03,1.03)`;
        });

        card.addEventListener('mouseleave', () => {
            card.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) scale3d(1,1,1)';
        });
    });
}

/* ===========================
   FAQ Accordion
=========================== */
function initFAQ() {
    const questions = document.querySelectorAll('.faq-question');

    questions.forEach(btn => {
        btn.addEventListener('click', () => {
            const isOpen = btn.getAttribute('aria-expanded') === 'true';
            const answer = btn.nextElementSibling;

            // Close all other open items in the same group
            const group = btn.closest('.about-faq-group');
            if (group) {
                group.querySelectorAll('.faq-question[aria-expanded="true"]').forEach(other => {
                    if (other !== btn) {
                        other.setAttribute('aria-expanded', 'false');
                        other.nextElementSibling?.classList.remove('is-open');
                    }
                });
            }

            btn.setAttribute('aria-expanded', String(!isOpen));
            answer?.classList.toggle('is-open', !isOpen);
        });
    });
}

/* ===========================
   Animated Counters (Stats)
=========================== */
function initCounters() {
    const counters = document.querySelectorAll('.about-stat-number[data-target]');
    if (!counters.length) return;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;

            const el     = entry.target;
            const target = parseInt(el.dataset.target, 10);
            const duration = 1800;
            const startTime = performance.now();

            function tick(now) {
                const elapsed  = now - startTime;
                const progress = Math.min(elapsed / duration, 1);
                // Ease out cubic
                const eased    = 1 - Math.pow(1 - progress, 3);
                el.textContent = Math.round(eased * target).toLocaleString();
                if (progress < 1) requestAnimationFrame(tick);
            }

            requestAnimationFrame(tick);
            observer.unobserve(el);
        });
    }, { threshold: 0.3 });

    counters.forEach(el => observer.observe(el));
}

/* ===========================
   Back to Top
=========================== */
function initBackToTop() {
    const btn = document.getElementById('backToTop');
    if (!btn) return;

    window.addEventListener('scroll', () => {
        btn.classList.toggle('show', window.scrollY > 500);
    }, { passive: true });

    btn.addEventListener('click', (e) => {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

/* ===========================
   Smooth Scroll for Anchors
=========================== */
function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const id = this.getAttribute('href');
            if (id === '#') return;
            const target = document.querySelector(id);
            if (!target) return;
            const offset = document.querySelector('.navbar')?.offsetHeight || 80;
            window.scrollTo({ top: target.offsetTop - offset, behavior: 'smooth' });
        });
    });
}
