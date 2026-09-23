// Panel GM/Admin: gracze, państwa, postacie, obiekty, tury; system (admin: backupy, logi, porządki, pola państw)
import { S, G, DB, run, now, newId, isDemo, gameNow, turn, realGM, isAdmin, persp, cFlag, cName, cDem, country, countriesSorted, userOfCountry, charView, charsOf, charLocation, writeChar, writeUnit, projectUnit,
  flagOf, presetByIso, STATS, KINDS, VIS, statusOf, unitViews, createBackup, deleteBackup, loadBackup, restoreSnapshot, snapshotWorld, cleanupLogs, undoOp, errId, log, allPlaces, placeLabel } from './store.js';
import { h, esc, form, modal, confirmBox, toast, chip, kv, download, pickFile, ago } from './ui.js';
import { COUNTRY_PRESETS } from './places.js';
import { AUTH } from './db.js';
import { select, drawArea, geoNames, TERR_STATUS, flyTo, npcOf, prevLabel, clipToCountry, focusCountry } from './map.js';
import { hideModals } from './ui.js';
import * as U from './units.js';
import { seedWorld } from './seed.js';

const goTab = () => window.dispatchEvent(new CustomEvent('ww:tab', { detail: 'gm' }));
let sub = 'players';
const PALETTE = ['#3fa7ff', '#ffcc00', '#ff5a5f', '#7bd88f', '#c792ea', '#ff9d3d', '#4fd1c5', '#f78fb3', '#a3be8c', '#e6c07b', '#61afef', '#d19a66'];
const ROLES = [['pending', '⏳ oczekuje'], ['leader', '👑 Country Leader'], ['observer', '👁 Observer'], ['gm', '🎲 Game Master'], ['admin', '🛡️ Admin'], ['blocked', '⛔ zablokowany']];
const STAFF = ['gm', 'admin'];
// GM zarządza graczami, ale role GM/Admin nadaje i odbiera tylko admin
const roleOpts = () => isAdmin() ? ROLES : ROLES.filter(([r]) => !STAFF.includes(r));
const canManage = u => u.id !== S.user.uid && (isAdmin() || !STAFF.includes(u.role));

export const GM = {
  render() {
    if (!realGM()) return h('div.empty', 'Tylko dla GM.');
    const tabs = [['players', '👥 Gracze'], ['countries', '🏳️ Państwa'], ['terr', '⚔️ Terytoria'], ['chars', '🧑‍💼 Postacie'], ['units', '✈️ Obiekty'], ['turns', '⏭ Tury'], ['system', '💾 System']];
    const body = { players, countries, terr, chars, units, turns, system }[sub]();
    return h('div.gm', h('div.filters', tabs.map(([k, l]) => h('button.chip' + (sub === k ? '.on' : ''), { onclick: () => { sub = k; goTab(); } }, l))), body);
  },
  editCountry, editStats, editChar, newTurn, conquer
};

// ───────── GRACZE ─────────
function players() {
  const us = Object.values(S.data.users).sort((a, b) => (a.role === 'pending' ? -1 : 0) - (b.role === 'pending' ? -1 : 0) || (a.displayName || '').localeCompare(b.displayName || ''));
  const cOpts = [['', '—'], ...countriesSorted().map(c => [c.id, `${c.flag} ${c.name}`])];
  const upd = (u, patch, label) => run('UPDATE_PLAYER', `${u.displayName}: ${label}`, w => w.merge('users/' + u.id, patch));
  return h('div',
    h('h3', 'PLAYER MANAGEMENT'),
    h('div.table-wrap', h('table.tbl', h('thead', h('tr', h('th', 'Gracz'), h('th', 'Państwo'), h('th', 'Rola'), h('th', 'Aktywność'), h('th', ''))),
      h('tbody', us.map(u => h('tr' + (u.role === 'pending' ? '.pending' : ''),
        h('td', h('b', u.displayName || '?'), h('br'), h('small.muted', u.email || u.id.slice(0, 10))),
        h('td', h('select', { disabled: !canManage(u) && u.id !== S.user.uid, onchange: e => upd(u, { countryId: e.target.value || null, ...(e.target.value && u.role === 'pending' ? { role: 'leader' } : {}) }, 'country → ' + (e.target.value || '—')) }, cOpts.map(([v, l]) => h('option', { value: v, selected: (u.countryId || '') === v }, l)))),
        h('td', canManage(u) ? h('select', { onchange: e => upd(u, { role: e.target.value }, 'role → ' + e.target.value) }, roleOpts().map(([v, l]) => h('option', { value: v, selected: u.role === v }, l))) : h('span.role.' + u.role, (ROLES.find(r => r[0] === u.role) || ['', u.role])[1])),
        h('td', h('small', u.lastSeen ? (now() - u.lastSeen < 180000 ? '🟢 online' : ago(u.lastSeen)) : '—')),
        h('td', canManage(u) ? h('div.btn-row',
          u.suspendedCountry ? h('button.btn.xs', { title: 'Oddaj państwo', onclick: () => upd(u, { role: 'leader', countryId: u.suspendedCountry, suspendedCountry: null }, 'restore control') }, '↩ oddaj') :
            u.role === 'leader' && u.countryId ? h('button.btn.xs', { title: 'GM czasowo przejmuje państwo — gracz staje się obserwatorem', onclick: () => upd(u, { role: 'observer', suspendedCountry: u.countryId }, 'GM takes control') }, '✋ przejmij') : null,
          isAdmin() ? h('button.btn.xs.danger', { onclick: async () => { if (!await confirmBox(`Usunąć gracza ${u.displayName}? (konto logowania zostaje — po ponownym zalogowaniu trafi do „oczekujących”)`, { danger: true })) return; await createBackup(`Before delete player ${u.displayName}`, { auto: true, reason: 'pre-delete', quiet: true }); run('DELETE_PLAYER', u.displayName, w => w.del('users/' + u.id)); } }, '🗑') : null) : h('small.muted', u.id === S.user.uid ? 'ty' : '—'))))))),
    h('div.btn-row', h('button.btn.sm', { onclick: createPlayer }, '+ Utwórz konto gracza')),
    h('p.muted', 'Nowi gracze logują się sami (Google lub e-mail) i pojawiają się tu jako „oczekuje”. Wybierz im państwo — rola zmieni się na Country Leader. „Przejmij” czasowo odbiera graczowi państwo (widzi świat jako obserwator), a GM steruje nim sam; „oddaj” przywraca.'));
}
async function createPlayer() {
  const v = await form('Nowe konto gracza', [{ k: 'name', label: 'Nazwa gracza', req: true }, { k: 'email', label: 'E-mail', type: 'email', req: !isDemo }, { k: 'pass', label: 'Hasło startowe (min. 6 znaków)', req: !isDemo }, { k: 'countryId', label: 'Państwo', type: 'select', options: [['', '—'], ...countriesSorted().map(c => [c.id, `${c.flag} ${c.name}`])] }, { k: 'role', label: 'Rola', type: 'select', value: 'leader', options: roleOpts().filter(r => r[0] !== 'pending') }]);
  if (!v) return;
  try {
    const uid = await AUTH.createForOther(v.email, v.pass, v.name);
    await run('CREATE_PLAYER', v.name, w => w.set('users/' + uid, { displayName: v.name, email: v.email || '', role: v.role, countryId: v.countryId || null, createdAt: now() }));
    toast(`Utworzono konto ${v.name}. Przekaż graczowi e-mail i hasło.`, 'ok', 8000);
  } catch (e) { const id = errId(); log('CREATE_PLAYER', v.name, 'ERROR', e.message, id); toast(`Nie udało się (${e.code || e.message}) · ${id}`, 'err', 8000); }
}

