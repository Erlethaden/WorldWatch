// Obiekty na mapie: tworzenie, podróże dyplomatyczne, edycja w locie, manifest, rozdział wywiadu
import { S, G, run, writeUnit, writeChar, newId, now, gameNow, realGM, myCountry, canEdit, countriesSorted, cName, cDem, cFlag, charsOf, charName, charView,
  KINDS, VIS, MISSIONS, CATEGORIES, STATUS_OVERRIDES, ZONE_TYPES, posOf, speedKmh, travelRoute, motionOf, nearestPlace, allPlaces, countryAtPlace, projectUnit, unitViews, turn, tr, trOpts } from './store.js';
import { form, confirmBox, toast, h, modal, esc } from './ui.js';

export const countryOpts = (withGm) => (realGM() ? countriesSorted() : countriesSorted().filter(c => c.id === myCountry())).map(c => [c.id, `${c.flag} ${c.name}`]).concat(withGm && realGM() ? [['__gm', '— brak / nieznany (tylko GM)']] : []);
const autoDuration = (kind, route) => { const km = G.routeKm(travelRoute({ kind, route })), sp = KINDS[kind]?.speed || 800; return Math.round((km / sp) * 3600000 + (kind === 'aircraft' ? 20 * 60000 : 0)); };
const capPlace = cid => { const c = S.data.countries[cid]?.capital; return c ? { name: c.name, lat: c.lat, lon: c.lon, cc: S.data.countries[cid].iso2 } : null; };
const curPlace = sec => { const v = { ...sec }; const p = posOf(v); if (!p) return null; const r = sec.route || []; const at = p.phase === 'after' ? r[r.length - 1] : p.phase === 'before' || p.phase === 'static' ? r[0] : null; return at || { name: nearestPlace(p.pos), lat: +p.pos.lat.toFixed(3), lon: +p.pos.lon.toFixed(3) }; };
export const secOf = id => S.data.unitSecrets[id];

