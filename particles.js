/**
 * IFMSA FAPI — Particle System & Confetti Engine
 * Canvas-based ambient particle effect + confetti burst on scan success
 */

(function () {
  'use strict';

  // ═══════════════════════════════════════
  // PARTICLE SYSTEM (Background Ambience)
  // ═══════════════════════════════════════

  const ParticleSystem = {
    canvas: null,
    ctx: null,
    particles: [],
    mouse: { x: -9999, y: -9999 },
    animationId: null,
    config: {
      count: 70,
      maxDistance: 140,
      speed: 0.3,
      colors: [
        'rgba(29, 55, 104, 0.6)',
        'rgba(59, 130, 246, 0.45)',
        'rgba(245, 158, 11, 0.3)',
        'rgba(6, 182, 212, 0.35)',
        'rgba(139, 92, 246, 0.25)'
      ],
      lineColor: 'rgba(59, 130, 246, 0.07)',
      mouseRadius: 180,
      sizeRange: [1.5, 4],
    },

    init(canvasId) {
      this.canvas = document.getElementById(canvasId);
      if (!this.canvas) return;
      this.ctx = this.canvas.getContext('2d');

      this.resize();
      this.createParticles();
      this.bindEvents();
      this.animate();
    },

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.width = window.innerWidth * dpr;
      this.canvas.height = window.innerHeight * dpr;
      this.canvas.style.width = window.innerWidth + 'px';
      this.canvas.style.height = window.innerHeight + 'px';
      this.ctx.scale(dpr, dpr);

      // Reduce particles on mobile
      if (window.innerWidth < 768) {
        this.config.count = 35;
        this.config.maxDistance = 100;
      } else {
        this.config.count = 70;
        this.config.maxDistance = 140;
      }
    },

    createParticles() {
      this.particles = [];
      const w = window.innerWidth;
      const h = window.innerHeight;
      for (let i = 0; i < this.config.count; i++) {
        this.particles.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * this.config.speed * 2,
          vy: (Math.random() - 0.5) * this.config.speed * 2,
          radius: this.config.sizeRange[0] + Math.random() * (this.config.sizeRange[1] - this.config.sizeRange[0]),
          color: this.config.colors[Math.floor(Math.random() * this.config.colors.length)],
          pulseOffset: Math.random() * Math.PI * 2,
          pulseSpeed: 0.01 + Math.random() * 0.02
        });
      }
    },

    bindEvents() {
      let resizeTimeout;
      window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
          this.resize();
          this.createParticles();
        }, 250);
      });

      window.addEventListener('mousemove', (e) => {
        this.mouse.x = e.clientX;
        this.mouse.y = e.clientY;
      });

      window.addEventListener('mouseleave', () => {
        this.mouse.x = -9999;
        this.mouse.y = -9999;
      });
    },

    animate() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.ctx.clearRect(0, 0, w, h);

      const now = performance.now() * 0.001;

      // Update & draw particles
      for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i];

        // Move
        p.x += p.vx;
        p.y += p.vy;

        // Bounce off edges
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
        p.x = Math.max(0, Math.min(w, p.x));
        p.y = Math.max(0, Math.min(h, p.y));

        // Mouse interaction — gentle push
        const dx = p.x - this.mouse.x;
        const dy = p.y - this.mouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < this.config.mouseRadius && dist > 0) {
          const force = (1 - dist / this.config.mouseRadius) * 0.015;
          p.vx += dx / dist * force;
          p.vy += dy / dist * force;
        }

        // Speed limit
        const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        if (speed > this.config.speed * 3) {
          p.vx *= 0.98;
          p.vy *= 0.98;
        }

        // Pulse
        const pulse = 1 + Math.sin(now * 2 + p.pulseOffset) * 0.3;
        const r = p.radius * pulse;

        // Draw
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        this.ctx.fillStyle = p.color;
        this.ctx.fill();

        // Glow
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, r * 3, 0, Math.PI * 2);
        const glow = this.ctx.createRadialGradient(p.x, p.y, r * 0.5, p.x, p.y, r * 3);
        glow.addColorStop(0, p.color.replace(/[\d.]+\)$/, '0.15)'));
        glow.addColorStop(1, 'transparent');
        this.ctx.fillStyle = glow;
        this.ctx.fill();
      }

      // Draw connections
      for (let i = 0; i < this.particles.length; i++) {
        for (let j = i + 1; j < this.particles.length; j++) {
          const a = this.particles[i];
          const b = this.particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < this.config.maxDistance) {
            const opacity = (1 - dist / this.config.maxDistance) * 0.12;
            this.ctx.beginPath();
            this.ctx.moveTo(a.x, a.y);
            this.ctx.lineTo(b.x, b.y);
            this.ctx.strokeStyle = `rgba(59, 130, 246, ${opacity})`;
            this.ctx.lineWidth = 0.8;
            this.ctx.stroke();
          }
        }
      }

      this.animationId = requestAnimationFrame(() => this.animate());
    },

    destroy() {
      if (this.animationId) cancelAnimationFrame(this.animationId);
    }
  };


  // ═══════════════════════════════════════
  // CONFETTI ENGINE (Check-in Celebration)
  // ═══════════════════════════════════════

  const ConfettiEngine = {
    canvas: null,
    ctx: null,
    particles: [],
    animationId: null,
    gravity: 0.25,
    friction: 0.99,
    colors: [
      '#1d3768', '#3b82f6', '#f59e0b', '#fbbf24',
      '#ffffff', '#06b6d4', '#10b981', '#8b5cf6'
    ],

    fire(options = {}) {
      const canvas = document.getElementById('confetti-canvas');
      if (!canvas) return;

      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
      this.canvas.style.display = 'block';

      const count = options.count || 180;
      const originX = options.x || window.innerWidth / 2;
      const originY = options.y || window.innerHeight * 0.4;

      this.particles = [];

      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const velocity = 4 + Math.random() * 8;
        const size = 4 + Math.random() * 6;
        const shape = Math.random() > 0.5 ? 'rect' : 'circle';

        this.particles.push({
          x: originX + (Math.random() - 0.5) * 30,
          y: originY + (Math.random() - 0.5) * 30,
          vx: Math.cos(angle) * velocity * (0.5 + Math.random()),
          vy: Math.sin(angle) * velocity * (0.5 + Math.random()) - 3,
          width: size,
          height: size * (0.4 + Math.random() * 0.6),
          color: this.colors[Math.floor(Math.random() * this.colors.length)],
          rotation: Math.random() * 360,
          rotationSpeed: (Math.random() - 0.5) * 12,
          opacity: 1,
          shape: shape,
          life: 1,
          decay: 0.008 + Math.random() * 0.006
        });
      }

      if (this.animationId) cancelAnimationFrame(this.animationId);
      this.animateConfetti();
    },

    animateConfetti() {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

      let alive = false;

      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];

        p.x += p.vx;
        p.y += p.vy;
        p.vy += this.gravity;
        p.vx *= this.friction;
        p.rotation += p.rotationSpeed;
        p.life -= p.decay;
        p.opacity = Math.max(0, p.life);

        if (p.life <= 0) {
          this.particles.splice(i, 1);
          continue;
        }

        alive = true;

        this.ctx.save();
        this.ctx.translate(p.x, p.y);
        this.ctx.rotate((p.rotation * Math.PI) / 180);
        this.ctx.globalAlpha = p.opacity;

        if (p.shape === 'rect') {
          this.ctx.fillStyle = p.color;
          this.ctx.fillRect(-p.width / 2, -p.height / 2, p.width, p.height);
        } else {
          this.ctx.beginPath();
          this.ctx.arc(0, 0, p.width / 2, 0, Math.PI * 2);
          this.ctx.fillStyle = p.color;
          this.ctx.fill();
        }

        this.ctx.restore();
      }

      if (alive) {
        this.animationId = requestAnimationFrame(() => this.animateConfetti());
      } else {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.canvas.style.display = 'none';
        this.animationId = null;
      }
    }
  };


  // ═══════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════

  window.IFMSAParticles = ParticleSystem;
  window.IFMSAConfetti = ConfettiEngine;

})();
