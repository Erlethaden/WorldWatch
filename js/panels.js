// Panele boczne: Feed, Kraj, Dyplomacja, Wywiad, Kronika
import { S, G, run, now, newId, gameNow, turn, realGM, isAdmin, myCountry, persp, gmView, canEdit, feedItems, unitViews, statusOf,
  cFlag, cName, cDem, cColor, country, countriesSorted, userOfCountry, charView, charsOf, charLocation, writeChar,
  NEWS_CATS, RELIABILITY, RELATIONS, REL_COLOR, TREATY_TYPES, tr, trOpts, statusChip, KINDS, VIS } from './store.js';
import { h, esc, form, modal, confirmBox, toast, chip, kv, download, img, searchable } from './ui.js';
import { select, TERR_ICON, TERR_NOUN } from './map.js';
import * as U from './units.js';
import * as P from './press.js';
import { GM, customFields, statSections } from './gm.js';
import { blocsSection, blocsOf } from './blocs.js';
import { battleForm, battleBlock } from './battle.js';
import { statNum, deltaOf, statChart, turnSummary } from './turns.js';

const goTab = t => window.dispatchEvent(new CustomEvent('ww:tab', { detail: t }));
const ctxCountry = () => { const p = persp(); return p && p !== 'gm' ? p : null; };
const relBadge = r => h('span.rel', { style: { '--c': REL_COLOR[r] || '#888' } }, tr('relation', r || 'Neutral'));
const TSTAT = { active: 'obowiązuje', proposed: 'proponowany', ended: 'wygasł' };
const PSTAT = { pending: 'OCZEKUJE', accepted: 'PRZYJĘTA', rejected: 'ODRZUCONA', countered: 'KONTRPROPOZYCJA', sent: '' };
const relKey = (a, b) => [a, b].sort().join('__');
export const relationOf = (a, b) => S.data.relations[relKey(a, b)]?.status || 'Neutral';
export const withFlags = n => /^[\u{1F1E6}-\u{1F1FF}]/u.test(n.headline || '') ? n.headline : `${(n.countries || []).map(cFlag).join('')} ${n.headline}`.trim();
const relClass = { Confirmed: 'ok', 'Highly reliable': 'ok', Reliable: 'ok2', Unverified: 'warn', Rumor: 'warn', 'False information': 'bad' };

// ═════════════════════════ FEED ═════════════════════════
let feedFilter = 'all';
const feed = {
  render() {
    const items = feedItems().filter(i => feedFilter === 'all' || (feedFilter === 'news' ? i.type === 'news' : feedFilter === 'move' ? i.type === 'move' : feedFilter === 'intel' ? i.type === 'intel' || i.type === 'msg' : true));
    const unread = S.unread?.size || 0;
    return h('div.feed',
      h('div.feed-head', h('div', h('h2', 'Aktualności'), unread ? h('div.new', `${unread} ${unread === 1 ? 'nowe zdarzenie' : unread < 5 ? 'nowe zdarzenia' : 'nowych zdarzeń'}`) : null),
        h('div.btn-row', realGM() ? [h('button.btn.sm.primary', { onclick: () => feed.create('news') }, '🔴 Wiadomość'), h('button.btn.sm', { onclick: () => feed.create('paper') }, '🗞️'), h('button.btn.sm', { onclick: () => feed.create('card') }, '🖼️')] : myCountry() ? [h('button.btn.sm', { onclick: () => feed.create('statement') }, '📢 Oświadczenie'), h('button.btn.sm', { title: 'Gazeta', 'aria-label': 'Gazeta', onclick: () => feed.create('paper') }, '🗞️'), h('button.btn.sm', { title: 'Grafika wydarzenia', 'aria-label': 'Grafika wydarzenia', onclick: () => feed.create('card') }, '🖼️')] : null)),
      h('div.filters', [['all', 'Wszystko'], ['news', 'Wiadomości'], ['move', 'Ruchy'], ['intel', 'Wywiad / prywatne']].map(([k, l]) => h('button.chip' + (feedFilter === k ? '.on' : ''), { onclick: () => { feedFilter = k; goTab('feed'); } }, l))),
      items.length ? items.map(feedItem) : h('div.empty', 'Cisza w eterze. Jeszcze nic się nie wydarzyło.'));
  },
  create(kind) {
    if (kind === 'news') return newsForm();
    if (kind === 'statement') return newsForm(null, true);
    if (kind === 'paper') return P.newspaper();
    if (kind === 'card') return P.eventCard();
  }
};
function feedItem(i) {
  const unread = S.unread?.has(i.id);
  if (i.type === 'news') {
    const n = i.news, leak = ['Unverified', 'Rumor', 'False information'].includes(n.reliability);
    return h('article.news' + (n.breaking ? '.breaking' : '') + (unread ? '.unread' : '') + (i.future ? '.future' : ''), { onclick: () => openNews(n.id) },
      h('div.news-top', n.breaking ? h('span.brk', '🔴 PILNE') : leak ? h('span.leak', n.leak ? '🔴 NIEPOTWIERDZONY PRZECIEK' : '⚠ NIEPOTWIERDZONE') : h('span.cat', tr('news', n.category) || 'Wiadomość'),
        n.official ? chip('OFICJALNE OŚWIADCZENIE', 'off') : null, n.press ? chip(`🗞️ prasa: ${cFlag(n.authorCountry)} ${cName(n.authorCountry)}`) : null, i.future ? chip('⏳ zaplanowane ' + G.fmtDT(n.gameTime), 'warn') : null, !n.audienceAll ? chip('🔒 ' + (n.audience || []).map(cFlag).join(''), 'priv') : null,
        h('time', G.fmtDT(n.gameTime))),
      h('h4', withFlags(n)),
      n.body ? h('p', n.body.length > 220 ? n.body.slice(0, 220) + '…' : n.body) : null,
      h('div.news-foot', n.reliability ? h('span.relia.' + (relClass[n.reliability] || ''), `Wiarygodność: ${tr('reliability', n.reliability)}${n.reliabilityPct != null ? ' · ' + n.reliabilityPct + '%' : ''}`) : null, n.paper ? chip('🗞️ ' + (n.paper.outlet || 'Pierwsza strona')) : null, n.card ? chip('🖼️ grafika') : null));
  }
  return h('div.fitem.' + i.type + (unread ? '.unread' : '') + (i.important ? '.imp' : ''), { onclick: () => i.unitKey ? select(i.unitKey, true) : i.type === 'msg' ? (diplo.openChannel(i.from), goTab('diplo')) : null },
    h('span.ic', i.icon), h('span.tx', i.text), h('time', G.fmtTime(i.t)));
}