// ───────── nowy / edycja obiektu ─────────
export async function editUnit(sec, presetKind, preset = {}) {
  const isNew = !sec; sec = sec || { id: newId(), kind: presetKind || 'aircraft', countryId: myCountry() || countriesSorted()[0]?.id, visibility: 'public', mission: 'Diplomatic', category: 'Government', missionVisible: true, passengersVisible: false, route: [], depTime: gameNow(), confidence: 50, ...preset };
  const r = sec.route || [], moving = r.length > 1;
  const v = await form(isNew ? 'Nowy obiekt na mapie' : `Edycja: ${sec.callsign || ''}`, [
    { k: 'kind', label: 'Rodzaj', type: 'select', value: sec.kind, options: Object.entries(KINDS).map(([k, x]) => [k, x.pl]).filter(([k]) => realGM() || k !== 'contact') },
    { k: 'countryId', label: 'Państwo (właściciel)', type: 'select', value: sec.countryId, options: countryOpts(true) },
    { k: 'callsign', label: 'Znak / nazwa', value: sec.callsign, req: true, ph: 'np. SE-ROYAL01, HSwMS Gotland' },
    { k: 'type', label: 'Typ', value: sec.type, ph: 'np. Samolot rządowy, Okręt podwodny, Fregata' },
    { k: 'operator', label: 'Operator', value: sec.operator, ph: 'np. Rząd Szwecji' },
    { k: 'category', label: 'Kategoria', type: 'select', value: sec.category, options: trOpts('category', CATEGORIES) },
    { k: 'group', label: 'Zespół: flota / szwadron / zgrupowanie (wiele jednostek jako jeden obiekt)', type: 'check', value: !!sec.group, show: x => ['ship', 'submarine', 'aircraft', 'ground'].includes(x.kind) },
    { k: 'composition', label: 'Skład (jedna pozycja na linię)', type: 'textarea', rows: 4, value: sec.composition, ph: '1× niszczyciel HSwMS Stockholm\n2× korweta typu Visby\n1× okręt zaopatrzeniowy', help: 'Liczba na początku linii liczy się do rozmiaru zespołu. Skład widzą inni tylko przy widoczności JAWNE.', show: x => x.group && ['ship', 'submarine', 'aircraft', 'ground'].includes(x.kind) },
    { k: 'guess', label: 'Co widzą inni (np. możliwy okręt podwodny)', value: sec.guess, show: x => x.kind === 'contact' },
    { type: 'section', label: 'Pozycja / trasa' },
    { k: 'from', label: 'Pozycja / start', type: 'place', value: r[0] || capPlace(sec.countryId), req: true },
    { k: 'via', label: 'Punkty pośrednie', type: 'places', value: r.slice(1, -1), show: x => !['satellite', 'zone', 'base'].includes(x.kind) },
    { k: 'to', label: 'Cel (puste = stoi w miejscu)', type: 'place', value: moving ? r[r.length - 1] : null, show: x => !['satellite', 'zone', 'base'].includes(x.kind) },
    { k: 'depTime', label: 'Start', type: 'datetime', value: sec.depTime, now: gameNow, show: x => !['satellite', 'zone', 'base'].includes(x.kind) },
    { k: 'duration', label: 'Czas podróży', type: 'duration', value: moving ? sec.duration : '', help: 'Puste = wyliczony z dystansu. Można wpisać dowolny czas „RPG”.', show: x => !['satellite', 'zone', 'base'].includes(x.kind) },
    { k: 'radiusKm', label: 'Promień strefy (km)', type: 'number', value: sec.radiusKm || 80, show: x => x.kind === 'zone' || x.kind === 'contact' },
    { k: 'zoneType', label: 'Typ strefy', type: 'select', value: sec.zoneType || 'exercise', options: Object.entries(ZONE_TYPES).map(([k, z]) => [k, z.en]), show: x => x.kind === 'zone' },
    { k: 'inclination', label: 'Inklinacja orbity (°)', type: 'number', value: sec.sat?.inclination ?? 55, show: x => x.kind === 'satellite' },
    { k: 'periodMin', label: 'Okres orbity (min)', type: 'number', value: sec.sat?.periodMin ?? 95, show: x => x.kind === 'satellite' },
    { type: 'section', label: 'Widoczność i misja' },
    { k: 'visibility', label: 'Widoczność', type: 'select', value: sec.visibility, options: Object.entries(VIS) },
    { k: 'mission', label: 'Misja', type: 'select', value: sec.mission, options: trOpts('mission', MISSIONS) },
    { k: 'missionVisible', label: 'Misja jawna dla innych', type: 'check', value: sec.missionVisible },
    { k: 'passengersVisible', label: 'Pasażerowie jawni', type: 'check', value: sec.passengersVisible, show: x => ['aircraft', 'ship', 'ground'].includes(x.kind) },
    { k: 'confidence', label: 'Pewność wykrycia (dla innych)', type: 'range', value: sec.confidence ?? 50, show: x => x.visibility === 'classified' || x.kind === 'contact' },
    { k: 'statusOverride', label: 'Status ręczny', type: 'select', value: sec.statusOverride || '', options: STATUS_OVERRIDES.map(s => [s, s ? tr('status', s) : '— automatyczny —']) },
    { k: 'notes', label: 'Notatki (tajne)', type: 'textarea', value: sec.notes }
  ], { wide: true, submit: isNew ? 'Utwórz' : 'Zapisz' });
  if (!v) return;
  const route = [v.from, ...(v.via || []), ...(v.to ? [v.to] : [])].filter(Boolean).map(p => ({ name: p.name, lat: +p.lat, lon: +p.lon, cc: p.cc || '' }));
  const n = { ...sec, ...v, route, delay: route.length > 1 && JSON.stringify(route) === JSON.stringify(sec.route) && v.depTime === sec.depTime ? sec.delay || 0 : 0 };
  delete n.from; delete n.to; delete n.via; delete n.inclination; delete n.periodMin;
  if (n.kind === 'satellite') n.sat = { inclination: v.inclination ?? 55, periodMin: v.periodMin || 95, lon0: route[0]?.lon || 0, epoch: sec.sat?.epoch || gameNow() };
  if (route.length > 1) n.duration = v.duration || autoDuration(n.kind, route); else { n.duration = 0; }
  if (n.kind === 'contact') n.fuzzKm = v.radiusKm || 40;
  if (!n.depTime) n.depTime = gameNow();
  if (!canEdit(n.countryId) && !realGM()) return toast('Brak uprawnień do tego państwa', 'err');
  await run(isNew ? 'CREATE_UNIT' : 'UPDATE_UNIT', n.callsign, w => writeUnit(w, n));
  return n.id;
}

