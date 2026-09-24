// WORLDWATCH — start aplikacji, logowanie, układ, zegar, karta obiektu, powiadomienia
import { initBackend, DB, AUTH, isDemo, now } from './db.js';
import { ADMIN_UIDS } from './db.js';
import { S, emit, onChange, startSubscriptions, stopAll, realGM, role, myCountry, persp, gmView, gameNow, turn, unitViews, statusOf, statusChip, tr, posOf, speedKmh, feedItems,
  cFlag, cName, flagOf, countriesSorted, allPlaces, placeLabel, parsePlace, nearestPlace, charName, setToast, run, G, createBackup, cleanupLogs, KINDS } from './store.js';
import { h, $, $$, esc, toast, modal, form, hooks, confirmBox, kv, searchable } from './ui.js';
import { initMap, render as renderMap, select, selectedKey, LAYERS, isOn, toggleLayer, pickOnMap, flyTo, colorOf, linesMode, canSeeAllLines, setLinesAll, setLineFocus } from './map.js';
import * as U from './units.js';
import { PANELS, openNews } from './panels.js';
import { autoClean } from './gm.js';
import { seedWorld } from './seed.js';
import './images.js';

setToast(toast);
hooks.pickOnMap = pickOnMap; hooks.parsePlace = parsePlace;

let tab = localStorage.getItem('ww_tab') || 'feed';
let mobileOpen = false;

// ───────────────────────── START ─────────────────────────
(async function boot() {
  try { await initBackend(); } catch (e) { $('#login').replaceChildren(h('div.login-card', h('h1.brand', '🌍 WORLDWATCH'), h('p.err', 'Nie udało się połączyć z Firebase: ' + e.message))); return; }
  document.body.classList.toggle('demo', isDemo);
  AUTH.onChange(onAuth);
})();

let meUnsub = null;
async function onAuth(u) {
  meUnsub && meUnsub(); meUnsub = null; stopAll(); S.user = u; S.me = null;
  if (!u) return showLogin();
  if (isDemo) { await ensureDemoUser(u); }
  meUnsub = DB.listenDoc('users/' + u.uid, async d => {
    const prevRole = S.me?.role, prevC = S.me?.countryId;
    if (!d) {
      const isOwner = ADMIN_UIDS.includes(u.uid);
      try { await DB.commit([{ t: 'set', path: 'users/' + u.uid, data: { displayName: u.name, email: u.email || '', role: isOwner ? 'admin' : 'pending', countryId: null, createdAt: Date.now(), lastSeen: Date.now() } }]); }
      catch (e) { showPending(u, 'Nie można utworzyć profilu: ' + e.message); }
      return;
    }
    S.me = d;
    if (ADMIN_UIDS.includes(u.uid) && d.role !== 'admin') DB.commit([{ t: 'merge', path: 'users/' + u.uid, data: { role: 'admin' } }]).catch(() => { });
    if (!['admin', 'gm', 'leader', 'observer'].includes(role())) return showPending(u);
    if (prevRole !== S.me.role || prevC !== S.me.countryId || !appStarted) startApp();
    emit();
  });
}

const DEMO_WHO = [['demo-admin', 'Admin (Ty)', 'admin', null], ['demo-gm', 'Mistrz Gry (GM)', 'gm', null], ['demo-se', 'Gracz — Szwecja', 'leader', 'se'], ['demo-pl', 'Gracz — Polska', 'leader', 'pl'], ['demo-us', 'Gracz — USA', 'leader', 'us'], ['demo-cn', 'Gracz — Chiny', 'leader', 'cn'], ['demo-obs', 'Obserwator', 'observer', null]];
async function ensureDemoUser(u) {
  const ops = [];
  for (const [uid, name, role, c] of DEMO_WHO) if (!(await DB.get('users/' + uid))) ops.push({ t: 'set', path: 'users/' + uid, data: { displayName: name, email: '', role, countryId: c, createdAt: Date.now(), lastSeen: uid === u.uid ? Date.now() : 0 } });
  if (ops.length) await DB.commit(ops);
  const meta = await DB.get('meta/game');
  if (!meta) await seedWorld();
}

