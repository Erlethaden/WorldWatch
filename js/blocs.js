// Sojusze, unie i organizacje wielostronne (np. pakt obronny, unia gospodarcza)
import { S, run, now, newId, gameNow, turn, realGM, myCountry, cFlag, cName, country, countriesSorted, G } from './store.js';
import { h, form, confirmBox, toast } from './ui.js';
import { npcOf, render as renderMap } from './map.js';
import { COUNTRY_PRESETS } from './places.js';

export const BLOC_TYPES = ['Sojusz wojskowy', 'Unia gospodarcza', 'Organizacja międzynarodowa', 'Pakt polityczny', 'Porozumienie handlowe', 'Inne'];
const COLORS = ['#3fa7ff', '#f5b301', '#3ddc84', '#ff5a5f', '#b18cff', '#4fd1c5', '#ff9d3d'];

// członek: id państwa w grze albo „n:616” (państwo NPC z mapy)
const isNpc = m => String(m).startsWith('n:');
export const memName = m => isNpc(m) ? (npcOf(m.slice(2))?.name || '?') : cName(m);
export const memFlag = m => isNpc(m) ? (npcOf(m.slice(2))?.flag || '🏳️') : cFlag(m);
export const memIso = m => isNpc(m) ? m.slice(2) : String(country(m)?.isoN || '');
export const blocsOf = cid => Object.values(S.data.blocs || {}).filter(b => (b.members || []).includes(cid));

const tab = () => window.dispatchEvent(new CustomEvent('ww:tab', { detail: 'diplo' }));
const flags = list => list.map(m => `${memFlag(m)} ${memName(m)}`).join(', ');
const news = (w, b, headline, countries) => { if (b.secret) return; const me = myCountry();
  w.set('news/' + newId(), { headline, body: '', category: 'Diplomacy', reliability: 'Confirmed', breaking: false, countries: countries.filter(c => !isNpc(c)), gameTime: gameNow(), createdAt: now(), audienceAll: true, audience: [], ...(realGM() ? { source: 'gm' } : { source: 'player', authorCountry: me, official: true }) }); };

// podświetlenie członków na mapie
export function focusBloc(id) { S.focusBloc = S.focusBloc === id ? null : id; renderMap(); tab(); }
export function focusedIsos() { const b = S.focusBloc && S.data.blocs?.[S.focusBloc]; return b ? { color: b.color, isos: new Set((b.members || []).map(memIso)) } : null; }

export function blocsSection(me) {
  const gm = realGM();
  const list = Object.values(S.data.blocs || {}).filter(b => gm || !b.secret || (b.members || []).includes(me) || (b.invites || []).includes(me))
    .sort((a, b) => ((b.invites || []).includes(me) - (a.invites || []).includes(me)) || (a.name || '').localeCompare(b.name || ''));
  return h('section', h('h3', '🏛 Sojusze i organizacje'),
    list.length ? list.map(b => blocCard(b, me, gm)) : h('p.muted', 'Brak sojuszy. Załóż pierwszy.'),
    gm || me ? h('button.btn.sm', { onclick: () => blocForm({}, me) }, '+ Nowy sojusz / organizacja') : null);
}