// ───────── Podróż dyplomatyczna / kreator wydarzeń (sekcje 7 i 26) ─────────
export const EVENT_TYPES = ['Diplomatic Visit', 'State Visit', 'Official Talks', 'Military Deployment', 'Intelligence Operation', 'Trade Mission', 'Transfer', 'Emergency', 'Other'];
export async function createTrip(pre = {}) {
  const cid = pre.countryId || myCountry() || countriesSorted()[0]?.id;
  if (!cid) return toast('Najpierw dodaj państwo (Panel GM → Państwa)', 'err');
  const step1 = realGM() && !pre.countryId ? await form('Kreator wydarzenia — państwo', [{ k: 'countryId', label: 'Państwo', type: 'select', value: cid, options: countryOpts() }], { submit: 'Dalej' }) : { countryId: cid };
  if (!step1) return;
  const C = step1.countryId;
  const vehicles = Object.values(S.data.unitSecrets).filter(u => u.countryId === C && ['aircraft', 'ship', 'submarine', 'ground'].includes(u.kind));
  const chars = charsOf(C);
  const pre0 = pre.unitId ? secOf(pre.unitId) : null;
  const v = await form(`Kreator wydarzenia — ${cFlag(C)} ${cName(C)}`, [
    { k: 'eventType', label: 'Typ wydarzenia', type: 'select', value: 'Diplomatic Visit', options: trOpts('event', EVENT_TYPES) },
    { k: 'vehicle', label: 'Transport', type: 'select', value: pre.unitId || vehicles.find(x => x.kind === 'aircraft')?.id || '__new', options: [...vehicles.map(u => [u.id, `${u.callsign} (${u.type || KINDS[u.kind].pl})`]), ['__new', '+ nowy pojazd']] },
    { k: 'newCallsign', label: 'Znak nowego pojazdu', ph: `${S.data.countries[C]?.iso2 || 'XX'}-GOV01`, show: x => x.vehicle === '__new' },
    { k: 'newKind', label: 'Rodzaj', type: 'select', value: 'aircraft', options: [['aircraft', 'Samolot'], ['ship', 'Okręt / statek'], ['ground', 'Konwój lądowy']], show: x => x.vehicle === '__new' },
    { k: 'newType', label: 'Typ', value: 'Samolot rządowy', show: x => x.vehicle === '__new' },
    { k: 'passengers', label: 'Postacie / delegacja', type: 'multi', value: pre0?.passengers || [], options: chars.map(c => [c.id, `${c.icon || '👤'} ${c.title || ''} ${c.name}`]), empty: 'To państwo nie ma jeszcze postaci' },
    { k: 'from', label: 'Wylot z', type: 'place', value: pre0 ? curPlace(pre0) : capPlace(C), req: true, help: 'Puste przy istniejącym pojeździe = jego obecna pozycja' },
    { k: 'via', label: 'Postoje / punkty pośrednie', type: 'places', value: [] },
    { k: 'to', label: 'Cel', type: 'place', req: true },
    { k: 'depTime', label: 'Odlot', type: 'datetime', value: gameNow(), now: gameNow },
    { k: 'duration', label: 'Czas podróży', type: 'duration', help: 'Puste = realny czas z dystansu. Wpisz np. „3h” dla czasu RPG.' },
    { k: 'visibility', label: 'Widoczność', type: 'select', value: 'public', options: Object.entries(VIS) },
    { k: 'mission', label: 'Misja', type: 'select', value: 'Diplomatic', options: trOpts('mission', MISSIONS) },
    { k: 'missionVisible', label: 'Misja jawna', type: 'check', value: true },
    { k: 'passengersVisible', label: 'Pasażerowie jawni', type: 'check', value: false },
    { k: 'autoNews', label: 'Automatyczne newsy (rozmowy po przylocie)', type: 'check', value: true },
    { k: 'talksAfter', label: 'Rozmowy zaczynają się po', type: 'duration', value: 20 * 60000, show: x => x.autoNews },
    { k: 'chronicle', label: 'Dodaj do kroniki świata', type: 'check', value: false, show: () => realGM() }
  ], { wide: true, submit: 'Utwórz wydarzenie' });
  if (!v) return;
  let sec = v.vehicle === '__new' ? { id: newId(), kind: v.newKind, countryId: C, callsign: v.newCallsign || `${(S.data.countries[C]?.iso2 || 'XX').toUpperCase()}-GOV${Math.floor(Math.random() * 90 + 10)}`, type: v.newType, operator: `Rząd: ${cName(C)}`, category: 'Government', legs: [] } : { ...secOf(v.vehicle), id: v.vehicle };
  const route = [v.from, ...(v.via || []), v.to].map(p => ({ name: p.name, lat: +p.lat, lon: +p.lon, cc: p.cc || '' }));
  if ((sec.route || []).length > 1) sec.legs = [...(sec.legs || []), { from: sec.route[0].name, to: sec.route[sec.route.length - 1].name, dep: (sec.depTime || 0) + (sec.delay || 0), arr: (sec.depTime || 0) + (sec.delay || 0) + (sec.duration || 0), passengers: sec.passengers || [] }].slice(-30);
  Object.assign(sec, { route, depTime: v.depTime, duration: v.duration || autoDuration(sec.kind, route), delay: 0, holdAt: null, statusOverride: '', passengers: v.passengers, visibility: v.visibility, mission: v.mission, missionVisible: v.missionVisible, passengersVisible: v.passengersVisible, eventType: v.eventType });
  const arr = sec.depTime + sec.duration, dest = route[route.length - 1], destC = countryAtPlace(dest);
  await run('CREATE_EVENT', `${v.eventType} ${cName(C)} → ${dest.name}`, w => {
    writeUnit(w, sec);
    if (v.autoNews && ['public', 'limited'].includes(v.visibility)) {
      const pub = v.visibility === 'public', flags = `${cFlag(C)}${destC && destC !== C ? cFlag(destC) : ''}`;
      const who = v.passengersVisible && v.passengers.length ? charName(v.passengers[0]) : `delegacja ${cName(C)}`;
      const talks = /Diplomatic|State|Talks|Trade/.test(v.eventType);
      const headline = pub
        ? (talks ? `${flags} ${who[0].toUpperCase() + who.slice(1)} rozpoczyna rozmowy${destC ? ' z przedstawicielami ' + cName(destC) : ''} (${dest.name})` : `${flags} ${tr('event', v.eventType)} (${cName(C)}) — przybycie: ${dest.name}`)
        : `${flags} Nieoficjalnie: przedstawiciele ${cName(C)} przebywają z wizytą — ${destC ? cName(destC) : nearestPlace(dest)}`;
      const nid = newId();
      w.set('news/' + nid, { headline, body: '', category: talks ? 'Diplomacy' : v.mission === 'Military' ? 'Military' : 'Politics', reliability: pub ? 'Confirmed' : 'Unverified', breaking: false, countries: [C, destC].filter(Boolean), gameTime: arr + (v.talksAfter || 0), createdAt: now(), audienceAll: true, audience: [], authorCountry: C, source: realGM() ? 'gm' : 'player', auto: true, unitId: sec.id, place: { name: dest.name, lat: dest.lat, lon: dest.lon } });
    }
    if (v.chronicle && realGM()) w.set('history/' + newId(), { turn: turn(), gameTime: sec.depTime, text: `${cName(C)}: ${v.eventType} to ${dest.name}${v.passengersVisible && v.passengers.length ? ' (' + v.passengers.map(charName).join(', ') + ')' : ''}.`, countries: [C, destC].filter(Boolean), createdAt: now() });
  });
  return sec.id;
}