// ───────────────────────── LOGOWANIE ─────────────────────────
function showLogin() {
  appStarted = false;
  $('#app').hidden = true;
  const box = $('#login'); box.hidden = false;
  if (isDemo) {
    const who = DEMO_WHO;
    box.replaceChildren(h('div.login-card',
      h('h1.brand', '🌍 WORLDWATCH'), h('p.tag', 'Konsola obserwacji geopolitycznej'),
      h('div.demo-note', h('b', 'TRYB DEMO'), ' — brak konfiguracji Firebase. Dane zapisują się tylko w tej przeglądarce. Otwórz drugą kartę jako inny gracz, żeby zobaczyć różnice w widoczności.'),
      h('div.who', who.map(([uid, name, r, c]) => h('button.btn.who-btn', { onclick: () => AUTH.demoLogin({ uid, name, email: '', role: r, countryId: c }) }, c ? h('span.flag', flagOf(c)) : h('span.flag', r === 'admin' ? '🛡️' : r === 'gm' ? '🎲' : '👁️'), name))),
      h('button.btn.link', { onclick: async () => { if (await confirmBox('Wyczyścić lokalny świat demo i zacząć od nowa?', { danger: true })) { DB.wipe(); location.reload(); } } }, 'Resetuj świat demo')));
    return;
  }
  const email = h('input', { type: 'email', placeholder: 'e-mail', autocomplete: 'email' });
  const pass = h('input', { type: 'password', placeholder: 'hasło', autocomplete: 'current-password' });
  const name = h('input', { placeholder: 'nazwa gracza (przy rejestracji)' });
  const err = h('div.form-err');
  const wrapE = f => async () => { err.textContent = ''; try { await f(); } catch (e) { err.textContent = plErr(e); } };
  box.replaceChildren(h('div.login-card',
    h('h1.brand', '🌍 WORLDWATCH'), h('p.tag', 'Konsola obserwacji geopolitycznej'),
    h('button.btn.primary.wide', { onclick: wrapE(() => AUTH.google()) }, 'Zaloguj przez Google'),
    h('div.or', 'albo'),
    h('div.login-form', email, pass,
      h('div.btn-row', h('button.btn.primary', { onclick: wrapE(() => AUTH.email(email.value.trim(), pass.value)) }, 'Zaloguj'), h('button.btn', { onclick: wrapE(() => AUTH.register(email.value.trim(), pass.value, name.value.trim())) }, 'Załóż konto')),
      name, h('button.btn.link', { onclick: wrapE(async () => { await AUTH.reset(email.value.trim()); toast('Wysłano link resetu hasła', 'ok'); }) }, 'Nie pamiętam hasła')),
    err));
}
const plErr = e => ({ 'auth/invalid-credential': 'Błędny e-mail lub hasło.', 'auth/email-already-in-use': 'Ten e-mail ma już konto.', 'auth/weak-password': 'Hasło musi mieć min. 6 znaków.', 'auth/invalid-email': 'Nieprawidłowy e-mail.', 'auth/popup-closed-by-user': 'Zamknięto okno logowania.' }[e.code] || e.message);

function showPending(u, extra) {
  appStarted = false;
  $('#app').hidden = true; const box = $('#login'); box.hidden = false;
  box.replaceChildren(h('div.login-card', h('h1.brand', '🌍 WORLDWATCH'),
    h('h3', 'Oczekiwanie na zatwierdzenie'),
    h('p', `Zalogowano jako ${u.email || u.name}. GM musi przypisać Ci rolę i państwo.`),
    h('div.uid', 'Twój UID: ', h('code', u.uid), h('button.btn.sm', { onclick: () => { navigator.clipboard?.writeText(u.uid); toast('Skopiowano UID', 'ok'); } }, 'kopiuj')),
    h('p.muted', 'Jeśli jesteś właścicielem (admin): wklej ten UID do js/firebase-config.js (ADMIN_UIDS) i do firestore.rules (owner()), opublikuj reguły i odśwież stronę.'),
    extra ? h('p.err', extra) : null,
    h('button.btn', { onclick: () => AUTH.out() }, 'Wyloguj')));
}

// ───────────────────────── APLIKACJA ─────────────────────────
let appStarted = false, offChange = null, presence = null, sysTimer = null;
function startApp() {
  appStarted = true;
  $('#login').hidden = true; $('#app').hidden = false;
  startSubscriptions();
  buildShell();
  DB.syncClock(S.user.uid);
  DB.commit([{ t: 'merge', path: 'users/' + S.user.uid, data: { lastSeen: Date.now() } }]).catch(() => { });
  clearInterval(presence); presence = setInterval(() => DB.commit([{ t: 'merge', path: 'users/' + S.user.uid, data: { lastSeen: Date.now() } }]).catch(() => { }), 60000);
  clearInterval(sysTimer); sysTimer = setInterval(systemDuties, 60000); setTimeout(systemDuties, 3000);
  offChange && offChange(); offChange = onChange(refreshAll);
  firstFeed = true;
  if ('Notification' in window && Notification.permission === 'default' && notifPref() !== 'off') setTimeout(() => toast(h('span', 'Powiadomienia na tym urządzeniu? ', h('button.btn.sm', { onclick: enableNotifs }, 'Włącz')), 'info', 12000), 4000);
}

// zadania GM w tle: auto-backup, sprzątanie logów
async function systemDuties() {
  if (!realGM() || !S.game) return;
  if (!S._metaChecked) {   // pierwszy start na czystym Firebase: domyślne ustawienia gry i zegar
    S._metaChecked = true;
    const ops = [];
    if (!(await DB.get('meta/game'))) ops.push({ t: 'set', path: 'meta/game', data: { turn: 1, logRetentionDays: 7, autoBackupMinutes: 60, keepAutoBackups: 20, turnAdvance: 0, backupCounter: 0 } });
    if (!(await DB.get('meta/clock'))) ops.push({ t: 'set', path: 'meta/clock', data: { running: true, rate: 1, anchorGame: now(), anchorReal: now() } });
    if (ops.length) await DB.commit(ops).catch(e => console.warn(e));
  }
  const every = S.game.autoBackupMinutes ?? 60;
  if (every > 0 && now() - (S.game.lastAutoBackup || 0) > every * 60000) await createBackup(`Auto — ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`, { auto: true, reason: 'interval', quiet: true });
  if (now() - (S._lastClean || 0) > 3600000) { S._lastClean = now(); const n = await cleanupLogs(); if (n) console.log('logi usunięte:', n); }
  autoClean();
}