export async function newsForm(n, statement) {
  const gm = realGM(), C = myCountry();
  const isNew = !n; n = n || { category: statement ? 'Politics' : 'Politics', reliability: 'Confirmed', audienceAll: true, audience: [], countries: C ? [C] : [], gameTime: gameNow() };
  const cOpts = countriesSorted().map(c => [c.id, `${c.flag} ${c.name}`]);
  const truth = gm ? S.data.gmNotes['news_' + n.id]?.truth : null;
  const v = await form(statement ? `📢 Oświadczenie — ${cFlag(C)} ${cName(C)}` : isNew ? '🔴 Nowa wiadomość' : 'Edycja wiadomości', [
    { k: 'headline', label: 'Nagłówek', value: n.headline, req: true, full: true, ph: 'Szwecja zapowiada rozbudowę marynarki wojennej' },
    { k: 'body', label: 'Treść', type: 'textarea', value: n.body, rows: 4, full: true },
    { k: 'category', label: 'Kategoria', type: 'select', value: n.category, options: trOpts('news', NEWS_CATS) },
    ...(gm ? [
      { k: 'reliability', label: 'Wiarygodność (widoczna dla graczy)', type: 'select', value: n.reliability, options: trOpts('reliability', RELIABILITY) },
      { k: 'reliabilityPct', label: 'Wiarygodność %', type: 'number', value: n.reliabilityPct, help: 'opcjonalnie, np. 32' },
      { k: 'leak', label: 'Oznacz jako przeciek (LEAK)', type: 'check', value: n.leak },
      { k: 'breaking', label: 'PILNA WIADOMOŚĆ (breaking)', type: 'check', value: n.breaking },
      { k: 'special', label: 'Wydanie specjalne (na cały ekran u odbiorców)', type: 'check', value: n.special },
      { k: 'truth', label: 'Prawda (tylko GM)', type: 'select', value: truth || 'true', options: [['true', 'Prawdziwa'], ['partial', 'Częściowo prawdziwa'], ['false', 'Fałszywa / dezinformacja']] },
      { k: 'countries', label: 'Dotyczy państw', type: 'multi', value: n.countries, options: cOpts },
      { k: 'audienceAll', label: 'Widoczne dla wszystkich', type: 'check', value: n.audienceAll },
      { k: 'audience', label: 'Tylko dla państw', type: 'multi', value: n.audience, options: cOpts, show: x => !x.audienceAll },
      { k: 'gameTime', label: 'Czas publikacji (przyszłość = zaplanowane)', type: 'datetime', value: n.gameTime, now: gameNow },
      { k: 'chronicle', label: 'Dodaj do kroniki świata', type: 'check', value: false, show: () => isNew }
    ] : []),
    { k: 'place', label: 'Miejsce (pinezka na mapie)', type: 'place', value: n.place },
    { k: 'imageUrl', label: 'Obraz (opcjonalnie)', type: 'image', value: n.imageUrl, full: true }
  ], { wide: true, submit: isNew ? 'Publikuj' : 'Zapisz' });
  if (!v) return;
  const id = n.id || newId();
  const doc = { ...n, ...v, place: v.place ? { name: v.place.name, lat: +v.place.lat, lon: +v.place.lon } : null, createdAt: n.createdAt || now(), gameTime: v.gameTime || n.gameTime || gameNow() };
  delete doc.id; delete doc.truth; delete doc.chronicle;
  if (!gm) Object.assign(doc, { authorCountry: C, source: 'player', official: true, audienceAll: true, audience: [], countries: [C], reliability: 'Confirmed', breaking: false, special: false });
  else { doc.source = 'gm'; if (doc.audienceAll) doc.audience = []; }
  await run(isNew ? 'PUBLISH_NEWS' : 'UPDATE_NEWS', v.headline, w => {
    w.set('news/' + id, doc);
    if (gm) w.set('gmNotes/news_' + id, { truth: v.truth });
    if (gm && v.chronicle) w.set('history/' + newId(), { turn: turn(), gameTime: doc.gameTime, text: v.headline, countries: doc.countries || [], createdAt: now() });
  });
}

export function openNews(id) {
  const n = S.data.news[id]; if (!n) return;
  const gm = realGM(), truth = gm ? S.data.gmNotes['news_' + id]?.truth : null;
  const m = modal(n.breaking ? '🔴 PILNA WIADOMOŚĆ' : tr('news', n.category) || 'Wiadomość', h('div.article',
    n.paper ? h('div.paper-wrap', P.renderPaper(n.paper)) : null,
    n.card ? h('div.paper-wrap', P.renderCard(n.card)) : null,
    !n.paper ? [h('h2', withFlags(n)), h('div.muted', `${G.fmtDT(n.gameTime)} UTC · ${tr('news', n.category)}`), n.imageUrl ? img(n.imageUrl, '.news-img') : null, battleBlock(n), n.body ? h('p', n.body) : null] : null,
    h('div.news-foot', n.reliability ? h('span.relia.' + (relClass[n.reliability] || ''), `Wiarygodność: ${tr('reliability', n.reliability)}${n.reliabilityPct != null ? ' · ' + n.reliabilityPct + '%' : ''}`) : null, n.official ? chip('OFICJALNE OŚWIADCZENIE — ' + cName(n.authorCountry), 'off') : null, n.press ? chip(`🗞️ prasa: ${cFlag(n.authorCountry)} ${cName(n.authorCountry)} (publikacja gracza)`) : null),
    gm ? h('div.gm-box', h('b', 'GM: '), `prawda: ${truth === 'false' ? '❌ fałsz' : truth === 'partial' ? '◐ częściowo' : '✅ prawda'} · widzą: ${n.audienceAll ? 'wszyscy' : (n.audience || []).map(cName).join(', ')}`) : null,
    h('div.btn-row.wrap',
      n.place ? h('button.btn.sm', { onclick: () => { m.close(); import('./map.js').then(M => M.flyTo(n.place.lat, n.place.lon, 6)); } }, '📍 Na mapie') : null,
      gm ? [h('button.btn.sm', { onclick: () => { m.close(); n.battle ? battleForm({ ...n, id }) : newsForm({ ...n, id }); } }, '✏️ Edytuj'),
        h('button.btn.sm', { onclick: () => { m.close(); P.newspaper({ newsId: id }); } }, '🗞️ Gazeta z tego'),
        h('button.btn.sm', { onclick: () => { m.close(); P.eventCard({ newsId: id }); } }, '🖼️ Grafika'),
        h('button.btn.sm', { onclick: () => run('ADD_CHRONICLE', n.headline, w => w.set('history/' + newId(), { turn: turn(), gameTime: n.gameTime, text: n.headline, countries: n.countries || [], createdAt: now() })) }, '📜 Do kroniki'),
        isAdmin() && h('button.btn.sm.danger', { onclick: async () => { if (await confirmBox('Usunąć wiadomość?', { danger: true })) { m.close(); run('DELETE_NEWS', n.headline, w => { w.del('news/' + id); w.del('gmNotes/news_' + id); }); } } }, '🗑')] : null)
  ), { wide: !!(n.paper || n.card) });
}