// ───────── PAŃSTWA ─────────
function countries() {
  const list = countriesSorted();
  return h('div',
    h('div.btn-row', h('button.btn.sm.primary', { onclick: () => editCountry() }, '+ Dodaj państwo')),
    list.map(c => h('div.gm-row', { style: { '--c': c.color } },
      h('span.bigflag.sm', c.flag), h('div.grow', h('b', c.name), h('small.muted', ` ${c.capital?.name || ''} · ${userOfCountry(c.id).map(u => u.displayName).join(', ') || 'NPC'}${c.publicStats ? ' · 📊 jawne' : ''}`)),
      h('div.btn-row', h('button.btn.xs', { title: 'Zobacz świat oczami tego państwa', onclick: () => { S.persp = c.id; window.dispatchEvent(new Event('ww:refresh')); toast(`Perspektywa: ${c.name}`, 'info'); } }, '👁'),
        h('button.btn.xs', { onclick: () => editCountry(c.id) }, '✏️'), h('button.btn.xs', { onclick: () => editStats(c.id) }, '📊'),
        isAdmin() ? h('button.btn.xs.danger', { onclick: () => deleteCountry(c.id) }, '🗑') : null))),
    !list.length ? h('div.empty', 'Brak państw. Dodaj pierwsze albo wczytaj przykładowy świat (System → Ustawienia).') : null);
}
async function editCountry(cid) {
  const c = cid ? country(cid) : null;
  let pre = null;
  if (!c) {
    const pick = await form('Dodaj państwo', [{ type: 'info', html: 'Wybierz realne państwo z listy (flaga, stolica i kontur mapy uzupełnią się same) albo zostaw puste, by stworzyć fikcyjne.' },
      { k: 'preset', label: 'Państwo', ph: 'np. Sweden (SE)', type: 'text', list: 'dl-presets' }], { submit: 'Dalej' });
    if (!pick) return;
    const m = pick.preset.match(/\(([A-Z]{2})\)\s*$/) || [null, pick.preset.toUpperCase()];
    pre = presetByIso(m[1]) || COUNTRY_PRESETS.find(p => p.name.toLowerCase() === pick.preset.toLowerCase() || p.pl.toLowerCase() === pick.preset.toLowerCase());
    if (pick.preset && !pre) toast('Nie znaleziono — tworzę państwo fikcyjne', 'info');
    if (pre && S.data.countries[pre.c.toLowerCase()]) return toast('To państwo już istnieje', 'err');
  }
  const base = c || (pre ? { name: pre.name, iso2: pre.c, isoN: pre.n, demonym: pre.dem, flag: flagOf(pre.c), capital: { name: pre.cap, lat: pre.lat, lon: pre.lon }, color: PALETTE[countriesSorted().length % PALETTE.length] } : { flag: '🏳️', color: PALETTE[countriesSorted().length % PALETTE.length] });
  const g = base.government || {};
  const v = await form(c ? `Profil: ${c.name}` : 'Nowe państwo', [
    { k: 'name', label: 'Nazwa', value: base.name, req: true }, { k: 'official', label: 'Pełna nazwa', value: base.official, ph: 'Kingdom of Sweden' }, { k: 'tag', label: 'Tag', value: base.tag, ph: 'np. USA, RUS, ChRL' },
    { k: 'flag', label: 'Flaga (emoji)', value: base.flag }, { k: 'color', label: 'Kolor na mapie', type: 'color', value: base.color },
    { k: 'demonym', label: 'Przymiotnik (EN)', value: base.demonym, ph: 'Swedish' }, { k: 'iso2', label: 'Kod ISO-2', value: base.iso2 }, { k: 'isoN', label: 'Kod ISO numeryczny (kontur mapy)', value: base.isoN },
    { k: 'capital', label: 'Stolica', type: 'place', value: base.capital, req: true },
    { type: 'section', label: 'Government' },
    { k: 'system', label: 'Ustrój', value: g.system, ph: 'Constitutional monarchy' }, { k: 'headTitle', label: 'Tytuł głowy państwa', value: g.headTitle || 'Head of state', ph: 'Monarch / President' },
    { k: 'head', label: 'Głowa państwa', value: g.head }, { k: 'headOfGov', label: 'Szef rządu', value: g.headOfGov }, { k: 'rulingParty', label: 'Partia rządząca', value: g.rulingParty },
    { k: 'publicStats', label: 'Statystyki jawne dla wszystkich', type: 'check', value: base.publicStats }
  ], { wide: true });
  if (!v) return;
  const id = cid || (v.iso2 ? v.iso2.toLowerCase() : v.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 20));
  if (!cid && S.data.countries[id]) return toast('Państwo o tym ID już istnieje', 'err');
  const doc = { name: v.name, official: v.official, tag: v.tag, flag: v.flag || '🏳️', color: v.color, demonym: v.demonym || v.name, iso2: (v.iso2 || '').toUpperCase(), isoN: v.isoN || '', capital: { name: v.capital.name, lat: +v.capital.lat, lon: +v.capital.lon }, government: { system: v.system, headTitle: v.headTitle, head: v.head, headOfGov: v.headOfGov, rulingParty: v.rulingParty }, publicStats: !!v.publicStats };
  await run(cid ? 'UPDATE_COUNTRY' : 'CREATE_COUNTRY', v.name, w => {
    w.set('countries/' + id, doc);
    if (!cid) w.set('countryPrivate/' + id, { countryId: id, economy: {}, military: {}, tech: {}, intelLevel: 2, projects: [], notes: '' });
  });
}
async function editStats(cid) {
  const p = S.data.countryPrivate[cid] || {};
  const v = await form(`📊 Statystyki — ${cFlag(cid)} ${cName(cid)}`, [
    ...[...STATS, ['Inne', []]].flatMap(([title, fields]) => {
      const extra = customFields().filter(f => f.section === title).map(f => f.public ? ['pub', f.key, f.label + ' (jawne)'] : ['custom', f.key, f.label]);
      const all = [...fields, ...extra];
      return all.length ? [{ type: 'section', label: title }, ...all.map(([grp, k, l]) => ({ k: grp + '.' + k, label: l, value: grp === 'pub' ? country(cid)?.custom?.[k] : p[grp]?.[k] }))] : [];
    }),
    { k: 'intelLevel', label: 'Intelligence Level (1–5)', type: 'number', value: p.intelLevel ?? 2, min: 0, max: 5 }
  ], { wide: true });
  if (!v) return;
  const doc = { countryId: cid, intelLevel: v.intelLevel ?? 2 };
  Object.entries(v).forEach(([key, x]) => { const [grp, k] = key.split('.'); if (k) (doc[grp] = doc[grp] || {})[k] = x; });
  await createBackup(`Before stats change ${cName(cid)}`, { auto: true, reason: 'pre-stats', quiet: true });
  const pub = doc.pub; delete doc.pub;
  await run('UPDATE_STATS', cName(cid), w => { w.merge('countryPrivate/' + cid, doc); if (pub) w.merge('countries/' + cid, { custom: pub }); });
}
async function deleteCountry(cid) {
  if (!await confirmBox(`Usunąć ${cName(cid)} razem z postaciami, obiektami, raportami wywiadu i relacjami? Przed usunięciem zostanie zrobiony automatyczny backup.`, { danger: true, ok: 'Usuń państwo' })) return;
  const b = await createBackup(`Before delete ${cName(cid)}`, { auto: true, reason: 'pre-delete', quiet: true });
  if (!b) return;
  await run('DELETE_COUNTRY', cName(cid), w => {
    w.del('countries/' + cid); w.del('countryPrivate/' + cid);
    Object.values(S.data.charSecrets).filter(c => c.countryId === cid).forEach(c => { w.del('charSecrets/' + c.id); w.del('characters/' + c.id); });
    Object.values(S.data.unitSecrets).filter(u => u.countryId === cid).forEach(u => { w.del('unitSecrets/' + u.id); w.del('units/' + u.id); });
    Object.values(S.data.intel).filter(i => i.toCountry === cid).forEach(i => w.del('intel/' + i.id));
    Object.values(S.data.relations).filter(r => r.parties.includes(cid)).forEach(r => w.del('relations/' + r.id));
    userOfCountry(cid).forEach(u => w.merge('users/' + u.id, { countryId: null }));
  }, { undo: false });
}