function buildShell() {
  const app = $('#app');
  const tabsDef = tabList();
  if (!tabsDef.find(t => t.k === tab)) tab = 'feed';
  app.replaceChildren(
    h('a.skip', { href: '#panel', onclick: e => { e.preventDefault(); setTab(tab); $('#panel').focus(); } }, 'Przejdź do panelu'),
    h('header#top',
      h('div.brand-sm', { onclick: () => select(null) }, h('span.globe', '🌍'), h('b', 'WORLDWATCH')),
      h('div#clock', { onclick: () => realGM() && clockModal(), title: realGM() ? 'Zegar gry (GM)' : 'Czas gry' }),
      h('div.top-right',
        realGM() ? h('select#persp', { title: 'Perspektywa — zobacz świat oczami gracza', onchange: e => { S.persp = e.target.value; select(null); refreshAll(); } }) : null,
        h('div#me'),
        h('button#bell.icon-btn', { onclick: () => { setTab('feed'); markAllRead(); }, title: 'Powiadomienia' }, '🔔', h('span.badge', { hidden: true })),
        h('button.icon-btn', { onclick: userMenu, title: 'Konto' }, '☰'))),
    h('div#main',
      h('div#map'),
      h('div#layerbar', { role: 'toolbar', 'aria-label': 'Warstwy mapy' }),
      h('div#perspbar', { hidden: true }),
      h('div#unitcard', { hidden: true }),
      h('button#fab.btn.primary', { onclick: quickCreate, hidden: !(realGM() || myCountry()) }, '＋ Wydarzenie'),
      h('aside#side', h('nav#tabs', { role: 'tablist', 'aria-label': 'Panele' }), h('div#panel', { tabIndex: -1, role: 'tabpanel' }))),
    h('nav#mobnav', { 'aria-label': 'Nawigacja' }));
  initMap($('#map'), { onSelectUnit: k => { if (k && mobileOpen && matchMedia('(max-width: 820px)').matches) { if (history.state?.ww === 'sheet') history.back(); else closeSheet(); } renderCard(k); }, onCountryClick: cid => { PANELS.country.open?.(cid); setTab('country'); refreshAll(); } });
  if (!window._wwListeners) { window._wwListeners = 1; window.addEventListener('ww:tick', onTick); window.addEventListener('ww:news', e => openNews(e.detail)); window.addEventListener('ww:tab', e => setTab(e.detail)); window.addEventListener('ww:refresh', () => { select(null); refreshAll(); }); }
  renderTabs(); refreshAll();
}
const tabList = () => [
  { k: 'feed', i: '📰', l: 'Aktualności', s: 'Wiadom.' }, { k: 'country', i: '🏛️', l: myCountry() || gmView() ? 'Kraj' : 'Państwa' },
  ...(myCountry() || realGM() ? [{ k: 'diplo', i: '🤝', l: 'Dyplomacja', s: 'Dypl.' }, { k: 'intel', i: '📡', l: 'Wywiad' }] : []),
  { k: 'chron', i: '📜', l: 'Kronika' }, ...(realGM() ? [{ k: 'gm', i: '⚙️', l: 'GM' }] : [])];
function setTab(k) {
  // telefon: otwarty panel = wpis w historii, więc systemowe „wstecz” wraca do mapy zamiast zamykać aplikację
  if (!mobileOpen && matchMedia('(max-width: 820px)').matches) history.pushState({ ww: 'sheet' }, '');
  tab = k; localStorage.setItem('ww_tab', k); mobileOpen = true; document.body.classList.add('sheet-open'); renderTabs(); renderPanel(true);
}
function closeSheet() { mobileOpen = false; document.body.classList.remove('sheet-open'); renderTabs(); }
window.addEventListener('popstate', () => { const w = [...document.querySelectorAll('.modal-wrap')].pop(); if (w) { w._requestClose ? w._requestClose() : w.remove(); if (mobileOpen) history.pushState({ ww: 'sheet' }, ''); } else if (mobileOpen) closeSheet(); });
function renderTabs() {
  const list = tabList();
  $('#tabs').replaceChildren(...list.map(t => h('button.tab' + (t.k === tab ? '.on' : ''), { role: 'tab', 'aria-selected': String(t.k === tab), onclick: () => setTab(t.k) }, h('span', { 'aria-hidden': 'true' }, t.i), ' ', t.l)));
  $('#mobnav').replaceChildren(h('button' + (!mobileOpen ? '.on' : ''), { onclick: () => { if (mobileOpen && history.state?.ww === 'sheet') history.back(); else closeSheet(); } }, h('span', { 'aria-hidden': 'true' }, '🗺️'), h('small', 'Mapa')),
    ...list.map(t => h('button' + (mobileOpen && t.k === tab ? '.on' : ''), { 'aria-current': mobileOpen && t.k === tab ? 'page' : null, 'aria-label': t.l, onclick: () => setTab(t.k) }, h('span', { 'aria-hidden': 'true' }, t.i), h('small', t.s || t.l))));
}

// zachowuje wpisywany tekst przy odświeżaniu panelu
function renderPanel(force) {
  const panel = $('#panel'); if (!panel) return;
  const P = PANELS[tab]; if (!P) return;
  const keep = {}; let focusId = null, sel = null;
  $$('[data-keep]', panel).forEach(el => { keep[el.dataset.keep] = el.value; if (el === document.activeElement) { focusId = el.dataset.keep; try { sel = [el.selectionStart, el.selectionEnd]; } catch { } } });
  if (!force && focusId && P.noRefreshWhileTyping) return;
  const st = panel.scrollTop;
  panel.replaceChildren(P.render());
  $$('.country-picker > select', panel).forEach(sel => { const ph = document.createComment(''); sel.replaceWith(ph); ph.replaceWith(searchable(sel, 8)); });
  $$('[data-keep]', panel).forEach(el => { if (keep[el.dataset.keep] != null) el.value = keep[el.dataset.keep]; if (el.dataset.keep === focusId) { el.focus(); try { sel && el.setSelectionRange(...sel); } catch { } } });
  if (!force) panel.scrollTop = st;
}