function blocCard(b, me, gm) {
  const members = b.members || [], invites = b.invites || [], mine = members.includes(me), invited = invites.includes(me);
  const on = S.focusBloc === b.id;
  return h('div.bloc' + (invited ? '.invited' : ''), { style: { '--c': b.color || '#3fa7ff' } },
    h('div.bloc-head', h('span.bloc-sw', { 'aria-hidden': 'true' }), h('b', `${b.secret ? '🔒 ' : ''}${b.name}${b.tag ? ` (${b.tag})` : ''}`), h('small.muted', ` ${b.type || ''} · ${members.length} ${members.length === 1 ? 'członek' : 'członków'}`)),
    h('div.bloc-members', members.map(m => h('span.chip', `${memFlag(m)} ${memName(m)}${m === b.founder ? ' ★' : ''}`))),
    invites.length ? h('small.muted', 'Zaproszeni: ' + flags(invites)) : null,
    b.charter ? h('details', h('summary', 'Statut / cele'), h('p.pre', b.charter)) : null,
    invited ? h('div.bloc-invite', h('span', `Zaproszenie dla ${cFlag(me)} ${cName(me)}`), h('button.btn.sm.primary', { onclick: () => answer(b, me, true) }, 'Przystąp'), h('button.btn.sm', { onclick: () => answer(b, me, false) }, 'Odrzuć')) : null,
    h('div.btn-row',
      h('button.btn.xs' + (on ? '.primary' : ''), { 'aria-pressed': String(on), onclick: () => focusBloc(b.id) }, on ? '🗺 Ukryj na mapie' : '🗺 Pokaż na mapie'),
      mine || gm ? h('button.btn.xs', { onclick: () => invite(b, me) }, '+ Zaproś') : null,
      mine && !gm ? h('button.btn.xs', { onclick: () => leave(b, me) }, 'Opuść') : null,
      gm ? h('button.btn.xs', { onclick: () => blocForm(b, me) }, '✏️ Edytuj') : null,
      gm ? h('button.btn.xs.danger', { onclick: () => dissolve(b) }, 'Rozwiąż') : null));
}

function memberOptions(gm) {
  const game = countriesSorted().map(c => [c.id, `${c.flag} ${c.name}`]);
  if (!gm) return game;
  const inGame = new Set(countriesSorted().map(c => String(c.isoN)));
  return [...game, ...COUNTRY_PRESETS.filter(p => p.n && !inGame.has(p.n)).map(p => ['n:' + p.n, `${npcOf(p.n)?.flag || ''} ${p.pl || p.name} (NPC)`]).sort((a, b) => a[1].localeCompare(b[1], 'pl'))];
}

async function blocForm(b, me) {
  const gm = realGM(), isNew = !b.id;
  const opts = memberOptions(gm).filter(([v]) => gm || v !== me);
  const v = await form(isNew ? '🏛 Nowy sojusz / organizacja' : `Edycja: ${b.name}`, [
    { k: 'name', label: 'Nazwa', value: b.name, req: true, ph: 'np. Pakt Bałtycki' },
    { k: 'tag', label: 'Skrót', value: b.tag, ph: 'np. PB' },
    { k: 'type', label: 'Rodzaj', type: 'select', value: b.type || BLOC_TYPES[0], options: BLOC_TYPES },
    { k: 'color', label: 'Kolor na mapie', type: 'color', value: b.color || COLORS[Object.keys(S.data.blocs || {}).length % COLORS.length] },
    gm ? { k: 'members', label: 'Członkowie', type: 'multi', value: b.members || [], options: opts } : { k: 'invites', label: 'Zaproś państwa (dołączą po akceptacji)', type: 'multi', value: [], options: opts },
    gm ? { k: 'invites', label: 'Zaproszeni (czekają na zgodę)', type: 'multi', value: b.invites || [], options: opts.filter(([v]) => !isNpc(v)) } : null,
    { k: 'secret', label: 'Tajny (widzą tylko członkowie, zaproszeni i GM)', type: 'check', value: !!b.secret },
    { k: 'charter', label: 'Statut / cele', type: 'textarea', value: b.charter, ph: 'np. Wzajemna obrona w razie ataku na któregokolwiek z członków.' }
  ].filter(Boolean), { wide: true, submit: isNew ? 'Załóż' : 'Zapisz' });
  if (!v) return;
  const members = gm ? v.members : [me];
  if (!members.length) return toast('Sojusz musi mieć co najmniej jednego członka', 'err');
  const id = b.id || newId();
  const doc = { name: v.name.trim(), tag: v.tag?.trim() || '', type: v.type, color: v.color, secret: !!v.secret, charter: v.charter || '', members, invites: (v.invites || []).filter(x => !members.includes(x)), founder: b.founder || (gm ? members[0] : me), createdAt: b.createdAt || now(), gameTime: b.gameTime || gameNow(), updatedAt: now() };
  const ok = await run(isNew ? 'CREATE_BLOC' : 'UPDATE_BLOC', doc.name, w => {
    w.set('blocs/' + id, doc);
    if (isNew) news(w, doc, `🏛 Powstaje ${doc.name}${doc.tag ? ` (${doc.tag})` : ''}: ${members.map(memFlag).join(' ')}`, members);
    if (isNew && gm && !doc.secret) w.set('history/' + newId(), { turn: turn(), gameTime: gameNow(), text: `Powstaje ${doc.name} (${flags(members)}).`, countries: members.filter(m => !isNpc(m)), createdAt: now() });
  });
  if (ok) toast(isNew ? `🏛 Założono: ${doc.name}` : 'Zapisano', 'ok');
}

