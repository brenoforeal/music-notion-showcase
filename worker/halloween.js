// Halloween look for the public pages (Lyric/Song of the Day, their histories, /ranking).
// It's an extra <style> + a few decorations added on top of the normal page: the CSS
// variables set here (--accent etc.) win over the page's own, so nothing else changes.
// On by itself from 15 Oct to 1 Nov (Brazil time, UTC-3); outside those days, nothing is added.

export function isHalloween(now = new Date()) {
  const br = new Date(now.getTime() - 3 * 3600 * 1000);
  const m = br.getUTCMonth() + 1, d = br.getUTCDate();
  return (m === 10 && d >= 15) || (m === 11 && d === 1);
}

// An SVG drawing as a CSS background (url("data:...")).
const svg = s => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' ${s}</svg>`)}")`;

// Ranking medals: 1 Michael Myers, 2 Jason, 3 Freddy (drawn here, no movie images).
const MYERS = svg(`viewBox='0 0 24 28'><path d='M3 9C3 3 7 1 12 1s9 2 9 8' fill='#5a3a22'/><path d='M4 9c0-4 4-6 8-6s8 2 8 6v8c0 6-4 10-8 10s-8-4-8-10z' fill='#ecebe4'/><ellipse cx='8.5' cy='12' rx='2.2' ry='1.5' fill='#111'/><ellipse cx='15.5' cy='12' rx='2.2' ry='1.5' fill='#111'/><path d='M9 21q3 1 6 0' stroke='#999' fill='none'/>`);
const JASON = svg(`viewBox='0 0 24 28'><path d='M12 1c6 0 9 4 9 11s-4 15-9 15S3 19 3 12 6 1 12 1z' fill='#e9e6da'/><path d='M6 9l3-3M18 9l-3-3M12 4v4M7 17l2 2M17 17l-2 2' stroke='#c62828' stroke-width='1.6'/><ellipse cx='8.5' cy='12' rx='2' ry='1.4' fill='#111'/><ellipse cx='15.5' cy='12' rx='2' ry='1.4' fill='#111'/><g fill='#333'><circle cx='10' cy='20' r='.8'/><circle cx='12' cy='21' r='.8'/><circle cx='14' cy='20' r='.8'/><circle cx='12' cy='23.5' r='.8'/></g>`);
const FREDDY = svg(`viewBox='0 0 26 28'><ellipse cx='13' cy='10' rx='12' ry='3' fill='#4a3320'/><path d='M6 10c0-6 3-8 7-8s7 2 7 8z' fill='#5c4028'/><rect x='6' y='9' width='14' height='2' fill='#2a1d12'/><rect x='5' y='14' width='16' height='13' rx='3' fill='#b32424'/><rect x='5' y='17' width='16' height='2.5' fill='#2e6b2e'/><rect x='5' y='22' width='16' height='2.5' fill='#2e6b2e'/>`);

// Ranking top tabs: one horror film each.
const SHINING = svg(`width='28' height='24'><path d='M7 0h14l7 12-7 12H7L0 12z' fill='none' stroke='#d0602a' stroke-width='3'/><path d='M10 6h8l4 6-4 6h-8l-4-6z' fill='#b32424'/>`);
const PUMPKIN = svg(`viewBox='0 0 40 36'><path d='M19 6c0-3 2-5 4-5' stroke='#3d5a1e' stroke-width='3' fill='none'/><ellipse cx='20' cy='21' rx='18' ry='14' fill='#e8731c'/><path d='M12 17l4 3h-6zM28 17l-4 3h6zM11 26q9 6 18 0l-3 1-2-2-3 2-2-2-2 2-3-2z' fill='#2a1402'/>`);
const LAMP = svg(`viewBox='0 0 20 40'><rect x='9' y='10' width='2' height='30' fill='#0b0c10'/><path d='M5 10h10l-2-6H7z' fill='#0b0c10'/><circle cx='10' cy='11' r='2.4' fill='#ffeeb0'/>`);
const SCREAM = svg(`viewBox='0 0 40 44'><path d='M20 4c9 0 13 8 12 18-1 11-6 18-12 18S9 33 8 22C7 12 11 4 20 4z' fill='#e8e8e8'/><ellipse cx='15' cy='18' rx='3' ry='5' fill='#111'/><ellipse cx='25' cy='18' rx='3' ry='5' fill='#111'/><ellipse cx='20' cy='31' rx='2.5' ry='6' fill='#111'/>`);
const BALLOON = svg(`viewBox='0 0 24 44'><path d='M12 26q-3 6 1 10t-1 8' stroke='#ccc' fill='none'/><ellipse cx='12' cy='13' rx='10' ry='12' fill='#d61f1f'/><ellipse cx='8' cy='8' rx='2.5' ry='4' fill='#ff8a8a' opacity='.7'/><path d='M10 25h4l-2 3z' fill='#d61f1f'/>`);

