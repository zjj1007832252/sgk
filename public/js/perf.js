// 性能优化：Canvas 渲染器 / 对象池 / 防抖渲染 / 资源预加载
(function () {
  'use strict';

  // ==================== 对象池 ====================
  class ObjectPool {
    constructor(factory, reset, maxSize = 100) {
      this.factory = factory;
      this.reset = reset;
      this.maxSize = maxSize;
      this.pool = [];
      this.active = new Set();
    }

    acquire() {
      let obj = this.pool.pop();
      if (!obj) obj = this.factory();
      this.active.add(obj);
      return obj;
    }

    release(obj) {
      if (this.active.delete(obj)) {
        if (this.pool.length < this.maxSize) {
          this.reset(obj);
          this.pool.push(obj);
        }
      }
    }

    releaseAll() {
      for (const obj of this.active) {
        if (this.pool.length < this.maxSize) {
          this.reset(obj);
          this.pool.push(obj);
        }
      }
      this.active.clear();
    }

    get activeCount() { return this.active.size; }
    get poolCount() { return this.pool.length; }
  }

  // ==================== Canvas 粒子渲染器 ====================
  class CanvasParticleRenderer {
    constructor() {
      this.canvas = null;
      this.ctx = null;
      this.particles = [];
      this.running = false;
      this.lastTime = 0;
      this.pool = new ObjectPool(
        () => ({ x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0, color: '#fff', size: 3, alpha: 1, shape: 'circle' }),
        (p) => { p.x = p.y = p.vx = p.vy = p.life = p.maxLife = 0; p.color = '#fff'; p.size = 3; p.alpha = 1; p.shape = 'circle'; },
        200
      );
    }

    ensureCanvas() {
      if (this.canvas) return;
      this.canvas = document.createElement('canvas');
      this.canvas.id = 'fx-canvas';
      this.canvas.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:140;';
      document.body.appendChild(this.canvas);
      this.ctx = this.canvas.getContext('2d');
      this.resize();
      window.addEventListener('resize', () => this.resize());
    }

    resize() {
      if (!this.canvas) return;
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
    }

    emit(x, y, opts = {}) {
      this.ensureCanvas();
      const n = opts.count || 10;
      const color = opts.color || '#ffd700';
      const size = opts.size || 4;
      const speed = opts.speed || 100;
      const life = opts.life || 0.6;
      const shape = opts.shape || 'circle';

      for (let i = 0; i < n; i++) {
        const p = this.pool.acquire();
        const angle = (Math.PI * 2 * i) / n + Math.random() * 0.3;
        const spd = speed * (0.5 + Math.random());
        p.x = x; p.y = y;
        p.vx = Math.cos(angle) * spd;
        p.vy = Math.sin(angle) * spd;
        p.maxLife = p.life = life * (0.7 + Math.random() * 0.3);
        p.color = color;
        p.size = size * (0.6 + Math.random() * 0.4);
        p.alpha = 1;
        p.shape = shape;
        this.particles.push(p);
      }

      if (!this.running) this.start();
    }

    start() {
      if (this.running) return;
      this.running = true;
      this.lastTime = performance.now();
      requestAnimationFrame((t) => this.loop(t));
    }

    loop(now) {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - this.lastTime) / 1000);
      this.lastTime = now;

      const ctx = this.ctx;
      if (ctx) {
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        for (let i = this.particles.length - 1; i >= 0; i--) {
          const p = this.particles[i];
          p.life -= dt;
          if (p.life <= 0) {
            this.pool.release(p);
            this.particles.splice(i, 1);
            continue;
          }

          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vy += 200 * dt; // 重力
          p.alpha = p.life / p.maxLife;

          ctx.globalAlpha = p.alpha;
          ctx.fillStyle = p.color;
          ctx.shadowColor = p.color;
          ctx.shadowBlur = p.size * 2;

          if (p.shape === 'star') {
            this.drawStar(ctx, p.x, p.y, p.size);
          } else {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
      }

      if (this.particles.length > 0) {
        requestAnimationFrame((t) => this.loop(t));
      } else {
        this.running = false;
        if (this.ctx) this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      }
    }

    drawStar(ctx, x, y, r) {
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2;
        const outerX = x + Math.cos(angle) * r;
        const outerY = y + Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(outerX, outerY); else ctx.lineTo(outerX, outerY);
        const innerAngle = angle + Math.PI / 5;
        ctx.lineTo(x + Math.cos(innerAngle) * r * 0.4, y + Math.sin(innerAngle) * r * 0.4);
      }
      ctx.closePath();
      ctx.fill();
    }

    clear() {
      this.pool.releaseAll();
      this.particles = [];
      this.running = false;
      if (this.ctx) this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  // ==================== 防抖渲染器 ====================
  class DebouncedRenderer {
    constructor(delay = 16) {
      this.delay = delay;
      this.timers = new Map();
      this.pending = new Map();
    }

    schedule(key, fn) {
      this.pending.set(key, fn);
      if (!this.timers.has(key)) {
        const timer = setTimeout(() => {
          this.timers.delete(key);
          const f = this.pending.get(key);
          this.pending.delete(key);
          if (f) f();
        }, this.delay);
        this.timers.set(key, timer);
      }
    }

    flush(key) {
      const timer = this.timers.get(key);
      if (timer) { clearTimeout(timer); this.timers.delete(key); }
      const f = this.pending.get(key);
      this.pending.delete(key);
      if (f) f();
    }

    flushAll() {
      for (const [key, timer] of this.timers) { clearTimeout(timer); }
      this.timers.clear();
      for (const [key, f] of this.pending) { f(); }
      this.pending.clear();
    }
  }

  // ==================== 资源预加载器 ====================
  class ResourcePreloader {
    constructor() {
      this.cache = new Map();
      this.loading = new Map();
    }

    preloadImage(url) {
      if (this.cache.has(url)) return Promise.resolve(this.cache.get(url));
      if (this.loading.has(url)) return this.loading.get(url);

      const promise = new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => { this.cache.set(url, img); this.loading.delete(url); resolve(img); };
        img.onerror = () => { this.loading.delete(url); resolve(null); };
        img.src = url;
      });
      this.loading.set(url, promise);
      return promise;
    }

    preloadImages(urls) { return Promise.all(urls.map(u => this.preloadImage(u))); }

    // 预加载武将头像
    preloadGenerals(generals) {
      const urls = generals.flatMap(g => [
        `/assets/avatars/${g.id}.png`,
        `/assets/avatars/${g.id}.svg`,
      ]);
      // 分批加载，避免同时发起过多请求
      const batchSize = 6;
      const loadBatch = async (batch) => {
        await Promise.all(batch.map(u => this.preloadImage(u)));
      };
      const batches = [];
      for (let i = 0; i < urls.length; i += batchSize) batches.push(urls.slice(i, i + batchSize));
      return batches.reduce((p, b) => p.then(() => loadBatch(b)), Promise.resolve());
    }

    get(url) { return this.cache.get(url); }
    has(url) { return this.cache.has(url); }
  }

  // ==================== 渲染调度器 ====================
  class RenderScheduler {
    constructor() {
      this.scheduled = false;
      this.callbacks = [];
    }

    schedule(fn) {
      this.callbacks.push(fn);
      if (!this.scheduled) {
        this.scheduled = true;
        requestAnimationFrame(() => this.flush());
      }
    }

    flush() {
      this.scheduled = false;
      const cbs = this.callbacks;
      this.callbacks = [];
      for (const fn of cbs) fn();
    }
  }

  // ==================== 导出 ====================
  window.PerfUtils = {
    ObjectPool,
    CanvasParticleRenderer,
    DebouncedRenderer,
    ResourcePreloader,
    RenderScheduler,
  };
})();