function refreshAll() {
  if (!appStarted || !$('#top')) return;
  const ps = $('#persp');
  if (ps) { const val = S.persp || 'gm'; ps.replaceChildren(h('option', { value: 'gm' }, '🎲 Widok GM (pełny)'), ...countriesSorted().map(c => h('option', { value: c.id }, `👁 jako ${c.flag} ${c.name}`)), h('option', { value: '__obs' }, '👁 jako obserwator')); ps.value = val; }
  const me = $('#me'), C = myCountry();
  me.replaceChildren(...[h('span.role.' + role(), role() === 'admin' ? 'ADMIN' : role() === 'gm' ? 'GM' : role() === 'leader' ? 'PRZYWÓDCA' : 'OBSERWATOR'), C ? h('span.mycountry', `${cFlag(C)} ${cName(C)}`) : null].filter(Boolean));
  $('#fab').hidden = !(realGM() || C);
  $('#layerbar').replaceChildren(...LAYERS.map(l => h('button.layer' + (isOn(l.k) ? '.on' : ''), { 'aria-pressed': String(isOn(l.k)), onclick: () => { toggleLayer(l.k); refreshAll(); }, title: (isOn(l.k) ? 'Ukryj: ' : 'Pokaż: ') + l.l }, l.i, h('span', l.l))));
  // przełącznik linii: wszystkie (GM / obserwator) albo tylko kliknięte państwo
  if (['trade', 'alliances', 'conflicts'].some(isOn)) {
    const lm = linesMode(), all = canSeeAllLines(), who = lm.focus ? `${cFlag(lm.focus)} ${cName(lm.focus)}` : 'kliknij państwo';
    $('#layerbar').append(h('button.layer.on.lines-mode', { title: all ? 'Przełącz: wszystkie linie / tylko wybrane państwo' : 'Pokazujesz linie jednego państwa — kliknij inne na mapie; tu wracasz do swojego', onclick: () => { all ? setLinesAll(!lm.all) : setLineFocus(null); refreshAll(); } }, '🔗', h('span', lm.all ? 'Linie: wszystkie' : `Linie: ${who}`)));
  }
  const pb = $('#perspbar'), pv = realGM() && S.persp && S.persp !== 'gm' ? S.persp : null;
  if (pb) { pb.hidden = !pv; document.body.classList.toggle('persp-on', !!pv); if (pv) pb.replaceChildren(h('span', '👁 Widzisz świat jako ', h('b', pv === '__obs' ? 'obserwator' : `${cFlag(pv)} ${cName(pv)}`)), h('button.btn.xs', { onclick: () => { S.persp = 'gm'; select(null); refreshAll(); } }, 'Wróć do widoku GM')); }
  const dl = $('#dl-places'); if (dl && (dl.childElementCount < 10 || S._plc !== Object.keys(S.data.countries).length)) { S._plc = Object.keys(S.data.countries).length; dl.replaceChildren(...allPlaces().map(p => h('option', { value: placeLabel(p) }))); }
  renderTabs(); renderMap(); renderPanel(); renderCard(selectedKey()); checkNotifications();
}

// ───────── zegar ─────────
let lastPanelTick = 0;
function onTick() {
  const t = gameNow(), c = S.clock;
  const el = $('#clock');
  if (el) el.replaceChildren(
    h('span.cdate', G.fmtDate(t)), h('span.ctime', G.fmtTime(t) + 'Z'),
    h('span.cturn', `TURA ${turn()}`),
    h('span.crate' + (c?.running === false ? '.paused' : ''), c?.running === false ? '❚❚ PAUZA' : `▶ ×${+(c?.rate || 1).toFixed(2)}`));
  updateCardDyn();
  if (Date.now() - lastPanelTick > 5000) { lastPanelTick = Date.now(); if (tab === 'feed') renderPanel(); checkNotifications(); }
}
export async function clockModal() {
  const c = S.clock || { running: true, rate: 1, anchorGame: now(), anchorReal: now() };
  const set = async (patch, label) => {
    const g = gameNow();
    await run('CLOCK', label, w => w.set('meta/clock', { running: c.running !== false, rate: c.rate || 1, ...patch, anchorGame: patch.anchorGame ?? g, anchorReal: now() }));
  };
  const presets = [[1, 'Czas rzeczywisty ×1'], [10, '1 min = 10 min'], [60, '1 min = 1 h'], [7, '1 dzień = 1 tydzień'], [30, '1 dzień = 1 miesiąc'], [1440, '1 min = 1 dzień']];
  const m = modal('⏱️ Zegar gry', h('div.clock-modal',
    h('div.big-clock', G.fmtDT(gameNow()) + ' UTC'),
    h('div.btn-row', c.running !== false ? h('button.btn', { onclick: () => { set({ running: false }, 'PAUSE'); m.close(); } }, '❚❚ Zatrzymaj czas') : h('button.btn.primary', { onclick: () => { set({ running: true }, 'RESUME'); m.close(); } }, '▶ Wznów czas')),
    h('div.form-section', 'Tempo'),
    h('div.btn-row.wrap', presets.map(([r, l]) => h('button.btn.sm' + ((c.rate || 1) === r ? '.primary' : ''), { onclick: () => { set({ rate: r }, 'RATE ×' + r); m.close(); } }, l)),
      h('button.btn.sm', { onclick: async () => { const v = await form('Własne tempo', [{ k: 'r', label: 'Mnożnik (minut gry na minutę realną)', type: 'number', value: c.rate || 1, req: true }]); if (v && v.r > 0) { set({ rate: v.r }, 'RATE ×' + v.r); m.close(); } } }, 'inne…')),
    h('div.form-section', 'Skok w czasie'),
    h('div.btn-row.wrap', [[-86400000, '−1 d'], [-3600000, '−1 h'], [-600000, '−10 min'], [600000, '+10 min'], [3600000, '+1 h'], [86400000, '+1 d'], [7 * 86400000, '+1 tydz.']].map(([d, l]) => h('button.btn.sm', { onclick: () => { set({ anchorGame: gameNow() + d }, 'JUMP ' + l); m.close(); } }, l))),
    h('div.btn-row', h('button.btn', { onclick: async () => { const v = await form('Ustaw datę gry', [{ k: 't', label: 'Data i godzina', type: 'datetime', value: gameNow(), now: gameNow }]); if (v?.t) { set({ anchorGame: v.t }, 'SET DATE'); m.close(); } } }, '📅 Ustaw konkretną datę'),
      h('button.btn', { onclick: () => { m.close(); PANELS.gm.newTurn(); } }, '⏭ Nowa tura'))));
}

