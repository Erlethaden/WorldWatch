// Tury: historia statystyk (migawka na koniec tury), podsumowanie tury i powtórka na osi czasu
import { S, G, run, now, gameNow, turn, realGM, myCountry, cFlag, cName, country, countriesSorted, tr } from './store.js';
import { h, modal, toast, download, esc } from './ui.js';
import { customFields } from './gm.js';
import { TERR_NOUN } from './map.js';

// ───────── liczby z pól tekstowych („10,6 mln”, „82%”) ─────────
export function statNum(v) {
  if (v == null || v === '') return null;
  const s = String(v).toLowerCase().replace(/\s| /g, '').replace(',', '.');
  const m = s.match(/-?\d+(\.\d+)?/); if (!m) return null;
  let n = parseFloat(m[0]);
  if (/bln|tr|bilion/.test(s)) n *= 1e12; else if (/mld|bn|miliard/.test(s)) n *= 1e9; else if (/mln|mio|milion|m$/.test(s)) n *= 1e6; else if (/tys|k$/.test(s)) n *= 1e3;
  return n;
}

// ───────── migawka statystyk ─────────
// statHistory/t{N}__pub  → pola jawne wszystkich państw (czytają wszyscy)
// statHistory/t{N}__{id} → pola niejawne jednego państwa (czyta tylko ono i GM)
export function snapshotStats(w, T, gameTime = gameNow()) {
  const fields = customFields(), pub = {}, at = now();
  countriesSorted().forEach(c => {
    const p = {}, s = {};
    fields.forEach(f => { const v = f.public ? c.custom?.[f.key] : S.data.countryPrivate[c.id]?.custom?.[f.key]; if (v != null && v !== '') (f.public ? p : s)[f.key] = v; });
    pub[c.id] = p;
    w.set(`statHistory/t${T}__${c.id}`, { turn: T, countryId: c.id, gameTime, values: s, createdAt: at });
  });
  w.set(`statHistory/t${T}__pub`, { turn: T, countryId: '__pub', gameTime, values: pub, createdAt: at });
}
export async function snapshotNow() {
  const T = turn();
  if (await run('STAT_SNAPSHOT', `tura ${T}`, w => snapshotStats(w, T), { undo: false })) toast(`📸 Zapisano stan statystyk (tura ${T})`, 'ok');
}
// wartość pola z migawki danej tury (null = brak / niewidoczne)
export function histVal(T, f, cid) {
  const d = f.public ? S.data.statHistory[`t${T}__pub`]?.values?.[cid] : S.data.statHistory[`t${T}__${cid}`]?.values;
  return d ? d[f.key] ?? null : null;
}
export const snapTurns = () => [...new Set(Object.values(S.data.statHistory || {}).map(d => d.turn))].sort((a, b) => a - b);
// zmiana od ostatniej migawki (przed bieżącą turą)
export function deltaOf(f, cid, cur) {
  const T = snapTurns().filter(t => t < turn()).pop() ?? snapTurns().pop(); if (T == null) return null;
  const a = statNum(histVal(T, f, cid)), b = statNum(cur);
  return a == null || b == null ? null : { d: b - a, pct: a ? (b - a) / Math.abs(a) * 100 : null, T };
}