// ═════════════════════════ KRAJ ═════════════════════════
let openCountry = null;
const countryPanel = {
  open(cid) { openCountry = cid; countryMode = 'list'; },
  render() {
    const modes = h('div.filters', [['list', '🏛️ Państwa'], ['rank', '🏆 Ranking']].map(([k, l]) => h('button.chip' + (countryMode === k ? '.on' : ''), { onclick: () => { countryMode = k; goTab('country'); } }, l)));
    if (countryMode === 'rank') return h('div', modes, leaderboard());
    const C = openCountry || ctxCountry();
    const list = countriesSorted();
    const picker = h('div.country-picker', h('select', { onchange: e => { openCountry = e.target.value || null; goTab('country'); } }, h('option', { value: '' }, ctxCountry() ? `${cFlag(ctxCountry())} Moje państwo` : '— wybierz państwo —'), list.map(c => h('option', { value: c.id, selected: c.id === openCountry }, `${c.flag} ${c.name}`))));
    if (!C) return h('div', modes, picker, h('div.country-grid', list.map(c => h('button.ccard', { style: { '--c': c.color }, onclick: () => { openCountry = c.id; goTab('country'); } }, h('span.flag', c.flag), h('b', c.name), h('small', userOfCountry(c.id).map(u => u.displayName).join(', ') || 'NPC')))));
    return h('div', modes, picker, dashboard(C));
  }
};

// ───────── RANKING: porównanie państw w polach statystyk ─────────
let countryMode = 'list', rankKey = null, rankAsc = false;
function statVal(c, f) {
  if (f.public) return c.custom?.[f.key];
  const priv = S.data.countryPrivate[c.id];   // niejawne: GM widzi wszystkie, gracz tylko swoje
  return priv ? priv.custom?.[f.key] : undefined;
}
const arrow = (f, r) => { if (r.hidden || r.n == null) return null; const d = deltaOf(f, r.c.id, r.raw); if (!d || !d.d) return null;
  return h('small.' + (d.d > 0 ? 'up' : 'down'), { title: `od tury ${d.T}` }, ` ${d.d > 0 ? '▲' : '▼'}${d.pct != null ? Math.abs(d.pct).toFixed(Math.abs(d.pct) < 10 ? 1 : 0) + '%' : ''}`); };
