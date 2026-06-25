/**
 * script.js - AgriSmart AI Landing Page
 * Advanced interactions, animations, and functionality
 */

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', () => {
    initPreloader();
    initNavigation();
    initAuthModal();
    initScrollEffects();
    initParticles();
    initTiltEffect();
    initGainCarousel();
    initScrollAnimations();
    initBackToTop();
    initSmoothScroll();
});

/**
 * Preloader
 * Hide preloader after page load
 */
function initPreloader() {
    const preloader = document.querySelector('.preloader');
    if (preloader) {
        setTimeout(() => {
            preloader.classList.add('hidden');
        }, 500);
    }
}

/**
 * Navigation
 * Mobile menu toggle and active link highlighting
 */
function initNavigation() {
    const hamburger = document.getElementById('hamburger');
    const navMenu = document.getElementById('navMenu');
    const navLinks = document.querySelectorAll('.nav-link');
    const navbar = document.getElementById('navbar');

    // Mobile menu toggle
    if (hamburger && navMenu) {
        hamburger.addEventListener('click', () => {
            hamburger.classList.toggle('active');
            navMenu.classList.toggle('active');
            document.body.classList.toggle('menu-open');
        });
    }

    // Close menu when clicking a link
    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            hamburger?.classList.remove('active');
            navMenu?.classList.remove('active');
            document.body.classList.remove('menu-open');
        });
    });

    // Active link highlighting on scroll
    window.addEventListener('scroll', () => {
        let current = '';
        const sections = document.querySelectorAll('section');
        const scrollPosition = window.scrollY + 100;

        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            const sectionHeight = section.clientHeight;
            
            if (scrollPosition >= sectionTop && scrollPosition < sectionTop + sectionHeight) {
                current = section.getAttribute('id');
            }
        });

        navLinks.forEach(link => {
            link.classList.remove('active');
            const href = link.getAttribute('href').substring(1);
            if (href === current) {
                link.classList.add('active');
            }
        });

        // Navbar background change on scroll
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });
}

/**
 * Auth Modal
 * Opens and closes the landing-page login modal
 */
function initAuthModal() {
    const modalMap = {
        login: document.getElementById('loginModal'),
        signup: document.getElementById('signupModal')
    };

    const openers = document.querySelectorAll('[data-auth-modal]');
    const closers = document.querySelectorAll('[data-auth-close]');
    const switchers = document.querySelectorAll('[data-auth-switch]');

    function openModal(name) {
        const modal = modalMap[name];
        if (!modal) return;

        Object.entries(modalMap).forEach(([key, item]) => {
            if (!item) return;
            const isTarget = key === name;
            item.classList.toggle('is-open', isTarget);
            item.setAttribute('aria-hidden', isTarget ? 'false' : 'true');
        });

        document.body.classList.add('modal-open');
        modal.querySelector('.auth-modal-dialog')?.querySelector('input, button, a')?.focus();

        if (name === 'signup' && window.AuthManager?.setSignupStep) {
            window.AuthManager.setSignupStep(1);
        }
    }

    function closeAllModals() {
        Object.values(modalMap).forEach((modal) => {
            if (!modal) return;
            modal.classList.remove('is-open');
            modal.setAttribute('aria-hidden', 'true');
        });
        document.body.classList.remove('modal-open');
    }

    openers.forEach((trigger) => {
        trigger.addEventListener('click', (e) => {
            e.preventDefault();
            openModal(trigger.dataset.authModal);
        });
    });

    switchers.forEach((trigger) => {
        trigger.addEventListener('click', (e) => {
            e.preventDefault();
            openModal(trigger.dataset.authSwitch);
        });
    });

    closers.forEach((closer) => {
        closer.addEventListener('click', closeAllModals);
    });

    const params = new URLSearchParams(window.location.search);
    const authView = params.get('auth');
    if (authView && modalMap[authView]) {
        openModal(authView);
        params.delete('auth');
        const nextQuery = params.toString();
        const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash}`;
        window.history.replaceState({}, '', nextUrl);
    }

    document.addEventListener('keydown', (e) => {
        const hasOpenModal = Object.values(modalMap).some((modal) => modal?.classList.contains('is-open'));
        if (e.key === 'Escape' && hasOpenModal) {
            closeAllModals();
        }
    });
}

/**
 * Scroll Effects
 * Parallax and reveal animations
 */
function initScrollEffects() {
    const elements = document.querySelectorAll('.feature-card, .step-item');
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, {
        threshold: 0.1,
        rootMargin: '0px'
    });

    elements.forEach(element => {
        element.style.opacity = '0';
        element.style.transform = 'translateY(50px)';
        element.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(element);
    });
}

/**
 * Particle Animation for Hero Section
 * Creates floating particles effect
 */
function initParticles() {
    const particlesContainer = document.getElementById('particles');
    if (!particlesContainer) return;

    const particleCount = 50;
    
    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        
        // Random size between 2px and 6px
        const size = Math.random() * 4 + 2;
        
        // Random position
        const posX = Math.random() * 100;
        const posY = Math.random() * 100;
        
        // Random animation duration
        const duration = Math.random() * 20 + 10;
        const delay = Math.random() * 5;
        
        particle.style.cssText = `
            position: absolute;
            width: ${size}px;
            height: ${size}px;
            background: rgba(43, 156, 108, ${Math.random() * 0.3 + 0.1});
            border-radius: 50%;
            left: ${posX}%;
            top: ${posY}%;
            pointer-events: none;
            animation: floatParticle ${duration}s ease-in-out ${delay}s infinite;
            z-index: 1;
        `;
        
        particlesContainer.appendChild(particle);
    }

    // Add keyframes for particle animation
    const styleSheet = document.createElement('style');
    styleSheet.textContent = `
        @keyframes floatParticle {
            0%, 100% {
                transform: translate(0, 0);
            }
            25% {
                transform: translate(10px, -10px);
            }
            50% {
                transform: translate(-5px, 15px);
            }
            75% {
                transform: translate(-10px, -5px);
            }
        }
    `;
    document.head.appendChild(styleSheet);
}

/**
 * Tilt Effect for Feature Cards
 * 3D tilt on mouse move
 */
function initTiltEffect() {
    const cards = document.querySelectorAll('[data-tilt]');
    
    cards.forEach(card => {
        card.addEventListener('mousemove', handleTilt);
        card.addEventListener('mouseleave', resetTilt);
    });
}

function handleTilt(e) {
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    
    const rotateX = (y - centerY) / 10;
    const rotateY = (centerX - x) / 10;
    
    card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.05, 1.05, 1.05)`;
}

