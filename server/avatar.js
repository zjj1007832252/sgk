const fs = require('fs');
const path = require('path');

const KINGDOM_STYLE = {
  wei: { main: '#1a2a4a', accent: '#4a7ab8', gold: '#c9b37a', name: '魏' },
  shu: { main: '#3a1208', accent: '#c64428', gold: '#d4af37', name: '蜀' },
  wu:  { main: '#0e3324', accent: '#3aa86a', gold: '#a3d8a0', name: '吴' },
  qun: { main: '#2a2630', accent: '#8b7db8', gold: '#c9b97f', name: '群' },
  god: { main: '#4a3010', accent: '#d4af37', gold: '#ffd700', name: '神' },
};

function avatarSVG(general) {
  const st = KINGDOM_STYLE[general.kingdom] || KINGDOM_STYLE.qun;
  // 转义 SVG 特殊字符防止注入
  const escSvg = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const chars = [...escSvg(general.name || '？')];
  const n = chars.length;
  // 名字缩小并下移，给上方武将剪影留出空间
  const size = n === 1 ? 46 : n === 2 ? 42 : 38;
  const totalH = n * (size - 6);
  const startY = 188 - totalH / 2 + size * 0.85;
  const hp = '❤'.repeat(Math.max(1, Math.min(5, general.hp || 4)));

  const nameTexts = chars.map((ch, i) =>
    `  <text x="120" y="${startY + i * (size - 6)}" text-anchor="middle" font-size="${size}" ` +
    `font-family="STKaiti,KaiTi,STSong,serif" font-weight="bold" fill="#f7e8c0" ` +
    `style="text-shadow:0 2px 8px rgba(0,0,0,.7);letter-spacing:3px">${ch}</text>`
  ).join('\n');

  // 武将剪影（持剑站立的通用将军轮廓，按势力配色）
  const silhouette = `
  <!-- 武将剪影 -->
  <g transform="translate(120,92)">
    <!-- 披风 -->
    <path d="M0,-4 C-46,2 -72,22 -82,58 L-56,60 C-48,34 -28,20 0,14 Z" fill="${st.accent}" opacity="0.45"/>
    <path d="M0,-4 C46,2 72,22 82,58 L56,60 C48,34 28,20 0,14 Z" fill="${st.accent}" opacity="0.45"/>
    <!-- 长袍身躯 -->
    <path d="M-30,12 L30,12 L40,78 L-40,78 Z" fill="${st.main}" stroke="${st.accent}" stroke-width="2.5"/>
    <!-- 腰带 -->
    <rect x="-32" y="48" width="64" height="8" rx="4" fill="${st.gold}"/>
    <!-- 肩甲 -->
    <path d="M-30,12 L-45,22 L-35,30 Z" fill="${st.gold}" opacity="0.85"/>
    <path d="M30,12 L45,22 L35,30 Z" fill="${st.gold}" opacity="0.85"/>
    <!-- 头部 -->
    <circle cx="0" cy="-20" r="16" fill="${st.main}" stroke="${st.accent}" stroke-width="2.5"/>
    <circle cx="0" cy="-20" r="6" fill="${st.accent}" opacity="0.25"/>
    <!-- 头盔 -->
    <path d="M-8,-34 L0,-48 L8,-34 Z" fill="${st.gold}"/>
    <path d="M0,-48 C-9,-55 -4,-61 0,-58 C4,-61 9,-55 0,-48" stroke="${st.accent}" stroke-width="2" fill="none"/>
    <!-- 剑 -->
    <rect x="34" y="4" width="5" height="66" rx="2.5" fill="${st.gold}"/>
    <rect x="25" y="-2" width="23" height="7" rx="3" fill="${st.gold}"/>
  </g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="300" viewBox="0 0 240 300">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${st.main}"/>
      <stop offset="0.6" stop-color="#1a1208"/>
      <stop offset="1" stop-color="#0d0a06"/>
    </linearGradient>
    <linearGradient id="frame" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${st.gold}"/>
      <stop offset="0.5" stop-color="#fff5d0"/>
      <stop offset="1" stop-color="${st.gold}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.28" r="0.7">
      <stop offset="0" stop-color="${st.accent}" stop-opacity="0.55"/>
      <stop offset="1" stop-color="${st.accent}" stop-opacity="0"/>
    </radialGradient>
    <pattern id="bgPattern" patternUnits="userSpaceOnUse" width="22" height="22" patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="22" stroke="${st.gold}" stroke-opacity="0.07" stroke-width="1"/>
    </pattern>
  </defs>

  <!-- 背景 -->
  <rect width="240" height="300" rx="12" fill="url(#bg)"/>
  <rect width="240" height="300" rx="12" fill="url(#bgPattern)"/>

  <!-- 光晕 -->
  <ellipse cx="120" cy="80" rx="100" ry="72" fill="url(#glow)"/>

${silhouette}

  <!-- 武将名（书法字，缩小置于剪影下方） -->
${nameTexts}

  <!-- 金色边框（双层） -->
  <rect x="5" y="5" width="230" height="290" rx="10" fill="none" stroke="url(#frame)" stroke-width="2.5"/>
  <rect x="12" y="12" width="216" height="276" rx="7" fill="none" stroke="${st.gold}" stroke-opacity="0.35" stroke-width="1"/>

  <!-- 势力角标（左上角三角） -->
  <polygon points="12,12 52,12 12,52" fill="${st.accent}" stroke="${st.gold}" stroke-width="1.5"/>
  <text x="26" y="40" font-size="20" text-anchor="middle" font-family="STKaiti,KaiTi,serif" font-weight="bold" fill="#f3e5a3">${st.name}</text>

  <!-- 体力心（右上） -->
  <text x="226" y="34" font-size="18" text-anchor="end" fill="#ff5555">${hp}</text>

  <!-- 称号条 -->
  <rect x="25" y="244" width="190" height="34" rx="3" fill="#1a1008" stroke="${st.gold}" stroke-opacity="0.5"/>
  <line x1="25" y1="244" x2="215" y2="244" stroke="${st.gold}" stroke-opacity="0.7"/>
  <line x1="25" y1="278" x2="215" y2="278" stroke="${st.gold}" stroke-opacity="0.7"/>
  <text x="120" y="268" text-anchor="middle" font-size="16"
    font-family="STKaiti,KaiTi,STSong,serif" letter-spacing="5px" fill="${st.gold}">${escSvg(general.title || '')}</text>

  <!-- 顶部装饰角 -->
  <path d="M12 70 L12 85 L27 85 Z" fill="${st.gold}" opacity="0.6"/>
  <path d="M228 70 L228 85 L213 85 Z" fill="${st.gold}" opacity="0.6"/>
</svg>`;
}

// 导出
if (typeof module !== 'undefined') module.exports = { avatarSVG, KINGDOM_STYLE };
