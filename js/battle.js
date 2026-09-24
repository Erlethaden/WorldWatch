// Bitwy i starcia: wpis w aktualnościach (+ kronika) z miejscem na mapie, stronami, stratami i wynikiem
import { S, run, now, newId, gameNow, turn, cFlag, cName, countriesSorted, unitViews, KINDS } from './store.js';
import { h, form, toast } from './ui.js';

export const RESULTS = [['a', 'Zwycięstwo strony A'], ['b', 'Zwycięstwo strony B'], ['draw', 'Nierozstrzygnięta'], ['ongoing', 'Walki trwają']];
const flags = list => (list || []).map(cFlag).join('');
const names = list => (list || []).map(c => `${cFlag(c)} ${cName(c)}`).join(', ') || '—';
const resultText = (b) => b.result === 'a' ? `zwycięstwo: ${names(b.sideA)}` : b.result === 'b' ? `zwycięstwo: ${names(b.sideB)}` : b.result === 'draw' ? 'bitwa nierozstrzygnięta' : 'walki trwają';

export async function battleForm(n = {}) {
  const b = n.battle || {}, isNew = !n.id;
  const cOpts = countriesSorted().map(c => [c.id, `${c.flag} ${c.name}`]);
  const uOpts = unitViews().filter(v => v.src === 'full' && !['zone', 'satellite', 'contact'].includes(v.kind)).map(v => [v.id, `${cFlag(v.countryId)} ${v.label} (${v.groupN ? v.sub : KINDS[v.kind]?.pl || v.kind})`]);
  const v = await form(isNew ? '⚔️ Bitwa / starcie' : `Edycja: ${b.name || n.headline}`, [
    { k: 'name', label: 'Nazwa', value: b.name, req: true, ph: 'np. Bitwa o Gotlandię' },
    { k: 'place', label: 'Miejsce', type: 'place', value: n.place, req: true },
    { k: 'gameTime', label: 'Czas', type: 'datetime', value: n.gameTime ?? gameNow(), now: gameNow },
    { k: 'result', label: 'Wynik', type: 'select', value: b.result || 'ongoing', options: RESULTS },
    { type: 'section', label: 'Strona A' },
    { k: 'sideA', label: 'Państwa', type: 'multi', value: b.sideA || [], options: cOpts },
    { k: 'lossesA', label: 'Straty', type: 'textarea', rows: 2, value: b.lossesA, ph: 'np. 1× korweta zatopiona, 40 zabitych' },
    { type: 'section', label: 'Strona B' },
    { k: 'sideB', label: 'Państwa', type: 'multi', value: b.sideB || [], options: cOpts },
    { k: 'lossesB', label: 'Straty', type: 'textarea', rows: 2, value: b.lossesB, ph: 'np. 2× samolot zestrzelony' },
    { type: 'section', label: 'Szczegóły' },
    uOpts.length ? { k: 'units', label: 'Jednostki biorące udział', type: 'multi', value: b.units || [], options: uOpts } : null,
    { k: 'body', label: 'Opis przebiegu', type: 'textarea', rows: 4, value: n.body },
    { k: 'imageUrl', label: 'Zdjęcie / grafika (opcjonalnie)', type: 'image', value: n.imageUrl },
    { k: 'audienceAll', label: 'Widoczne dla wszystkich', type: 'check', value: n.audienceAll ?? true },
    { k: 'audience', label: 'Tylko dla państw', type: 'multi', value: n.audience || [], options: cOpts, show: x => !x.audienceAll },
    { k: 'breaking', label: 'Pilna wiadomość', type: 'check', value: n.breaking ?? true },
    { k: 'special', label: 'Wydanie specjalne (na cały ekran)', type: 'check', value: !!n.special },
    { k: 'chronicle', label: 'Dodaj do kroniki świata', type: 'check', value: isNew, show: () => isNew }
  ].filter(Boolean), { wide: true, submit: isNew ? 'Zapisz bitwę' : 'Zapisz' });
  if (!v) return;
  if (!v.sideA.length && !v.sideB.length) return toast('Wybierz państwa co najmniej po jednej stronie', 'err');
  const battle = { name: v.name.trim(), sideA: v.sideA, sideB: v.sideB, lossesA: v.lossesA || '', lossesB: v.lossesB || '', result: v.result, units: v.units || [] };
  const id = n.id || newId();
  const doc = {
    ...n, headline: `${flags(v.sideA)} ⚔️ ${flags(v.sideB)} ${battle.name}`.replace(/\s+/g, ' ').trim(), body: v.body || '', battle,
    category: 'Conflict', reliability: n.reliability || 'Confirmed', breaking: !!v.breaking, special: !!v.special, countries: [...new Set([...v.sideA, ...v.sideB])],
    place: { name: v.place.name, lat: +v.place.lat, lon: +v.place.lon }, gameTime: v.gameTime || gameNow(), createdAt: n.createdAt || now(),
    audienceAll: !!v.audienceAll, audience: v.audienceAll ? [] : v.audience || [], imageUrl: v.imageUrl || '', source: 'gm'
  };
  delete doc.id;
  const ok = await run(isNew ? 'BATTLE' : 'UPDATE_BATTLE', battle.name, w => {
    w.set('news/' + id, doc);
    if (isNew) w.set('gmNotes/news_' + id, { truth: 'true' });
    if (isNew && v.chronicle) w.set('history/' + newId(), { turn: turn(), gameTime: doc.gameTime, text: `${battle.name} (${v.place.name}): ${resultText(battle)}.`, countries: doc.countries, secret: !v.audienceAll, createdAt: now() });
  });
  if (ok) toast(`⚔️ Zapisano: ${battle.name}`, 'ok');
}

// blok w oknie wiadomości: strony, straty, wynik
export function battleBlock(n) {
  const b = n.battle; if (!b) return null;
  const side = (label, list, losses, win) => h('div.bt-side' + (win ? '.win' : ''), h('small', label + (win ? ' · zwycięstwo' : '')), h('b', names(list)), h('div.bt-loss', h('small', 'Straty'), h('span', losses || 'brak danych')));
  const units = (b.units || []).map(id => unitViews().find(v => v.id === id || v.key === 'u:' + id)).filter(Boolean);
  return h('div.battle',
    h('div.bt-head', h('b', b.name), h('span.bt-res.' + (b.result || 'ongoing'), RESULTS.find(r => r[0] === b.result)?.[1] || 'Walki trwają')),
    h('div.bt-sides', side('Strona A', b.sideA, b.lossesA, b.result === 'a'), side('Strona B', b.sideB, b.lossesB, b.result === 'b')),
    units.length ? h('div.bt-units', h('small', 'Jednostki: '), units.map(v => `${cFlag(v.countryId)} ${v.label}`).join(' · ')) : null);
}