// ───────── szybkie akcje w locie ─────────
export async function delayUnit(id) {
  const sec = secOf(id), m = motionOf(sec, gameNow());
  const v = await form(`Opóźnienie — ${sec.callsign}`, [{ k: 'min', label: 'Opóźnij o', type: 'duration', value: 45 * 60000, req: true }, { k: 'mark', label: 'Ustaw status DELAYED', type: 'check', value: m?.phase === 'before' }]);
  if (!v) return;
  const n = { ...sec, id };
  if (!m || m.phase === 'before') n.delay = (sec.delay || 0) + v.min; else n.duration = (sec.duration || 0) + v.min;
  if (v.mark) n.statusOverride = 'DELAYED';
  await run('DELAY_UNIT', `${sec.callsign} +${G.fmtDur(v.min)}`, w => writeUnit(w, n));
}
export async function setDuration(id) {
  const sec = secOf(id);
  const v = await form(`Czas podróży — ${sec.callsign}`, [{ k: 'd', label: 'Całkowity czas', type: 'duration', value: sec.duration, req: true, help: `Realny: ${G.fmtDur(autoDuration(sec.kind, sec.route))}. ETA przesunie się automatycznie.` }]);
  if (!v) return;
  await run('UPDATE_DURATION', `${sec.callsign} ${G.fmtDur(v.d)}`, w => writeUnit(w, { ...sec, id, duration: v.d }));
}
export async function redirectUnit(id, mode = 'redirect') {
  const sec = secOf(id), t = gameNow(), p = posOf({ ...sec, id }, t);
  if (!p) return;
  let dest, status = mode === 'return' ? 'RETURNING' : mode === 'emergency' ? 'EMERGENCY' : 'DIVERTED', news = false;
  if (mode === 'return') dest = sec.route[0];
  else if (mode === 'emergency') {
    const near = allPlaces().filter(q => q.cc).sort((a, b) => G.distKm(p.pos, a) - G.distKm(p.pos, b))[0];
    const v = await form(`Awaryjne lądowanie — ${sec.callsign}`, [{ k: 'to', label: 'Lotnisko awaryjne', type: 'place', value: near, req: true }, { k: 'news', label: 'Breaking news (jeśli obiekt jest jawny)', type: 'check', value: true }]);
    if (!v) return; dest = v.to; news = v.news;
  } else {
    const v = await form(`Zmiana trasy — ${sec.callsign}`, [{ k: 'to', label: 'Nowy cel', type: 'place', req: true }, { k: 'status', label: 'Status', type: 'select', value: 'DIVERTED', options: STATUS_OVERRIDES.map(s => [s, s ? tr('status', s) : '— automatyczny —']) }]);
    if (!v) return; dest = v.to; status = v.status;
  }
  const here = p.phase === 'moving' || p.phase === 'hold' ? { name: nearestPlace(p.pos), lat: +p.pos.lat.toFixed(3), lon: +p.pos.lon.toFixed(3) } : curPlace(sec);
  const route = [here, { name: dest.name, lat: +dest.lat, lon: +dest.lon, cc: dest.cc || '' }];
  const sp = speedKmh(sec) || KINDS[sec.kind]?.speed || 800;
  const n = { ...sec, id, route, depTime: t, delay: 0, holdAt: null, duration: Math.max(60000, Math.round(G.routeKm(travelRoute({ kind: sec.kind, route })) / sp * 3600000)), statusOverride: status };
  await run(mode === 'emergency' ? 'EMERGENCY_LANDING' : mode === 'return' ? 'RETURN_UNIT' : 'REDIRECT_UNIT', `${sec.callsign} → ${dest.name}`, w => {
    writeUnit(w, n);
    if (news && ['public', 'limited'].includes(sec.visibility)) w.set('news/' + newId(), { headline: sec.visibility === 'public' ? `${cFlag(sec.countryId)} ${sec.callsign} ogłasza stan awaryjny i zmienia kurs na ${dest.name}` : `${cFlag(sec.countryId)} Samolot rządowy (${cName(sec.countryId)}) ogłasza stan awaryjny`, body: '', category: 'Politics', reliability: 'Confirmed', breaking: true, countries: [sec.countryId], gameTime: t, createdAt: now(), audienceAll: true, audience: [], authorCountry: sec.countryId, source: realGM() ? 'gm' : 'player', place: { name: dest.name, lat: +dest.lat, lon: +dest.lon } });
  });
}
export async function holdUnit(id) {
  const sec = secOf(id), t = gameNow();
  const n = sec.holdAt ? { ...sec, id, delay: (sec.delay || 0) + (t - sec.holdAt), holdAt: null, statusOverride: sec.statusOverride === 'HOLDING' ? '' : sec.statusOverride } : { ...sec, id, holdAt: t, statusOverride: 'HOLDING' };
  await run(sec.holdAt ? 'RESUME_UNIT' : 'HOLD_UNIT', sec.callsign, w => writeUnit(w, n));
}
export async function finishNow(id) {
  const sec = secOf(id), t = gameNow(), start = (sec.depTime || 0) + (sec.delay || 0);
  const n = t <= start ? { ...sec, id, depTime: t - 60000, delay: 0, duration: 60000, holdAt: null } : { ...sec, id, duration: Math.max(60000, t - start), holdAt: null };
  if (n.statusOverride === 'HOLDING' || n.statusOverride === 'DELAYED') n.statusOverride = '';
  await run('FINISH_NOW', sec.callsign, w => writeUnit(w, n));
}
export async function manifest(id) {
  const sec = secOf(id), chars = charsOf(sec.countryId), cur = sec.passengers || [];
  const v = await form(`Manifest pasażerów — ${sec.callsign}`, [
    { k: 'passengers', label: 'Na pokładzie', type: 'multi', value: cur, options: chars.map(c => [c.id, `${c.icon || '👤'} ${c.title || ''} ${c.name}`]) },
    { k: 'drop', label: 'Usunięte postacie zostają w bieżącej lokalizacji (wysadzenie na postoju)', type: 'check', value: true },
    { k: 'passengersVisible', label: 'Pasażerowie jawni', type: 'check', value: sec.passengersVisible }
  ]);
  if (!v) return;
  const removed = cur.filter(c => !v.passengers.includes(c)), t = gameNow(), p = posOf({ ...sec, id }, t);
  await run('UPDATE_MANIFEST', sec.callsign, w => {
    writeUnit(w, { ...sec, id, passengers: v.passengers, passengersVisible: v.passengersVisible });
    if (v.drop && p) removed.forEach(cid => { const c = charView(cid); if (c) writeChar(w, { ...c, locOverride: { name: nearestPlace(p.pos), lat: +p.pos.lat.toFixed(3), lon: +p.pos.lon.toFixed(3), at: t } }); });
  });
}
export async function deleteUnit(id) {
  const sec = secOf(id);
  if (!await confirmBox(`Usunąć „${sec.callsign}” z mapy? (raporty wywiadu o nim też znikną)`, { danger: true, ok: 'Usuń' })) return;
  const intel = Object.values(S.data.intel).filter(i => i.unitId === id);
  await run('DELETE_UNIT', sec.callsign, w => { w.del('unitSecrets/' + id); w.del('units/' + id); if (realGM()) intel.forEach(i => w.del('intel/' + i.id)); });
}