function leaderboard() {
  const gm = realGM(), me = myCountry(), fields = customFields().filter(f => gm || f.public || me);
  const list = countriesSorted();
  if (!fields.length) return h('div.empty', 'Brak pól statystyk do porównania. Admin dodaje je w GM → System → 🧩 Pola państw.');
  const f = fields.find(x => x.key === rankKey) || fields[0]; rankKey = f.key;
  const rows = list.map(c => { const raw = statVal(c, f), n = statNum(raw); return { c, raw, n, hidden: raw === undefined && !f.public }; });
  const known = rows.filter(r => r.n != null).sort((a, b) => rankAsc ? a.n - b.n : b.n - a.n), rest = rows.filter(r => r.n == null);
  const max = Math.max(...known.map(r => Math.abs(r.n)), 0) || 1;
  const row = (r, i) => h('div.rk-row' + (r.c.id === me ? '.me' : ''), { style: { '--c': r.c.color || '#3fa7ff' } },
    h('span.rk-pos', r.n != null ? String(i + 1) : '–'), h('span.rk-name', `${r.c.flag} ${r.c.name}`),
    h('span.rk-bar', r.n != null ? h('i', { style: { width: Math.max(2, Math.abs(r.n) / max * 100) + '%', background: r.c.color || '#3fa7ff' } }) : null),
    h('b.rk-val', r.hidden ? '🔒' : r.raw ?? '—', arrow(f, r)));
  // tabela wszystkich pól (przewijana w poziomie)
  const cols = fields, cell = (c, x) => { const v = statVal(c, x); return v === undefined && !x.public ? '🔒' : v ?? '—'; };
  return h('div.rank',
    h('div.rk-controls',
      h('select', { 'aria-label': 'Statystyka', onchange: e => { rankKey = e.target.value; goTab('country'); } }, fields.map(x => h('option', { value: x.key, selected: x.key === f.key }, `${x.label}${x.public ? '' : ' 🔒'}`))),
      h('button.btn.sm', { title: 'Odwróć kolejność', onclick: () => { rankAsc = !rankAsc; goTab('country'); } }, rankAsc ? '↑ rosnąco' : '↓ malejąco')),
    !gm && !f.public ? h('p.help', 'Pole niejawne: widzisz tylko wartość swojego państwa.') : null,
    h('div.rk-list', known.map(row), rest.map(r => row(r, 0))),
    h('h3', `📈 Historia: ${f.label}`),
    statChart(f, f.public || gm ? list : list.filter(c => c.id === me), c => statVal(c, f)) || h('p.help', 'Brak migawek. Stan statystyk zapisuje się automatycznie na koniec każdej tury (GM → Tury).'),
    h('h3', 'Porównanie wszystkich pól'),
    h('div.table-wrap', h('table.tbl.rk-table',
      h('thead', h('tr', h('th', 'Państwo'), cols.map(x => h('th', { role: 'button', tabIndex: 0, onclick: () => { rankKey = x.key; goTab('country'); }, title: 'Pokaż ranking' }, x.label + (x.public ? '' : ' 🔒'))))),
      h('tbody', list.map(c => h('tr' + (c.id === me ? '.me' : ''), h('td', `${c.flag} ${c.name}`), cols.map(x => h('td' + (x.key === f.key ? '.on' : ''), cell(c, x)))))))),
    h('p.help', gm ? 'Widok GM: widzisz wszystkie pola, także niejawne.' : 'Pola z 🔒 są niejawne: znasz tylko własne wartości. Ranking liczy się z liczb w polach (np. „10,6 mln”, „82%”).'));
}
function dashboard(cid) {
  const c = country(cid); if (!c) return h('div.empty', 'Brak państwa');
  const priv = S.data.countryPrivate[cid], mine = canEdit(cid), gm = realGM();
  const g = c.government || {};
  const players = userOfCountry(cid);
  return h('div.dash',
    h('div.dash-head', { style: { '--c': c.color } }, h('span.bigflag', c.flag), h('div', h('h2', (c.official || c.name).toUpperCase()), h('div.muted', `Stolica: ${c.capital?.name || '—'} · Gracze: ${players.map(p => p.displayName).join(', ') || 'NPC'}`)),
      gm ? h('div.btn-col', h('button.btn.sm', { onclick: () => GM.editCountry(cid) }, '✏️ Profil'), h('button.btn.sm', { onclick: () => GM.editStats(cid) }, '📊 Statystyki')) : null),
    h('section', h('h3', 'Władze'), kv('Tag', c.tag || c.iso2 || '—'), kv('Ustrój', g.system || '—'), kv('Partia rządząca', g.rulingParty || '—'), kv(g.headTitle || 'Głowa państwa', g.head || '—'), kv('Szef rządu', g.headOfGov || '—')),
    !priv ? h('section', h('p.muted', '🔒 Statystyki tego państwa są niejawne.')) : null,
    statSections().map(([title, fields]) => {
      // pola dodane przez admina (jawne z profilu państwa, niejawne z części prywatnej)
      const rows = fields.filter(f => f.public || priv).map(f => [f.label, String((f.public ? c.custom?.[f.key] : priv?.custom?.[f.key]) ?? '').trim() || '—']);
      return rows.length ? h('section', h('h3', title), h('div.stat-grid', rows.map(([l, v]) => h('div.stat', h('small', l), h('b', String(v)))))) : null;
    }),
    priv ? h('section', h('h3', 'Wywiad'), kv('Poziom wywiadu', `${priv.intelLevel || '—'}/5`)) : null,
    h('section', h('h3', 'Dyplomacja'),
      h('div.rel-list', countriesSorted().filter(o => o.id !== cid).map(o => { const r = relationOf(cid, o.id); return r === 'Neutral' ? null : h('div.rel-row', `${o.flag} ${o.name}`, relBadge(r)); })),
      blocsOf(cid).length ? h('div.treaty-mini', blocsOf(cid).map(b => h('div', `🏛 ${b.secret ? '🔒 ' : ''}${b.name}${b.tag ? ` (${b.tag})` : ''} · ${b.type || ''}`))) : null,
      h('div.treaty-mini', Object.values(S.data.treaties).filter(t => (t.parties || []).includes(cid) && t.status !== 'ended').map(t => h('div', `${t.secret ? '🔒 ' : '📜 '}${t.name} — ${t.parties.map(cFlag).join('')} (${TSTAT[t.status] || t.status})`)))),
    priv ? projectsSection(cid, priv, mine) : null,
    territorySection(cid),
    charsSection(cid, mine),
    unitsSection(cid),
    priv && (mine || gm) ? h('section', h('h3', 'Notatki'), h('p.pre', priv.notes || '—'), h('button.btn.sm', { onclick: async () => { const v = await form('Notatki państwa', [{ k: 'notes', label: 'Notatki', type: 'textarea', rows: 8, value: priv.notes }]); if (v) run('UPDATE_NOTES', cName(cid), w => w.merge('countryPrivate/' + cid, { notes: v.notes })); } }, '✏️')) : null
  );
}
function projectsSection(cid, priv, mine) {
  const projects = priv.projects || [];
  const save = (list, label) => run('UPDATE_PROJECTS', `${cName(cid)} ${label}`, w => w.merge('countryPrivate/' + cid, { projects: list }));
  return h('section', h('h3', 'Projekty narodowe'),
    projects.length ? projects.map((p, idx) => {
      const done = (p.phases || []).filter(x => x.done).length, tot = (p.phases || []).length, pct = tot ? Math.round(done / tot * 100) : (p.progress || 0);
      return h('div.project', h('div.pj-head', h('b', `${p.secrecy === 'Secret' ? '🔒 ' : ''}${p.name}`), h('span.muted', `${pct}%`), mine ? h('span.pj-actions', h('button.btn.xs', { onclick: () => projectForm(cid, p, idx) }, '✏️'), h('button.btn.xs', { onclick: async () => { if (await confirmBox(`Usunąć projekt ${p.name}?`, { danger: true })) save(projects.filter((_, i) => i !== idx), 'delete'); } }, '🗑')) : null),
        h('div.pbar', h('div', { style: { width: pct + '%' } })),
        p.desc ? h('p.muted', p.desc) : null,
        h('div.phases', (p.phases || []).map((ph, j) => h('label.phase' + (ph.done ? '.done' : ''), h('input', { type: 'checkbox', checked: !!ph.done, disabled: !mine, onchange: e => { const list = structuredClone(projects); list[idx].phases[j].done = e.target.checked; save(list, `${p.name}: ${ph.name}`); } }), ` Faza ${roman(j + 1)} — ${ph.name}`))),
        h('div.pj-meta', [['Koszt', p.cost], ['Czas', p.duration], ['Wymagania', p.requirements], ['Efekty', p.effects], ['Ryzyko', tr('risk', p.risk)], ['Tajność', tr('secrecy', p.secrecy)]].filter(x => x[1]).map(([k, v]) => h('span', h('small', k + ': '), v))));
    }) : h('p.muted', 'Brak projektów.'),
    mine ? h('button.btn.sm', { onclick: () => projectForm(cid) }, '+ Nowy projekt') : null);
}
const roman = n => ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'][n - 1] || n;
async function projectForm(cid, p = {}, idx = -1) {
  const v = await form(idx < 0 ? 'Nowy projekt narodowy' : `Projekt: ${p.name}`, [
    { k: 'name', label: 'Nazwa', value: p.name, req: true, ph: 'PROJEKT WAZA' }, { k: 'desc', label: 'Opis', type: 'textarea', value: p.desc },
    { k: 'phases', label: 'Fazy (jedna na linię)', type: 'textarea', rows: 6, value: (p.phases || []).map(x => x.name).join('\n'), ph: 'Modernizacja gospodarki\nRozbudowa przemysłu\nModernizacja marynarki' },
    { k: 'cost', label: 'Koszt', value: p.cost }, { k: 'duration', label: 'Czas trwania', value: p.duration }, { k: 'requirements', label: 'Wymagania', value: p.requirements },
    { k: 'effects', label: 'Efekty', value: p.effects }, { k: 'risk', label: 'Ryzyko', type: 'select', value: p.risk || 'Low', options: trOpts('risk', ['Low', 'Medium', 'High', 'Extreme']) }, { k: 'secrecy', label: 'Tajność', type: 'select', value: p.secrecy || 'Public', options: trOpts('secrecy', ['Public', 'Restricted', 'Secret']) }
  ], { wide: true });
  if (!v) return;
  const old = p.phases || [];
  const phases = v.phases.split('\n').map(s => s.trim()).filter(Boolean).map(name => ({ name, done: !!old.find(o => o.name === name)?.done }));
  const list = structuredClone(S.data.countryPrivate[cid]?.projects || []);
  const np = { ...p, ...v, phases, id: p.id || newId() };
  if (idx < 0) list.push(np); else list[idx] = np;
  await run('UPDATE_PROJECTS', `${cName(cid)}: ${v.name}`, w => w.merge('countryPrivate/' + cid, { projects: list }));
}
function territorySection(cid) {
  const T = Object.values(S.data.territories), held = T.filter(t => t.controller === cid), lost = T.filter(t => t.previous === cid && t.controller !== cid);
  if (!held.length && !lost.length) return null;
  const row = (t, who) => h('div.rel-row', h('span', `${TERR_ICON[t.status] || ''} ${t.label}`), h('small.muted', `${who} · ${TERR_NOUN[t.status] || t.status}`));
  const pup = t => t.status === 'puppet';
  return h('section', h('h3', 'Terytorium'), held.map(t => row(t, pup(t) ? 'państwo zależne' : t.previous ? 'zdobyte od ' + cFlag(t.previous) + ' ' + cName(t.previous) : 'kontrolowane')), lost.map(t => row(t, pup(t) ? 'rządzi nami ' + cFlag(t.controller) + ' ' + cName(t.controller) : 'utracone na rzecz ' + cFlag(t.controller) + ' ' + cName(t.controller))));
}
function charsSection(cid, mine) {
  const chars = charsOf(cid);
  return h('section', h('h3', 'Postacie'),
    chars.length ? chars.map(c => {
      const loc = charLocation(c.id);
      return h('div.char', h('div.avatar', c.avatar ? img(c.avatar) : c.icon || '👤'),
        h('div.char-body', h('b', c.name), h('small', `${c.title || ''}${c.age ? ' · ' + c.age : ''}`), h('small.loc', loc ? `📍 ${loc.text}` : '📍 nieznane', c.status && c.status !== 'Active' ? ` · ${tr('charStatus', c.status)}` : ''), c.full && c.mission ? h('small.mission', '🎯 ' + c.mission) : null),
        h('div.btn-col', loc?.unit ? h('button.btn.xs', { onclick: () => select(loc.unit.key, true) }, '🗺') : null, realGM() || (mine && c.full) ? h('button.btn.xs', { onclick: () => GM.editChar(c) }, '✏️') : null));
    }) : h('p.muted', 'Brak postaci.'),
    realGM() ? h('button.btn.sm', { onclick: () => GM.editChar({ countryId: cid }) }, '+ Postać') : null);
}
function unitsSection(cid) {
  const us = unitViews().filter(v => v.countryId === cid && v.src === 'full');
  if (!us.length) return null;
  return h('section', h('h3', 'Siły i obiekty'), us.map(v => { const st = statusChip(v); return h('div.asset', { onclick: () => select(v.key, true) }, h('span', KINDS[v.kind]?.en || v.kind), h('b', v.label), h('span.status.' + st.cls, st.text)); }));
}