// ───────── karta obiektu (FlightRadar) ─────────
let cardView = null;
function renderCard(key) {
  const box = $('#unitcard'); if (!box) return;
  const v = key && unitViews().find(x => x.key === key);
  cardView = v || null;
  if (!v) { box.hidden = true; return; }
  box.hidden = false;
  const air = v.kind === 'aircraft', r = v.route || [], moving = r.length > 1 && v.duration && !v.hideFuture;
  // karta: 3 akcje pasujące do stanu obiektu na wierzchu, reszta w „Więcej”, usuwanie osobno
  const main = [], more = [];
  let del = null;
  const sec = v.src === 'full' ? v : null;
  if (sec && v.canEdit) {
    const id = v.id, A = (to, l, f, cls) => to.push(h('button.btn.sm' + (cls ? '.' + cls : ''), { onclick: f }, l));
    const mobile = ['aircraft', 'ship', 'submarine', 'ground'].includes(v.kind), pax = ['aircraft', 'ship', 'ground'].includes(v.kind);
    if (moving) {
      A(main, '↪ Zmień cel', () => U.redirectUnit(id)); A(main, '⏱ Opóźnij', () => U.delayUnit(id)); A(main, v.holdAt ? '▶ Wznów' : '⏸ Wstrzymaj', () => U.holdUnit(id));
      A(more, '⌛ Czas lotu', () => U.setDuration(id)); A(more, '↩ Zawróć', () => U.redirectUnit(id, 'return')); A(more, '⏹ Zakończ teraz', () => U.finishNow(id));
      if (air) A(more, '🚨 Lądowanie awaryjne', () => U.redirectUnit(id, 'emergency'), 'danger');
      if (pax) A(more, '👥 Manifest', () => U.manifest(id));
      A(more, '✏️ Edytuj', () => U.editUnit(U.secOf(id)));
    } else {
      if (mobile) A(main, '🧭 Nowa podróż', () => U.createTrip({ countryId: v.countryId, unitId: id }));
      A(main, '✏️ Edytuj', () => U.editUnit(U.secOf(id)));
      if (pax) A(main, '👥 Manifest', () => U.manifest(id));
    }
    if (moving && mobile) A(more, '🧭 Nowa podróż', () => U.createTrip({ countryId: v.countryId, unitId: id }));
    if (realGM()) A(realGM() && !moving ? main : more, '📡 Wywiad', () => U.distributeIntel(id));
    del = h('button.btn.sm.danger.del', { onclick: () => U.deleteUnit(id) }, '🗑 Usuń');
  }
  if (v.src === 'intel' && realGM()) del = h('button.btn.sm.danger.del', { onclick: async () => { if (await confirmBox(`Usunąć raport wywiadu „${v.label}”?`, { danger: true, ok: 'Usuń' })) run('DELETE_INTEL', v.label, w => w.del('intel/' + v.id)); } }, '🗑 Usuń raport');
  const acts = [...main, more.length ? h('details.more', h('summary.btn.sm', 'Więcej'), h('div.more-list', more)) : null, del].filter(Boolean);
  const pax = sec && sec.passengerIds?.length ? h('div.pax', h('div.k', 'Manifest'), sec.passengerIds.map(id => h('div.pax-row', charName(id)))) : null;
  box.replaceChildren(h('div.card',
    h('div.card-head', { style: { borderColor: colorOf(v) } },
      h('div', h('div.cs', v.countryId ? cFlag(v.countryId) + ' ' : v.src === 'intel' ? '📡 ' : '⚠️ ', v.label), h('div.sub', v.sub || KINDS[v.kind]?.en || '')),
      h('div.card-head-r', h('span.status', { 'data-dyn': 'status' }), h('button.icon-btn', { onclick: () => select(null), 'aria-label': 'Zamknij' }, '✕'))),
    v.src !== 'full' ? h('div.srcnote.' + v.src, v.src === 'intel' ? `RAPORT WYWIADU · pewność ${v.confidence ?? '?'}%` : v.visibility === 'public' ? 'INFORMACJA PUBLICZNA' : v.visibility === 'limited' ? 'INFORMACJA OGRANICZONA' : `NIEZIDENTYFIKOWANY · pewność ${v.confidence ?? '?'}%`) : h('div.srcnote.full', gmView() ? 'PEŁNA INFORMACJA (GM)' : 'TWÓJ OBIEKT — PEŁNA INFORMACJA'),
    moving ? h('div.route',
      h('div.ap', h('b', code(r[0].name)), h('small', r[0].name), h('span', { 'data-dyn': 'dep' })),
      h('div.bar', h('div.fill', { 'data-dyn': 'bar' }), h('span.plane', { 'data-dyn': 'plane' }, air ? '✈' : v.kind === 'ground' ? '▸' : '⛴')),
      h('div.ap.r', h('b', code(r[r.length - 1].name)), h('small', r[r.length - 1].name), h('span', { 'data-dyn': 'eta' }))) : null,
    h('div.dyn-grid', h('div', h('small', 'Pozycja'), h('span', { 'data-dyn': 'pos' })), h('div', h('small', air ? 'Wysokość' : 'Kurs'), h('span', { 'data-dyn': 'alt' })), h('div', h('small', 'Prędkość'), h('span', { 'data-dyn': 'spd' }))),
    h('div.lines', (v.lines || []).map(l => kv(l.k, l.v))),
    pax,
    sec?.legs?.length ? h('details.legs', h('summary', `Historia podróży (${sec.legs.length})`), sec.legs.slice().reverse().map(l => h('div.leg', `${G.fmtDT(l.dep)} · ${l.from} → ${l.to}`))) : null,
    acts.length ? h('div.card-actions', acts) : null));
  updateCardDyn();
}
const code = n => (n || '?').replace(/[^A-Za-zÀ-ž ]/g, '').trim().slice(0, 3).toUpperCase() || '???';
function updateCardDyn() {
  const v = cardView, box = $('#unitcard'); if (!v || !box || box.hidden) return;
  const t = gameNow(), p = posOf(v, t), set = (k, val) => { const e = box.querySelector(`[data-dyn="${k}"]`); if (e) e.textContent = val; };
  const st = statusChip(v, t); const se = box.querySelector('[data-dyn="status"]'); if (se) { se.textContent = st.text; se.className = 'status ' + st.cls; }
  if (!p) return;
  const fuzzy = v.fuzzKm > 0;
  set('pos', fuzzy ? G.posRange(p.pos, v.fuzzKm) : `${p.pos.lat.toFixed(2)}°, ${p.pos.lon.toFixed(2)}°`);
  const moving = p.phase === 'moving', sp = speedKmh(v);
  if (v.kind === 'aircraft') set('alt', moving ? (fuzzy ? '~' : '') + (v.altitude || (p.progress < 0.08 || p.progress > 0.92 ? Math.round(Math.min(p.progress, 1 - p.progress) / 0.08 * 35) * 1000 : 35000)).toLocaleString('pl') + ' stóp' : '0 stóp');
  else set('alt', moving ? `${G.compass(p.heading)} (${Math.round(p.heading)}°)` : '—');
  set('spd', moving && sp ? (v.kind === 'aircraft' ? `${Math.round(sp)} km/h` : `${(sp / 1.852).toFixed(1)} węzła`) : v.kind === 'satellite' ? '27 600 km/h' : '0');
  if (p.start) {
    set('dep', `${p.phase === 'before' ? 'Odlot (plan)' : 'Odlot'} ${G.fmtTime(p.start)}${v.delay ? ' (+' + G.fmtDur(v.delay) + ')' : ''}`);
    set('eta', `${p.phase === 'after' ? 'Przylot' : 'Przylot ok.'} ${G.fmtTime(p.end)}${p.phase === 'moving' ? ' · ' + G.fmtDur(p.end - t) : ''}`);
    const pct = Math.round((p.progress || 0) * 100); const b = box.querySelector('[data-dyn="bar"]'); if (b) b.style.width = pct + '%'; const pl = box.querySelector('[data-dyn="plane"]'); if (pl) pl.style.left = pct + '%';
  }
}

