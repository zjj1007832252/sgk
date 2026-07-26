// 古风 SVG 占位头像生成（可替换：往 public/assets/avatars/ 放 <武将id>.png 即可覆盖）
const KINGDOM_STYLE = {
  wei: { c1: '#2c3e5f', c2: '#6f9bd8', name: '魏' },
  shu: { c1: '#5f2c2c', c2: '#e08a6f', name: '蜀' },
  wu:  { c1: '#2c5f3a', c2: '#7fd88a', name: '吴' },
  qun: { c1: '#4a4a52', c2: '#c9b97f', name: '群' },
};

function avatarSVG(general) {
  const st = KINGDOM_STYLE[general.kingdom] || KINGDOM_STYLE.qun;
  const chars = [...(general.name || '？')];
  const n = chars.length;
  const size = n === 1 ? 96 : n === 2 ? 72 : 56;
  const totalH = n * (size + 8);
  const startY = 120 - totalH / 2 + size * 0.82;
  const nameTexts = chars.map((ch, i) =>
    `<text x="120" y="${startY + i * (size + 8)}" class="name" font-size="${size}">${ch}</text>`
  ).join('\n  ');
  const hp = '❤'.repeat(Math.max(1, Math.min(5, general.hp || 4)));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="300" viewBox="0 0 240 300">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${st.c1}"/>
      <stop offset="1" stop-color="#12100d"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.4" r="0.6">
      <stop offset="0" stop-color="${st.c2}" stop-opacity="0.45"/>
      <stop offset="1" stop-color="${st.c2}" stop-opacity="0"/>
    </radialGradient>
    <style>
      .name { font-family: 'STKaiti','KaiTi','STSong',serif; fill: #f3e6c8; text-anchor: middle; font-weight: bold; }
      .sub { font-family: 'STKaiti','KaiTi','STSong',serif; fill: #d8c9a3; text-anchor: middle; }
    </style>
  </defs>
  <rect width="240" height="300" rx="10" fill="url(#bg)"/>
  <rect width="240" height="300" rx="10" fill="url(#glow)"/>
  <circle cx="120" cy="122" r="86" fill="none" stroke="${st.c2}" stroke-opacity="0.45" stroke-width="2"/>
  <circle cx="120" cy="122" r="78" fill="none" stroke="${st.c2}" stroke-opacity="0.2" stroke-width="1"/>
  <rect x="10" y="10" width="36" height="36" rx="7" fill="${st.c1}" stroke="${st.c2}" stroke-width="1.5"/>
  <text x="28" y="36" font-size="24" class="sub" fill="#fff" text-anchor="middle" style="fill:#f3e6c8">${st.name}</text>
  <text x="228" y="34" font-size="15" class="sub" text-anchor="end">${hp}</text>
  ${nameTexts}
  <text x="120" y="272" font-size="17" class="sub">${general.title || ''}</text>
  <rect x="1.5" y="1.5" width="237" height="297" rx="10" fill="none" stroke="${st.c2}" stroke-opacity="0.6" stroke-width="2"/>
</svg>`;
}

module.exports = { avatarSVG, KINGDOM_STYLE };
