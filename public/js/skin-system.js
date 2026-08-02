// 武将皮肤与立绘系统
(function () {
  'use strict';

  // ==================== 皮肤定义 ====================
  const SKINS = {
    // 默认皮肤
    default: { id: 'default', name: '默认', desc: '标准立绘', free: true },

    // 经典皮肤（可通过成就解锁）
    classic: { id: 'classic', name: '经典', desc: '复古水墨风格', free: true, unlock: 'play_10_games' },
    premium: { id: 'premium', name: '豪华', desc: '华丽特效立绘', free: false, unlock: 'rank_gold' },
    legend: { id: 'legend', name: '传说', desc: '动态特效立绘', free: false, unlock: 'win_100' },

    // 特殊皮肤
    festival: { id: 'festival', name: '节日', desc: '春节限定', free: false, unlock: 'event_spring' },
    anniversary: { id: 'anniversary', name: '周年', desc: '周年纪念限定', free: false, unlock: 'event_anniversary' },
  };

  // ==================== 头像框定义 ====================
  const AVATAR_FRAMES = {
    none: { id: 'none', name: '无', desc: '不显示头像框', free: true },
    bronze: { id: 'bronze', name: '青铜', desc: '青铜边框', free: true, unlock: 'play_5_games' },
    silver: { id: 'silver', name: '白银', desc: '白银边框', free: true, unlock: 'rank_silver' },
    gold: { id: 'gold', name: '黄金', desc: '黄金边框', free: true, unlock: 'rank_gold' },
    diamond: { id: 'diamond', name: '钻石', desc: '钻石边框', free: false, unlock: 'rank_diamond' },
    dragon: { id: 'dragon', name: '龙纹', desc: '动态龙纹边框', free: false, unlock: 'achievement_master' },
    phoenix: { id: 'phoenix', name: '凤羽', desc: '动态凤羽边框', free: false, unlock: 'achievement_legend' },
  };

  // ==================== 皮肤管理器 ====================
  class SkinManager {
    constructor() {
      this.currentSkin = localStorage.getItem('sgk_skin') || 'default';
      this.currentFrame = localStorage.getItem('sgk_frame') || 'none';
      this.unlockedSkins = new Set(JSON.parse(localStorage.getItem('sgk_unlocked_skins') || '["default","classic"]'));
      this.unlockedFrames = new Set(JSON.parse(localStorage.getItem('sgk_unlocked_frames') || '["none","bronze"]'));
      this.skinEffects = localStorage.getItem('sgk_skin_effects') !== 'false';
    }

    // 获取当前皮肤
    getSkin() { return this.currentSkin; }

    // 获取当前头像框
    getFrame() { return this.currentFrame; }

    // 设置皮肤
    setSkin(skinId) {
      if (!this.unlockedSkins.has(skinId)) return false;
      this.currentSkin = skinId;
      localStorage.setItem('sgk_skin', skinId);
      return true;
    }

    // 设置头像框
    setFrame(frameId) {
      if (!this.unlockedFrames.has(frameId)) return false;
      this.currentFrame = frameId;
      localStorage.setItem('sgk_frame', frameId);
      return true;
    }

    // 解锁皮肤
    unlockSkin(skinId) {
      this.unlockedSkins.add(skinId);
      localStorage.setItem('sgk_unlocked_skills', JSON.stringify([...this.unlockedSkins]));
    }

    // 解锁头像框
    unlockFrame(frameId) {
      this.unlockedFrames.add(frameId);
      localStorage.setItem('sgk_unlocked_frames', JSON.stringify([...this.unlockedFrames]));
    }

    // 检查是否已解锁
    isSkinUnlocked(skinId) { return this.unlockedSkins.has(skinId); }
    isFrameUnlocked(frameId) { return this.unlockedFrames.has(frameId); }

    // 获取皮肤CSS类
    getSkinClass() {
      return `skin-${this.currentSkin}`;
    }

    // 获取头像框CSS类
    getFrameClass() {
      return this.currentFrame !== 'none' ? `frame-${this.currentFrame}` : '';
    }

    // 获取皮肤特效
    getSkinEffect() {
      if (!this.skinEffects) return null;
      switch (this.currentSkin) {
        case 'premium': return { particle: '#ffd700', aura: 'gold' };
        case 'legend': return { particle: '#ff44ff', aura: 'rainbow' };
        case 'festival': return { particle: '#ff4444', aura: 'fire' };
        case 'anniversary': return { particle: '#44ff44', aura: 'star' };
        default: return null;
      }
    }

    // 切换特效开关
    setSkinEffects(v) {
      this.skinEffects = v;
      localStorage.setItem('sgk_skin_effects', v);
    }
  }

  window.SKIN_SYSTEM = { SKINS, AVATAR_FRAMES, SkinManager };
})();