const COMMON = `
  :root{--bg:#0b0c10;--card:rgba(23,26,33,.84);--accent:#e05555}
  html{background:radial-gradient(circle at 92% 0,#262a36 0,#0b0c10 420px) fixed #0b0c10;min-height:100%}
  body{background:transparent!important}
  .hw-moon,.hw-fog,.hw-bat{position:fixed;pointer-events:none}
  .hw-moon{z-index:-1;top:14px;right:16px;width:46px;height:46px;border-radius:50%;
    background:radial-gradient(circle at 38% 35%,#f6f2df,#d9d2b4 70%,#bfb795);box-shadow:0 0 44px 12px rgba(233,228,207,.2)}
  .hw-fog{z-index:5;left:-40px;right:-40px;bottom:-30px;height:110px;
    background:linear-gradient(transparent,rgba(160,170,190,.13));animation:hw-drift 10s ease-in-out infinite alternate}
  /* Own layer for the moving bits: no flicker over the blurred cover banners */
  .hw-fog,.hw-bat{will-change:transform}
  .hw-bat{z-index:5;left:100%;font-size:16px;opacity:.75;animation:hw-fly 26s linear infinite}
  .hw-bat.b2{font-size:12px;animation-duration:34s;animation-delay:-14s}
  /* Narrow screens and Notion embeds: the card fills the width, so the moon only peeks in from the corner */
  @media (max-width:640px){.hw-moon{top:-14px;right:-14px;width:38px;height:38px}}
  @keyframes hw-drift{to{transform:translateX(40px)}}
  @keyframes hw-fly{0%{transform:translate(0,0)}25%{transform:translate(-30vw,14px)}50%{transform:translate(-60vw,-6px)}75%{transform:translate(-90vw,10px)}100%{transform:translate(-130vw,0)}}
  @keyframes hw-flicker{0%,88%,100%{opacity:1}90%{opacity:.35}92%{opacity:1}95%{opacity:.55}}
  @media (prefers-reduced-motion:reduce){.hw-fog,.hw-bat{animation:none}.hw-bat{display:none}}`;

// Lyric/Song of the Day and their histories (publicPageWrap in lyric-pages.js).
const PUBLIC = `
  .tab[aria-selected="true"]{background:#b32424;color:#fff;border-color:#b32424;animation:hw-flicker 5s infinite}
  .lyric{border-left-color:#8a1c1c}
  @media (prefers-reduced-motion:reduce){.tab[aria-selected="true"]{animation:none}}`;

// /ranking (ranking-page.js).
const RANKING = `
  .toptab,.toptab.active{color:#fff;text-shadow:0 1px 3px #000,0 0 8px #000;background-color:#14161c}
  .toptab{position:relative;z-index:0;background-image:linear-gradient(rgba(11,12,16,.6),rgba(11,12,16,.6)),var(--hw-film)}
  .toptab,.toptab.active{background-repeat:repeat,var(--hw-rep,no-repeat);
    background-size:auto,var(--hw-size,auto 80%);background-position:0 0,var(--hw-pos,right 8px center)}
  .toptab.active{background-image:linear-gradient(rgba(11,12,16,.15),rgba(11,12,16,.15)),var(--hw-film);box-shadow:inset 0 0 0 2px var(--accent)}
  .toptab[data-top="albums"]{--hw-film:${SHINING};--hw-rep:repeat;--hw-size:28px 24px;--hw-pos:0 0;background-color:#3a1a0f}
  .toptab[data-top="artists"]{--hw-film:${PUMPKIN};background-color:#3a1604}
  .toptab[data-top="epcomp"]{--hw-film:${LAMP};background-color:#1b2330}
  .toptab[data-top="epcomp"]::before{content:"";position:absolute;inset:0;z-index:-1;border-radius:inherit;background:radial-gradient(ellipse at 88% 0,rgba(255,236,170,.45),transparent 60%);pointer-events:none}
  .toptab[data-top="others"]{--hw-film:${SCREAM}}
  .toptab[data-top="songs"]{--hw-film:${BALLOON}}
  .subtab.active,.artist-section.active,.pager button.active{color:#fff}
  .medal{position:relative;box-shadow:none;background-color:transparent;background-repeat:no-repeat;background-position:center;background-size:contain;border-radius:0}
  /* The face hides the rank number; a red badge in the corner shows it instead */
  .medal.m1,.medal.m2,.medal.m3{color:transparent}
  .medal::after{position:absolute;right:-7px;bottom:-4px;width:15px;height:15px;border-radius:50%;background:#b32424;
    color:#fff;font-size:10px;font-weight:800;line-height:15px;text-align:center;box-shadow:0 0 0 2px #0b0c10}
  .medal.m1::after{content:"1"}
  .medal.m2::after{content:"2"}
  .medal.m3::after{content:"3"}
  .medal.m1{background-image:${MYERS}}
  .medal.m2{background-image:${JASON}}
  .medal.m3{background-image:${FREDDY}}
  .item.podium.p1,.item.podium.p2,.item.podium.p3{border-color:#8a1c1c88}`;

const DECOR = `<div class="hw-moon" aria-hidden="true"></div><div class="hw-bat" aria-hidden="true" style="top:70px">🦇</div><div class="hw-bat b2" aria-hidden="true" style="top:150px">🦇</div><div class="hw-fog" aria-hidden="true"></div>`;

// What a page adds: style goes in <head>, decor right after <body>. Empty outside Halloween.
// page: 'public' (Lyric/Song pages) or 'ranking'.
export function halloween(page, now = new Date()) {
  if (!isHalloween(now)) return { style: '', decor: '' };
  return { style: '<style>' + COMMON + (page === 'ranking' ? RANKING : PUBLIC) + '\n</style>', decor: DECOR };
}