// ───────── POSTACIE ─────────
function chars() {
  return h('div', h('div.btn-row', h('button.btn.sm.primary', { onclick: () => editChar({}) }, '+ Nowa postać')),
    countriesSorted().map(c => { const cs = charsOf(c.id); return cs.length ? h('section', h('h3', `${c.flag} ${c.name}`), cs.map(ch => { const loc = charLocation(ch.id); return h('div.gm-row', h('span.avatar.sm', ch.avatar ? h('img', { src: ch.avatar, alt: '' }) : ch.icon || '👤'), h('div.grow', h('b', ch.name), h('small.muted', ` ${ch.title || ''} · 📍 ${loc?.text || '—'}${ch.visibility === 'classified' ? ' · 🔒' : ''}`)), h('div.btn-row', h('button.btn.xs', { onclick: () => editChar(ch) }, '✏️'), h('button.btn.xs.danger', { onclick: async () => { if (await confirmBox(`Usunąć postać ${ch.name}?`, { danger: true })) run('DELETE_CHARACTER', ch.name, w => { w.del('characters/' + ch.id); w.del('charSecrets/' + ch.id); }); } }, '🗑'))); })) : null; }));
}
const ICONS = ['👑', '👔', '🛡️', '🌍', '🕵️', '⚓', '✈️', '🏭', '🎖️', '⚖️', '🔬', '💼', '📡', '🚀', '👤'];
async function editChar(c = {}) {
  const gm = realGM();
  const cur = c.id ? charView(c.id) : c;
  const v = await form(c.id ? `Postać: ${cur.name}` : 'Nowa postać', [
    { k: 'name', label: 'Imię i nazwisko', value: cur.name, req: true }, { k: 'title', label: 'Stanowisko', value: cur.title, ph: 'Minister of Defence' },
    { k: 'icon', label: 'Ikona', type: 'select', value: cur.icon || '👤', options: ICONS },
    { k: 'countryId', label: 'Państwo', type: 'select', value: cur.countryId, options: countriesSorted().map(x => [x.id, `${x.flag} ${x.name}`]), req: true },
    { k: 'age', label: 'Wiek', type: 'number', value: cur.age }, { k: 'avatar', label: 'Zdjęcie (URL)', value: cur.avatar },
    { k: 'desc', label: 'Opis', type: 'textarea', value: cur.desc },
    { k: 'status', label: 'Status', type: 'select', value: cur.status || 'Active', options: ['Active', 'Travelling', 'In talks', 'Hospitalised', 'Detained', 'Missing', 'Resigned', 'Deceased'] },
    { k: 'visibility', label: 'Widoczność', type: 'select', value: cur.visibility || 'public', options: [['public', 'Publiczna'], ['classified', 'Tajna tożsamość']] },
    { k: 'home', label: 'Stała lokalizacja (baza)', type: 'place', value: cur.home || (country(cur.countryId)?.capital) },
    { k: 'loc', label: 'Aktualna lokalizacja (ręcznie, opcjonalnie)', type: 'place', value: null, help: cur.locOverride ? `obecnie: ${cur.locOverride.name}` : 'puste = wyliczana z podróży' },
    { k: 'mission', label: 'Aktualna misja (tajne)', value: cur.mission }, { k: 'notes', label: 'Notatki (tajne)', type: 'textarea', value: cur.notes }
  ], { wide: true });
  if (!v) return;
  const id = c.id || newId();
  const loc = v.loc ? { name: v.loc.name, lat: +v.loc.lat, lon: +v.loc.lon, at: gameNow() } : cur.locOverride || null;
  const doc = { id, name: v.name, title: v.title, icon: v.icon, countryId: v.countryId, age: v.age, avatar: v.avatar, desc: v.desc, status: v.status, visibility: v.visibility, home: v.home ? { name: v.home.name, lat: +v.home.lat, lon: +v.home.lon } : null, mission: v.mission, notes: v.notes, locOverride: loc };
  await run(c.id ? 'UPDATE_CHARACTER' : 'CREATE_CHARACTER', v.name, w => writeChar(w, doc));
}

// ───────── OBIEKTY ─────────
function units() {
  const list = Object.values(S.data.unitSecrets).sort((a, b) => (a.countryId || '').localeCompare(b.countryId || '') || (a.callsign || '').localeCompare(b.callsign || ''));
  const K = ['aircraft', 'ship', 'submarine', 'ground', 'base', 'zone', 'satellite', 'contact'];
  return h('div',
    h('div.btn-row.wrap', h('button.btn.sm.primary', { onclick: () => U.createTrip() }, '🧭 Kreator wydarzenia'), K.map(k => h('button.btn.sm', { onclick: async () => { const id = await U.editUnit(null, k); id && select('u:' + id, true); } }, '+ ' + KINDS[k].pl))),
    h('div.table-wrap', h('table.tbl', h('thead', h('tr', h('th', 'Obiekt'), h('th', 'Status'), h('th', 'Widoczność'), h('th', ''))), h('tbody', list.map(u => {
      const v = { ...u, key: 'u:' + u.id };
      return h('tr', h('td', { onclick: () => select('u:' + u.id, true), style: { cursor: 'pointer' } }, `${cFlag(u.countryId)} `, h('b', u.callsign), h('br'), h('small.muted', `${KINDS[u.kind]?.pl || u.kind}${(u.route || []).length > 1 ? ' · ' + u.route[0].name + ' → ' + u.route[u.route.length - 1].name : ''}`)),
        h('td', h('span.status.s-' + statusOf(v).split(' ')[0].toLowerCase(), statusOf(v))), h('td', chip(u.visibility || 'public', u.visibility)),
        h('td', h('div.btn-row', h('button.btn.xs', { onclick: () => U.editUnit(u) }, '✏️'), h('button.btn.xs', { onclick: () => U.distributeIntel(u.id) }, '📡'), h('button.btn.xs.danger', { onclick: () => U.deleteUnit(u.id) }, '🗑'))));
    })))),
    !list.length ? h('div.empty', 'Brak obiektów.') : null);
}

// ───────── TURY ─────────
function turns() {
  const g = S.game || {};
  return h('div',
    h('div.turn-big', h('small', 'AKTUALNA TURA'), h('b', turn()), h('small', G.fmtDT(gameNow()) + ' UTC')),
    h('div.btn-row', h('button.btn.primary', { onclick: newTurn }, '⏭ Zakończ turę i rozpocznij następną'), h('button.btn', { onclick: () => import('./app.js').then(a => a.clockModal()) }, '⏱ Zegar gry')),
    h('section', h('h3', 'Ustawienia tur'), kv('Przesunięcie czasu przy nowej turze', g.turnAdvance ? G.fmtDur(g.turnAdvance) : 'brak'),
      h('button.btn.sm', { onclick: async () => { const v = await form('Ustawienia tur', [{ k: 'adv', label: 'Nowa tura przesuwa czas gry o', type: 'duration', value: g.turnAdvance || '', help: 'np. „30d” = miesiąc na turę; puste = bez skoku' }, { k: 'news', label: 'Ogłaszaj nową turę w newsach', type: 'check', value: g.turnNews !== false }]); if (v) run('TURN_SETTINGS', '', w => w.merge('meta/game', { turnAdvance: v.adv || 0, turnNews: v.news })); } }, '⚙️ Zmień')),
    h('p.muted', 'Nowa tura: automatyczny backup „End of Turn N”, wpis w kronice, opcjonalny skok czasu i komunikat dla graczy. Raporty tur znajdziesz w zakładce Kronika → Raporty tur.'));
}
async function newTurn() {
  const T = turn();
  const v = await form(`Zakończyć turę ${T}?`, [{ k: 'summary', label: `Podsumowanie tury ${T} (do kroniki, opcjonalnie)`, type: 'textarea', rows: 4 }, { k: 'adv', label: 'Przesuń czas gry o', type: 'duration', value: S.game.turnAdvance || '' }], { submit: `⏭ Rozpocznij turę ${T + 1}` });
  if (!v) return;
  const b = await createBackup(`End of Turn ${T}`, { auto: false, reason: 'turn-end', quiet: true });
  if (!b) return;
  const g = gameNow() + (v.adv || 0);
  await run('NEW_TURN', `${T} → ${T + 1}`, w => {
    w.merge('meta/game', { turn: T + 1 });
    if (v.adv) { const c = S.clock || {}; w.set('meta/clock', { running: c.running !== false, rate: c.rate || 1, anchorGame: g, anchorReal: now() }); }
    if (v.summary) w.set('history/' + newId(), { turn: T, gameTime: gameNow(), text: v.summary, countries: [], createdAt: now() });
    w.set('history/' + newId(), { turn: T + 1, gameTime: g, text: `Turn ${T + 1} begins.`, countries: [], createdAt: now(), system: true });
    if (S.game.turnNews !== false) w.set('news/' + newId(), { headline: `⏭ TURN ${T + 1} BEGINS`, body: v.summary || '', category: 'Politics', reliability: 'Confirmed', breaking: true, countries: [], gameTime: g, createdAt: now(), audienceAll: true, audience: [], source: 'gm', system: true });
  });
  toast(`Rozpoczęto turę ${T + 1}`, 'ok');
}