function resetTilt(e) {
    const card = e.currentTarget;
    card.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) scale3d(1, 1, 1)';
}

/**
 * What You Gain Carousel
 * Responsive cards carousel with arrows, dots, keyboard, and touch support
 */
function initGainCarousel() {
    const track = document.getElementById('gainTrack');
    const prevBtn = document.getElementById('gainPrevBtn');
    const nextBtn = document.getElementById('gainNextBtn');
    const dotsContainer = document.getElementById('gainDots');

    if (!track || !prevBtn || !nextBtn || !dotsContainer) return;

    const cards = Array.from(track.children);
    const dots = Array.from(dotsContainer.querySelectorAll('.gain-dot'));
    let currentIndex = 0;
    let touchStartX = 0;
    let touchEndX = 0;

    function getCardsPerView() {
        if (window.innerWidth <= 768) return 1;
        if (window.innerWidth <= 992) return 2;
        return 3;
    }

    function getMaxIndex() {
        return Math.max(0, cards.length - getCardsPerView());
    }

    function updateDots(maxIndex) {
        dots.forEach((dot, index) => {
            const isVisible = index <= maxIndex;
            dot.style.display = isVisible ? '' : 'none';
            dot.classList.toggle('active', isVisible && index === currentIndex);
        });
    }

    function updateCarousel() {
        const maxIndex = getMaxIndex();
        currentIndex = Math.min(currentIndex, maxIndex);

        const activeCard = cards[currentIndex];
        const offset = activeCard ? activeCard.offsetLeft : 0;
        track.style.transform = `translateX(-${offset}px)`;

        prevBtn.disabled = currentIndex === 0;
        nextBtn.disabled = currentIndex === maxIndex;
        updateDots(maxIndex);
    }

    function goTo(index) {
        currentIndex = index;
        updateCarousel();
    }

    function next() {
        goTo(Math.min(currentIndex + 1, getMaxIndex()));
    }

    function prev() {
        goTo(Math.max(currentIndex - 1, 0));
    }

    prevBtn.addEventListener('click', prev);
    nextBtn.addEventListener('click', next);

    dots.forEach((dot, index) => {
        dot.addEventListener('click', () => goTo(index));
    });

    window.addEventListener('resize', updateCarousel);

    // Keyboard support for accessibility when section is in view.
    document.addEventListener('keydown', (e) => {
        const section = document.getElementById('what-you-gain');
        if (!section) return;

        const rect = section.getBoundingClientRect();
        const sectionVisible = rect.top < window.innerHeight && rect.bottom > 0;
        if (!sectionVisible) return;

        if (e.key === 'ArrowRight') next();
        if (e.key === 'ArrowLeft') prev();
    });

    // Touch gesture support for mobile swiping.
    track.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    track.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        const swipeDistance = touchStartX - touchEndX;

        if (Math.abs(swipeDistance) < 45) return;
        if (swipeDistance > 0) {
            next();
        } else {
            prev();
        }
    }, { passive: true });

    updateCarousel();
}

/**
 * Scroll Animations
 * Reveal elements on scroll
 */
function initScrollAnimations() {
    const animatedElements = document.querySelectorAll('.fade-in-left, .fade-in-right, .fade-in-up');
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.animationPlayState = 'running';
            }
        });
    }, {
        threshold: 0.2,
        rootMargin: '0px'
    });

    animatedElements.forEach(element => {
        element.style.animationPlayState = 'paused';
        observer.observe(element);
    });
}

/**
 * Back to Top Button
 * Show/hide and smooth scroll to top
 */
function initBackToTop() {
    const backToTop = document.getElementById('backToTop');
    
    if (!backToTop) return;
    
    window.addEventListener('scroll', () => {
        if (window.scrollY > 500) {
            backToTop.classList.add('show');
        } else {
            backToTop.classList.remove('show');
        }
    });
    
    backToTop.addEventListener('click', (e) => {
        e.preventDefault();
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });
}

/**
 * Smooth Scroll for Anchor Links
 * Smoothly scroll to sections
 */
function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            if (this.dataset.authModal) return;

            e.preventDefault();
            
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;
            
            const targetElement = document.querySelector(targetId);
            
            if (targetElement) {
                const navbarHeight = document.querySelector('.navbar').offsetHeight;
                const targetPosition = targetElement.offsetTop - navbarHeight;
                
                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });
}
