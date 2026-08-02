// 快捷键系统
(function () {
  'use strict';

  const VISIBLE_CARDS = 12;

  class Shortcuts {
    constructor() {
      this.enabled = true;
      this.ctx = null; // 'play' | 'respond' | 'target' | 'global'
      this.onAction = null; // callback(action, payload)
      this.onHelp = null;
      this.onMute = null;
      this.onVolume = null;
      this.selection = { hand: [], mode: null, targets: [] };
      this.cb = this.handle.bind(this);
      document.addEventListener('keydown', this.cb);
    }

    setContext(ctx) { this.ctx = ctx; }
    setSelection(s) { this.selection = s; }
    setHandlers(h) { Object.assign(this, h); }

    isActive() {
      return this.enabled && document.getElementById('view-game') &&
        document.getElementById('view-game').classList.contains('active') &&
        !this._modalOpen() && !this._typing();
    }

    _modalOpen() {
      const m = document.getElementById('modal-mask');
      return m && !m.classList.contains('hidden');
    }

    _typing() {
      const a = document.activeElement;
      return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT');
    }

    // 获取当前可选目标列表
    _targetCandidates() {
      const cands = [];
      if (!window.gameState) return cands;
      const me = window.gameState.mySeat;
      window.gameState.players.forEach(p => {
        if (!p.alive) return;
        if (this.selection.mode === 'sha' || this.selection.skill === 'jijiang') {
          if (p.seat !== me && p.distance <= (window._ATTACK_RANGE || 1)) cands.push(p.seat);
        } else if (p.seat !== me) {
          cands.push(p.seat);
        }
      });
      return cands;
    }

    handle(e) {
      const k = e.key;
      // 帮助键全局有效
      if (this._isHelpKey(k)) { e.preventDefault(); this.onHelp && this.onHelp(); return; }
      // 静音全局有效（非输入框）
      if (this._isMuteKey(k) && !this._typing()) { e.preventDefault(); this.onMute && this.onMute(); return; }
      // 音量（非输入框）
      if (this._isVolumeKey(k) && !this._typing()) { e.preventDefault(); this.onVolume && this.onVolume(k === 'ArrowUp' ? +1 : -1); return; }
      if (!this.isActive()) return;

      // 数字键选牌
      if (this._isNumberKey(k)) { this._handleNumber(k); e.preventDefault(); return; }

      // 确认
      if (this._isConfirmKey(k)) { e.preventDefault(); this.onAction && this.onAction('confirm'); return; }

      // 取消/跳过（若帮助面板打开则关闭它）
      if (this._isCancelKey(k)) {
        if (window._sgkHelpVisible) {
          e.preventDefault();
          window._sgkHelpVisible = false;
          const h = document.getElementById('shortcuts-help');
          if (h) h.classList.add('hidden');
          return;
        }
        e.preventDefault(); this.onAction && this.onAction('cancel'); return;
      }

      // 结束出牌
      if (this._isEndKey(k)) { e.preventDefault(); this.onAction && this.onAction('endTurn'); return; }

      // 切换出牌方式
      if (this._isCycleModeKey(k)) { e.preventDefault(); this.onAction && this.onAction('cycleMode', k === 'q' ? -1 : 1); return; }

      // 切换目标
      if (this._isCycleTargetKey(k)) { e.preventDefault(); this.onAction && this.onAction('cycleTarget', e.shiftKey || k === 'ArrowLeft' ? -1 : 1); return; }

      // 技能快捷键 F1-F8
      if (this._isFunctionKey(k)) {
        const idx = parseInt(k.replace('F', ''), 10) - 1;
        e.preventDefault();
        this.onAction && this.onAction('skill', idx);
        return;
      }
    }

    // 键识别
    _isHelpKey(k) { return k === 'h' || k === 'H' || k === '/' || k === '?'; }
    _isMuteKey(k) { return k === 'm' || k === 'M'; }
    _isVolumeKey(k) { return k === 'ArrowUp' || k === 'ArrowDown'; }
    _isNumberKey(k) { return /^[0-9]$/.test(k); }
    _isConfirmKey(k) { return k === 'Enter' || k === ' '; }
    _isCancelKey(k) { return k === 'Escape' || k === 'Backspace'; }
    _isEndKey(k) { return k === 'End' || k === '\\' || k === 'x' || k === 'X'; }
    _isCycleModeKey(k) { return k === 'q' || k === 'Q' || k === 'e' || k === 'E'; }
    _isCycleTargetKey(k) { return k === 'Tab' || k === 'ArrowLeft' || k === 'ArrowRight'; }
    _isFunctionKey(k) { return /^F([1-9]|1[0-8])$/.test(k); }

    _handleNumber(k) {
      const idx = k === '0' ? 9 : parseInt(k, 10) - 1;
      this.onAction && this.onAction('selectCard', idx);
    }
  }

  window.Shortcuts = Shortcuts;
})();