// ───────── SYSTEM ─────────
let sysTab = 'recovery';
function system() {
  const tabs = isAdmin() ? [['backups', '💾 Backupy'], ['logs', '📝 Logi'], ['cleanup', '🧹 Porządki'], ['fields', '🧩 Pola państw'], ['recovery', '🔄 Cofanie'], ['diag', '🔧 Diagnostyka'], ['settings', '⚙️ Ustawienia']]
    : [['recovery', '🔄 Cofanie'], ['settings', '⚙️ Ustawienia']];
  if (!tabs.some(t => t[0] === sysTab)) sysTab = tabs[0][0];
  return h('div', h('div.filters.sub', tabs.map(([k, l]) => h('button.chip' + (sysTab === k ? '.on' : ''), { onclick: () => { sysTab = k; goTab(); } }, l))), { backups, logs, cleanup, fields, recovery, diag, settings }[sysTab]());
}
function backups() {
  const list = Object.values(S.data.backups).sort((a, b) => b.createdAt - a.createdAt);
  return h('div',
    h('div.btn-row.wrap', h('button.btn.sm.primary', { onclick: async () => { const v = await form('CREATE BACKUP', [{ k: 'label', label: 'Opis kopii', ph: 'Before Sweden Naval Reform' }, { k: 'perm', label: '⭐ KEEP FOREVER', type: 'check' }]); if (v) createBackup(v.label, { permanent: v.perm }); } }, '💾 Create Backup'),
      h('button.btn.sm', { onclick: importBackup }, '⬆ Import z pliku'),
      h('button.btn.sm', { onclick: async () => download(`worldwatch-live-${new Date().toISOString().slice(0, 16)}.json`, JSON.stringify(await snapshotWorld(), null, 1)) }, '⬇ Eksport stanu teraz')),
    h('p.muted', `Auto-backup co ${S.game.autoBackupMinutes ?? 60} min (gdy GM jest online), przy końcu tury i przed ryzykownymi operacjami. Trzymane jest ${S.game.keepAutoBackups || 20} ostatnich automatycznych; ręczne i ⭐ nie są usuwane.`),
    list.map(b => h('div.backup' + (b.permanent ? '.perm' : ''),
      h('div.grow', h('b', `${b.permanent ? '⭐ ' : ''}Backup #${String(b.nr || 0).padStart(3, '0')}`), ' ', h('span', b.label), h('br'),
        h('small.muted', `Turn ${b.turn} · ${new Date(b.createdAt).toISOString().slice(0, 16).replace('T', ' ')} · gra: ${G.fmtDT(b.gameTime)} · ${Math.round((b.size || 0) / 1024)} KB${b.auto ? ' · auto' : ''}`)),
      h('div.btn-row', h('button.btn.xs', { title: 'Przywróć', onclick: () => restore(b) }, '🔄'), h('button.btn.xs', { title: 'Eksport', onclick: async () => { try { download(`worldwatch-backup-${b.nr}.json`, JSON.stringify(await loadBackup(b), null, 1)); } catch (e) { toast('Błąd eksportu: ' + e.message, 'err'); } } }, '⬇'),
        h('button.btn.xs', { title: 'Keep forever', onclick: () => run('MARK_BACKUP', b.label, w => w.merge('backups/' + b.id, { permanent: !b.permanent }), { undo: false }) }, b.permanent ? '☆' : '⭐'),
        h('button.btn.xs.danger', { onclick: async () => { if (await confirmBox(`Usunąć backup „${b.label}”?`, { danger: true })) deleteBackup(b); } }, '🗑')))),
    !list.length ? h('div.empty', 'Brak kopii.') : null);
}
async function restore(b) {
  if (!await confirmBox(`RESTORE BACKUP #${b.nr} — „${b.label}” (tura ${b.turn}). Cały świat wróci do tego stanu. Obecny stan zostanie najpierw zapisany jako osobny backup.`, { danger: true, ok: 'Przywróć' })) return;
  try { const snap = await loadBackup(b); if (await restoreSnapshot(snap, b.label)) toast(`✅ Przywrócono backup #${b.nr}`, 'ok', 7000); }
  catch (e) { toast('Błąd: ' + e.message, 'err', 8000); }
}
async function importBackup() {
  const txt = await pickFile('.json'); if (!txt) return;
  let snap; try { snap = JSON.parse(txt); } catch { return toast('To nie jest poprawny plik JSON', 'err'); }
  if (snap.app !== 'worldwatch' || !snap.data) return toast('To nie jest backup WorldWatch', 'err');
  if (!await confirmBox(`Zaimportować świat z pliku (tura ${snap.turn}, ${new Date(snap.at).toISOString().slice(0, 10)})? Obecny stan zostanie zapisany jako backup.`, { danger: true, ok: 'Importuj' })) return;
  if (await restoreSnapshot(snap, 'import z pliku')) toast('✅ Zaimportowano', 'ok');
}
let logFilter = 'all';
function logs() {
  const list = Object.values(S.data.logs).filter(l => logFilter === 'all' || l.result === 'ERROR').sort((a, b) => b.tsMs - a.tsMs).slice(0, 300);
  const RET = [[1, '24 godziny'], [3, '3 dni'], [7, '7 dni'], [30, '30 dni'], [90, '90 dni'], [-1, 'bezterminowo']];
  return h('div',
    h('div.btn-row.wrap', h('select', { onchange: e => run('SET_RETENTION', e.target.value, w => w.merge('meta/game', { logRetentionDays: +e.target.value }), { undo: false }) }, RET.map(([d, l]) => h('option', { value: d, selected: (S.game.logRetentionDays ?? 7) === d }, 'Retencja: ' + l))),
      h('button.btn.sm', { onclick: async () => { const n = await cleanupLogs(true); toast(`Usunięto ${n} starych wpisów`, 'ok'); } }, '🧹 Clear old logs'),
      h('button.btn.sm.danger', { onclick: async () => { const all = Object.keys(S.data.logs); if (all.length && await confirmBox(`Usunąć WSZYSTKIE logi (${all.length})?`, { danger: true })) { await DB.commit(all.map(id => ({ t: 'del', path: 'logs/' + id }))); log('CLEAR_ALL_LOGS', all.length); } } }, '🗑 Usuń wszystkie'),
      h('button.btn.sm', { onclick: () => download('worldwatch-errors.json', JSON.stringify(Object.values(S.data.logs).filter(l => l.result === 'ERROR'), null, 1)) }, '⬇ Export error log'),
      h('button.chip' + (logFilter === 'err' ? '.on' : ''), { onclick: () => { logFilter = logFilter === 'err' ? 'all' : 'err'; goTab(); } }, 'tylko błędy')),
    h('p.muted', 'Logi techniczne są czyszczone automatycznie. Historia świata (Kronika) i backupy NIE są usuwane razem z logami.'),
    h('div.logs', list.map(l => h('div.log.' + (l.result === 'ERROR' ? 'err' : 'ok'), h('code', `[${new Date(l.tsMs).toTimeString().slice(0, 8)}] ${l.user} (${l.role})`), h('b', ' ' + l.op), ' ', h('span', l.target), ' ', h('span.res', l.result), h('button.btn.xs.logdel', { title: 'Usuń wpis', onclick: () => DB.commit([{ t: 'del', path: 'logs/' + l.id }]) }, '✕'), l.error ? h('div.lerr', `ERROR: ${l.error} · ${l.errorId}`) : null))));
}
function recovery() {
  const list = Object.values(S.data.undo).sort((a, b) => b.at - a.at);
  const lastBackup = Object.values(S.data.backups).sort((a, b) => b.createdAt - a.createdAt)[0];
  return h('div',
    h('p.muted', 'Każda operacja GM zapisuje się atomowo — jeśli coś się wysypie w trakcie, nic nie zostaje zapisane (nie ma stanów „Stockholm → NULL”). Poniżej ostatnie operacje, które możesz cofnąć jednym kliknięciem.'),
    lastBackup ? h('div.btn-row', h('button.btn.sm', { onclick: () => restore(lastBackup) }, `⏮ Last valid state: backup #${lastBackup.nr} (${lastBackup.label})`)) : null,
    h('h3', 'Restore previous operation'),
    list.map(u => h('div.gm-row', h('div.grow', h('b', u.op), ' ', h('span', u.target || ''), h('br'), h('small.muted', `${u.user} · ${ago(u.at)}`)),
      h('button.btn.xs', { onclick: async () => { if (await confirmBox(`Cofnąć „${u.op} ${u.target || ''}”? Dokumenty wrócą do stanu sprzed tej operacji.`)) { if (await undoOp(u)) toast('↩ Cofnięto', 'ok'); } } }, '↩ Cofnij'))),
    !list.length ? h('div.empty', 'Brak operacji do cofnięcia.') : null);
}
function diag() {
  const counts = ['countries', 'characters', 'unitSecrets', 'units', 'intel', 'news', 'treaties', 'messages', 'history', 'logs', 'backups', 'users'].map(c => [c, Object.keys(S.data[c]).length]);
  const active = Object.values(S.data.users).filter(u => now() - (u.lastSeen || 0) < 180000);
  const errs = Object.values(S.data.logs).filter(l => l.result === 'ERROR').sort((a, b) => b.tsMs - a.tsMs);
  const last = S.lastError || (errs[0] && { id: errs[0].errorId, op: errs[0].op, msg: errs[0].error, at: errs[0].tsMs });
  const lb = Object.values(S.data.backups).sort((a, b) => b.createdAt - a.createdAt)[0];
  const healthy = navigator.onLine && !DB.status.fromCache;
  return h('div',
    h('div.health' + (healthy ? '.ok' : '.bad'), healthy ? '● SYSTEM HEALTH: OK' : '● SYSTEM HEALTH: OFFLINE / CACHE'),
    h('section', h('h3', 'Database status'), kv('Backend', DB.kind === 'demo' ? 'DEMO — localStorage' : 'Cloud Firestore'), kv('Połączenie', navigator.onLine ? (DB.status.fromCache ? 'dane z cache' : 'online') : 'OFFLINE'), counts.map(([k, n]) => kv(k, n))),
    h('section', h('h3', 'Active connections'), active.length ? active.map(u => kv(u.displayName, `${u.role}${u.countryId ? ' · ' + cName(u.countryId) : ''}`)) : h('p.muted', '—')),
    h('section', h('h3', 'Last error'), last ? [kv('Error ID', last.id), kv('Operacja', last.op), kv('Treść', last.msg), kv('Kiedy', new Date(last.at).toLocaleString())] : h('p.muted', 'Brak błędów 🎉')),
    h('section', h('h3', 'Game state'), kv('Tura', turn()), kv('Czas gry', G.fmtDT(gameNow())), kv('Zegar', S.clock?.running === false ? 'PAUZA' : `×${S.clock?.rate || 1}`), kv('Ostatni backup', lb ? `#${lb.nr} · ${ago(lb.createdAt)}` : 'brak')),
    h('div.btn-row', h('button.btn.sm', { onclick: () => { sysTab = 'cleanup'; goTab(); } }, '🧹 Sprawdź duchy i spójność')));
}
// ───────── PORZĄDKI: duchy i zapychanie bazy (admin) ─────────
const AD = () => ({ pendingMaxDays: 14, inactiveDays: 60, autoClean: true, playerRateLimit: 20, ...(S.admin || {}) });
const DAY = 86400000;
// każda kategoria: lista problemów z naprawą; auto = bezpieczna do automatycznego sprzątania
export function scanGhosts() {
  const A = AD(), D = S.data, has = id => !!D.countries[id], out = [];
  const add = (key, label, auto, items) => out.push({ key, label, auto, items });
  add('pending', `Konta „oczekuje” starsze niż ${A.pendingMaxDays} dni (nikt ich nie zatwierdził)`, true,
    Object.values(D.users).filter(u => u.role === 'pending' && now() - (u.createdAt || 0) > A.pendingMaxDays * DAY).map(u => ({ t: `${u.displayName || u.id} (${u.email || ''})`, fix: w => w.del('users/' + u.id) })));
  add('inactive', `Gracze nieaktywni od ${A.inactiveDays} dni (tylko ręcznie)`, false,
    Object.values(D.users).filter(u => ['leader', 'observer', 'blocked'].includes(u.role) && now() - (u.lastSeen || u.createdAt || 0) > A.inactiveDays * DAY).map(u => ({ t: `${u.displayName} · ${u.lastSeen ? ago(u.lastSeen) : 'nigdy'}`, fix: w => w.del('users/' + u.id) })));
  add('badCountry', 'Gracze przypisani do nieistniejącego państwa', true,
    Object.values(D.users).filter(u => u.countryId && !has(u.countryId)).map(u => ({ t: u.displayName, fix: w => w.merge('users/' + u.id, { countryId: null }) })));
  const orph = [];
  Object.keys(D.units).forEach(id => { if (!D.unitSecrets[id]) orph.push({ t: `mapa: ${D.units[id].label} (brak prawdy)`, fix: w => w.del('units/' + id) }); });
  Object.values(D.unitSecrets).forEach(u => { if (u.countryId !== '__gm' && !has(u.countryId)) orph.push({ t: `obiekt ${u.callsign} (brak państwa)`, fix: w => { w.del('unitSecrets/' + u.id); w.del('units/' + u.id); } }); });
  Object.keys(D.characters).forEach(id => { const c = D.characters[id]; if (!D.charSecrets[id] || !has(c.countryId)) orph.push({ t: `postać ${c.name}`, fix: w => { w.del('characters/' + id); w.del('charSecrets/' + id); } }); });
  Object.keys(D.charSecrets).forEach(id => { if (!D.characters[id]) orph.push({ t: `tajna część postaci ${id}`, fix: w => w.del('charSecrets/' + id) }); });
  Object.values(D.intel).forEach(i => { if (!has(i.toCountry) || (i.unitId && !D.unitSecrets[i.unitId])) orph.push({ t: `raport wywiadu „${i.label}”`, fix: w => w.del('intel/' + i.id) }); });
  Object.values(D.relations).forEach(r => { if (!r.parties?.every(has)) orph.push({ t: `relacja ${r.id}`, fix: w => w.del('relations/' + r.id) }); });
  Object.values(D.territories).forEach(t => { if (!has(t.controller)) orph.push({ t: `terytorium ${t.label}`, fix: w => w.del('territories/' + t.id) }); });
  Object.values(D.messages).forEach(m => { if (!m.parties?.every(has)) orph.push({ t: `wiadomość ${m.subject || m.id}`, fix: w => w.del('messages/' + m.id) }); });
  Object.keys(D.countryPrivate).forEach(id => { if (!has(id)) orph.push({ t: `statystyki ${id}`, fix: w => w.del('countryPrivate/' + id) }); });
  Object.keys(D.gmNotes).forEach(id => { if (id.startsWith('news_') && !D.news[id.slice(5)]) orph.push({ t: `notatka GM ${id}`, fix: w => w.del('gmNotes/' + id) }); });
  add('orphans', 'Osierocone dokumenty (duchy po usuniętych państwach/obiektach)', true, orph);
  const broken = [];
  Object.values(D.unitSecrets).forEach(u => {
    if ((u.route || []).some(p => !isFinite(p?.lat) || !isFinite(p?.lon))) broken.push({ t: `${u.callsign}: uszkodzona trasa`, fix: w => writeUnit(w, { ...u, route: (u.route || []).filter(p => isFinite(p?.lat) && isFinite(p?.lon)) }) });
    else if (projectUnit(u) && !D.units[u.id]) broken.push({ t: `${u.callsign}: brak publicznej projekcji`, fix: w => writeUnit(w, u) });
  });
  add('broken', 'Uszkodzone obiekty', true, broken);
  const ret = S.game.logRetentionDays ?? 7;
  add('logs', `Logi starsze niż ${ret < 0 ? '∞' : ret + ' dni'}`, true, ret < 0 ? [] : Object.values(D.logs).filter(l => (l.tsMs || 0) < now() - ret * DAY).map(l => ({ t: l.op, fix: w => w.del('logs/' + l.id) })));
  const keep = S.game.keepAutoBackups || 20;
  add('backups', `Automatyczne backupy ponad limit ${keep}`, true, Object.values(D.backups).filter(b => b.auto && !b.permanent).sort((a, b) => b.createdAt - a.createdAt).slice(keep)
    .map(b => ({ t: b.label, fix: w => { for (let i = 0; i < (b.parts || 1); i++) w.del(`backups/${b.id}/parts/${i}`); w.del('backups/' + b.id); } })));
  return out;
}
export async function cleanGhosts(cats, auto) {
  const items = cats.flatMap(c => c.items);
  if (!items.length) return 0;
  const ok = await run(auto ? 'AUTO_CLEANUP' : 'CLEANUP', cats.map(c => `${c.key}:${c.items.length}`).join(' '), w => items.forEach(i => i.fix(w)), { undo: false });
  return ok ? items.length : 0;
}
// raz na dobę, gdy admin jest online
export async function autoClean() {
  if (!isAdmin() || AD().autoClean === false || now() - (S.admin?.lastClean || 0) < DAY) return;
  const n = await cleanGhosts(scanGhosts().filter(c => c.auto), true);
  await DB.commit([{ t: 'merge', path: 'meta/admin', data: { lastClean: now(), lastCleanCount: n } }]).catch(() => { });
}
const sizeOf = c => JSON.stringify(Object.values(S.data[c] || {})).length;
function cleanup() {
  const A = AD(), cats = scanGhosts(), total = cats.reduce((n, c) => n + c.items.length, 0);
  const cols = ['countries', 'countryPrivate', 'characters', 'unitSecrets', 'units', 'intel', 'news', 'messages', 'history', 'treaties', 'users', 'logs', 'undo', 'backups'];
  return h('div',
    h('div.health' + (total ? '.bad' : '.ok'), total ? `● ${total} DO POSPRZĄTANIA` : '● BAZA CZYSTA — BRAK DUCHÓW'),
    h('section', h('h3', 'Ustawienia (tylko admin)'),
      kv('Auto-sprzątanie raz na dobę', A.autoClean ? `włączone · ostatnio ${S.admin?.lastClean ? ago(S.admin.lastClean) + ` (${S.admin.lastCleanCount || 0})` : 'nigdy'}` : 'wyłączone'),
      kv('Usuwaj niezatwierdzone konta po', A.pendingMaxDays + ' dniach'), kv('Nieaktywny gracz po', A.inactiveDays + ' dniach'),
      kv('Limit operacji gracza', A.playerRateLimit ? A.playerRateLimit + ' / min' : 'brak'),
      h('button.btn.sm', { onclick: async () => {
        const v = await form('Porządki — ustawienia', [
          { k: 'autoClean', label: 'Automatycznie sprzątaj bezpieczne kategorie raz na dobę (gdy admin online)', type: 'check', value: A.autoClean },
          { k: 'pendingMaxDays', label: 'Usuń konta „oczekuje” starsze niż (dni)', type: 'number', value: A.pendingMaxDays, min: 1 },
          { k: 'inactiveDays', label: 'Pokaż graczy nieaktywnych od (dni)', type: 'number', value: A.inactiveDays, min: 1 },
          { k: 'playerRateLimit', label: 'Limit operacji gracza na minutę (0 = bez limitu)', type: 'number', value: A.playerRateLimit, min: 0 }]);
        if (v) run('ADMIN_SETTINGS', 'cleanup', w => w.merge('meta/admin', { autoClean: v.autoClean, pendingMaxDays: v.pendingMaxDays || 14, inactiveDays: v.inactiveDays || 60, playerRateLimit: v.playerRateLimit ?? 20 }), { undo: false });
      } }, '⚙️ Zmień')),
    h('div.btn-row', h('button.btn.sm.primary', { disabled: !total, onclick: async () => { const safe = cats.filter(c => c.auto && c.items.length); if (await confirmBox(`Wyczyścić ${safe.reduce((n, c) => n + c.items.length, 0)} pozycji z bezpiecznych kategorii? Przed tym zrobię backup.`)) { await createBackup('Before cleanup', { auto: true, reason: 'pre-cleanup', quiet: true }); toast(`🧹 Usunięto ${await cleanGhosts(safe)} pozycji`, 'ok'); } } }, '🧹 Wyczyść bezpieczne')),
    cats.map(c => h('section', h('h3', `${c.label} — ${c.items.length}`),
      c.items.length ? [h('ul.ghosts', c.items.slice(0, 30).map(i => h('li', i.t)), c.items.length > 30 ? h('li.muted', `…i ${c.items.length - 30} więcej`) : null),
        h('button.btn.xs' + (c.auto ? '' : '.danger'), { onclick: async () => { if (await confirmBox(`Usunąć/naprawić ${c.items.length} pozycji: ${c.label}?`, { danger: !c.auto })) { if (!c.auto) await createBackup('Before cleanup ' + c.key, { auto: true, reason: 'pre-cleanup', quiet: true }); toast(`🧹 ${await cleanGhosts([c])} pozycji`, 'ok'); } } }, c.auto ? 'Wyczyść' : 'Usuń tych graczy')] : h('p.muted', '✓ brak'))),
    h('section', h('h3', 'Rozmiar bazy (szacunkowo)'), cols.map(c => kv(c, `${Object.keys(S.data[c] || {}).length} dok. · ${(sizeOf(c) / 1024).toFixed(1)} KB`))),
    h('p.muted', 'Serwer dodatkowo odrzuca zbyt długie teksty (reguły Firestore), a niezatwierdzone konta nie mogą nic zapisać poza własnym profilem.'));
}