// ═════════════════════════ DYPLOMACJA ═════════════════════════
let channel = null, gmSide = null;
const diplo = {
  noRefreshWhileTyping: true,
  openChannel(c) { channel = c; },
  render() {
    const gm = realGM(), me = gm ? (gmSide || ctxCountry()) : myCountry();
    const others = countriesSorted().filter(c => c.id !== me);
    const side = gm ? h('div.country-picker', h('span.muted', 'Działaj jako: '), h('select', { onchange: e => { gmSide = e.target.value || null; channel = null; goTab('diplo'); } }, h('option', { value: '' }, '— tylko podgląd GM —'), countriesSorted().map(c => h('option', { value: c.id, selected: c.id === me }, `${c.flag} ${c.name}`)))) : null;
    return h('div.diplo', side,
      me ? h('section', h('h3', `${cFlag(me)} Relacje`), h('div.rel-table', others.map(o => {
        const r = relationOf(me, o.id);
        return h('div.rel-row', h('span', `${o.flag} ${o.name}`), canEdit(me) ? h('select.rel-sel', { style: { '--c': REL_COLOR[r] }, onchange: e => setRelation(me, o.id, e.target.value) }, RELATIONS.map(x => h('option', { value: x, selected: x === r }, tr('relation', x)))) : relBadge(r));
      }))) : gm ? allRelations() : null,
      blocsSection(me),
      treatiesSection(me),
      me ? channels(me, others) : gm ? allChannels() : null);
  }
};
async function setRelation(a, b, status) {
  await run('SET_RELATION', `${cName(a)} ↔ ${cName(b)}: ${status}`, w => w.set('relations/' + relKey(a, b), { parties: [a, b].sort(), status, updatedAt: now(), gameTime: gameNow() }));
}
function allRelations() {
  const rs = Object.values(S.data.relations).filter(r => r.status !== 'Neutral');
  return h('section', h('h3', 'Wszystkie relacje'), rs.length ? rs.map(r => h('div.rel-row', h('span', `${cFlag(r.parties[0])} ${cName(r.parties[0])} ↔ ${cFlag(r.parties[1])} ${cName(r.parties[1])}`), h('select.rel-sel', { style: { '--c': REL_COLOR[r.status] }, onchange: e => setRelation(r.parties[0], r.parties[1], e.target.value) }, RELATIONS.map(x => h('option', { value: x, selected: x === r.status }, tr('relation', x)))))) : h('p.muted', 'Wszyscy neutralni. Wybierz państwo powyżej, by ustawić relacje.'));
}
function treatiesSection(me) {
  const list = Object.values(S.data.treaties).filter(t => !me || realGM() && !gmSide || (t.parties || []).includes(me) || !t.secret).sort((a, b) => (b.signedAt || 0) - (a.signedAt || 0));
  return h('section', h('h3', '📜 Traktaty i porozumienia'),
    list.length ? list.map(t => h('div.treaty.' + (t.status || 'active'), h('div', h('b', `${t.secret ? '🔒 ' : ''}${t.name}`), h('small', ` ${tr('treaty', t.type)} · ${t.parties.map(cFlag).join(' ')} · ${TSTAT[t.status] || t.status}${t.signedAt ? ' · ' + G.fmtDate(t.signedAt) : ''}`)), t.text ? h('p.muted', t.text) : null,
      realGM() ? h('div.btn-row', h('button.btn.xs', { onclick: () => treatyForm(t) }, '✏️'), t.status !== 'ended' ? h('button.btn.xs', { onclick: () => run('END_TREATY', t.name, w => w.merge('treaties/' + t.id, { status: 'ended' })) }, 'zakończ') : null, isAdmin() && h('button.btn.xs.danger', { onclick: async () => { if (await confirmBox(`Usunąć traktat ${t.name}?`, { danger: true })) run('DELETE_TREATY', t.name, w => w.del('treaties/' + t.id)); } }, '🗑')) : null)) : h('p.muted', 'Brak znanych traktatów.'),
    realGM() ? h('button.btn.sm', { onclick: () => treatyForm() }, '+ Traktat (GM)') : null);
}
async function treatyForm(t = {}) {
  const cOpts = countriesSorted().map(c => [c.id, `${c.flag} ${c.name}`]);
  const v = await form(t.id ? 'Edycja traktatu' : 'Nowy traktat', [
    { k: 'name', label: 'Nazwa', value: t.name, req: true }, { k: 'type', label: 'Typ', type: 'select', value: t.type, options: TREATY_TYPES },
    { k: 'parties', label: 'Strony', type: 'multi', value: t.parties || [], options: cOpts, req: true }, { k: 'secret', label: 'Tajny', type: 'check', value: t.secret },
    { k: 'status', label: 'Status', type: 'select', value: t.status || 'active', options: Object.entries(TSTAT) },
    { k: 'text', label: 'Treść / postanowienia', type: 'textarea', value: t.text }, { k: 'news', label: 'Ogłoś w newsach (jeśli jawny)', type: 'check', value: !t.id }, { k: 'chron', label: 'Dodaj do kroniki', type: 'check', value: !t.id }
  ], { wide: true });
  if (!v) return;
  const id = t.id || newId();
  await run(t.id ? 'UPDATE_TREATY' : 'CREATE_TREATY', v.name, w => {
    w.set('treaties/' + id, { name: v.name, type: v.type, parties: v.parties, secret: !!v.secret, status: v.status, text: v.text, signedAt: t.signedAt || gameNow(), createdAt: t.createdAt || now() });
    if (v.news && !v.secret) w.set('news/' + newId(), { headline: `${v.parties.map(cFlag).join('')} ${listNames(v.parties)} podpisują: ${v.name}`, body: v.text || '', category: 'Diplomacy', reliability: 'Confirmed', breaking: true, countries: v.parties, gameTime: gameNow(), createdAt: now(), audienceAll: true, audience: [], source: 'gm' });
    if (v.chron) w.set('history/' + newId(), { turn: turn(), gameTime: gameNow(), text: `${listNames(v.parties)} ${v.secret ? 'potajemnie ' : ''}podpisują: ${v.name} (${tr('treaty', v.type)}).`, countries: v.parties, createdAt: now(), secret: !!v.secret });
  });
}
const listNames = ids => { const n = ids.map(cName); return n.length > 1 ? n.slice(0, -1).join(', ') + ' i ' + n[n.length - 1] : n[0] || ''; };