// ───────── WYWIAD: kto co wie o danym obiekcie (sekcja 32) ─────────
export const INTEL_LEVELS = [['none', '— nic —'], ['detected', 'Wykryty (niepewny kontakt)'], ['suspected', 'Podejrzewany (znane państwo)'], ['identified', 'Zidentyfikowany (pełna trasa)']];
export function buildIntel(sec, toCountry, level, confidence, text) {
  const conf = Math.max(1, Math.min(100, confidence || 50));
  const km = level === 'identified' ? 0 : Math.round((105 - conf) * (sec.kind === 'submarine' ? 2.2 : 3));
  const route = (sec.route || []).map((p, i) => km ? { ...G.fuzzPoint(p, km, sec.id + toCountry + i + (sec.depTime || 0)), name: level === 'suspected' && i === 0 ? p.name : '?' } : { ...p });
  const kindTxt = { aircraft: 'samolot', ship: 'jednostka nawodna', submarine: 'okręt podwodny', ground: 'ruch wojsk lądowych', satellite: 'satelita', zone: 'aktywność wojskowa', base: 'obiekt', contact: 'kontakt' }[sec.kind] || 'kontakt';
  const label = level === 'identified' ? `${cFlag(sec.countryId)} ${sec.callsign}` : level === 'suspected' ? `Możliwy ${kindTxt} (${cName(sec.countryId)})` : `Możliwy ${sec.category === 'Government' ? 'rządowy ' : ''}${kindTxt}`;
  const lines = level === 'identified'
    ? [{ k: 'Państwo', v: `${cFlag(sec.countryId)} ${cName(sec.countryId)}` }, { k: 'Typ', v: sec.type || kindTxt }, { k: 'Trasa', v: (sec.route || []).map(p => p.name).join(' → ') }, { k: 'Misja', v: tr('mission', sec.mission) }]
    : level === 'suspected' ? [{ k: 'Podejrzewane państwo', v: `${cFlag(sec.countryId)} ${cName(sec.countryId)}` }, { k: 'Typ', v: `możliwy ${kindTxt}` }] : [{ k: 'Typ', v: `możliwy ${kindTxt}` }];
  return { toCountry, unitId: sec.id, kind: sec.kind === 'zone' || sec.kind === 'base' ? sec.kind : sec.kind, level, confidence: conf, label, lines, text: text || '', route, depTime: sec.depTime || 0, duration: sec.duration || 0, delay: sec.delay || 0, holdAt: sec.holdAt || null, sat: sec.sat || null, radiusKm: sec.radiusKm || null, zoneType: sec.zoneType || null, fuzzKm: km, countryId: level === 'identified' || level === 'suspected' ? sec.countryId : null, createdGame: gameNow(), createdAt: now(), source: 'gm', category: 'known' };
}
export async function distributeIntel(id) {
  const sec = secOf(id);
  const others = countriesSorted().filter(c => c.id !== sec.countryId);
  const rows = others.map(c => {
    const ex = S.data.intel[`${id}__${c.id}`];
    const sel = h('select', INTEL_LEVELS.map(([k, l]) => h('option', { value: k, selected: (ex?.level || 'none') === k }, l)));
    const conf = h('input', { type: 'number', min: 1, max: 100, value: ex?.confidence ?? 60, style: { width: '64px' } });
    const note = h('input', { value: ex?.text || '', placeholder: 'ocena analityka (opcjonalnie)' });
    return { c, sel, conf, note, row: h('tr', h('td', `${c.flag} ${c.name}`), h('td', sel), h('td', conf, '%'), h('td', note)) };
  });
  const quick = lvl => rows.forEach(r => r.sel.value = lvl);
  modal(`📡 Wywiad — kto co wie o: ${sec.callsign}`, h('div',
    h('p.muted', 'Prawda jest jedna — ale każde państwo może widzieć ją inaczej. Raport tworzy dla danego państwa osobny, niepewny ślad na mapie (migawka trasy z tej chwili; po zmianie trasy użyj ponownie, żeby odświeżyć).'),
    h('div.btn-row', h('button.btn.sm', { onclick: () => quick('none') }, 'wszyscy: nic'), h('button.btn.sm', { onclick: () => quick('detected') }, 'wszyscy: wykryty')),
    h('div.table-wrap', h('table.tbl', h('thead', h('tr', h('th', 'Państwo'), h('th', 'Poziom'), h('th', 'Pewność'), h('th', 'Ocena'))), h('tbody', rows.map(r => r.row))))
  ), { wide: true, actions: [{ label: 'Anuluj' }, { label: 'Zapisz raporty', kind: 'primary', do: async () => {
    await run('DISTRIBUTE_INTEL', sec.callsign, w => rows.forEach(r => {
      const path = `intel/${id}__${r.c.id}`, lvl = r.sel.value;
      if (lvl === 'none') { if (S.data.intel[`${id}__${r.c.id}`]) w.del(path); return; }
      w.set(path, buildIntel({ ...sec, id }, r.c.id, lvl, +r.conf.value, r.note.value.trim()));
    }));
  } }] });
}