// ───────── WŁASNE POLA PAŃSTW (admin) ─────────
export const customFields = () => S.admin?.fields || [];
function fields() {
  const list = customFields(), sections = [...STATS.map(s => s[0]), 'Inne'];
  const save = (next, label) => run('CUSTOM_FIELDS', label, w => w.merge('meta/admin', { fields: next }), { undo: false });
  return h('div',
    h('p.muted', 'Dodatkowe pola informacji o państwach (np. „Rezerwy złota”, „Religia”, „Poziom korupcji”). Wartości wpisuje GM w 📊 Statystykach. Pole jawne widzą wszyscy gracze, niejawne tylko państwo i GM.'),
    list.map((f, i) => h('div.gm-row', h('div.grow', h('b', f.label), h('small.muted', ` · ${f.section} · ${f.public ? 'jawne' : 'niejawne'}`)),
      h('div.btn-row', h('button.btn.xs', { disabled: !i, onclick: () => { const n = [...list]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; save(n, 'reorder'); } }, '↑'),
        h('button.btn.xs.danger', { onclick: async () => { if (await confirmBox(`Usunąć pole „${f.label}”? Wpisane wartości zostaną w bazie, ale znikną z widoku.`, { danger: true })) save(list.filter((_, j) => j !== i), 'delete ' + f.label); } }, '🗑')))),
    !list.length ? h('div.empty', 'Brak własnych pól.') : null,
    h('button.btn.sm.primary', { onclick: async () => {
      const v = await form('Nowe pole państwa', [{ k: 'label', label: 'Nazwa pola', req: true, ph: 'np. Rezerwy złota' }, { k: 'section', label: 'Sekcja', type: 'select', options: sections }, { k: 'public', label: 'Jawne dla wszystkich graczy', type: 'check' }]);
      if (v) save([...list, { key: 'f' + newId(), label: v.label, section: v.section, public: !!v.public }], 'add ' + v.label);
    } }, '+ Nowe pole'));
}