function channels(me, others) {
  const msgs = Object.values(S.data.messages).filter(m => (m.parties || []).includes(me));
  const unreadFrom = new Set(msgs.filter(m => m.to === me && m.status === 'pending').map(m => m.from));
  if (!channel || channel === me) channel = null;
  const thread = channel ? msgs.filter(m => m.parties.includes(channel)).sort((a, b) => a.createdAt - b.createdAt) : [];
  return h('section.channels', h('h3', '🔒 Prywatne kanały dyplomatyczne'),
    h('div.chan-list', others.map(o => h('button.chip' + (channel === o.id ? '.on' : ''), { onclick: () => { channel = o.id; goTab('diplo'); } }, `${o.flag} ${o.name}`, unreadFrom.has(o.id) ? h('span.dot') : null))),
    channel ? h('div.thread',
      h('div.thread-head', `${cFlag(me)} ${cName(me)} → ${cFlag(channel)} ${cName(channel)}`, h('small.muted', ' · PRYWATNY KANAŁ DYPLOMATYCZNY')),
      thread.length ? thread.map(m => msgBubble(m, me)) : h('p.muted', 'Brak wiadomości. Zacznij rozmowę.'),
      composer(me, channel)) : h('p.muted', 'Wybierz państwo, aby otworzyć kanał.'));
}
function msgBubble(m, me) {
  const out = m.from === me, t = m.treaty;
  return h('div.msg' + (out ? '.out' : '.in') + '.' + (m.kind || 'message'),
    h('div.msg-meta', `${cFlag(m.from)} ${out ? 'Ty' : cName(m.from)} · ${G.fmtDT(m.gameTime)}`, m.kind === 'proposal' ? h('span.prop-st.' + m.status, ` ${PSTAT[m.status] ?? m.status}`) : null,
      isAdmin() && h('button.btn.xs.logdel', { title: 'Usuń (admin)', onclick: async () => { if (await confirmBox('Usunąć wiadomość z kanału?', { danger: true })) run('DELETE_MESSAGE', m.subject || m.id, w => w.del('messages/' + m.id)); } }, '✕')),
    m.subject ? h('b', m.subject) : null, h('p', m.text),
    t ? h('div.treaty-draft', `📜 ${t.name} — ${tr('treaty', t.type)}${t.secret ? ' · 🔒 tajne' : ''}`) : null,
    m.kind === 'proposal' && m.status === 'pending' && m.to === me && canEdit(me) ? h('div.btn-row',
      h('button.btn.sm.primary', { onclick: () => respond(m, 'accepted') }, 'Przyjmij'), h('button.btn.sm.danger', { onclick: () => respond(m, 'rejected') }, 'Odrzuć'),
      h('button.btn.sm', { onclick: () => counter(m) }, 'Kontrpropozycja')) : null);
}
async function respond(m, status) {
  const ok = await run(status === 'accepted' ? 'ACCEPT_PROPOSAL' : 'REJECT_PROPOSAL', m.subject || m.text.slice(0, 40), w => {
    w.merge('messages/' + m.id, { status, respondedAt: now() });
    if (status === 'accepted' && m.treaty) {
      w.set('treaties/' + newId(), { name: m.treaty.name, type: m.treaty.type, parties: [m.from, m.to].sort(), secret: !!m.treaty.secret, status: 'active', text: m.text, signedAt: gameNow(), createdAt: now() });
      if (!m.treaty.secret) w.set('news/' + newId(), { headline: `${cFlag(m.from)}${cFlag(m.to)} ${cName(m.from)} i ${cName(m.to)} podpisują: ${m.treaty.name}`, body: '', category: 'Diplomacy', reliability: 'Confirmed', breaking: true, countries: [m.from, m.to], gameTime: gameNow(), createdAt: now(), audienceAll: true, audience: [], authorCountry: m.to, source: realGM() ? 'gm' : 'player', official: true });
    }
  });
  if (ok) toast(status === 'accepted' ? '✅ Propozycja przyjęta' : '❌ Propozycja odrzucona', 'ok');
}
async function counter(m) {
  const v = await form('Kontrpropozycja', [{ k: 'text', label: 'Kontrpropozycja', type: 'textarea', value: m.text, req: true }, { k: 'tname', label: 'Traktat (nazwa)', value: m.treaty?.name }, { k: 'ttype', label: 'Typ', type: 'select', value: m.treaty?.type, options: [['', '—'], ...trOpts('treaty', TREATY_TYPES)] }, { k: 'secret', label: 'Tajny', type: 'check', value: m.treaty?.secret }]);
  if (!v) return;
  await run('COUNTEROFFER', m.subject || '', w => {
    w.merge('messages/' + m.id, { status: 'countered', respondedAt: now() });
    w.set('messages/' + newId(), { from: m.to, to: m.from, parties: [m.from, m.to].sort(), kind: 'proposal', status: 'pending', subject: 'Kontrpropozycja: ' + (m.subject || ''), text: v.text, treaty: v.tname ? { name: v.tname, type: v.ttype || 'Secret agreement', secret: v.secret } : null, replyTo: m.id, createdAt: now(), gameTime: gameNow() });
  });
}
function composer(me, to) {
  const subj = h('input', { placeholder: 'Temat (opcjonalnie)', 'data-keep': 'subj' });
  const txt = h('textarea', { rows: 3, placeholder: 'Szwecja proponuje wspólne opracowanie nowego morskiego systemu rakietowego…', 'data-keep': 'msg' });
  const kind = h('select', { 'data-keep': 'kind' }, h('option', { value: 'message' }, 'Wiadomość'), h('option', { value: 'proposal' }, 'Propozycja (przyjmij / odrzuć)'));
  const tname = h('input', { placeholder: 'Nazwa porozumienia (opcjonalnie)', 'data-keep': 'tname' });
  const ttype = h('select', { 'data-keep': 'ttype' }, TREATY_TYPES.map(t => h('option', { value: t }, tr('treaty', t))));
  const secret = h('input', { type: 'checkbox' }), reveal = h('input', { type: 'checkbox' });
  const send = async () => {
    if (!txt.value.trim()) return;
    const isProp = kind.value === 'proposal';
    const ok = await run('SEND_MESSAGE', `${cName(me)} → ${cName(to)}`, w => {
      w.set('messages/' + newId(), { from: me, to, parties: [me, to].sort(), kind: kind.value, status: isProp ? 'pending' : 'sent', subject: subj.value.trim(), text: txt.value.trim(), treaty: isProp && tname.value.trim() ? { name: tname.value.trim(), type: ttype.value, secret: secret.checked } : null, createdAt: now(), gameTime: gameNow() });
      if (reveal.checked) w.set('news/' + newId(), { headline: `${cFlag(me)}${cFlag(to)} Przedstawiciele państw ${cName(me)} i ${cName(to)} odbyli niejawne spotkanie`, body: '', category: 'Diplomacy', reliability: 'Reliable', breaking: false, countries: [me, to], gameTime: gameNow(), createdAt: now(), audienceAll: true, audience: [], authorCountry: me, source: realGM() ? 'gm' : 'player', official: false });
    });
    if (ok) { txt.value = ''; subj.value = ''; tname.value = ''; toast('📨 Wysłano kanałem dyplomatycznym', 'ok'); }
  };
  return h('div.composer', subj, txt, h('div.comp-row', kind, h('button.btn.primary', { onclick: send }, 'Wyślij')),
    h('details', h('summary', 'Porozumienie / opcje'), tname, ttype, h('label.chk', secret, ' tajne porozumienie'), h('label.chk', reveal, ' ujawnij światu fakt spotkania (bez treści)')));
}
function allChannels() {
  const pairs = {};
  Object.values(S.data.messages).forEach(m => { const k = m.parties.join('__'); (pairs[k] = pairs[k] || []).push(m); });
  return h('section', h('h3', '🔒 Wszystkie kanały (podgląd GM)'),
    Object.entries(pairs).length ? Object.entries(pairs).map(([k, ms]) => h('details.gm-thread', h('summary', `${ms[0].parties.map(p => cFlag(p) + ' ' + cName(p)).join(' ↔ ')} (${ms.length})`), ms.sort((a, b) => a.createdAt - b.createdAt).map(m => msgBubble(m, ms[0].parties[0])))) : h('p.muted', 'Brak prywatnych rozmów.'));
}