// ───────── szybkie tworzenie ─────────
function quickCreate() {
  const gm = realGM();
  // pogrupowane: najczęstsza akcja gracza (oświadczenie) na górze
  const MOVE = ['Ruch i siły', [['trip', '🧭 Podróż / wizyta dyplomatyczna'], ['aircraft', '✈️ Samolot'], ['ship', '🚢 Okręt / statek'], ['fleet', '⚓ Flota / zespół okrętów'], ['submarine', '🌊 Okręt podwodny'], ['squadron', '🛩️ Szwadron / eskadra'], ['ground', '🪖 Jednostka lądowa'], ['base', '🏗️ Baza / obiekt'], ['zone', '🎯 Ćwiczenia / strefa'], ['satellite', '🛰️ Satelita']]];
  const groups = gm
    ? [['Komunikaty i prasa', [['news', '🔴 Wiadomość / przeciek'], ['paper', '🗞️ Gazeta'], ['card', '🖼️ Grafika wydarzenia'], ['statement', '📢 Oświadczenie państwa']]], MOVE,
       ['Wywiad', [['intel', '📡 Raport wywiadu'], ['contact', '⚠️ Nieznany kontakt radarowy']]], ['Teren i walki', [['battle', '💥 Bitwa / starcie'], ['conquest', '⚔️ Podbój terenu']]]]
    : [['Komunikat', [['statement', '📢 Oświadczenie państwa']]], MOVE, ['Wywiad', [['intel', '📝 Notatka wywiadu']]]];
  const m = modal('Utwórz', h('div.create-groups', groups.map(([title, opts]) => h('section.cg', h('h4', title), h('div.create-grid', opts.map(([k, l]) => h('button.btn.create', { onclick: () => { m.close(); doCreate(k); } }, l)))))));
}
async function doCreate(k) {
  if (k === 'trip') { const id = await U.createTrip(); id && setTimeout(() => select('u:' + id, true), 400); return; }
  if (['news', 'statement', 'paper', 'card'].includes(k)) return PANELS.feed.create(k);
  if (k === 'intel') return U.intelReport();
  if (k === 'conquest') return PANELS.gm.conquer();
  if (k === 'battle') return import('./battle.js').then(B => B.battleForm());
  if (k === 'fleet' || k === 'squadron') { const id = await U.editUnit(null, k === 'fleet' ? 'ship' : 'aircraft', { group: true, category: 'Military', mission: 'Military' }); if (id) setTimeout(() => select('u:' + id, true), 400); return; }
  const id = await U.editUnit(null, k); if (id) setTimeout(() => select('u:' + id, true), 400);
}

