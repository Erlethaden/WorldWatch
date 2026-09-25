// Kronika kampanii: cała gra tura po turze w oknie do druku → „Zapisz jako PDF”
import { S, gameNow, turn, realGM, myCountry, cFlag, cName, cColor, countriesSorted, userOfCountry, tr } from './store.js';
import { esc, form, toast, download } from './ui.js';
import { worldFeatures, areaGeo, TERR_NOUN } from './map.js';
import { customFields } from './gm.js';
import { turnData, allTurns } from './turns.js';
import * as G from './geo.js';

const RES = { a: 'zwycięstwo strony A', b: 'zwycięstwo strony B', draw: 'nierozstrzygnięta', ongoing: 'walki trwają' };
const flags = l => (l || []).map(cFlag).join('');

// ───── mini-mapa SVG (odwzorowanie walcowe, wspólny kadr dla wszystkich tur) ─────
function frame(feats, pins) {
  const iso = new Set(countriesSorted().map(c => String(c.isoN)));
  Object.values(S.data.territories).forEach(t => t.isoN && iso.add(String(t.isoN)));
  let a = 180, b = -180, c = 90, d = -90;
  const add = (x, y) => { a = Math.min(a, x); b = Math.max(b, x); c = Math.min(c, y); d = Math.max(d, y); };
  feats.filter(f => iso.has(String(f.id))).forEach(f => f.bb && (add(f.bb[0], f.bb[1]), add(f.bb[2], f.bb[3])));
  Object.values(S.data.territories).filter(t => t.kind !== 'country').forEach(t => areaGeo(t).forEach(p => (p[0] || []).forEach(([x, y]) => add(x, y))));
  pins.forEach(p => add(p.lon, p.lat));
  if (a > b) { a = -30; b = 60; c = 25; d = 72; }
  const px = (b - a) * .08 + 2, py = (d - c) * .08 + 2;
  return { a: a - px, b: b + px, c: Math.max(-60, c - py), d: Math.min(84, d + py) };
}
function bbox(f) {
  let a = 1e9, b = -1e9, c = 1e9, d = -1e9;
  const g = f.geometry; (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).forEach(p => p[0].forEach(([x, y]) => { a = Math.min(a, x); b = Math.max(b, x); c = Math.min(c, y); d = Math.max(d, y); }));
  return [a, c, b, d];
}
function mapSvg(fr, feats, at, pins) {
  const k = Math.cos((fr.c + fr.d) / 2 * Math.PI / 180), W = 720, sx = W / ((fr.b - fr.a) * k), H = Math.min(520, Math.round((fr.d - fr.c) * sx));
  const sy = H / (fr.d - fr.c);
  const P = (x, y) => [(x - fr.a) * k * sx, (fr.d - y) * sy];
  const path = polys => polys.map(poly => poly.map(r => { let o = '', lx = -1e9, ly = -1e9; r.forEach(([x, y], i) => { const [X, Y] = P(x, y); if (i && Math.abs(X - lx) + Math.abs(Y - ly) < .8) return; o += (o ? 'L' : 'M') + X.toFixed(1) + ' ' + Y.toFixed(1); lx = X; ly = Y; }); return o + 'Z'; }).join('')).join('');
  const terr = Object.values(S.data.territories).filter(t => (t.since || 0) <= at);
  const owner = {}; terr.filter(t => t.kind === 'country').sort((x, y) => (x.since || 0) - (y.since || 0)).forEach(t => owner[String(t.isoN)] = t);
  const byIso = {}; countriesSorted().forEach(c => byIso[String(c.isoN)] = c);
  const vis = feats.filter(f => f.bb[2] >= fr.a && f.bb[0] <= fr.b && f.bb[3] >= fr.c && f.bb[1] <= fr.d);
  const land = vis.map(f => { const g = f.geometry, t = owner[String(f.id)], c = byIso[String(f.id)];
    const fill = t ? cColor(t.controller) : c ? c.color || '#8a93a0' : '#d4d8dd', op = t || c ? .55 : 1;
    return `<path d="${path(g.type === 'Polygon' ? [g.coordinates] : g.coordinates)}" fill="${fill}" fill-opacity="${op}" stroke="#fff" stroke-width=".6"${t && t.status !== 'annexed' ? ` stroke-dasharray="${t.status === 'puppet' ? '1 3' : '3 2'}"` : ''}/>`; }).join('');
  const areas = terr.filter(t => t.kind !== 'country').map(t => `<path d="${path(areaGeo(t))}" fill="${cColor(t.controller)}" fill-opacity=".45" stroke="${cColor(t.controller)}" stroke-width="1.2" stroke-dasharray="4 3"/>`).join('');
  const dots = pins.map((p, i) => { const [X, Y] = P(p.lon, p.lat); return `<g><circle cx="${X.toFixed(1)}" cy="${Y.toFixed(1)}" r="8" fill="#c62828" stroke="#fff" stroke-width="1.5"/><text x="${X.toFixed(1)}" y="${(Y + 3.5).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="700" fill="#fff">${i + 1}</text></g>`; }).join('');
  return `<svg class="map" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"><rect width="${W}" height="${H}" fill="#e8eef4"/>${land}${areas}${dots}</svg>`;
}