function settings() {
  const g = S.game || {};
  return h('div',
    isAdmin() ? h('section', h('h3', 'Kopie zapasowe'), h('button.btn.sm', { onclick: async () => { const v = await form('Automatyczne kopie', [{ k: 'every', label: 'Auto-backup co (minut, 0 = wył.)', type: 'number', value: g.autoBackupMinutes ?? 60 }, { k: 'keep', label: 'Ile automatycznych trzymać', type: 'number', value: g.keepAutoBackups || 20 }]); if (v) run('BACKUP_SETTINGS', '', w => w.merge('meta/game', { autoBackupMinutes: v.every ?? 60, keepAutoBackups: v.keep || 20 }), { undo: false }); } }, '⚙️ Ustawienia auto-backupu')) : null,
    h('section', h('h3', 'Własne lokalizacje'), h('p.muted', 'Bazy, lotniska, fikcyjne miejsca — pojawią się w podpowiedziach tras.'),
      (g.places || []).map((p, i) => h('div.gm-row', h('div.grow', `${p.name} (${p.lat.toFixed(2)}, ${p.lon.toFixed(2)})`), h('button.btn.xs.danger', { onclick: () => run('DELETE_PLACE', p.name, w => w.merge('meta/game', { places: (g.places || []).filter((_, j) => j !== i) })) }, '🗑'))),
      h('button.btn.sm', { onclick: async () => { const v = await form('Nowa lokalizacja', [{ k: 'name', label: 'Nazwa', req: true }, { k: 'p', label: 'Pozycja', type: 'place', req: true }, { k: 'cc', label: 'Państwo', type: 'select', options: [['', '—'], ...countriesSorted().map(c => [c.iso2, `${c.flag} ${c.name}`])] }]); if (v) run('ADD_PLACE', v.name, w => w.merge('meta/game', { places: [...(g.places || []), { name: v.name, lat: +v.p.lat, lon: +v.p.lon, cc: v.cc }] })); } }, '+ Lokalizacja')),
    h('section', h('h3', 'Świat'),
      h('div.btn-row.wrap', h('button.btn.sm', { onclick: async () => { if (await confirmBox('Wczytać przykładowy świat (Szwecja, Polska, USA, Chiny, Meksyk…)? Istniejące dane z tymi samymi ID zostaną nadpisane. Najpierw zrobię backup.')) { await createBackup('Before sample world', { auto: true, reason: 'pre-import', quiet: true }); await seedWorld(true); toast('Wczytano przykładowy świat', 'ok'); } } }, '🌍 Wczytaj przykładowy świat'),
        isAdmin() ? h('button.btn.sm.danger', { onclick: wipeWorld }, '☢ Wyczyść świat') : null,
        isAdmin() ? h('button.btn.sm.danger', { onclick: factoryReset }, '💣 Usuń wszystko (po testach)') : null)));
}
async function wipeWorld() {
  if (!await confirmBox('Usunąć WSZYSTKIE państwa, obiekty, postacie, newsy, traktaty, wiadomości i kronikę? Gracze, backupy i logi zostają. Najpierw zrobię backup.', { danger: true, ok: 'Wyczyść' })) return;
  const b = await createBackup('Before wipe', { auto: false, reason: 'pre-wipe', quiet: true }); if (!b) return;
  const cols = ['countries', 'countryPrivate', 'characters', 'charSecrets', 'units', 'unitSecrets', 'intel', 'news', 'gmNotes', 'relations', 'treaties', 'messages', 'history', 'territories'];
  await run('WIPE_WORLD', '', w => cols.forEach(c => Object.keys(S.data[c]).forEach(id => w.del(`${c}/${id}`))), { undo: false });
}