// ───────── wykres: jedna statystyka w kolejnych turach ─────────
export function statChart(f, list, valNow) {
  const turns = snapTurns(), cur = turn();
  const xs = [...turns.filter(t => t < cur), cur];                  // migawki + „teraz”
  const series = list.map(c => ({ c, pts: xs.map(t => ({ t, v: statNum(t === cur ? valNow(c) : histVal(t, f, c.id)) })).filter(p => p.v != null) })).filter(s => s.pts.length);
  if (!series.length || xs.length < 2) return h('p.help', 'Wykres pojawi się po zapisaniu pierwszej migawki (przy „Zakończ turę” albo GM → Tury → 📸).');
  const W = 360, H = 170, L = 8, R = 8, T = 10, B = 22, all = series.flatMap(s => s.pts.map(p => p.v));
  let lo = Math.min(...all), hi = Math.max(...all); if (lo === hi) { lo -= 1; hi += 1; } const pad = (hi - lo) * .08; lo -= pad; hi += pad;
  const x = t => L + (xs.indexOf(t) / (xs.length - 1)) * (W - L - R), y = v => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const NS = 'http://www.w3.org/2000/svg', el = (n, a = {}, ...k) => { const e = document.createElementNS(NS, n); Object.entries(a).forEach(([q, v]) => e.setAttribute(q, v)); k.forEach(c => e.append(c)); return e; };
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'st-chart', role: 'img', 'aria-label': `${f.label} w kolejnych turach` });
  [0, .5, 1].forEach(q => svg.append(el('line', { x1: L, x2: W - R, y1: T + q * (H - T - B), y2: T + q * (H - T - B), class: 'grid' })));
  xs.forEach(t => svg.append(el('text', { x: x(t), y: H - 6, class: 'ax', 'text-anchor': t === xs[0] ? 'start' : t === cur ? 'end' : 'middle' }, t === cur ? 'teraz' : `T${t}`)));
  series.forEach(({ c, pts }) => {
    const col = c.color || '#3fa7ff';
    svg.append(el('polyline', { points: pts.map(p => `${x(p.t)},${y(p.v)}`).join(' '), fill: 'none', stroke: col, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    pts.forEach(p => svg.append(el('circle', { cx: x(p.t), cy: y(p.v), r: 4, fill: col, stroke: 'var(--panel)', 'stroke-width': 2 }, el('title', {}, `${c.name} · ${p.t === cur ? 'teraz' : 'tura ' + p.t}: ${p.t === cur ? valNow(c) : histVal(p.t, f, c.id)}`))));
  });
  return h('figure.st-fig', svg, h('figcaption.st-legend', series.map(({ c }) => h('span', h('i', { style: { background: c.color || '#3fa7ff' } }), `${c.flag} ${c.name}`))));
}

// ───────── okno czasowe tury ─────────
// początek tury: zapisany start → systemowy wpis „Rozpoczyna się tura” → najwcześniejszy wpis kroniki z tej tury
function turnStartsAll() {
  const st = {}, hist = Object.values(S.data.history);
  hist.forEach(e => { if (e.turn && isFinite(e.gameTime)) st[e.turn] = Math.min(st[e.turn] ?? Infinity, e.gameTime); });
  hist.filter(e => e.system && e.turn && isFinite(e.gameTime)).forEach(e => st[e.turn] = e.gameTime);
  Object.entries(S.game.turnStarts || {}).forEach(([n, v]) => st[n] = v);
  return Object.entries(st).map(([n, v]) => [+n, v]).sort((x, y) => x[0] - y[0]);
}
// każde zdarzenie należy do dokładnie jednej tury: ostatniej, która zaczęła się przed nim
function turnOfTime(t, st = turnStartsAll()) { let n = null; st.forEach(([k, v]) => { if (v <= t) n = k; }); return n ?? st[0]?.[0] ?? turn(); }
function turnWindow(T) {
  const st = turnStartsAll(), from = st.find(x => x[0] === T)?.[1] ?? -Infinity, next = st.find(x => x[0] > T);
  return { from, to: next ? next[1] : Infinity, st };
}

// ───────── podsumowanie tury ─────────
// dane tury (wspólne dla podsumowania i kroniki PDF); widoczność jak w Kronice
export function turnData(T) {
  const { from, to, st } = turnWindow(T), inT = t => t != null && turnOfTime(t, st) === T, me = myCountry(), gm = realGM();
  const news = Object.values(S.data.news).filter(n => inT(n.gameTime) && (n.gameTime || 0) <= gameNow());
  const battles = news.filter(n => n.battle);
  const breaking = news.filter(n => !n.battle && (n.breaking || n.special) && !n.system);
  const terr = Object.values(S.data.territories).filter(t => t.turn === T || inT(t.since));
  const treaties = Object.values(S.data.treaties).filter(t => inT(t.signedAt));
  const blocs = Object.values(S.data.blocs || {}).filter(b => inT(b.gameTime));
  const chron = Object.values(S.data.history).filter(e => e.turn === T && !e.system && (gm || !e.secret || (e.countries || []).includes(me)));
  // zmiany statystyk: migawka T vs T-1 (albo stan obecny, jeśli tura trwa)
  const changes = [];
  const prev = snapTurns().filter(t => t < T).pop(), hasT = snapTurns().includes(T);
  if (prev != null) customFields().filter(f => gm || f.public || me).forEach(f => countriesSorted().forEach(c => {
    const a = statNum(histVal(prev, f, c.id));
    const bRaw = hasT ? histVal(T, f, c.id) : f.public ? c.custom?.[f.key] : S.data.countryPrivate[c.id]?.custom?.[f.key], b = statNum(bRaw);
    if (a != null && b != null && a !== b) changes.push({ f, c, a: histVal(prev, f, c.id), b: bRaw, pct: a ? (b - a) / Math.abs(a) * 100 : null });
  }));
  changes.sort((x, y) => Math.abs(y.pct ?? 0) - Math.abs(x.pct ?? 0));
  return { from, to, battles, breaking, terr, treaties, blocs, chron, changes };
}
export const allTurns = () => [...new Set([...snapTurns(), turn(), ...Object.values(S.data.history).map(e => e.turn).filter(Boolean)])].sort((a, b) => a - b);

export function turnSummary(T = turn()) {
  const { from, to, battles, breaking, terr, treaties, blocs, chron, changes } = turnData(T);
  const flags = l => (l || []).map(cFlag).join('');
  const sec = (title, items, fmt) => items.length ? h('section', h('h3', `${title} (${items.length})`), h('ul', items.map(i => h('li', fmt(i))))) : null;
  const resWord = b => b.result === 'a' ? `zwycięstwo ${flags(b.sideA)}` : b.result === 'b' ? `zwycięstwo ${flags(b.sideB)}` : b.result === 'draw' ? 'nierozstrzygnięta' : 'walki trwają';
  const lines = [];   // wersja tekstowa (plik / gazeta)
  const body = h('div.tsum',
    h('p.muted', `${isFinite(from) ? G.fmtDate(from) : 'początek'} → ${isFinite(to) ? G.fmtDate(to) : 'teraz'}`),
    sec('💥 Bitwy', battles, n => { lines.push(`Bitwa: ${n.battle.name} — ${resWord(n.battle)}`); return [h('b', n.battle.name), ` · ${flags(n.battle.sideA)} ⚔️ ${flags(n.battle.sideB)} · ${resWord(n.battle)}`]; }),
    sec('⚔️ Zmiany terytorialne', terr, t => { lines.push(`Teren: ${cName(t.controller)} — ${t.label} (${t.status})`); return `${cFlag(t.controller)} ${cName(t.controller)} → ${t.label} · ${TERR_NOUN[t.status] || t.status}`; }),
    sec('📜 Traktaty', treaties, t => { lines.push(`Traktat: ${t.name} (${(t.parties || []).map(cName).join(', ')})`); return `${t.secret ? '🔒 ' : ''}${t.name} · ${flags(t.parties)} · ${tr('treaty', t.type)}`; }),
    sec('🏛 Nowe sojusze i organizacje', blocs, b => { lines.push(`Sojusz: ${b.name}`); return `${b.name} · ${(b.members || []).length} członków`; }),
    sec('🔴 Najważniejsze wiadomości', breaking.slice(0, 12), n => { lines.push(`News: ${n.headline}`); return n.headline; }),
    sec('📈 Największe zmiany statystyk', changes.slice(0, 15), x => { lines.push(`${cName(x.c.id)}: ${x.f.label} ${x.a} → ${x.b}`); return [`${x.c.flag} ${x.c.name} · ${x.f.label}: ${x.a} → `, h('b', String(x.b)), x.pct != null ? h('span.' + (x.pct >= 0 ? 'up' : 'down'), ` ${x.pct >= 0 ? '▲' : '▼'} ${Math.abs(x.pct).toFixed(1)}%`) : null]; }),
    sec('📖 Kronika', chron, e => { lines.push(`Kronika: ${e.text}`); return `${flags(e.countries)} ${e.text}`; }));
  const empty = !body.querySelector('section');
  if (empty) body.append(h('div.empty', 'W tej turze nic nie zapisano.'));
  const text = `PODSUMOWANIE TURY ${T}\n\n` + lines.map(l => '• ' + l).join('\n');
  const m = modal(`📋 Podsumowanie tury ${T}`, h('div',
    h('div.btn-row.wrap', h('small.muted', 'Tura:'), allTurns().map(n => h('button.chip' + (n === T ? '.on' : ''), { onclick: () => { m.close(); turnSummary(n); } }, String(n)))),
    body,
    h('div.btn-row', h('button.btn.sm', { onclick: () => download(`podsumowanie-tury-${T}.txt`, text, 'text/plain') }, '⬇ Pobierz tekst'),
      realGM() || myCountry() ? h('button.btn.sm', { onclick: () => { m.close(); import('./press.js').then(P => P.newspaper({ cfg: { headline: `PODSUMOWANIE TURY ${T}`, subheadline: lines[0] || '', body: lines.slice(0, 8).join('. ') } })); } }, '🗞️ Zrób z tego gazetę') : null)), { wide: true });
}

// ───────── powtórka na osi czasu ─────────
let replayTimer = null;
export function replayRange() {
  const t = [...Object.values(S.data.history).map(e => e.gameTime), ...Object.values(S.data.news).map(n => n.gameTime), ...Object.values(S.data.territories).map(x => x.since), ...Object.values(S.game.turnStarts || {})].filter(v => isFinite(v) && v > 0);
  const hi = gameNow(), lo = Math.max(Math.min(...t, hi - 30 * 86400000), hi - 20 * 365 * 86400000);
  return { lo, hi };
}
const turnAt = t => { const s = Object.entries(S.game.turnStarts || {}).map(([k, v]) => [+k, v]).sort((a, b) => a[0] - b[0]); let n = s.length ? s[0][0] - 1 || 1 : null; s.forEach(([k, v]) => { if (v <= t) n = k; }); return n; };
export function startReplay(refresh) {
  if (document.querySelector('#replaybar')) return stopReplay(refresh);
  const { lo, hi } = replayRange(), span = hi - lo;
  S.viewTime = lo;
  const label = h('b.rp-date'), slider = h('input', { type: 'range', min: 0, max: 1000, value: 0, 'aria-label': 'Czas powtórki', list: 'rp-turns' });
  const ticks = h('datalist#rp-turns', Object.values(S.game.turnStarts || {}).filter(v => v >= lo && v <= hi).map(v => h('option', { value: Math.round((v - lo) / span * 1000) })));
  const speeds = [['1 dzień/s', 86400000], ['1 tydz./s', 7 * 86400000], ['1 mies./s', 30 * 86400000], ['1 h/s', 3600000]];
  const speed = h('select', { 'aria-label': 'Tempo powtórki' }, speeds.map(([l, v]) => h('option', { value: v }, l)));
  const set = t => { S.viewTime = Math.min(hi, Math.max(lo, t)); slider.value = Math.round((S.viewTime - lo) / span * 1000); const n = turnAt(S.viewTime); label.textContent = `${G.fmtDT(S.viewTime)}${n ? ' · tura ' + n : ''}`; refresh(); };
  const play = h('button.btn.sm.primary', { onclick: () => { if (replayTimer) { clearInterval(replayTimer); replayTimer = null; play.textContent = '▶ Odtwórz'; return; } if (S.viewTime >= hi) set(lo); play.textContent = '❚❚ Pauza'; replayTimer = setInterval(() => { set(S.viewTime + (+speed.value) / 5); if (S.viewTime >= hi) play.click(); }, 200); } }, '▶ Odtwórz');
  slider.oninput = () => set(lo + (+slider.value / 1000) * span);
  const bar = h('div#replaybar', { role: 'region', 'aria-label': 'Powtórka' }, h('span.rp-tag', '⏪ POWTÓRKA'), label, play, slider, ticks, speed, h('button.btn.sm', { onclick: () => stopReplay(refresh) }, 'Zakończ'));
  document.querySelector('#main').append(bar); document.body.classList.add('replay');
  set(lo);
}
export function stopReplay(refresh) {
  clearInterval(replayTimer); replayTimer = null; S.viewTime = null;
  document.querySelector('#replaybar')?.remove(); document.body.classList.remove('replay'); refresh();
}