// ───────── menu użytkownika ─────────
function userMenu() {
  modal('Konto', h('div.stack',
    kv('Użytkownik', S.me?.displayName || S.user?.name), kv('Rola', { admin: 'Admin', gm: 'Mistrz Gry', leader: 'Przywódca państwa', observer: 'Obserwator' }[role()] || role()), myCountry() ? kv('Państwo', `${cFlag(myCountry())} ${cName(myCountry())}`) : null,
    kv('Dane', isDemo ? 'DEMO (lokalnie w przeglądarce)' : 'Firebase'),
    notifSettings(),
    realGM() ? h('label.frow', h('span.flabel', 'Perspektywa (zobacz świat oczami gracza)'), (() => { const ps = $('#persp').cloneNode(true); ps.id = ''; ps.value = S.persp || 'gm'; ps.onchange = e => { S.persp = e.target.value; select(null); refreshAll(); }; return ps; })()) : null,
    h('button.btn', { onclick: () => AUTH.out() }, 'Wyloguj')));
}

// ───────── POWIADOMIENIA ─────────
let seen = new Set(), firstFeed = true;
const seenKey = () => 'ww_seen_' + (S.user?.uid || '') + '_' + (persp() ?? 'obs');
function checkNotifications() {
  if (!S.user || !S.clock && !isDemo) return;
  const items = feedItems().filter(i => !i.future);
  if (firstFeed) {
    try { seen = new Set(JSON.parse(localStorage.getItem(seenKey()) || '[]')); } catch { seen = new Set(); }
    if (!seen.size) items.forEach(i => seen.add(i.id));
    firstFeed = false; S._seenKey = seenKey(); saveSeen();
  }
  if (S._seenKey !== seenKey()) { firstFeed = true; return checkNotifications(); }
  const fresh = items.filter(i => !seen.has(i.id));
  S.unread = (S.unread || new Set()); fresh.forEach(i => S.unread.add(i.id));
  fresh.slice(0, 4).forEach(i => {
    const txt = i.type === 'news' ? `${i.news.breaking ? '🔴 PILNE: ' : '📰 '}${i.news.headline}` : `${i.icon} ${i.text}`;
    toast(h('span', { onclick: () => i.unitKey ? select(i.unitKey, true) : i.news ? openNews(i.news.id) : setTab(i.type === 'msg' ? 'diplo' : 'feed') }, txt), i.important || i.news?.breaking ? 'hot' : 'info', 7000);

  });
  if (fresh.length > 4) toast(`…i ${fresh.length - 4} więcej w feedzie`, 'info');
  pushSystem(fresh);
  const sp = fresh.filter(i => i.type === 'news' && i.news.special).sort((a, b) => (b.news.gameTime || 0) - (a.news.gameTime || 0));
  if (sp.length && !realGM()) specialEdition(sp[0].news);
  fresh.forEach(i => seen.add(i.id)); if (fresh.length) saveSeen();
  const b = $('#bell .badge'); if (b) { const n = S.unread.size; b.hidden = !n; b.textContent = n > 99 ? '99+' : n; }
}
// „Wydanie specjalne”: podbój, nowa tura albo ręcznie oznaczony news przejmuje ekran u odbiorców
function specialEdition(n) {
  document.querySelector('.special')?.remove();
  const back = document.activeElement;
  const close = () => { ov.classList.add('out'); document.removeEventListener('keydown', key); setTimeout(() => ov.remove(), 250); back?.focus?.(); };
  const key = e => { if (e.key === 'Escape') close(); };
  const read = h('button.btn.primary', { onclick: () => { close(); openNews(n.id); } }, 'Czytaj');
  const ov = h('div.special', { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'sp-h', onmousedown: e => { if (e.target === ov) close(); } },
    h('article.sp-paper',
      h('div.sp-mast', h('b', 'Wydanie specjalne'), h('span', G.fmtDT(n.gameTime ?? gameNow()) + ' UTC')),
      (n.countries || []).length ? h('div.sp-flags', { 'aria-hidden': 'true' }, n.countries.map(cFlag).join(' ')) : null,
      h('h2#sp-h', (n.headline || '').replace(/^[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\uFE0F\s]+/u, '')),
      n.body ? h('p.sp-body', n.body) : null,
      h('div.sp-actions', read, h('button.btn', { onclick: close }, 'Zamknij'))));
  document.body.append(ov); document.addEventListener('keydown', key);
  requestAnimationFrame(() => read.focus({ preventScroll: true }));
}
// ───────── powiadomienia systemowe (telefon / przeglądarka) ─────────
// ponytail: działa, gdy aplikacja jest otwarta (także w tle / zminimalizowana). Push przy całkiem zamkniętej aplikacji wymagałby serwera (FCM + Cloud Functions, plan Blaze).
const notifPref = () => { try { return localStorage.getItem('ww_notif') || 'important'; } catch { return 'important'; } };
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent), standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
let swReg = null;
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').then(r => { swReg = r; }).catch(() => { });
  navigator.serviceWorker.addEventListener('message', e => { const d = e.data || {}; if (d.ww !== 'open') return; if (d.news) openNews(d.news); else if (d.unit) select(d.unit, true); else if (d.tab) setTab(d.tab); });
}
async function enableNotifs() {
  if (!('Notification' in window)) return toast(isIOS && !standalone ? 'Na iPhonie: Udostępnij → „Dodaj do ekranu początkowego”, potem otwórz WorldWatch z ikony i włącz powiadomienia.' : 'Ta przeglądarka nie obsługuje powiadomień.', 'err', 9000);
  const r = await Notification.requestPermission();
  if (r === 'granted') { try { localStorage.setItem('ww_notif', notifPref() === 'off' ? 'important' : notifPref()); } catch { } toast('🔔 Powiadomienia włączone', 'ok'); }
  else toast('Powiadomienia zablokowane. Zezwól na nie w ustawieniach strony w przeglądarce.', 'err', 8000);
}
async function sysNotify(title, body, data = {}, tag) {
  const opts = { body, tag, data, icon: 'vendor/icon-192.png', badge: 'vendor/icon-192.png', renotify: !!tag, vibrate: [120, 60, 120] };
  try { const reg = swReg || await navigator.serviceWorker?.getRegistration(); if (reg) return reg.showNotification(title, opts); } catch { }
  try { const n = new Notification(title, opts); n.onclick = () => { window.focus(); data.news ? openNews(data.news) : data.unit ? select(data.unit, true) : data.tab && setTab(data.tab); n.close(); }; } catch { }
}
function pushSystem(fresh) {
  const pref = notifPref();
  if (pref === 'off' || !fresh.length || !('Notification' in window) || Notification.permission !== 'granted') return;
  const pick = fresh.filter(i => pref === 'all' || i.important || i.own || i.type === 'msg' || i.news?.breaking || i.news?.special);
  if (!pick.length) return;
  const away = document.hidden || !document.hasFocus();
  if (!away) { navigator.vibrate?.(pick.some(i => i.news?.breaking || i.news?.special) ? [150, 80, 150] : 60); return; }   // na ekranie wystarczy toast + wibracja
  const clean = t => String(t).replace(/\p{Extended_Pictographic}|️/gu, '').replace(/\s+/g, ' ').trim();
  const txt = i => i.type === 'news' ? `${i.news.breaking ? 'PILNE: ' : ''}${clean(i.news.headline)}` : clean(i.text);
  if (pick.length === 1) { const i = pick[0]; return sysNotify(i.news?.special ? 'WorldWatch · wydanie specjalne' : 'WorldWatch', txt(i), i.news ? { news: i.news.id } : i.unitKey ? { unit: i.unitKey } : { tab: i.type === 'msg' ? 'diplo' : 'feed' }, i.id); }
  sysNotify(`WorldWatch · ${pick.length} nowe zdarzenia`, pick.slice(0, 4).map(txt).join('\n'), { tab: 'feed' }, 'ww-batch');
}
function notifSettings() {
  const supported = 'Notification' in window, perm = supported ? Notification.permission : 'unsupported';
  const sel = h('select', { onchange: e => { try { localStorage.setItem('ww_notif', e.target.value); } catch { } } }, [['important', 'Ważne (pilne, moje, wiadomości do mnie)'], ['all', 'Wszystko z aktualności'], ['off', 'Wyłączone']].map(([v, l]) => h('option', { value: v, selected: notifPref() === v }, l)));
  return h('div.stack',
    h('label.frow', h('span.flabel', 'Powiadomienia na tym urządzeniu'), sel),
    perm === 'granted' ? h('div.btn-row', h('small.muted', '✅ Zezwolono'), h('button.btn.sm', { onclick: () => sysNotify('WorldWatch', 'Test: powiadomienia działają.', { tab: 'feed' }, 'ww-test') }, 'Wyślij test'))
      : perm === 'denied' ? h('small.muted', '⛔ Zablokowane w przeglądarce — zezwól w ustawieniach strony (ikona kłódki przy adresie).')
      : h('button.btn.sm.primary', { onclick: enableNotifs }, '🔔 Włącz powiadomienia'),
    isIOS && !standalone ? h('small.muted', 'iPhone: najpierw Udostępnij → „Dodaj do ekranu początkowego” i otwieraj WorldWatch z ikony.') : null,
    h('small.muted', 'Powiadomienia przychodzą, gdy WorldWatch jest otwarty, także w tle lub na zablokowanym telefonie, dopóki system nie uśpi karty.'));
}
function saveSeen() { try { localStorage.setItem(seenKey(), JSON.stringify([...seen].slice(-800))); } catch { } }
function markAllRead() { S.unread = new Set(); const b = $('#bell .badge'); if (b) b.hidden = true; }
export { setTab, select };