// ───── dokument ─────
const list = (title, items, fmt) => items.length ? `<h3>${title}</h3><ul>${items.map(i => `<li>${fmt(i)}</li>`).join('')}</ul>` : '';
function turnHtml(T, fr, feats, maps) {
  const d = turnData(T), end = Math.min(isFinite(d.to) ? d.to - 1 : gameNow(), gameNow());
  const pins = d.battles.filter(n => n.place?.lat != null).map(n => ({ lat: +n.place.lat, lon: +n.place.lon, n }));
  const any = d.battles.length + d.terr.length + d.treaties.length + d.blocs.length + d.breaking.length + d.chron.length + d.changes.length;
  return `<section class="turn"><header><span class="tn">TURA ${T}</span><span class="dt">${isFinite(d.from) ? G.fmtDate(d.from) : 'początek gry'} — ${isFinite(d.to) ? G.fmtDate(d.to) : 'trwa'}</span></header>
  ${maps && feats.length ? `<figure>${mapSvg(fr, feats, end, pins)}<figcaption>Stan mapy na koniec tury${pins.length ? ' · ● miejsca bitew' : ''}</figcaption></figure>` : ''}
  ${d.chron.length ? `<div class="chron">${d.chron.sort((a, b) => (a.gameTime || 0) - (b.gameTime || 0)).map(e => `<p>${e.countries?.length ? `<span class="fl">${flags(e.countries)}</span> ` : ''}${esc(e.text)}</p>`).join('')}</div>` : ''}
  ${list('Bitwy', d.battles, n => `${pins.findIndex(p => p.n === n) + 1 ? `<b class="pin">${pins.findIndex(p => p.n === n) + 1}</b> ` : ''}<b>${esc(n.battle.name)}</b>${n.place?.name ? ` (${esc(n.place.name)})` : ''} · ${flags(n.battle.sideA)} ⚔ ${flags(n.battle.sideB)} · ${RES[n.battle.result] || RES.ongoing}${n.battle.lossesA || n.battle.lossesB ? `<br><small>Straty: ${esc(n.battle.lossesA || '—')} / ${esc(n.battle.lossesB || '—')}</small>` : ''}`)}
  ${list('Zmiany terytorialne', d.terr, t => `${cFlag(t.controller)} ${esc(cName(t.controller))} → ${esc(t.label || '')} · ${TERR_NOUN[t.status] || t.status}`)}
  ${list('Traktaty', d.treaties, t => `${esc(t.name)} · ${flags(t.parties)} · ${esc(tr('treaty', t.type))}`)}
  ${list('Sojusze i organizacje', d.blocs, b => `${esc(b.name)} · ${(b.members || []).length} członków`)}
  ${list('Najważniejsze wiadomości', d.breaking.slice(0, 12), n => `${esc(n.headline)}${n.gameTime ? ` <small>${G.fmtDate(n.gameTime)}</small>` : ''}`)}
  ${list('Największe zmiany statystyk', d.changes.slice(0, 12), x => `${x.c.flag} ${esc(x.c.name)} · ${esc(x.f.label)}: ${esc(x.a)} → <b>${esc(x.b)}</b>${x.pct != null ? ` <span class="${x.pct >= 0 ? 'up' : 'down'}">${x.pct >= 0 ? '▲' : '▼'} ${Math.abs(x.pct).toFixed(1)}%</span>` : ''}`)}
  ${any ? '' : '<p class="muted">W tej turze nic nie zapisano.</p>'}</section>`;
}
function finalHtml() {
  const gm = realGM(), me = myCountry(), fields = customFields().filter(f => gm || f.public || me);
  if (!fields.length) return '';
  const val = (c, f) => { const v = f.public ? c.custom?.[f.key] : S.data.countryPrivate[c.id]?.custom?.[f.key]; return v === undefined && !f.public ? '🔒' : esc(v ?? '—'); };
  return `<section class="turn"><header><span class="tn">STAN KOŃCOWY</span><span class="dt">${G.fmtDate(gameNow())}</span></header>
  <table><thead><tr><th>Państwo</th>${fields.map(f => `<th>${esc(f.label)}${f.public ? '' : ' 🔒'}</th>`).join('')}</tr></thead>
  <tbody>${countriesSorted().map(c => `<tr><td>${c.flag} ${esc(c.name)}</td>${fields.map(f => `<td>${val(c, f)}</td>`).join('')}</tr>`).join('')}</tbody></table></section>`;
}
const CSS = `@page{size:A4;margin:16mm 14mm}*{box-sizing:border-box}body{font:11pt/1.5 Georgia,'Times New Roman',serif;color:#1b1f24;margin:0;background:#fff}
.bar{position:sticky;top:0;background:#10161e;color:#fff;padding:10px 16px;display:flex;gap:12px;align-items:center;font:14px system-ui,sans-serif}.bar button{font:600 14px system-ui;padding:8px 14px;border:0;border-radius:6px;background:#f5b301;cursor:pointer}
main{max-width:760px;margin:0 auto;padding:24px 16px}.cover{min-height:88vh;display:flex;flex-direction:column;justify-content:center;border-bottom:3px double #1b1f24}
.cover small{font:600 10pt system-ui,sans-serif;letter-spacing:.2em;color:#666}.cover h1{font-size:34pt;line-height:1.1;margin:8px 0 6px}.cover .sub{font-size:13pt;color:#444;margin:0 0 22px}
.roster{columns:2;column-gap:24px;font-size:10.5pt}.roster div{break-inside:avoid;margin:2px 0}
.turn{break-before:page;padding-top:8px}header{display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid #1b1f24;margin-bottom:12px}
.tn{font:700 20pt system-ui,sans-serif;letter-spacing:.04em}.dt{font:10pt system-ui,sans-serif;color:#555}
figure{margin:0 0 12px}.map{width:100%;height:auto;display:block;border:1px solid #c9d1da}figcaption{font:9pt system-ui,sans-serif;color:#666;margin-top:3px}
.chron p{margin:0 0 8px;text-align:justify}
h3{font:700 10pt system-ui,sans-serif;text-transform:uppercase;letter-spacing:.08em;color:#444;margin:14px 0 4px;border-bottom:1px solid #ddd}
ul{margin:0;padding-left:18px}li{margin:3px 0;break-inside:avoid}small{color:#666}.muted{color:#777;font-style:italic}.up{color:#1b7a3d}.down{color:#b3261e}
.pin{display:inline-block;min-width:16px;height:16px;border-radius:50%;background:#c62828;color:#fff;font:700 9px/16px system-ui;text-align:center}
table{width:100%;border-collapse:collapse;font:9.5pt system-ui,sans-serif}th,td{border-bottom:1px solid #ddd;padding:4px 6px;text-align:left}th{background:#f1f3f5}
@media print{.bar{display:none}main{padding:0;max-width:none}}`;