// raport wywiadu bez obiektu (notatka / kontakt statyczny)
export async function intelReport(pre = {}) {
  const gm = realGM();
  const v = await form(gm ? 'Nowy raport wywiadu' : 'Notatka analityczna', [
    { k: 'toCountry', label: 'Dla państwa', type: 'select', value: pre.toCountry || myCountry(), options: gm ? countriesSorted().map(c => [c.id, `${c.flag} ${c.name}`]) : [[myCountry(), cName(myCountry())]] },
    { k: 'category', label: 'Kategoria', type: 'select', value: pre.category || 'suspected', options: [['known', 'Known — wiemy'], ['suspected', 'Suspected — podejrzewamy'], ['unknown', 'Unknown — nie wiemy']] },
    { k: 'label', label: 'Tytuł', value: pre.label, req: true, ph: 'np. Nowe polsko-szwedzkie porozumienie obronne' },
    { k: 'text', label: 'Treść / ocena', type: 'textarea', value: pre.text },
    { k: 'confidence', label: 'Pewność', type: 'range', value: pre.confidence ?? 60 },
    { k: 'place', label: 'Pozycja na mapie (opcjonalnie)', type: 'place', value: pre.pos || null },
    { k: 'radius', label: 'Niepewność pozycji (km)', type: 'number', value: pre.fuzzKm || 60 }
  ]);
  if (!v) return;
  const id = pre.id || newId();
  await run('INTEL_REPORT', v.label, w => w.set('intel/' + id, { toCountry: v.toCountry, category: v.category, label: v.label, text: v.text, confidence: v.confidence, kind: 'contact', pos: v.place ? { lat: +v.place.lat, lon: +v.place.lon } : null, fuzzKm: v.place ? v.radius || 60 : 0, lines: [], createdGame: pre.createdGame || gameNow(), createdAt: now(), source: gm ? 'gm' : 'self', level: 'report' }));
}