// ═════════════════════════ WYWIAD ═════════════════════════
let intelFor = null;
const intelPanel = {
  render() {
    const gm = realGM(), C = gm ? (intelFor || ctxCountry()) : myCountry();
    const all = Object.values(S.data.intel).filter(i => !C || i.toCountry === C).sort((a, b) => (b.createdGame || 0) - (a.createdGame || 0));
    const priv = C && S.data.countryPrivate[C];
    const cat = k => all.filter(i => (i.category || 'known') === k && !i.unitId);
    const tracks = all.filter(i => i.unitId || i.pos);
    const item = i => h('div.intel-item', { onclick: () => (i.route || i.pos) && select('i:' + i.id, true) },
      h('div', h('b', i.label), i.confidence != null ? h('span.conf', { style: { '--p': i.confidence + '%' } }, `${i.confidence}%`) : null),
      i.text ? h('p.muted', i.text) : null, gm && !C ? h('small', `→ ${cFlag(i.toCountry)} ${cName(i.toCountry)}`) : null,
      canEditIntel(i) ? h('div.btn-row', h('button.btn.xs', { onclick: e => { e.stopPropagation(); U.intelReport({ ...i }); } }, '✏️'), h('button.btn.xs.danger', { onclick: async e => { e.stopPropagation(); if (await confirmBox('Usunąć raport?', { danger: true })) run('DELETE_INTEL', i.label, w => w.del('intel/' + i.id)); } }, '🗑')) : null);
    return h('div.intel',
      gm ? h('div.country-picker', h('select', { onchange: e => { intelFor = e.target.value || null; goTab('intel'); } }, h('option', { value: '' }, '— wszystkie państwa —'), countriesSorted().map(c => h('option', { value: c.id, selected: c.id === C }, `${c.flag} ${c.name}`))),
        h('label.chk', h('input', { type: 'checkbox', checked: !!S.showAllIntel, onchange: e => { S.showAllIntel = e.target.checked; window.dispatchEvent(new Event('ww:refresh')); } }), ' pokaż wszystkie raporty na mapie')) : null,
      C ? h('div.intel-head', h('h2', `${cFlag(C)} WYWIAD — ${cName(C).toUpperCase()}`), priv ? h('div.ilevel', 'Poziom wywiadu: ', h('b', `${priv.intelLevel || '?'}/5`), h('span.dots', [1, 2, 3, 4, 5].map(n => h('i' + (n <= (priv.intelLevel || 0) ? '.on' : ''))))) : null) : null,
      h('div.btn-row', h('button.btn.sm', { onclick: () => U.intelReport({ toCountry: C }) }, gm ? '+ Raport wywiadu' : '+ Notatka analityczna')),
      [['known', 'Wiemy'], ['suspected', 'Podejrzewamy'], ['unknown', 'Nie wiemy']].map(([k, l]) => h('section', h('h3', l), cat(k).length ? cat(k).map(item) : h('p.muted', '—'))),
      h('section', h('h3', '📡 Śledzone kontakty'), tracks.length ? tracks.map(item) : h('p.muted', 'Brak śledzonych kontaktów.')));
  }
};
const canEditIntel = i => realGM() || (i.source === 'self' && i.toCountry === myCountry());