// Pełny reset po testach: świat + wybrane dane systemowe. Zostaje tylko konto admina, który to robi.
async function factoryReset() {
  const v = await form('💣 Usuń wszystko', [
    { type: 'info', html: 'Czyści bazę do zera, np. po testach. <b>Tego nie da się cofnąć</b> — kopie zapasowe też mogą zostać usunięte, więc najlepiej zostaw zaznaczone pobranie pliku.' },
    { k: 'download', label: 'Najpierw pobierz kopię całości do pliku JSON', type: 'check', value: true },
    { k: 'users', label: 'Usuń wszystkich graczy (oprócz Ciebie)', type: 'check', value: true },
    { k: 'backups', label: 'Usuń backupy', type: 'check', value: true },
    { k: 'logs', label: 'Usuń logi i historię cofania', type: 'check', value: true },
    { k: 'settings', label: 'Zresetuj ustawienia (tura, zegar, lokalizacje, pola państw, porządki)', type: 'check', value: true },
    { k: 'confirm', label: 'Wpisz USUŃ, aby potwierdzić', req: true, ph: 'USUŃ' }
  ], { submit: '💣 Usuń' });
  if (!v) return;
  if (v.confirm.toUpperCase() !== 'USUŃ') return toast('Nie potwierdzono — nic nie usunięto', 'info');
  if (v.download) download(`worldwatch-przed-resetem-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(await snapshotWorld(), null, 1));
  const cols = ['countries', 'countryPrivate', 'characters', 'charSecrets', 'units', 'unitSecrets', 'intel', 'news', 'gmNotes', 'relations', 'treaties', 'messages', 'history', 'territories'];
  if (v.logs) cols.push('logs', 'undo');
  const ok = await run('FACTORY_RESET', Object.entries(v).filter(([, x]) => x === true).map(([k]) => k).join(','), async w => {
    for (const c of cols) (await DB.getAll(c)).forEach(d => w.del(`${c}/${d.id}`));
    if (v.users) (await DB.getAll('users')).forEach(u => { if (u.id !== S.user.uid) w.del('users/' + u.id); });
    if (v.backups) (await DB.getAll('backups')).forEach(b => { for (let i = 0; i < (b.parts || 1); i++) w.del(`backups/${b.id}/parts/${i}`); w.del('backups/' + b.id); });
    if (v.settings) ['game', 'clock', 'admin'].forEach(d => w.del('meta/' + d));
  }, { undo: false });
  if (ok) { S._metaChecked = false; S.persp = 'gm'; toast('💣 Baza wyczyszczona', 'ok', 6000); }
}

// ───────── PODBÓJ / TERYTORIA ─────────
function terr() {
  const list = Object.values(S.data.territories).sort((a, b) => (b.since || 0) - (a.since || 0));
  return h('div',
    h('div.btn-row', h('button.btn.sm.primary', { onclick: () => conquer() }, '⚔️ Podbój / zajęcie terenu')),
    h('p.muted', 'Całe państwo z mapy albo narysowany obszar przechodzi pod kontrolę innego państwa. Usunięcie wpisu = teren wraca do pierwotnego właściciela.'),
    list.map(t => h('div.gm-row', { style: { '--c': cColor(t.controller) } },
      h('div.grow', h('b', `${cFlag(t.controller)} ${t.label}`), h('br'), h('small.muted', `${TERR_STATUS[t.status]} · ${t.kind === 'area' ? 'obszar' : 'całe terytorium'}${prevLabel(t) ? ' · wcześniej ' + prevLabel(t) : ''} · od ${G.fmtDate(t.since)}`)),
      h('div.btn-row', t.kind === 'area' && h('button.btn.xs', { onclick: () => flyTo(t.points[0].lat, t.points[0].lon, 5) }, '🗺'),
        h('button.btn.xs', { onclick: () => conquer(t) }, '✏️'),
        h('button.btn.xs', { title: 'Wyzwolenie / zwrot', onclick: () => liberate(t) }, '🕊️')))),
    !list.length ? h('div.empty', 'Brak zajętych terenów.') : null);
}
const cColor = id => country(id)?.color || '#8a93a0';
export async function conquer(t = {}) {
  const names = geoNames(), cOpts = countriesSorted().map(c => [c.id, `${c.flag} ${c.name}`]);
  const byIso = n => countriesSorted().find(c => String(c.isoN) === String(n));
  const v = await form(t.id ? `Terytorium: ${t.label}` : '⚔️ Podbój terenu', [
    { k: 'kind', label: 'Co zostało zajęte', type: 'select', value: t.clipIso ? 'part' : t.kind || 'country', options: [['country', 'Całe państwo / terytorium'], ['part', 'Część państwa — narysuję, przytnie się do granic'], ['area', 'Dowolny obszar — narysuję (np. morze, kilka krajów)']] },
    { k: 'isoN', label: 'Terytorium', type: 'select', value: t.isoN || t.clipIso || '', options: [['', '— wybierz —'], ...names.map(n => [n.isoN, (byIso(n.isoN)?.flag || npcOf(n.isoN)?.flag || '🏳️') + ' ' + n.name + (byIso(n.isoN) ? '' : ' (NPC)')])], show: x => x.kind !== 'area' },
    { k: 'label', label: 'Nazwa obszaru', value: t.kind === 'area' ? t.label : '', ph: 'np. Okręg kaliningradzki, Północna Gotlandia', show: x => x.kind !== 'country' },
    { k: 'redraw', label: 'Narysuj obszar od nowa', type: 'check', value: !t.points, show: x => x.kind !== 'country' && !!t.points },
    { k: 'controller', label: 'Kontroluje teraz', type: 'select', value: t.controller, options: cOpts, req: true },
    { k: 'previous', label: 'Poprzedni właściciel', type: 'select', value: t.previous || (t.previousName ? 'npc:' + t.previousName : ''), options: [['', '— auto —'], ...cOpts, ...names.filter(n => !byIso(n.isoN)).map(n => ['npc:' + n.name, `${npcOf(n.isoN)?.flag || '🏳️'} ${n.name} (NPC)`])] },
    { k: 'status', label: 'Status', type: 'select', value: t.status || 'occupied', options: Object.entries(TERR_STATUS) },
    { k: 'news', label: 'Ogłoś w newsach', type: 'check', value: !t.id }, { k: 'chron', label: 'Dodaj do kroniki', type: 'check', value: !t.id }
  ], { submit: t.id ? 'Zapisz' : 'Dalej' });
  if (!v) return;
  if (v.kind !== 'area' && !v.isoN) return toast('Wybierz terytorium', 'err');
  const part = v.kind === 'part'; if (part) v.kind = 'area';
  let points = t.points || null;
  if (v.kind === 'area' && (v.redraw || !points || (part && t.clipIso !== v.isoN))) {
    if (part) focusCountry(v.isoN);
    toast(part ? 'Obrysuj zajętą część — granice kraju zostaną dopasowane same' : 'Obrysuj teren na mapie i kliknij „Zakończ”', 'info');
    hideModals(true); points = await drawArea(); hideModals(false);
    if (!points) return toast('Nie narysowano obszaru — anulowano', 'info');
  }
  if (part && !clipToCountry(points, v.isoN)?.length) return toast('Narysowany obszar nie zachodzi na wybrane państwo', 'err');
  const partOf = part ? names.find(n => n.isoN === v.isoN)?.name || '' : '';
  const label = v.kind === 'country' ? (names.find(n => n.isoN === v.isoN)?.name || v.isoN) : (v.label || (part ? `Część: ${partOf}` : 'Zajęty obszar'));
  const npc = v.previous.startsWith('npc:') ? v.previous.slice(4) : '';
  const previous = (!npc && v.previous) || (v.kind === 'country' || part ? byIso(v.isoN)?.id : '') || null;
  const previousName = previous ? '' : npc || (v.kind === 'country' ? label : partOf);
  const id = t.id || (v.kind === 'country' ? 'iso' + v.isoN : newId());
  const doc = { kind: v.kind, isoN: v.kind === 'country' ? v.isoN : null, points: v.kind === 'area' ? points : null, clipIso: part ? v.isoN : null, label, controller: v.controller, previous, previousName, status: v.status, since: t.since || gameNow(), turn: t.turn || turn() };
  const verb = { occupied: 'forces take control of', annexed: 'annexes', contested: 'forces clash over' }[v.status];
  const head = `⚔️ ${cFlag(v.controller)} ${v.status === 'annexed' ? cName(v.controller) : cDem(v.controller)} ${verb} ${part && !v.label ? 'part of ' + partOf : label}`;
  await run(t.id ? 'UPDATE_TERRITORY' : 'CONQUEST', `${cName(v.controller)} → ${label}`, w => {
    w.set('territories/' + id, doc);
    const at = points ? points[0] : null;
    if (v.news) w.set('news/' + newId(), { headline: head, body: '', category: 'Conflict', reliability: 'Confirmed', breaking: true, countries: [v.controller, previous].filter(Boolean), gameTime: gameNow(), createdAt: now(), audienceAll: true, audience: [], source: 'gm', place: at ? { name: label, lat: at.lat, lon: at.lon } : null });
    if (v.chron) w.set('history/' + newId(), { turn: turn(), gameTime: gameNow(), text: head.replace(/^⚔️ \S+ /, '') + '.', countries: [v.controller, previous].filter(Boolean), createdAt: now() });
  });
}
async function liberate(t) {
  const v = await form(`🕊️ ${t.label} wraca do ${prevLabel(t) || 'pierwotnego właściciela'}`, [{ k: 'news', label: 'Ogłoś w newsach', type: 'check', value: true }, { k: 'chron', label: 'Dodaj do kroniki', type: 'check', value: true }], { submit: 'Zwróć teren' });
  if (!v) return;
  const head = `🕊️ ${cDem(t.controller)} forces withdraw from ${t.label}`;
  await run('LIBERATE_TERRITORY', t.label, w => {
    w.del('territories/' + t.id);
    if (v.news) w.set('news/' + newId(), { headline: head, body: '', category: 'Conflict', reliability: 'Confirmed', breaking: false, countries: [t.controller, t.previous].filter(Boolean), gameTime: gameNow(), createdAt: now(), audienceAll: true, audience: [], source: 'gm' });
    if (v.chron) w.set('history/' + newId(), { turn: turn(), gameTime: gameNow(), text: head.slice(3) + '.', countries: [t.controller, t.previous].filter(Boolean), createdAt: now() });
  });
}
