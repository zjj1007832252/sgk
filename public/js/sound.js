// 背景音乐与音效管理器
(function () {
  'use strict';

  // ==================== 音效包定义 ====================
  const SOUND_PACKS = {
    classic: { name: '经典', desc: '传统三国杀风格' },
    modern: { name: '现代', desc: '电子风格' },
    soft: { name: '柔和', desc: '轻音乐' },
  };

  // ==================== 背景音乐生成器（Web Audio API） ====================
  class BGMGenerator {
    constructor() {
      this.ctx = null;
      this.currentTrack = null;
      this.gainNode = null;
      this.isPlaying = false;
      this.pack = 'classic';
    }

    ensureCtx() {
      if (!this.ctx) {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.gainNode = this.ctx.createGain();
        this.gainNode.connect(this.ctx.destination);
        this.gainNode.gain.value = 0.3;
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    }

    // 生成简单旋律循环
    play(scene) {
      this.ensureCtx();
      this.stop();
      this.isPlaying = true;

      const tracks = {
        battle: this.createBattleTrack.bind(this),
        select: this.createSelectTrack.bind(this),
        settle: this.createSettleTrack.bind(this),
        menu: this.createMenuTrack.bind(this),
      };

      if (tracks[scene]) {
        this.currentTrack = tracks[scene]();
      }
    }

    // 战斗音乐：紧张节奏
    createBattleTrack() {
      const ctx = this.ctx;
      const now = ctx.currentTime;
      const masterGain = ctx.createGain();
      masterGain.connect(this.gainNode);
      masterGain.gain.value = 0.15;

      // 低音鼓点
      const playBeat = (time, freq) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.3, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + 0.15);
        osc.connect(gain).connect(masterGain);
        osc.start(time);
        osc.stop(time + 0.15);
      };

      // 循环旋律
      const loop = (startTime, duration) => {
        const beatDur = 0.25;
        for (let i = 0; i < duration / beatDur; i++) {
          const t = startTime + i * beatDur;
          // 鼓点
          if (i % 2 === 0) playBeat(t, 80);
          if (i % 4 === 2) playBeat(t, 60);
          // 旋律
          if (i % 4 === 0) {
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.value = [261, 329, 392, 329][Math.floor(i / 4) % 4];
            g.gain.setValueAtTime(0.08, t);
            g.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
            osc.connect(g).connect(masterGain);
            osc.start(t);
            osc.stop(t + 0.2);
          }
        }
      };

      // 循环播放
      let offset = now;
      const loopDuration = 4;
      const scheduleLoops = () => {
        if (!this.isPlaying) return;
        loop(offset, loopDuration);
        offset += loopDuration;
        this._scheduler = setTimeout(scheduleLoops, loopDuration * 1000 - 100);
      };
      scheduleLoops();

      return { stop: () => { this.isPlaying = false; clearTimeout(this._scheduler); } };
    }

    // 选将音乐：轻快
    createSelectTrack() {
      const ctx = this.ctx;
      const masterGain = ctx.createGain();
      masterGain.connect(this.gainNode);
      masterGain.gain.value = 0.1;

      let offset = ctx.currentTime;
      const notes = [523, 587, 659, 698, 784, 698, 659, 587];
      const beatDur = 0.4;

      const loop = (start) => {
        notes.forEach((freq, i) => {
          const t = start + i * beatDur;
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = freq;
          g.gain.setValueAtTime(0.06, t);
          g.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
          osc.connect(g).connect(masterGain);
          osc.start(t);
          osc.stop(t + 0.3);
        });
      };

      const schedule = () => {
        if (!this.isPlaying) return;
        loop(offset);
        offset += notes.length * beatDur;
        this._scheduler = setTimeout(schedule, notes.length * beatDur * 1000 - 100);
      };
      schedule();
      return { stop: () => { this.isPlaying = false; clearTimeout(this._scheduler); } };
    }

    // 结算音乐：悠扬
    createSettleTrack() {
      const ctx = this.ctx;
      const masterGain = ctx.createGain();
      masterGain.connect(this.gainNode);
      masterGain.gain.value = 0.12;

      let offset = ctx.currentTime;
      const notes = [392, 440, 494, 523, 494, 440, 392, 349];

      const loop = (start) => {
        notes.forEach((freq, i) => {
          const t = start + i * 0.5;
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.value = freq;
          g.gain.setValueAtTime(0.07, t);
          g.gain.exponentialRampToValueAtTime(0.01, t + 0.4);
          osc.connect(g).connect(masterGain);
          osc.start(t);
          osc.stop(t + 0.4);
        });
      };

      const schedule = () => {
        if (!this.isPlaying) return;
        loop(offset);
        offset += notes.length * 0.5;
        this._scheduler = setTimeout(schedule, notes.length * 500 - 100);
      };
      schedule();
      return { stop: () => { this.isPlaying = false; clearTimeout(this._scheduler); } };
    }

    // 菜单音乐：平静
    createMenuTrack() {
      const ctx = this.ctx;
      const masterGain = ctx.createGain();
      masterGain.connect(this.gainNode);
      masterGain.gain.value = 0.08;

      let offset = ctx.currentTime;
      const notes = [261, 293, 329, 349, 329, 293];

      const loop = (start) => {
        notes.forEach((freq, i) => {
          const t = start + i * 0.6;
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = freq;
          g.gain.setValueAtTime(0.05, t);
          g.gain.exponentialRampToValueAtTime(0.01, t + 0.5);
          osc.connect(g).connect(masterGain);
          osc.start(t);
          osc.stop(t + 0.5);
        });
      };

      const schedule = () => {
        if (!this.isPlaying) return;
        loop(offset);
        offset += notes.length * 0.6;
        this._scheduler = setTimeout(schedule, notes.length * 600 - 100);
      };
      schedule();
      return { stop: () => { this.isPlaying = false; clearTimeout(this._scheduler); } };
    }

    stop() {
      this.isPlaying = false;
      if (this._scheduler) clearTimeout(this._scheduler);
      if (this.currentTrack && this.currentTrack.stop) this.currentTrack.stop();
      this.currentTrack = null;
    }

    setVolume(v) {
      if (this.gainNode) this.gainNode.gain.value = Math.max(0, Math.min(1, v));
    }
  }

  // ==================== 短句配音管理器 ====================
  class PhraseManager {
    constructor() {
      this.cache = new Map();
      this.enabled = true;
      this.volume = 0.7;
      this.pack = 'classic';
      this.basePath = '/assets/audio/phrases/';
    }

    play(id) {
      if (!this.enabled) return;
      const url = this.basePath + id + '.wav';

      // 优先使用缓存
      if (this.cache.has(url)) {
        const a = this.cache.get(url).cloneNode();
        a.volume = this.volume;
        a.play().catch(() => {});
        return;
      }

      const audio = new Audio(url);
      audio.volume = this.volume;
      audio.play().catch(() => {});
      // 缓存
      if (this.cache.size < 50) this.cache.set(url, audio);
    }

    setVolume(v) { this.volume = Math.max(0, Math.min(1, v)); }
    setEnabled(v) { this.enabled = !!v; }
  }

  // ==================== 主音效管理器 ====================
  class SoundManager {
    constructor() {
      this.phrases = new PhraseManager();
      this.bgm = new BGMGenerator();
      this.pack = localStorage.getItem('sgk_sound_pack') || 'classic';
      this.bgmEnabled = localStorage.getItem('sgk_bgm_enabled') !== 'false';
      this.sfxEnabled = localStorage.getItem('sgk_sfx_enabled') !== 'false';
      this.bgmVolume = parseFloat(localStorage.getItem('sgk_bgm_volume') || '0.3');
      this.sfxVolume = parseFloat(localStorage.getItem('sgk_sfx_volume') || '0.7');
      this.currentScene = null;

      this.phrases.enabled = this.sfxEnabled;
      this.phrases.volume = this.sfxVolume;
      this.bgm.setVolume(this.bgmVolume);
    }

    // 播放短句
    playPhrase(id) {
      this.phrases.play(id);
    }

    // 播放背景音乐
    playBGM(scene) {
      if (!this.bgmEnabled || this.currentScene === scene) return;
      this.currentScene = scene;
      this.bgm.play(scene);
    }

    stopBGM() {
      this.currentScene = null;
      this.bgm.stop();
    }

    // 场景切换
    setScene(scene) {
      if (scene === 'menu') this.playBGM('menu');
      else if (scene === 'select') this.playBGM('select');
      else if (scene === 'battle') this.playBGM('battle');
      else if (scene === 'settle') this.playBGM('settle');
      else this.stopBGM();
    }

    // 游戏事件触发对应音效
    onGameEvent(type) {
      switch (type) {
        case 'sha': this.playPhrase('sha'); break;
        case 'shan': this.playPhrase('shan'); break;
        case 'tao': this.playPhrase('tao'); break;
        case 'wuxie': this.playPhrase('wuxie'); break;
        case 'juedou': this.playPhrase('juedou'); break;
        case 'nanman': this.playPhrase('nanman'); break;
        case 'wanjian': this.playPhrase('wanjian'); break;
        case 'wugu': this.playPhrase('wugu'); break;
        case 'taoyuan': this.playPhrase('taoyuan'); break;
        case 'guohe': this.playPhrase('guohe'); break;
        case 'shunshou': this.playPhrase('shunshou'); break;
        case 'jiedao': this.playPhrase('jiedao'); break;
        case 'lebu': this.playPhrase('lebu'); break;
        case 'shandian': this.playPhrase('shandian'); break;
        case 'jiu': this.playPhrase('jiu'); break;
        case 'dying': this.playPhrase('dying'); break;
        case 'round_start': this.playPhrase('round_start'); break;
        case 'victory': this.playPhrase('shengli'); break;
        case 'defeat': this.playPhrase('shibai'); break;
      }
    }

    // 设置
    setPack(pack) {
      this.pack = pack;
      localStorage.setItem('sgk_sound_pack', pack);
      this.phrases.pack = pack;
    }

    setBgmEnabled(v) {
      this.bgmEnabled = v;
      localStorage.setItem('sgk_bgm_enabled', v);
      if (!v) this.stopBGM();
      else if (this.currentScene) this.playBGM(this.currentScene);
    }

    setSfxEnabled(v) {
      this.sfxEnabled = v;
      localStorage.setItem('sgk_sfx_enabled', v);
      this.phrases.enabled = v;
    }

    setBgmVolume(v) {
      this.bgmVolume = v;
      localStorage.setItem('sgk_bgm_volume', v);
      this.bgm.setVolume(v);
    }

    setSfxVolume(v) {
      this.sfxVolume = v;
      localStorage.setItem('sgk_sfx_volume', v);
      this.phrases.volume = v;
    }
  }

  window.SoundManager = SoundManager;
  window.SOUND_PACKS = SOUND_PACKS;
})();