export async function campaignPdf() {
  const turns = allTurns(); if (!turns.length) return toast('Brak tur do wydrukowania', 'info');
  const v = await form('📕 Kronika kampanii (PDF)', [
    { k: 'title', label: 'Tytuł', value: 'Kronika kampanii', req: true },
    { k: 'from', label: 'Od tury', type: 'number', value: turns[0] }, { k: 'to', label: 'Do tury', type: 'number', value: turns[turns.length - 1] },
    { k: 'maps', label: 'Mapa dla każdej tury', type: 'check', value: true },
    { k: 'final', label: 'Tabela statystyk na końcu', type: 'check', value: true }
  ], { submit: '📕 Utwórz' });
  if (!v) return;
  const sel = turns.filter(t => t >= +v.from && t <= +v.to);
  const w = window.open('', '_blank');   // otwieramy od razu (w obsłudze kliknięcia), inaczej blokada wyskakujących okien
  const feats = worldFeatures().filter(f => f.properties?.name !== 'Antarctica');
  feats.forEach(f => f.bb ||= bbox(f));
  const pins = sel.flatMap(T => turnData(T).battles).filter(n => n.place?.lat != null).map(n => ({ lat: +n.place.lat, lon: +n.place.lon }));
  const fr = frame(feats, pins);
  const me = myCountry(), who = realGM() ? 'wersja Mistrza Gry (pełna)' : me ? `wersja: ${cFlag(me)} ${cName(me)}` : 'wersja obserwatora';
  const cover = `<div class="cover"><small>WORLDWATCH · ${esc(who.toUpperCase())}</small><h1>${esc(v.title)}</h1><p class="sub">Tury ${sel[0]}–${sel[sel.length - 1]} · stan na ${G.fmtDate(gameNow())}</p>
    ${v.maps && feats.length ? `<figure>${mapSvg(fr, feats, gameNow(), [])}<figcaption>Świat w chwili wydania kroniki</figcaption></figure>` : ''}
    <h3>Państwa</h3><div class="roster">${countriesSorted().map(c => `<div>${c.flag} <b>${esc(c.name)}</b>${userOfCountry(c.id).length ? ` — ${esc(userOfCountry(c.id).map(u => u.displayName).join(', '))}` : ' <small>(NPC)</small>'}</div>`).join('')}</div></div>`;
  const html = `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(v.title)}</title><style>${CSS}</style></head><body>
    <div class="bar"><button>🖨 Zapisz jako PDF</button><span>W oknie drukowania wybierz „Zapisz jako PDF”.</span></div>
    <main>${cover}${sel.map(T => turnHtml(T, fr, feats, v.maps)).join('')}${v.final ? finalHtml() : ''}</main></body></html>`;
  if (!w) { download(`${v.title.replace(/[^\p{L}\p{N}]+/gu, '-')}.html`, html, 'text/html'); return toast('Przeglądarka zablokowała okno. Pobrano plik HTML: otwórz go i wydrukuj do PDF.', 'info', 8000); }
  w.document.open(); w.document.write(html); w.document.close();
  w.document.querySelector('.bar button').onclick = () => w.print();
  setTimeout(() => w.print(), 600);
}
