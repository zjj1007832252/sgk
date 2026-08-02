// 出牌动画与视觉特效引擎
(function () {
  'use strict';

  const SUIT_SYMBOL = { spade: '♠', heart: '♥', club: '♣', diamond: '♦' };
  const CARD_COLORS = {
    sha: '#c03030', shan: '#3a78d8', tao: '#3a8a4a', juedou: '#b06020',
    guohe: '#706050', shunshou: '#c0a020', nanman: '#6a3a8a', wanjian: '#4a5a8a',
    taoyuan: '#3a8a4a', wugu: '#8a7a3a', lebo: '#5a5a6a', shandian: '#2a2a3a',
    equip: '#b09020', judge: '#5a6a7a', heal: '#3a8a4a', dodge: '#3a78d8',
  };

  class FX {
    constructor() {
      this.layer = document.createElement('div');
      this.layer.id = 'fx-layer';
      this.layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:150;overflow:hidden;';
      document.body.appendChild(this.layer);
      this.active = [];
      this.reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    rectOf(el) {
      if (!el) return { x: window.innerWidth / 2, y: window.innerHeight / 2, w: 0, h: 0 };
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
    }

    // 通用：创建动画元素并在结束后自动移除
    spawn(html, cssText, cleanupDelay) {
      const el = document.createElement('div');
      el.innerHTML = html;
      el.style.cssText = cssText;
      this.layer.appendChild(el);
      const remove = () => el.remove();
      if (cleanupDelay) setTimeout(remove, cleanupDelay);
      else el.addEventListener('animationend', remove, { once: true });
      this.active.push(el);
      return el;
    }

    // 粒子爆发（使用 Canvas 渲染器）
    particles(x, y, opts = {}) {
      if (this.reduced) return;
      // 优先使用 Canvas 渲染器
      if (window.canvasParticles) {
        window.canvasParticles.emit(x, y, opts);
        return;
      }
      // 降级到 DOM 渲染
      const n = opts.count || 14;
      const color = opts.color || '#ffd700';
      const size = opts.size || 5;
      const speed = opts.speed || 120;
      const shape = opts.shape || 'circle';
      for (let i = 0; i < n; i++) {
        const angle = (Math.PI * 2 * i) / n + Math.random() * 0.4;
        const dist = speed * (0.5 + Math.random());
        const dx = Math.cos(angle) * dist;
        const dy = Math.sin(angle) * dist - 30;
        const p = document.createElement('div');
        const s = size * (0.6 + Math.random());
        const isStar = shape === 'star';
        p.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${s}px;height:${s}px;
          background:${isStar ? 'transparent' : color};${isStar ? '' : `border-radius:50%`};
          box-shadow:0 0 ${s * 2}px ${color};opacity:1;pointer-events:none;`;
        if (isStar) {
          p.style.color = color;
          p.style.fontSize = s * 2 + 'px';
          p.textContent = '✦';
        }
        this.layer.appendChild(p);
        const anim = p.animate([
          { transform: 'translate(0,0) scale(1)', opacity: 1 },
          { transform: `translate(${dx}px,${dy}px) scale(0.2)`, opacity: 0 }
        ], { duration: 400 + Math.random() * 300, easing: 'cubic-bezier(.2,.6,.4,1)' });
        anim.onfinish = () => p.remove();
      }
    }

    // 目标高亮特效（被指定为目标时）
    targetHighlight(seatEl, cardType = 'sha') {
      if (this.reduced || !seatEl) return;
      const colors = {
        sha: '#c03030', shan: '#3a78d8', tao: '#3a8a4a', juedou: '#b06020',
        guohe: '#706050', shunshou: '#c0a020', jiedao: '#8a6a3a',
        lebu: '#5a5a6a', wuxie: '#5a6a7a', nanman: '#6a3a8a', wanjian: '#4a5a8a',
      };
      const color = colors[cardType] || '#ffd700';
      // 闪烁边框
      seatEl.style.animation = 'none';
      seatEl.offsetHeight;
      seatEl.style.animation = `targetFlash 0.6s ease-out`;
      seatEl.style.setProperty('--flash-color', color);
      setTimeout(() => { seatEl.style.animation = ''; }, 700);
      // 目标圈
      const r = this.rectOf(seatEl);
      const ring = document.createElement('div');
      ring.style.cssText = `position:absolute;left:${r.x}px;top:${r.y}px;width:${r.w + 20}px;height:${r.h + 20}px;
        border:3px solid ${color};border-radius:50%;transform:translate(-50%,-50%);
        box-shadow:0 0 20px ${color};opacity:0;pointer-events:none;z-index:158;`;
      this.layer.appendChild(ring);
      const anim = ring.animate([
        { transform: 'translate(-50%,-50%) scale(0.5)', opacity: 1 },
        { transform: 'translate(-50%,-50%) scale(1.5)', opacity: 0 }
      ], { duration: 500, easing: 'ease-out' });
      anim.onfinish = () => ring.remove();
    }

    // 卡牌命中特效（不同卡牌不同效果）
    hitEffect(seatEl, cardType = 'sha') {
      if (this.reduced || !seatEl) return;
      const r = this.rectOf(seatEl);
      const effects = {
        sha: { color: '#ff4a4a', icon: '💥', count: 8, speed: 100, shake: true },
        shan: { color: '#5a9af0', icon: '✦', count: 6, speed: 60, shake: false },
        tao: { color: '#4ac060', icon: '✚', count: 10, speed: 50, shake: false },
        juedou: { color: '#ff8a30', icon: '⚔', count: 12, speed: 90, shake: true },
        guohe: { color: '#8a7a5a', icon: '✂', count: 6, speed: 50, shake: false },
        shunshou: { color: '#ffd700', icon: '✋', count: 8, speed: 60, shake: false },
        wuxie: { color: '#7aaadf', icon: '🛡', count: 10, speed: 70, shake: false },
        lebu: { color: '#6a6a8a', icon: '🔒', count: 5, speed: 40, shake: false },
        nanman: { color: '#8a4aaa', icon: '🐎', count: 8, speed: 80, shake: true },
        wanjian: { color: '#5a7aaa', icon: '➤', count: 15, speed: 80, shake: false },
        equip: { color: '#ffd700', icon: '✨', count: 12, speed: 70, shake: false },
      };
      const eff = effects[cardType] || effects.sha;
      // 粒子
      this.particles(r.x, r.y, { count: eff.count, color: eff.color, size: 5, speed: eff.speed });
      // 图标
      const icon = document.createElement('div');
      icon.textContent = eff.icon;
      icon.style.cssText = `position:absolute;left:${r.x}px;top:${r.y}px;transform:translate(-50%,-50%);
        font-size:32px;color:${eff.color};text-shadow:0 0 10px ${eff.color};opacity:1;pointer-events:none;z-index:160;`;
      this.layer.appendChild(icon);
      const anim = icon.animate([
        { transform: 'translate(-50%,-50%) scale(0.3)', opacity: 0 },
        { transform: 'translate(-50%,-50%) scale(1.5)', opacity: 1, offset: 0.3 },
        { transform: 'translate(-50%,-80%) scale(1)', opacity: 0 }
      ], { duration: 600, easing: 'ease-out' });
      anim.onfinish = () => icon.remove();
      // 屏震
      if (eff.shake) this.shake(4);
    }

    // 出牌者发光特效
    casterGlow(seatEl, cardType = 'sha') {
      if (this.reduced || !seatEl) return;
      const colors = { sha: '#ff4a4a', shan: '#5a9af0', tao: '#4ac060', juedou: '#ff8a30', nanman: '#8a4aaa', wanjian: '#5a7aaa' };
      const color = colors[cardType] || '#ffd700';
      seatEl.style.animation = 'none';
      seatEl.offsetHeight;
      seatEl.style.animation = `casterGlow 0.5s ease-out`;
      seatEl.style.setProperty('--glow-color', color);
      setTimeout(() => { seatEl.style.animation = ''; }, 600);
    }

    // 卡牌飞行
    cardFly(seatFrom, seatTo, card, opts = {}) {
      if (this.reduced) return;
      const from = this.rectOf(seatFrom);
      const to = this.rectOf(seatTo);
      const color = CARD_COLORS[opts.type] || '#c03030';
      const el = document.createElement('div');
      el.className = 'fx-flycard';
      el.innerHTML = `<span style="font-size:22px;font-weight:bold">${opts.symbol || SUIT_SYMBOL[card.suit] || '⚔'}</span>
        <span style="font-size:11px">${card.name}</span>`;
      el.style.cssText = `position:absolute;left:${from.x}px;top:${from.y}px;transform:translate(-50%,-50%);
        min-width:48px;padding:4px 8px;border-radius:6px;background:linear-gradient(160deg,#f5ecd8,#e3d5b8);
        border:2px solid ${color};box-shadow:0 0 18px ${color}aa,0 4px 10px #000a;
        display:flex;flex-direction:column;align-items:center;color:#2a2015;pointer-events:none;z-index:160;`;
      this.layer.appendChild(el);

      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const dur = Math.min(600, Math.max(250, dist * 0.6));
      const rotate = opts.rotate || (dx > 0 ? 540 : -540);

      // 拖尾粒子
      if (opts.trail !== false) {
        let steps = 6;
        const stepX = dx / steps, stepY = dy / steps;
        for (let i = 1; i <= steps; i++) {
          setTimeout(() => {
            this.particles(from.x + stepX * i, from.y + stepY * i, { count: 3, color, size: 3, speed: 20 });
          }, (dur / steps) * i);
        }
      }

      const anim = el.animate([
        { transform: 'translate(-50%,-50%) rotate(0deg) scale(1)', opacity: 1 },
        { transform: `translate(-50%,-50%) rotate(${rotate}deg) scale(0.7)`, opacity: 0.9, offset: 0.85 },
        { transform: `translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) rotate(${rotate}deg) scale(0.3)`, opacity: 0 }
      ], { duration: dur, easing: 'cubic-bezier(.3,.1,.5,1)' });
      anim.onfinish = () => { el.remove(); if (opts.impact !== false) this.particles(to.x, to.y, { count: 18, color, size: 6, speed: 90 }); };
    }

    // ==================== 南蛮入侵：万马奔腾 ====================
    nanmanSweep(fromEl) {
      if (this.reduced) return;
      const from = this.rectOf(fromEl);
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:155;overflow:hidden;';
      document.body.appendChild(overlay);

      const dust = document.createElement('div');
      dust.style.cssText = 'position:absolute;inset:0;background:radial-gradient(ellipse at center,#4a2a0aaa 0%,transparent 70%);opacity:0;';
      overlay.appendChild(dust);
      dust.animate([{ opacity: 0 }, { opacity: 0.8, offset: 0.3 }, { opacity: 0 }], { duration: 1200, easing: 'ease-out' });

      for (let i = 0; i < 12; i++) {
        const horse = document.createElement('div');
        const startX = from.x + (Math.random() - 0.5) * 200;
        const startY = from.y + 100 + Math.random() * 200;
        const size = 30 + Math.random() * 25;
        const delay = Math.random() * 300;
        horse.textContent = '🐎';
        horse.style.cssText = `position:absolute;left:${startX}px;top:${startY}px;font-size:${size}px;
          filter:drop-shadow(0 4px 8px #000a);transform:scaleX(-1);opacity:0;`;
        overlay.appendChild(horse);
        const endX = window.innerWidth + 100;
        const dur = 800 + Math.random() * 400;
        const anim = horse.animate([
          { left: startX + 'px', opacity: 0, transform: 'scaleX(-1) scale(0.5)' },
          { opacity: 1, offset: 0.1 },
          { left: endX + 'px', opacity: 0.8, transform: 'scaleX(-1) scale(1.2)' }
        ], { duration: dur, delay, easing: 'ease-in' });
        anim.onfinish = () => horse.remove();
        if (window.canvasParticles) {
          setTimeout(() => {
            const rect = horse.getBoundingClientRect();
            window.canvasParticles.emit(rect.left, rect.bottom, { count: 5, color: '#8a6a3a', size: 4, speed: 40, life: 0.5 });
          }, delay + 200);
        }
      }

      this.shake(8);
      const label = document.createElement('div');
      label.textContent = '南 蛮 入 侵';
      label.style.cssText = `position:absolute;left:50%;top:38%;transform:translate(-50%,-50%);
        font-size:52px;font-weight:bold;color:#8a4a2a;letter-spacing:12px;
        text-shadow:0 0 20px #ff6a0088,0 4px 8px #000;
        font-family:'STKaiti','KaiTi',serif;opacity:0;`;
      overlay.appendChild(label);
      label.animate([
        { opacity: 0, transform: 'translate(-50%,-50%) scale(2)' },
        { opacity: 1, transform: 'translate(-50%,-50%) scale(1)', offset: 0.3 },
        { opacity: 0, transform: 'translate(-50%,-50%) scale(0.8)' }
      ], { duration: 1000, easing: 'ease-out' });
      setTimeout(() => overlay.remove(), 1500);
    }

    // ==================== 万箭齐发：箭雨 ====================
    wanjianSweep(fromEl) {
      if (this.reduced) return;
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:155;overflow:hidden;';
      document.body.appendChild(overlay);

      for (let i = 0; i < 30; i++) {
        const arrow = document.createElement('div');
        const x = Math.random() * window.innerWidth;
        const delay = Math.random() * 400;
        const size = 20 + Math.random() * 16;
        arrow.textContent = '➤';
        arrow.style.cssText = `position:absolute;left:${x}px;top:-40px;color:#6a7aaa;font-size:${size}px;
          text-shadow:0 0 6px #8ac;transform:rotate(90deg);opacity:0;`;
        overlay.appendChild(arrow);
        const dur = 500 + Math.random() * 200;
        const anim = arrow.animate([
          { top: '-40px', opacity: 0 },
          { opacity: 1, offset: 0.1 },
          { top: window.innerHeight + 40 + 'px', opacity: 0.3 }
        ], { duration: dur, delay, easing: 'ease-in' });
        anim.onfinish = () => arrow.remove();
      }

      const label = document.createElement('div');
      label.textContent = '万 箭 齐 发';
      label.style.cssText = `position:absolute;left:50%;top:35%;transform:translate(-50%,-50%);
        font-size:52px;font-weight:bold;color:#4a6aaa;letter-spacing:12px;
        text-shadow:0 0 20px #6a8aff88,0 4px 8px #000;
        font-family:'STKaiti','KaiTi',serif;opacity:0;`;
      overlay.appendChild(label);
      label.animate([
        { opacity: 0, transform: 'translate(-50%,-50%) scale(2)' },
        { opacity: 1, transform: 'translate(-50%,-50%) scale(1)', offset: 0.3 },
        { opacity: 0, transform: 'translate(-50%,-50%) scale(0.8)' }
      ], { duration: 1000, easing: 'ease-out' });
      this.shake(4);
      setTimeout(() => overlay.remove(), 1400);
    }

    // ==================== 龙胆：银枪突刺 ====================
    longdanAnim(seatFrom, seatTo) {
      if (this.reduced) return;
      const from = this.rectOf(seatFrom), to = this.rectOf(seatTo);
      const dx = to.x - from.x, dy = to.y - from.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx) * 180 / Math.PI;

      const spear = document.createElement('div');
      spear.textContent = '⚔';
      spear.style.cssText = `position:absolute;left:${from.x}px;top:${from.y}px;font-size:40px;
        color:#c0d8ff;text-shadow:0 0 20px #88aaff,0 0 40px #4488ff;
        transform-origin:center;opacity:0;pointer-events:none;z-index:160;`;
      this.layer.appendChild(spear);

      const anim = spear.animate([
        { opacity: 0, transform: `translate(-50%,-50%) rotate(${angle}deg) scale(0.3)` },
        { opacity: 1, transform: `translate(-50%,-50%) rotate(${angle}deg) scale(1.5)`, offset: 0.15 },
        { opacity: 0, transform: `translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) rotate(${angle}deg) scale(0.5)` }
      ], { duration: 400, easing: 'cubic-bezier(.3,.1,.5,1)' });
      anim.onfinish = spear.remove;

      if (window.canvasParticles) {
        for (let i = 0; i < 5; i++) {
          setTimeout(() => {
            window.canvasParticles.emit(from.x + dx * (i / 5), from.y + dy * (i / 5), { count: 4, color: '#88aaff', size: 4, speed: 30, life: 0.3 });
          }, i * 60);
        }
      }
      setTimeout(() => this.particles(to.x, to.y, { count: 16, color: '#c0d8ff', size: 5, speed: 80 }), 300);
    }

    // ==================== 武圣：青龙斩 ====================
    wushengAnim(seatFrom, seatTo) {
      if (this.reduced) return;
      const from = this.rectOf(seatFrom), to = this.rectOf(seatTo);
      const dx = to.x - from.x, dy = to.y - from.y;
      const angle = Math.atan2(dy, dx) * 180 / Math.PI;

      const slash = document.createElement('div');
      slash.style.cssText = `position:absolute;left:${from.x}px;top:${from.y}px;
        width:200px;height:8px;background:linear-gradient(90deg,#ff4a4a,#ff8a4a,#ffd700);
        box-shadow:0 0 30px #ff4a4a,0 0 60px #ff6a00;
        transform-origin:left center;opacity:0;pointer-events:none;z-index:160;border-radius:4px;`;
      this.layer.appendChild(slash);

      const anim = slash.animate([
        { opacity: 0, width: '0px', transform: `rotate(${angle}deg)` },
        { opacity: 1, width: '200px', transform: `rotate(${angle}deg)`, offset: 0.2 },
        { opacity: 0, width: '250px', transform: `rotate(${angle}deg)` }
      ], { duration: 350, easing: 'ease-out' });
      anim.onfinish = slash.remove;
      setTimeout(() => this.particles(to.x, to.y, { count: 20, color: '#ff6a4a', size: 6, speed: 100 }), 200);
      this.shake(5);
    }

    // ==================== 装备穿戴动画 ====================
    equipAnim(seat, opts = {}) {
      if (this.reduced) return;
      const el = this._seatEl(seat);
      if (!el) return;
      const r = this.rectOf(el);

      const ring = document.createElement('div');
      ring.style.cssText = `position:absolute;left:${r.x}px;top:${r.y}px;transform:translate(-50%,-50%);
        width:60px;height:60px;border-radius:50%;border:3px solid #ffd700;
        box-shadow:0 0 20px #ffd700,0 0 40px #ffd70066;opacity:0;pointer-events:none;z-index:160;`;
      this.layer.appendChild(ring);
      const anim = ring.animate([
        { transform: 'translate(-50%,-50%) scale(0.3)', opacity: 0 },
        { transform: 'translate(-50%,-50%) scale(1.5)', opacity: 1, offset: 0.3 },
        { transform: 'translate(-50%,-50%) scale(2.5)', opacity: 0 }
      ], { duration: 600, easing: 'ease-out' });
      anim.onfinish = ring.remove;

      this.particles(r.x, r.y, { count: 16, color: '#ffd700', size: 5, speed: 70, shape: 'star' });

      if (opts.equipName) {
        const label = document.createElement('div');
        label.textContent = `【${opts.equipName}】`;
        label.style.cssText = `position:absolute;left:${r.x}px;top:${r.y - 40}px;transform:translate(-50%,-50%);
          font-size:18px;color:#ffd700;font-weight:bold;letter-spacing:2px;
          text-shadow:0 0 10px #ffd70088,0 2px 4px #000;
          font-family:'STKaiti','KaiTi',serif;opacity:0;pointer-events:none;z-index:160;`;
        this.layer.appendChild(label);
        label.animate([
          { opacity: 0, transform: 'translate(-50%,-50%) translateY(10px)' },
          { opacity: 1, transform: 'translate(-50%,-50%) translateY(0)', offset: 0.2 },
          { opacity: 0, transform: 'translate(-50%,-50%) translateY(-20px)' }
        ], { duration: 800, easing: 'ease-out' });
        setTimeout(() => label.remove(), 900);
      }
    }

    // ==================== 濒死特效 ====================
    dyingEffect(seat) {
      if (this.reduced) return;
      if (this._dyingSeats.has(seat)) return;
      this._dyingSeats.add(seat);

      const el = this._seatEl(seat);
      if (!el) { this._dyingSeats.delete(seat); return; }

      el.style.transition = 'box-shadow 0.15s, border-color 0.15s';
      let flashCount = 0;
      const flash = () => {
        if (flashCount >= 6) {
          el.style.boxShadow = '';
          el.style.borderColor = '';
          this._dyingSeats.delete(seat);
          return;
        }
        const on = flashCount % 2 === 0;
        el.style.boxShadow = on ? '0 0 30px #ff0000cc, 0 0 60px #ff000066, inset 0 0 20px #ff000044' : '';
        el.style.borderColor = on ? '#ff0000' : '';
        flashCount++;
        setTimeout(flash, 200);
      };
      flash();

      const r = this.rectOf(el);
      this.particles(r.x, r.y, { count: 12, color: '#ff2020', size: 5, speed: 60, life: 0.8 });

      const pulse = document.createElement('div');
      pulse.style.cssText = `position:absolute;left:${r.x}px;top:${r.y}px;transform:translate(-50%,-50%);
        width:80px;height:80px;border-radius:50%;border:2px solid #ff0000;
        opacity:0;pointer-events:none;z-index:159;`;
      this.layer.appendChild(pulse);
      const anim = pulse.animate([
        { transform: 'translate(-50%,-50%) scale(0.5)', opacity: 0.8, borderWidth: '3px' },
        { transform: 'translate(-50%,-50%) scale(2)', opacity: 0, borderWidth: '1px' }
      ], { duration: 600, iterations: 3 });
      anim.onfinish = pulse.remove();
    }

    clearDying(seat) {
      this._dyingSeats.delete(seat);
      const el = this._seatEl(seat);
      if (el) { el.style.boxShadow = ''; el.style.borderColor = ''; }
    }

    // 辅助：获取座位元素
    _seatEl(seat) {
      if (!window.gameState) return null;
      if (seat === window.gameState.mySeat) return document.getElementById('my-panel');
      return document.querySelector(`.opp[data-seat="${seat}"]`);
    }

    // 伤害数字
    damageNumber(el, amount, opts = {}) {
      if (this.reduced) return;
      const r = this.rectOf(el);
      const color = opts.color || '#e03030';
      const size = opts.size || 32;
      const txt = document.createElement('div');
      txt.textContent = (opts.prefix || '') + (opts.amount || amount);
      txt.style.cssText = `position:absolute;left:${r.x}px;top:${r.y}px;transform:translate(-50%,-50%);
        font-size:${size}px;font-weight:bold;color:${color};
        text-shadow:0 0 8px ${color},0 2px 4px #000;pointer-events:none;z-index:170;
        font-family:'STKaiti','KaiTi',serif;`;
      this.layer.appendChild(txt);
      const anim = txt.animate([
        { transform: 'translate(-50%,-50%) scale(0.5)', opacity: 0 },
        { transform: 'translate(-50%,-50%) scale(1.4)', opacity: 1, offset: 0.2 },
        { transform: `translate(-50%,calc(-50% - 60px)) scale(1)`, opacity: 0 }
      ], { duration: 900, easing: 'cubic-bezier(.3,.1,.5,1)' });
      anim.onfinish = txt.remove.bind(txt);
      // 受击屏震
      if (opts.shake !== false) this.shake(6);
    }

    // 回复数字
    healNumber(el, amount) {
      if (this.reduced) return;
      const r = this.rectOf(el);
      const txt = document.createElement('div');
      txt.textContent = '+' + amount;
      txt.style.cssText = `position:absolute;left:${r.x}px;top:${r.y}px;transform:translate(-50%,-50%);
        font-size:28px;font-weight:bold;color:#40c060;text-shadow:0 0 8px #40c060,0 2px 4px #000;pointer-events:none;z-index:170;`;
      this.layer.appendChild(txt);
      const anim = txt.animate([
        { transform: 'translate(-50%,-50%) scale(0.5)', opacity: 0 },
        { transform: 'translate(-50%,-50%) scale(1.3)', opacity: 1, offset: 0.15 },
        { transform: `translate(-50%,calc(-50% - 50px)) scale(0.9)`, opacity: 0 }
      ], { duration: 800, easing: 'ease-out' });
      anim.onfinish = txt.remove.bind(txt);
    }

    // 躲避
    dodge(el) {
      if (this.reduced) return;
      const r = this.rectOf(el);
      this.particles(r.x, r.y, { count: 12, color: '#3a78d8', size: 5, speed: 80 });
      const txt = document.createElement('div');
      txt.textContent = '闪';
      txt.style.cssText = `position:absolute;left:${r.x}px;top:${r.y}px;transform:translate(-50%,-50%);
        font-size:48px;font-weight:bold;color:#5a9af0;text-shadow:0 0 16px #3a78d8,0 2px 4px #000;
        pointer-events:none;z-index:170;font-family:'STKaiti','KaiTi',serif;`;
      this.layer.appendChild(txt);
      const anim = txt.animate([
        { transform: 'translate(-50%,-50%) scale(0.3) rotate(-20deg)', opacity: 0 },
        { transform: 'translate(-50%,-50%) scale(1.3) rotate(8deg)', opacity: 1, offset: 0.2 },
        { transform: 'translate(-50%,-50%) scale(1) rotate(0deg)', opacity: 0 }
      ], { duration: 600, easing: 'ease-out' });
      anim.onfinish = txt.remove.bind(txt);
      this.shake(3);
    }

    // 判定翻牌
    judgment(card) {
      if (this.reduced) return;
      const c = document.createElement('div');
      const color = (card.suit === 'heart' || card.suit === 'diamond') ? '#c03030' : '#222';
      c.className = 'fx-judge-card';
      c.innerHTML = `<div class="fx-judge-inner">
        <span style="font-size:30px;color:${color}">${SUIT_SYMBOL[card.suit]}</span>
        <span style="font-size:22px;font-weight:bold;color:${color}">${card.rankLabel}</span>
        <span style="font-size:16px;color:#5a4a33">${card.name}</span>
      </div>`;
      c.style.cssText = `position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);
        width:90px;height:120px;border-radius:8px;background:linear-gradient(160deg,#f5ecd8,#e3d5b8);
        border:3px solid #8a6a42;box-shadow:0 0 30px #ffd70088,0 8px 20px #000a;
        display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:180;`;
      document.body.appendChild(c);
      const anim = c.animate([
        { transform: 'translate(-50%,-50%) rotateY(180deg) scale(0.3)', opacity: 0 },
        { transform: 'translate(-50%,-50%) rotateY(0deg) scale(1.2)', opacity: 1, offset: 0.4 },
        { transform: 'translate(-50%,-50%) rotateY(0deg) scale(1)', opacity: 1, offset: 0.8 },
        { transform: 'translate(-50%,-50%) scale(0.8)', opacity: 0 }
      ], { duration: 900, easing: 'ease-out' });
      anim.onfinish = c.remove.bind(c);
    }

    // 死亡崩塌
    death(el) {
      if (this.reduced) return;
      const r = this.rectOf(el);
      this.shake(8);
      // 灰尘粒子
      this.particles(r.x, r.y - 20, { count: 20, color: '#8a7a5a', size: 6, speed: 60 });
      // 文字
      const txt = document.createElement('div');
      txt.textContent = '☠';
      txt.style.cssText = `position:absolute;left:${r.x}px;top:${r.y}px;transform:translate(-50%,-50%);
        font-size:60px;color:#6a2a2a;text-shadow:0 0 20px #a02020,0 4px 8px #000;pointer-events:none;z-index:170;`;
      this.layer.appendChild(txt);
      const anim = txt.animate([
        { transform: 'translate(-50%,-50%) scale(0.3) rotate(-30deg)', opacity: 0 },
        { transform: 'translate(-50%,-50%) scale(1.4) rotate(10deg)', opacity: 1, offset: 0.3 },
        { transform: `translate(-50%,calc(-50% + 30px)) scale(1) rotate(0deg)`, opacity: 0 }
      ], { duration: 1000, easing: 'ease-in' });
      anim.onfinish = txt.remove.bind(txt);
    }

    // 阶段横幅
    banner(text, opts = {}) {
      if (this.reduced) return;
      const color = opts.color || '#e6cf9a';
      const size = opts.size || 36;
      const existing = document.querySelector('.fx-banner');
      if (existing) existing.remove();
      const b = document.createElement('div');
      b.className = 'fx-banner';
      b.textContent = text;
      b.style.cssText = `position:fixed;left:50%;top:30%;transform:translate(-50%,-50%);
        font-size:${size}px;font-weight:bold;color:${color};letter-spacing:6px;
        text-shadow:0 0 20px ${color},0 2px 6px #000;pointer-events:none;z-index:180;
        font-family:'STKaiti','KaiTi',serif;white-space:nowrap;`;
      this.layer.appendChild(b);
      const anim = b.animate([
        { transform: 'translate(-50%,-50%) scale(0.5)', opacity: 0, filter: 'blur(10px)' },
        { transform: 'translate(-50%,-50%) scale(1.1)', opacity: 1, filter: 'blur(0px)', offset: 0.2 },
        { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: 0.7 },
        { transform: 'translate(-50%,-50%) scale(0.9)', opacity: 0 }
      ], { duration: opts.duration || 1400, easing: 'cubic-bezier(.3,.1,.5,1)' });
      anim.onfinish = b.remove.bind(b);
    }

    // 胜负结算
    endGameOverlay(isWin) {
      const overlay = document.createElement('div');
      overlay.style.cssText = `position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;
        pointer-events:auto;z-index:250;background:${isWin ? 'radial-gradient(circle,#ffd70044,transparent 70%)' : 'radial-gradient(circle,#2a1a3a,transparent 70%)'};`;
      const title = isWin ? '胜 利' : '失 败';
      const color = isWin ? '#ffd700' : '#8a7a9a';
      overlay.innerHTML = `<div class="fx-end-title" style="font-size:80px;font-weight:bold;color:${color};
        letter-spacing:24px;text-shadow:0 0 40px ${color},0 4px 10px #000;
        font-family:'STKaiti','KaiTi',serif;animation:fxEndIn .8s cubic-bezier(.3,.1,.5,1);">${title}</div>
        <div style="margin-top:16px;font-size:20px;color:#b8a88a;letter-spacing:4px;">— 对局结束 —</div>`;
      document.body.appendChild(overlay);
      // 粒子庆祝 / 散落
      if (isWin) {
        for (let i = 0; i < 5; i++) {
          setTimeout(() => {
            this.particles(Math.random() * window.innerWidth, Math.random() * window.innerHeight * 0.5,
              { count: 10, color: '#ffd700', size: 5, speed: 60, shape: 'star' });
          }, i * 200);
        }
      }
    }

    // 屏震
    shake(intensity) {
      if (this.reduced) return;
      const el = document.getElementById('table-felt') || document.body;
      const d = intensity || 5;
      const frames = [];
      for (let i = 0; i <= 8; i++) {
        const decay = 1 - i / 8;
        const x = (Math.random() - 0.5) * d * 2 * decay;
        const y = (Math.random() - 0.5) * d * 2 * decay;
        frames.push({ transform: `translate(${x}px,${y}px)`, opacity: 1 });
      }
      const anim = el.animate(frames, { duration: 300 + d * 20, easing: 'ease-out' });
      anim.onfinish = () => { el.style.transform = ''; };
    }

    // 回合提示
    turnIndicator(seat) {
      const el = seat === window._MY_SEAT ? document.getElementById('my-panel') :
        document.querySelector(`.opp[data-seat="${seat}"]`);
      if (!el) return;
      el.classList.add('fx-turn-glow');
      setTimeout(() => el.classList.remove('fx-turn-glow'), 1500);
    }
  }

  window.FX = FX;
})();
