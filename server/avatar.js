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
  const size = n === 1 ? 100 : n === 2 ? 78 : 60;
  const totalH = n * (size - 8);
  const startY = 145 - totalH / 2 + size * 0.85;
  const hp = '❤'.repeat(Math.max(1, Math.min(5, general.hp || 4)));

  const nameTexts = chars.map((ch, i) =>
    `  <text x="120" y="${startY + i * (size - 8)}" text-anchor="middle" font-size="${size}" ` +
    `font-family="STKaiti,KaiTi,STSong,serif" font-weight="bold" fill="#f7e8c0" ` +
    `style="text-shadow:0 2px 8px rgba(0,0,0,.7);letter-spacing:3px">${ch}</text>`
  ).join('\n');

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
    <radialGradient id="glow" cx="0.5" cy="0.3" r="0.7">
      <stop offset="0" stop-color="${st.accent}" stop-opacity="0.5"/>
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
  <ellipse cx="120" cy="90" rx="100" ry="70" fill="url(#glow)"/>

  <!-- 金色边框（双层） -->
  <rect x="5" y="5" width="230" height="290" rx="10" fill="none" stroke="url(#frame)" stroke-width="2.5"/>
  <rect x="12" y="12" width="216" height="276" rx="7" fill="none" stroke="${st.gold}" stroke-opacity="0.35" stroke-width="1"/>

  <!-- 势力角标（左上角三角） -->
  <polygon points="12,12 52,12 12,52" fill="${st.accent}" stroke="${st.gold}" stroke-width="1.5"/>
  <text x="26" y="40" font-size="20" text-anchor="middle" font-family="STKaiti,KaiTi,serif" font-weight="bold" fill="#f3e5a3">${st.name}</text>

  <!-- 体力心（右上） -->
  <text x="226" y="34" font-size="18" text-anchor="end" fill="#ff5555">${hp}</text>

  <!-- 武将名（书法大字） -->
${nameTexts}

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