async function invite(b, me) {
  const taken = new Set([...(b.members || []), ...(b.invites || [])]);
  const opts = countriesSorted().filter(c => !taken.has(c.id)).map(c => [c.id, `${c.flag} ${c.name}`]);
  if (!opts.length) return toast('Wszystkie państwa w grze są już członkami albo zaproszone', 'info');
  const v = await form(`Zaproś do: ${b.name}`, [{ k: 'who', label: 'Państwa', type: 'multi', value: [], options: opts }], { submit: 'Zaproś' });
  if (!v?.who?.length) return;
  const ok = await run('BLOC_INVITE', `${b.name}: ${v.who.join(',')}`, w => w.merge('blocs/' + b.id, { invites: [...(b.invites || []), ...v.who], updatedAt: now() }));
  if (ok) toast('📨 Wysłano zaproszenie', 'ok');
}

async function answer(b, me, yes) {
  const invites = (b.invites || []).filter(x => x !== me);
  const ok = await run(yes ? 'BLOC_JOIN' : 'BLOC_DECLINE', `${cName(me)} → ${b.name}`, w => {
    w.merge('blocs/' + b.id, yes ? { invites, members: [...(b.members || []), me], updatedAt: now() } : { invites, updatedAt: now() });
    if (yes) news(w, b, `🏛 ${cFlag(me)} ${cName(me)} przystępuje do: ${b.name}`, [me]);
  });
  if (ok) toast(yes ? `✅ ${cName(me)} jest członkiem: ${b.name}` : 'Odrzucono zaproszenie', 'ok');
}

async function leave(b, me) {
  if (!await confirmBox(`${cName(me)} opuszcza ${b.name}?`, { ok: 'Opuść', danger: true, title: 'Wyjście z sojuszu' })) return;
  run('BLOC_LEAVE', `${cName(me)} ← ${b.name}`, w => {
    w.merge('blocs/' + b.id, { members: (b.members || []).filter(x => x !== me), updatedAt: now() });
    news(w, b, `🏛 ${cFlag(me)} ${cName(me)} opuszcza: ${b.name}`, [me]);
  });
}

async function dissolve(b) {
  if (!await confirmBox(`Rozwiązać ${b.name}? Dokument zniknie (jest w backupach i w Cofaniu).`, { ok: 'Rozwiąż', danger: true, title: 'Rozwiązanie sojuszu' })) return;
  if (S.focusBloc === b.id) S.focusBloc = null;
  run('DISSOLVE_BLOC', b.name, w => {
    w.del('blocs/' + b.id);
    news(w, b, `🏛 ${b.name} zostaje rozwiązany`, b.members || []);
    if (!b.secret) w.set('history/' + newId(), { turn: turn(), gameTime: gameNow(), text: `Rozwiązanie: ${b.name}.`, countries: (b.members || []).filter(m => !isNpc(m)), createdAt: now() });
  });
}
