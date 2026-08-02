// 音效与配音管理器
// - Web Audio API 生成实时音效（无需音频文件）
// - 配音优先播放预生成音频文件；不存在则用 Web Speech API 合成
(function () {
  'use strict';

  const SUITES = {
    click: { f: 880, t: 0.05, type: 'sine', vol: 0.15 },
    sha: { type: 'noise', dur: 0.22, freqStart: 1800, freqEnd: 400, vol: 0.35 },
    shan: { type: 'noise', dur: 0.18, freqStart: 1200, freqEnd: 2400, vol: 0.3 },
    tao: { type: 'bell', f: [523, 659], dur: 0.7, vol: 0.35 },
    damage: { type: 'thud', dur: 0.25, vol: 0.45 },
    heal: { type: 'sparkle', dur: 0.5, vol: 0.3 },
    death: { type: 'gong', f: 95, dur: 1.2, vol: 0.45 },
    judge: { type: 'flip', dur: 0.12, vol: 0.25 },
    draw: { type: 'shuffle', dur: 0.28, vol: 0.22 },
    equip: { type: 'clang', dur: 0.35, vol: 0.35 },
    win: { type: 'fanfare', dur: 0.8, vol: 0.4 },
    lose: { type: 'sad', dur: 0.9, vol: 0.35 },
    phase: { type: 'chime', f: 660, dur: 0.35, vol: 0.2 },
    prompt: { type: 'bell', f: [440, 554], dur: 0.4, vol: 0.2 },
  };

  class AudioManager {
    constructor() {
      this.ctx = null;
      this.enabled = localStorage.getItem('sgk_audio_enabled') !== 'false';
      this.volume = parseFloat(localStorage.getItem('sgk_audio_volume') || '0.7');
      this.synthReady = false;
      this.voices = [];
      this.currentVoice = null;
      this.initSpeech();
    }

    init() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) this.ctx = new AC();
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    }

    initSpeech() {
      if (!window.speechSynthesis) return;
      const loadVoices = () => {
        this.voices = window.speechSynthesis.getVoices().filter(v => v.lang.startsWith('zh'));
        this.synthReady = true;
      };
      loadVoices();
      if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = loadVoices;
      }
    }

    setEnabled(v) {
      this.enabled = !!v;
      localStorage.setItem('sgk_audio_enabled', this.enabled);
      if (this.enabled) this.init();
      if (!this.enabled) this.stopAll();
    }

    setVolume(v) {
      this.volume = Math.max(0, Math.min(1, v));
      localStorage.setItem('sgk_audio_volume', this.volume);
    }

    stopAll() {
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      if (this.ctx) this.ctx.suspend();
    }

    now() { return this.ctx ? this.ctx.currentTime : 0; }

    playSfx(name) {
      if (!this.enabled) return;
      this.init();
      if (!this.ctx) return;
      const def = SUITES[name] || SUITES.click;
      const t0 = this.now();
      const vol = (def.vol || 0.3) * this.volume;
      try {
        switch (def.type) {
          case 'sine': this.beep(def.f, def.t || 0.1, vol, t0); break;
          case 'noise': this.noise(def.dur, def.freqStart, def.freqEnd, vol, t0); break;
          case 'bell': this.bell(def.f, def.dur, vol, t0); break;
          case 'thud': this.thud(def.dur, vol, t0); break;
          case 'sparkle': this.sparkle(def.dur, vol, t0); break;
          case 'gong': this.gong(def.f, def.dur, vol, t0); break;
          case 'flip': this.flip(def.dur, vol, t0); break;
          case 'shuffle': this.shuffle(def.dur, vol, t0); break;
          case 'clang': this.clang(def.dur, vol, t0); break;
          case 'fanfare': this.fanfare(def.dur, vol, t0); break;
          case 'sad': this.sad(def.dur, vol, t0); break;
          case 'chime': this.chime(def.f, def.dur, vol, t0); break;
        }
      } catch (e) { console.error('sfx error', e); }
    }

    // ---- Web Audio primitives ----
    beep(freq, dur, vol, t0) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      o.connect(g).connect(this.ctx.destination);
      o.start(t0); o.stop(t0 + dur);
    }

    noise(dur, fStart, fEnd, vol, t0) {
      const len = this.ctx.sampleRate * dur;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(fStart, t0);
      filter.frequency.exponentialRampToValueAtTime(fEnd, t0 + dur);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      src.connect(filter).connect(g).connect(this.ctx.destination);
      src.start(t0); src.stop(t0 + dur);
    }

    bell(freqs, dur, vol, t0) {
      (Array.isArray(freqs) ? freqs : [freqs]).forEach((f, i) => {
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(f, t0 + i * 0.04);
        g.gain.setValueAtTime(0, t0 + i * 0.04);
        g.gain.linearRampToValueAtTime(vol, t0 + i * 0.04 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
        o.connect(g).connect(this.ctx.destination);
        o.start(t0 + i * 0.04); o.stop(t0 + dur);
      });
    }

    thud(dur, vol, t0) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(120, t0);
      o.frequency.exponentialRampToValueAtTime(40, t0 + dur);
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(400, t0);
      filter.frequency.exponentialRampToValueAtTime(60, t0 + dur);
      o.connect(filter).connect(g).connect(this.ctx.destination);
      o.start(t0); o.stop(t0 + dur);
    }

    sparkle(dur, vol, t0) {
      [880, 1100, 1320, 1760].forEach((f, i) => {
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(f, t0 + i * 0.06);
        g.gain.setValueAtTime(0, t0 + i * 0.06);
        g.gain.linearRampToValueAtTime(vol * 0.6, t0 + i * 0.06 + 0.03);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + i * 0.06 + 0.25);
        o.connect(g).connect(this.ctx.destination);
        o.start(t0 + i * 0.06); o.stop(t0 + dur);
      });
    }

    gong(f, dur, vol, t0) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(f, t0);
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      o.connect(g).connect(this.ctx.destination);
      o.start(t0); o.stop(t0 + dur);
      // 添加少量泛音
      [f * 2.7, f * 5.4].forEach(hf => {
        const oh = this.ctx.createOscillator();
        const gh = this.ctx.createGain();
        oh.type = 'sine'; oh.frequency.setValueAtTime(hf, t0);
        gh.gain.setValueAtTime(vol * 0.15, t0);
        gh.gain.exponentialRampToValueAtTime(0.001, t0 + dur * 0.6);
        oh.connect(gh).connect(this.ctx.destination);
        oh.start(t0); oh.stop(t0 + dur);
      });
    }

    flip(dur, vol, t0) {
      this.noise(dur, 3000, 600, vol, t0);
    }

    shuffle(dur, vol, t0) {
      const len = this.ctx.sampleRate * dur;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(2000, t0);
      filter.frequency.linearRampToValueAtTime(800, t0 + dur);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(vol, t0);
      src.connect(filter).connect(g).connect(this.ctx.destination);
      src.start(t0); src.stop(t0 + dur);
    }

    clang(dur, vol, t0) {
      [440, 660].forEach((f, i) => {
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = 'square';
        o.frequency.setValueAtTime(f, t0 + i * 0.03);
        g.gain.setValueAtTime(vol * 0.5, t0 + i * 0.03);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
        const ftr = this.ctx.createBiquadFilter();
        ftr.type = 'lowpass'; ftr.frequency.value = 2400;
        o.connect(ftr).connect(g).connect(this.ctx.destination);
        o.start(t0 + i * 0.03); o.stop(t0 + dur);
      });
      this.noise(dur * 0.5, 3000, 1000, vol * 0.3, t0);
    }

    fanfare(dur, vol, t0) {
      [523, 659, 784, 1047].forEach((f, i) => {
        this.beep(f, 0.25, vol, t0 + i * 0.12);
      });
    }

    sad(dur, vol, t0) {
      [392, 349, 330, 294].forEach((f, i) => {
        this.beep(f, 0.3, vol, t0 + i * 0.18);
      });
    }

    chime(f, dur, vol, t0) {
      this.bell([f, f * 1.5], dur, vol, t0);
    }

    // ---- 配音 ----
    playVoice(generalId, kind, skillId) {
      if (!this.enabled) return;
      this.init();
      // 优先播放预生成文件
      const fileUrl = this.voiceFileUrl(generalId, kind, skillId);
      if (fileUrl) {
        const a = new Audio(fileUrl);
        a.volume = this.volume;
        a.play().catch(() => this.speakVoice(generalId, kind, skillId));
        return;
      }
      this.speakVoice(generalId, kind, skillId);
    }

    voiceFileUrl(generalId, kind, skillId) {
      const base = `/assets/audio/voices/${generalId}`;
      let path = null;
      if (kind === 'select') path = `${base}/select.wav`;
      else if (kind === 'death') path = `${base}/death.wav`;
      else if (kind === 'skill' && skillId) path = `${base}/${skillId}.wav`;
      // 客户端无法直接知道文件是否存在，这里交给 Audio.play 容错
      return path;
    }

    speakVoice(generalId, kind, skillId) {
      if (!window.speechSynthesis || !this.synthReady) return;
      const text = this.voiceText(generalId, kind, skillId);
      if (!text) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-CN';
      u.rate = 1.05;
      u.pitch = 1;
      u.volume = this.volume;
      if (this.voices.length) {
        u.voice = this.voices.find(v => v.lang === 'zh-CN') || this.voices[0];
      }
      window.speechSynthesis.speak(u);
    }

    voiceText(generalId, kind, skillId) {
      const meta = window._SGK_META;
      const g = meta && (meta.generals.find(x => x.id === generalId) || meta.customs.find(x => x.id === generalId));
      if (!g) return '';
      if (kind === 'select') return `${g.name}，${g.title || ''}`;
      if (kind === 'death') return `${g.name}，呃啊……`;
      if (kind === 'skill' && skillId) {
        const s = meta && (meta.diySkills.find(x => x.id === skillId) || { name: skillId });
        return s ? s.name : '';
      }
      return '';
    }
  }

  window.AudioManager = AudioManager;
})();