// ═════════════════════════ KRONIKA ═════════════════════════
let chronMode = 'years';
const chron = {
  render() {
    const gm = realGM();
    const list = Object.values(S.data.history).filter(e => gm || !e.secret || (e.countries || []).includes(myCountry())).sort((a, b) => (a.gameTime || 0) - (b.gameTime || 0));
    const entry = e => h('li', (e.countries || []).map(cFlag).join(''), ' ', e.text, e.secret ? ' 🔒' : '', gm ? h('span.hist-act', h('button.btn.xs', { onclick: () => histForm(e) }, '✏️'), isAdmin() && h('button.btn.xs.danger', { onclick: async () => { if (await confirmBox('Usunąć wpis z kroniki?', { danger: true })) run('DELETE_HISTORY', e.text.slice(0, 40), w => w.del('history/' + e.id)); } }, '🗑')) : null);
    let body;
    if (chronMode === 'years') {
      const by = {}; list.forEach(e => (by[new Date(e.gameTime || 0).getUTCFullYear()] = by[new Date(e.gameTime || 0).getUTCFullYear()] || []).push(e));
      body = Object.entries(by).map(([y, es]) => h('div.year', h('h3', y), h('ul', es.map(entry))));
    } else {
      const by = {}; list.forEach(e => (by[e.turn || 0] = by[e.turn || 0] || []).push(e));
      body = Object.entries(by).sort((a, b) => b[0] - a[0]).map(([t, es]) => {
        const perC = {}; es.forEach(e => { const cs = (e.countries || []).length ? e.countries : ['__world']; cs.forEach(c => (perC[c] = perC[c] || []).push(e)); });
        return h('div.turn-rep', h('div.row-between', h('h3', `TURA ${t}`), h('button.btn.xs', { onclick: () => turnSummary(+t) }, '📋 Podsumowanie')), Object.entries(perC).map(([c, xs]) => h('div', h('b', c === '__world' ? '🌍 Świat' : `${cFlag(c)} ${cName(c)}`), h('ul', xs.map(entry)))));
      });
    }
    return h('div.chron', h('div.feed-head', h('h2', '📜 KRONIKA ŚWIATA'), h('div.btn-row', gm ? h('button.btn.sm', { onclick: () => histForm() }, '+ Wpis') : null, h('button.btn.sm', { onclick: exportChron }, '⬇ Eksport'))),
      h('div.filters', [['years', 'Według lat'], ['turns', 'Raporty tur']].map(([k, l]) => h('button.chip' + (chronMode === k ? '.on' : ''), { onclick: () => { chronMode = k; goTab('chron'); } }, l)), h('button.chip', { title: 'Cała kampania tura po turze, z mapami — do zapisania jako PDF', onclick: () => import('./chronicle.js').then(m => m.campaignPdf()) }, '📕 Kronika PDF')),
      list.length ? body : h('div.empty', 'Historia tej kampanii jeszcze nie została napisana.'));
  }
};
async function histForm(e = {}) {
  const v = await form(e.id ? 'Edycja wpisu kroniki' : 'Nowy wpis kroniki', [
    { k: 'text', label: 'Wydarzenie', type: 'textarea', value: e.text, req: true, ph: 'Szwecja rozpoczyna Projekt Waza.' },
    { k: 'countries', label: 'Państwa', type: 'multi', value: e.countries || [], options: countriesSorted().map(c => [c.id, `${c.flag} ${c.name}`]) },
    { k: 'turn', label: 'Tura', type: 'number', value: e.turn ?? turn() }, { k: 'gameTime', label: 'Data', type: 'datetime', value: e.gameTime ?? gameNow(), now: gameNow },
    { k: 'secret', label: 'Ukryty (widoczny tylko dla państw wpisu)', type: 'check', value: e.secret }]);
  if (!v) return;
  await run(e.id ? 'UPDATE_HISTORY' : 'ADD_HISTORY', v.text.slice(0, 50), w => w.set('history/' + (e.id || newId()), { ...v, createdAt: e.createdAt || now() }));
}
function exportChron() {
  const list = Object.values(S.data.history).sort((a, b) => (a.gameTime || 0) - (b.gameTime || 0));
  let out = `# KRONIKA ŚWIATA\n`, y = null;
  list.forEach(e => { const yy = new Date(e.gameTime || 0).getUTCFullYear(); if (yy !== y) { y = yy; out += `\n## ${y}\n\n`; } out += `- [Tura ${e.turn || '?'} · ${G.fmtDate(e.gameTime)}] ${(e.countries || []).map(cName).join(', ')}${e.countries?.length ? ': ' : ''}${e.text}\n`; });
  download('worldwatch-kronika.md', out, 'text/markdown');
}

export const PANELS = { feed, country: countryPanel, diplo, intel: intelPanel, chron, gm: GM };
