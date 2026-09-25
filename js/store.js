// Stan aplikacji, subskrypcje, perspektywy widoczności, projekcje publiczne, operacje atomowe, logi, backupy
import { DB, now, newId, isDemo } from './db.js';
import { ADMIN_UIDS } from './db.js';
import * as G from './geo.js';
import * as SR from './searoute.js';
import { COUNTRY_PRESETS, CITIES, SEAS } from './places.js';

export const S = {
  user: null, me: null, persp: 'gm', clock: null, game: {}, lastError: null,
  data: {}, src: {}, unsubs: [], listeners: new Set(), errors: []
};
const ALL = ['countries', 'countryPrivate', 'characters', 'charSecrets', 'units', 'unitSecrets', 'intel', 'news', 'gmNotes', 'relations', 'treaties', 'messages', 'history', 'territories', 'users', 'logs', 'undo', 'backups', 'blocs', 'statHistory'];
ALL.forEach(c => { S.data[c] = {}; S.src[c] = {}; });

// ───────── zdarzenia zmian ─────────
let raf = 0;
export function emit() { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; S.listeners.forEach(f => { try { f(); } catch (e) { console.error(e); } }); }); }
export const onChange = f => (S.listeners.add(f), () => S.listeners.delete(f));

// ───────── role ─────────
// ADMIN ⊃ GM: admin ma wszystko co GM + gracze/role GM, usuwanie państw i wpisów, logi, backupy, porządki, własne pola
export const isAdmin = () => !!S.me && (S.me.role === 'admin' || ADMIN_UIDS.includes(S.user?.uid));
export const realGM = () => isAdmin() || S.me?.role === 'gm';
export const role = () => isAdmin() ? 'admin' : realGM() ? 'gm' : S.me?.role || 'pending';
export const myCountry = () => (S.me?.role === 'leader' ? S.me.countryId : null) || null;
// perspektywa: 'gm' | id państwa | null (obserwator)
export function persp() { return realGM() ? (S.persp === '__obs' ? null : S.persp || 'gm') : myCountry(); }
export const gmView = () => persp() === 'gm';
export function canEdit(cid) { return realGM() || (!!cid && S.me?.role === 'leader' && S.me.countryId === cid); }

// ───────── czas gry ─────────
export function gameNow() {
  const c = S.clock; if (!c) return now();
  return c.running ? c.anchorGame + (now() - c.anchorReal) * (c.rate || 1) : c.anchorGame;
}
export const turn = () => S.game?.turn || 1;

// ───────── subskrypcje ─────────
function setSrc(col, key, arr) {
  S.src[col][key] = arr || [];
  const m = {}; Object.values(S.src[col]).forEach(a => a.forEach(d => m[d.id] = d));
  S.data[col] = m; emit();
}
function sub(col, key, filters) { S.unsubs.push(DB.listen(col, filters, arr => setSrc(col, key, arr))); }
export function stopAll() { S.unsubs.forEach(u => u && u()); S.unsubs = []; ALL.forEach(c => { S.data[c] = {}; S.src[c] = {}; }); }

let pubPrivSubs = {};
export function startSubscriptions() {
  stopAll(); pubPrivSubs = {};
  const r = role(), C = myCountry();
  S.unsubs.push(DB.listenDoc('meta/clock', d => { S.clock = d; emit(); }));
  S.unsubs.push(DB.listenDoc('meta/game', d => { S.game = d || {}; emit(); }));
  S.unsubs.push(DB.listenDoc('meta/admin', d => { S.admin = d || {}; emit(); }));
  ['countries', 'characters', 'units', 'relations', 'history', 'territories', 'users'].forEach(c => sub(c, 'all'));
  if (r === 'gm' || r === 'admin') {
    ['countryPrivate', 'charSecrets', 'unitSecrets', 'intel', 'news', 'gmNotes', 'treaties', 'messages', 'undo', 'blocs', 'statHistory'].forEach(c => sub(c, 'all'));
    if (r === 'admin') { sub('logs', 'all'); sub('backups', 'all'); }
  } else {
    sub('news', 'pub', [['audienceAll', '==', true]]);
    sub('treaties', 'pub', [['secret', '==', false]]);
    sub('blocs', 'pub', [['secret', '==', false]]);
    sub('statHistory', 'pub', [['countryId', '==', '__pub']]);
    if (C) {
      sub('unitSecrets', 'mine', [['countryId', '==', C]]);
      sub('charSecrets', 'mine', [['countryId', '==', C]]);
      sub('intel', 'mine', [['toCountry', '==', C]]);
      sub('news', 'mine', [['audience', 'array-contains', C]]);
      sub('treaties', 'mine', [['parties', 'array-contains', C]]);
      sub('messages', 'mine', [['parties', 'array-contains', C]]);
      sub('blocs', 'mine', [['members', 'array-contains', C]]);
      sub('blocs', 'inv', [['invites', 'array-contains', C]]);
      sub('statHistory', 'mine', [['countryId', '==', C]]);
      S.unsubs.push(DB.listenDoc('countryPrivate/' + C, d => setSrc('countryPrivate', 'mine', d ? [d] : [])));
    }
    // statystyki państw oznaczonych jako publiczne
    S.listeners.add(syncPublicStats);
  }
}
function syncPublicStats() {
  if (realGM()) return;
  Object.values(S.data.countries).forEach(c => {
    if (c.publicStats && !pubPrivSubs[c.id] && c.id !== myCountry()) {
      pubPrivSubs[c.id] = DB.listenDoc('countryPrivate/' + c.id, d => setSrc('countryPrivate', 'p_' + c.id, d ? [d] : []));
      S.unsubs.push(pubPrivSubs[c.id]);
    }
  });
}

// ───────── pomocnicze: państwa ─────────
export const flagOf = iso2 => iso2 && /^[A-Za-z]{2}$/.test(iso2) ? String.fromCodePoint(...iso2.toUpperCase().split('').map(c => 0x1F1A5 + c.charCodeAt(0))) : '🏳️';
export const country = id => S.data.countries[id];
export const cFlag = id => country(id)?.flag || (id ? '🏳️' : '');
export const cName = id => country(id)?.name || (id && id !== '__gm' ? id.toUpperCase() : 'nieznane');
export const cDem = id => country(id)?.demonym || cName(id);
export const cColor = id => country(id)?.color || '#8a93a0';
export const countriesSorted = () => Object.values(S.data.countries).sort((a, b) => a.name.localeCompare(b.name));
export const presetByIso = iso2 => COUNTRY_PRESETS.find(p => p.c === iso2?.toUpperCase());
export function ccToCountryId(cc) { if (!cc) return null; const id = cc.toLowerCase(); return S.data.countries[id] ? id : null; }
export function userOfCountry(cid) { return Object.values(S.data.users).filter(u => u.role === 'leader' && u.countryId === cid); }

// ───────── lokalizacje ─────────
export function allPlaces() {
  const out = [];
  Object.values(S.data.countries).forEach(c => c.capital && out.push({ name: c.capital.name, cc: c.iso2, lat: c.capital.lat, lon: c.capital.lon }));
  (S.game.places || []).forEach(p => out.push(p));
  CITIES.forEach(([name, cc, lat, lon]) => out.push({ name, cc, lat, lon }));
  SEAS.forEach(([name, lat, lon]) => out.push({ name, cc: '', lat, lon }));
  const seen = new Set(); return out.filter(p => { const k = p.name + '|' + p.cc; if (seen.has(k)) return false; seen.add(k); return true; });
}
export const placeLabel = p => p.cc ? `${p.name}, ${p.cc}` : p.name;
export function parsePlace(str) {
  str = (str || '').trim(); if (!str) return null;
  const m = str.match(/^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)(?:\s+(.+))?$/);
  if (m) return { name: m[3] || `${(+m[1]).toFixed(2)}, ${(+m[2]).toFixed(2)}`, lat: +m[1], lon: +m[2], cc: '' };
  const low = str.toLowerCase(), pl = allPlaces();
  return pl.find(p => placeLabel(p).toLowerCase() === low) || pl.find(p => p.name.toLowerCase() === low) || pl.find(p => p.name.toLowerCase().startsWith(low)) || null;
}
export function nearestPlace(p) {
  let best = null, bd = 1e9;
  allPlaces().forEach(q => { const d = G.distKm(p, q); if (d < bd) { bd = d; best = q; } });
  return best ? (bd < 60 ? best.name : `${Math.round(bd)} km na ${G.compass(G.bearing(best, p)).toLowerCase()} od: ${best.name}`) : 'nieznany obszar';
}
export function countryAtPlace(p) { return p ? ccToCountryId(p.cc) : null; }

// ───────── słowniki ─────────
export const KINDS = {
  aircraft: { pl: 'Samolot', en: 'Samolot', layer: 'aircraft', speed: 850 },
  ship: { pl: 'Okręt / statek', en: 'Jednostka pływająca', layer: 'naval', speed: 30 },
  submarine: { pl: 'Okręt podwodny', en: 'Okręt podwodny', layer: 'naval', speed: 20 },
  ground: { pl: 'Jednostka lądowa', en: 'Jednostka lądowa', layer: 'military', speed: 35 },
  satellite: { pl: 'Satelita', en: 'Satelita', layer: 'satellites', speed: 27000 },
  base: { pl: 'Baza / obiekt', en: 'Obiekt', layer: 'military', speed: 0 },
  zone: { pl: 'Strefa (ćwiczenia/konflikt)', en: 'Strefa', layer: 'exercises', speed: 0 },
  contact: { pl: 'Nieznany kontakt', en: 'Kontakt', layer: 'intel', speed: 20 }
};
export const VIS = { public: 'JAWNE', limited: 'OGRANICZONE', classified: 'TAJNE', hidden: 'UKRYTE (tylko właściciel)' };
// Wartości w bazie zostają angielskimi kluczami (zgodność wstecz), a wyświetlamy je po polsku przez tr().
export const MISSIONS = ['Diplomatic', 'Military', 'Intelligence', 'Trade', 'Personal', 'Emergency', 'Classified', 'Unknown'];
export const CATEGORIES = ['Government', 'Military', 'Civilian', 'State-owned', 'Unknown'];
export const RELATIONS = ['Neutral', 'Friendly', 'Partner', 'Strategic Partner', 'Ally', 'Hostile', 'At War'];
export const REL_COLOR = { Neutral: '#8a93a0', Friendly: '#7bc67b', Partner: '#4fb3a9', 'Strategic Partner': '#3fa7ff', Ally: '#2f7bff', Hostile: '#ff8a3d', 'At War': '#ff3b3b' };
export const TREATY_TYPES = ['Alliance', 'Defence treaty', 'Trade agreement', 'Military agreement', 'Technology programme', 'Non-aggression pact', 'Secret agreement', 'Strategic partnership'];
export const NEWS_CATS = ['Politics', 'Economy', 'Military', 'Diplomacy', 'Technology', 'Intelligence', 'Conflict', 'Trade', 'Science'];
export const RELIABILITY = ['Confirmed', 'Highly reliable', 'Reliable', 'Unverified', 'Rumor', 'False information'];
export const ZONE_TYPES = { exercise: { en: 'Ćwiczenia wojskowe', color: '#f5b301', layer: 'exercises' }, conflict: { en: 'Strefa konfliktu', color: '#ff3b3b', layer: 'conflicts' }, exclusion: { en: 'Strefa zamknięta', color: '#ff8a3d', layer: 'conflicts' }, activity: { en: 'Zgłoszona aktywność', color: '#b18cff', layer: 'military' } };
const T = {
  mission: { Diplomatic: 'Dyplomatyczna', Military: 'Wojskowa', Intelligence: 'Wywiadowcza', Trade: 'Handlowa', Personal: 'Prywatna', Emergency: 'Ratunkowa', Classified: 'Tajna', Unknown: 'Nieznana' },
  category: { Government: 'Rządowy', Military: 'Wojskowy', Civilian: 'Cywilny', 'State-owned': 'Państwowy', Unknown: 'Nieznany' },
  relation: { Neutral: 'Neutralne', Friendly: 'Przyjazne', Partner: 'Partnerstwo', 'Strategic Partner': 'Partnerstwo strategiczne', Ally: 'Sojusz', Hostile: 'Wrogie', 'At War': 'Wojna' },
  treaty: { Alliance: 'Sojusz', 'Defence treaty': 'Traktat obronny', 'Trade agreement': 'Umowa handlowa', 'Military agreement': 'Umowa wojskowa', 'Technology programme': 'Program technologiczny', 'Non-aggression pact': 'Pakt o nieagresji', 'Secret agreement': 'Tajne porozumienie', 'Strategic partnership': 'Partnerstwo strategiczne' },
  news: { Politics: 'Polityka', Economy: 'Gospodarka', Military: 'Wojsko', Diplomacy: 'Dyplomacja', Technology: 'Technologia', Intelligence: 'Wywiad', Conflict: 'Konflikt', Trade: 'Handel', Science: 'Nauka' },
  reliability: { Confirmed: 'Potwierdzone', 'Highly reliable': 'Bardzo wiarygodne', Reliable: 'Wiarygodne', Unverified: 'Niepotwierdzone', Rumor: 'Plotka', 'False information': 'Fałszywa informacja' },
  status: { AIRBORNE: 'W LOCIE', SCHEDULED: 'PLANOWANY', LANDED: 'WYLĄDOWAŁ', 'ON GROUND': 'NA ZIEMI', UNDERWAY: 'W DRODZE', 'IN PORT': 'W PORCIE', ARRIVED: 'NA MIEJSCU', STATIONARY: 'POSTÓJ', HOLDING: 'OCZEKUJE', DETECTED: 'WYKRYTY', 'IN ORBIT': 'NA ORBICIE', ACTIVE: 'AKTYWNA', OPERATIONAL: 'DZIAŁA', DELAYED: 'OPÓŹNIONY', DIVERTED: 'ZMIANA TRASY', RETURNING: 'POWRÓT', EMERGENCY: 'ALARM', 'LOST CONTACT': 'BRAK KONTAKTU', GROUNDED: 'UZIEMIONY', DOCKED: 'ZACUMOWANY', 'ON STATION': 'NA POZYCJI' },
  event: { 'Diplomatic Visit': 'Wizyta dyplomatyczna', 'State Visit': 'Wizyta państwowa', 'Official Talks': 'Oficjalne rozmowy', 'Military Deployment': 'Przerzut wojsk', 'Intelligence Operation': 'Operacja wywiadowcza', 'Trade Mission': 'Misja handlowa', Transfer: 'Przelot / transfer', Emergency: 'Sytuacja awaryjna', Other: 'Inne' },
  charStatus: { Active: 'Aktywny', Travelling: 'W podróży', 'In talks': 'W trakcie rozmów', Hospitalised: 'W szpitalu', Detained: 'Zatrzymany', Missing: 'Zaginiony', Resigned: 'Zdymisjonowany', Deceased: 'Nie żyje' },
  risk: { Low: 'Niskie', Medium: 'Średnie', High: 'Wysokie', Extreme: 'Ekstremalne' },
  secrecy: { Public: 'Jawny', Restricted: 'Zastrzeżony', Secret: 'Tajny' }
};
export const tr = (ns, k) => T[ns]?.[k] ?? k ?? '';
export const trOpts = (ns, list) => list.map(k => [k, tr(ns, k)]);
export const STATUS_OVERRIDES = ['', 'DELAYED', 'DIVERTED', 'RETURNING', 'HOLDING', 'EMERGENCY', 'LOST CONTACT', 'GROUNDED', 'DOCKED', 'ON STATION'];

// ───────── postacie ─────────
export function charView(id) {
  const pub = S.data.characters[id], sec = S.data.charSecrets[id];
  if (!pub && !sec) return null;
  const full = sec && (gmView() || sec.countryId === persp());
  const v = { ...(pub || {}), id, full: !!full };
  if (full) Object.assign(v, { name: sec.realName || pub?.name, mission: sec.mission, notes: sec.notes, locOverride: sec.locOverride });
  return v;
}
export const charName = id => { const c = charView(id); return c ? `${c.icon || ''} ${c.title ? c.title + ' ' : ''}${c.name}`.trim() : '?'; };
export const charsOf = cid => Object.keys(S.data.characters).map(charView).filter(c => c && c.countryId === cid);

// gdzie jest postać (wyliczane z podróży)
export function charLocation(id, t = gameNow()) {
  const c = charView(id); if (!c) return null;
  let best = null;
  unitViews().forEach(v => {
    if (!(v.passengerIds || []).includes(id)) return;
    const m = motionOf(v, t); if (!m) return;
    if (m.phase === 'moving' || m.phase === 'hold') best = { state: 'transit', pos: m.pos, unit: v, at: t, text: `Na pokładzie: ${v.label}` };
    else if (m.phase === 'after' && (!best || (best.state !== 'transit' && m.end > best.at))) { const d = v.route[v.route.length - 1]; best = { state: 'at', pos: d, at: m.end, text: d.name, unit: v }; }
  });
  if (c.locOverride && (!best || (best.state !== 'transit' && (c.locOverride.at || 0) >= (best.at || 0)))) best = { state: 'at', pos: c.locOverride, at: c.locOverride.at, text: c.locOverride.name };
  if (!best && c.home) best = { state: 'home', pos: c.home, text: c.home.name };
  return best;
}

// ───────── PROJEKCJA PUBLICZNA (co widzą inni) ─────────
// zespoły: flota, szwadron, zgrupowanie — jeden obiekt na mapie ze składem (np. „2× fregata”)
export const GROUP_NOUN = { ship: 'Flota', submarine: 'Grupa okrętów podwodnych', aircraft: 'Szwadron', ground: 'Zgrupowanie' };
const GROUP_VAGUE = { ship: 'Zespół okrętów', submarine: 'Grupa okrętów podwodnych', aircraft: 'Grupa samolotów', ground: 'Zgrupowanie wojsk' };
const compLines = sec => String(sec.composition || '').split('\n').map(l => l.trim()).filter(Boolean);
export const groupSize = sec => sec.group && GROUP_NOUN[sec.kind] ? Math.max(1, compLines(sec).reduce((s, l) => s + (+(l.match(/^(\d+)/)?.[1]) || 1), 0)) : 0;
const KIND_NOUN = { aircraft: 'Samolot', ship: 'Jednostka pływająca', submarine: 'Okręt podwodny', ground: 'Konwój', satellite: 'Satelita', zone: 'Strefa', base: 'Obiekt', contact: 'Kontakt' };
export function projectUnit(sec) {
  const vis = sec.visibility || 'public';
  if (vis === 'hidden') return null;
  const K = KINDS[sec.kind] || KINDS.aircraft, cn = cName(sec.countryId), route = sec.route || [];
  const o = route[0], d = route[route.length - 1];
  const destC = countryAtPlace(d), moving = route.length > 1;
  const base = { kind: sec.kind, visibility: vis, depTime: sec.depTime || 0, duration: sec.duration || 0, delay: sec.delay || 0, holdAt: sec.holdAt || null, statusOverride: sec.statusOverride || '', updatedAt: now(), category: sec.category || '' };
  const paxNames = (sec.passengers || []).map(charName);
  const country = { k: 'Państwo', v: `${cFlag(sec.countryId)} ${cn}` };
  if (sec.kind === 'contact') {
    const km = sec.fuzzKm || 40;
    return { ...base, countryId: null, label: sec.callsign || 'NIEZNANY KONTAKT', sub: sec.guess || 'Niezidentyfikowany', route: route.map((p, i) => ({ ...G.fuzzPoint(p, km * 0.6, sec.id + 'K' + i), name: '?' })), fuzzKm: km, confidence: sec.confidence || 50,
      lines: [{ k: 'Typ', v: sec.guess || 'Nieznany' }, { k: 'Pewność', v: (sec.confidence || 50) + '%' }] };
  }
  if (sec.kind === 'satellite') {
    if (vis === 'classified') return { ...base, countryId: null, label: 'Niezidentyfikowany obiekt orbitalny', sub: 'Nieznany', sat: sec.sat, lines: [{ k: 'Właściciel', v: 'nieznany' }, { k: 'Pewność', v: (sec.confidence || 60) + '%' }], confidence: sec.confidence || 60 };
    return { ...base, countryId: sec.countryId, label: vis === 'public' ? sec.callsign : `Satelita (${cn})`, sub: vis === 'public' ? sec.type : 'Satelita', sat: sec.sat, lines: [country, { k: 'Misja', v: sec.missionVisible ? tr('mission', sec.mission) : 'nieznana' }] };
  }
  if (sec.kind === 'zone' || sec.kind === 'base') {
    if (vis === 'classified') return null;
    const lim = vis === 'limited';
    return { ...base, countryId: sec.countryId, label: lim ? (sec.kind === 'zone' ? `${ZONE_TYPES[sec.zoneType]?.en || 'Aktywność'} (niepotwierdzone)` : `Obiekt (${cn})`) : sec.callsign, sub: lim ? 'Niepotwierdzone' : sec.type, zoneType: sec.zoneType || 'exercise', radiusKm: lim ? (sec.radiusKm || 50) * 1.6 : sec.radiusKm || 50, route: lim ? [G.fuzzPoint(o, (sec.radiusKm || 50) * 0.5, sec.id + 'z')] : [o],
      lines: lim ? [country, { k: 'Status', v: 'niepotwierdzone doniesienia' }] : [country, { k: 'Typ', v: sec.type || '' }, { k: 'Misja', v: sec.missionVisible ? tr('mission', sec.mission) : 'działalność rządowa' }], fuzzKm: lim ? sec.radiusKm * 0.5 : 0 };
  }
  const gN = groupSize(sec);
  if (vis === 'public') {
    return { ...base, groupN: gN, countryId: sec.countryId, label: sec.callsign, sub: gN ? `${GROUP_NOUN[sec.kind]} · ${gN} jedn.` : sec.type, route, destCc: destC, passengerIds: sec.passengersVisible ? sec.passengers || [] : [],
      lines: [country, { k: 'Operator', v: sec.operator || '' }, { k: 'Typ', v: sec.type || K.en }, gN ? { k: 'Skład', v: compLines(sec).join(' · ') } : null, moving ? { k: 'Trasa', v: `${o.name} → ${d.name}` } : { k: 'Położenie', v: o?.name || '' }, { k: 'Misja', v: sec.missionVisible ? tr('mission', sec.mission) : 'działalność rządowa' }, { k: 'Pasażerowie', v: sec.passengersVisible ? (paxNames.join(', ') || '—') : 'TAJNE' }] };
  }
  if (vis === 'limited') {
    const fr = moving ? [o, ...route.slice(1).map((p, i) => ({ ...G.fuzzPoint(p, 90, sec.id + 'L' + i + (sec.depTime || 0)), name: '?' }))] : [G.fuzzPoint(o, 40, sec.id + 'L')];
    const cat = sec.category && sec.category !== 'Unknown' ? ' ' + tr('category', sec.category).toLowerCase() : '';
    return { ...base, countryId: sec.countryId, label: `${gN ? GROUP_VAGUE[sec.kind] : KIND_NOUN[sec.kind] || 'Obiekt'}${cat} (${cn})`, sub: 'Informacja ograniczona', route: fr, destCc: destC, fuzzKm: moving ? 60 : 40,
      lines: [country, moving ? { k: 'Skąd', v: o.name } : { k: 'Rejon', v: nearestPlace(o) }, moving ? { k: 'Kierunek', v: destC ? `w stronę: ${cName(destC)}` : G.compass(G.bearing(o, d)) } : null, { k: 'Misja', v: sec.missionVisible ? `prawdopodobnie ${tr('mission', sec.mission).toLowerCase()}` : 'nieznana' }, { k: 'Pasażerowie', v: 'TAJNE' }].filter(Boolean) };
  }
  // classified
  const km = sec.kind === 'submarine' ? 80 : 150;
  const kindTxt = sec.kind === 'aircraft' ? 'Nieznany samolot' : sec.kind === 'ground' ? 'Niezidentyfikowany ruch wojsk' : 'Nieznany kontakt morski';
  return { ...base, countryId: null, label: kindTxt, sub: sec.kind === 'submarine' ? 'Możliwy okręt podwodny' : 'Niezidentyfikowany', route: route.map((p, i) => ({ ...G.fuzzPoint(p, km, sec.id + 'C' + i + (sec.depTime || 0)), name: '?' })), fuzzKm: km, confidence: sec.confidence || 45,
    lines: [{ k: 'Typ', v: sec.kind === 'submarine' ? 'możliwy okręt podwodny' : sec.kind === 'aircraft' ? 'możliwy samolot rządowy' : 'nieznany' }, { k: 'Pewność', v: (sec.confidence || 45) + '%' }] };
}

// ───────── WIDOKI OBIEKTÓW (zależne od perspektywy) ─────────
function fullView(sec) {
  const K = KINDS[sec.kind] || KINDS.aircraft, route = sec.route || [], o = route[0], d = route[route.length - 1];
  const pax = (sec.passengers || []).map(charName), gN = groupSize(sec);
  return {
    ...sec, key: 'u:' + sec.id, src: 'full', groupN: gN, label: sec.callsign || sec.name || K.en, sub: gN ? `${GROUP_NOUN[sec.kind]} · ${gN} jedn.` : sec.type || K.en, passengerIds: sec.passengers || [],
    destCc: countryAtPlace(d), radiusKm: sec.radiusKm, sat: sec.sat, canEdit: canEdit(sec.countryId),
    lines: [
      { k: 'Państwo', v: `${cFlag(sec.countryId)} ${cName(sec.countryId)}` }, sec.operator ? { k: 'Operator', v: sec.operator } : null,
      { k: 'Typ', v: `${sec.type || K.en}${sec.category ? ' · ' + tr('category', sec.category) : ''}` },
      gN ? { k: 'Skład', v: compLines(sec).join(' · ') } : null,
      route.length > 1 ? { k: 'Trasa', v: route.map(p => p.name).join(' → ') } : o ? { k: 'Położenie', v: o.name } : null,
      { k: 'Misja', v: tr('mission', sec.mission) || 'nieznana' }, ['aircraft', 'ship', 'submarine', 'ground'].includes(sec.kind) && !pax.length ? { k: 'Pasażerowie', v: '—' } : null,
      { k: 'Widoczność', v: VIS[sec.visibility] || sec.visibility }, sec.notes ? { k: 'Notatki', v: sec.notes } : null
    ].filter(Boolean)
  };
}
function pubView(id, pub) { return { ...pub, id, key: 'u:' + id, src: 'pub', canEdit: false, hideFuture: pub.visibility === 'classified' || pub.kind === 'contact' }; }
function intelView(i) {
  return { ...i, key: 'i:' + i.id, src: 'intel', hideFuture: i.level !== 'identified', kind: i.kind || 'contact', label: i.label || 'Możliwy kontakt', sub: `WYWIAD · ${i.confidence ?? '?'}%`, canEdit: realGM(),
    lines: [...(i.lines || []), { k: 'Pewność', v: (i.confidence ?? '?') + '%' }, i.text ? { k: 'Ocena', v: i.text } : null].filter(Boolean) };
}
export function unitViews() {
  const P = persp(), out = [];
  const ids = new Set([...Object.keys(S.data.units), ...Object.keys(S.data.unitSecrets)]);
  const intel = Object.values(S.data.intel).filter(i => i.route?.length || i.pos);
  const mine = intel.filter(i => i.toCountry === P), byUnit = {};
  mine.forEach(i => { if (i.unitId) byUnit[i.unitId] = i; });
  ids.forEach(id => {
    const sec = S.data.unitSecrets[id], pub = S.data.units[id];
    if (sec && (P === 'gm' || sec.countryId === P)) out.push(fullView({ ...sec, id }));
    else if (byUnit[id]) out.push(intelView(byUnit[id]));          // raport wywiadu zastępuje widok publiczny
    else if (pub) out.push(pubView(id, pub));
  });
  mine.forEach(i => { if (!i.unitId || !ids.has(i.unitId)) out.push(intelView(i)); });   // samodzielne kontakty
  if (P === 'gm' && S.showAllIntel) intel.forEach(i => out.push({ ...intelView(i), label: `→${cFlag(i.toCountry)} ${i.label}`, gmIntel: true }));
  return out;
}

// statusOf zwraca KLUCZ (do kolorów CSS); na ekran: tr('status', klucz)
export function statusOf(v, t = gameNow()) {
  if (v.statusOverride) return v.statusOverride;
  if (v.kind === 'satellite') return 'IN ORBIT';
  if (v.kind === 'zone') return 'ACTIVE';
  if (v.kind === 'base') return 'OPERATIONAL';
  const m = motionOf(v, t); if (!m) return '—';
  const air = v.kind === 'aircraft';
  return { static: air ? 'ON GROUND' : v.kind === 'contact' ? 'DETECTED' : 'STATIONARY', before: air ? 'SCHEDULED' : 'IN PORT', moving: air ? 'AIRBORNE' : 'UNDERWAY', hold: 'HOLDING', after: air ? 'LANDED' : 'ARRIVED' }[m.phase];
}
export const statusChip = (v, t) => { const k = statusOf(v, t); return { key: k, cls: 's-' + String(k).split(' ')[0].toLowerCase(), text: tr('status', k) }; };
export function posOf(v, t = gameNow()) {
  if (v.kind === 'satellite' && v.sat) return { pos: G.satPos(v.sat, t), heading: 90, phase: 'moving' };
  if (v.pos && !v.route) return { pos: v.pos, heading: 0, phase: 'static' };
  return motionOf(v, t);
}
// okręty płyną po morzu: trasa z rozkazu rozwinięta w szlak omijający ląd (samoloty dalej po wielkim kole)
export const NAVAL = new Set(['ship', 'submarine']);
export const travelRoute = v => NAVAL.has(v.kind) && (v.route || []).length && SR.ready() ? SR.seaPath(v.route) : v.route;
export const motionOf = (v, t) => { const r = travelRoute(v); return G.motion(r === v.route ? v : { ...v, route: r }, t); };
export function speedKmh(v) { const r = travelRoute(v) || []; return r.length > 1 && v.duration ? G.routeKm(r) / (v.duration / 3600000) : 0; }

// ───────── FEED (co ta perspektywa „wie”) ─────────
export function feedItems() {
  const t = gameNow(), P = persp(), items = [], horizon = t - 14 * 86400000;
  Object.values(S.data.news).forEach(n => {
    if ((n.gameTime || 0) > t && !gmView()) return;
    if (P !== 'gm' && P && !n.audienceAll && !(n.audience || []).includes(P)) return;
    if (!P && !n.audienceAll) return;
    items.push({ id: 'n:' + n.id, t: n.gameTime || 0, type: 'news', news: n, future: (n.gameTime || 0) > t });
  });
  unitViews().forEach(v => {
    if (!['aircraft', 'ship', 'submarine', 'ground', 'contact'].includes(v.kind) || (v.route || []).length < 2 || !v.duration) return;
    const m = motionOf(v, t); if (!m) return;
    const air = v.kind === 'aircraft', ic = air ? '✈️' : v.kind === 'ground' ? '🪖' : '🚢', fl = v.countryId ? cFlag(v.countryId) + ' ' : '';
    const o = v.route[0], d = v.route[v.route.length - 1], known = v.src === 'full' || v.visibility === 'public';
    const own = v.src === 'full' && v.countryId === P;
    if (m.start <= t && m.start > horizon) {
      let txt;
      if (v.kind === 'contact') txt = `${v.label} — wykryto w rejonie: ${nearestPlace(o)}`;
      else if (known) txt = `${fl}${v.label} — ${air ? 'start' : 'wypłynął'}: ${o.name}${v.src === 'full' ? ' → ' + d.name : ''}`;
      else if (v.visibility === 'limited') txt = `${fl}${v.label} — ${air ? 'w powietrzu' : 'w drodze'} z: ${o.name}, kierunek: ${v.destCc ? cName(v.destCc) : G.compass(G.bearing(o, d)).toLowerCase()}`;
      else txt = `${v.label} — wykryto w rejonie: ${nearestPlace(o)}`;
      items.push({ id: `d:${v.key}:${m.start}`, t: m.start, type: 'move', icon: known || v.visibility === 'limited' ? ic : '⚠️', text: txt, unitKey: v.key, own });
    }
    if (P && P !== 'gm' && !own && v.destCc === P && m.end - 1800000 <= t && m.end > t) {
      items.push({ id: `a:${v.key}:${m.end}`, t: m.end - 1800000, type: 'move', icon: ic, text: `${fl}${v.label} zbliża się do: ${known ? d.name : cName(P)}`, unitKey: v.key, important: true });
    }
    if (m.end <= t && m.end > horizon && v.kind !== 'contact') {
      let txt;
      if (known) txt = `${fl}${v.label} — ${air ? 'wylądował' : 'dotarł'}: ${d.name}`;
      else if (v.visibility === 'limited') txt = `${fl}${v.label} — ${air ? 'wylądował' : 'dotarł'} w: ${v.destCc ? cName(v.destCc) : nearestPlace(d)}`;
      else return;   // tajne / nieznane: bez komunikatu o dotarciu
      items.push({ id: `l:${v.key}:${m.end}`, t: m.end, type: 'move', icon: known || v.visibility === 'limited' ? (air ? '🛬' : '⚓') : '❔', text: txt, unitKey: v.key, own, important: own || v.destCc === P });
    }
  });
  Object.values(S.data.intel).forEach(i => {
    if (i.toCountry !== P || !i.createdGame) return;
    items.push({ id: 'i:' + i.id, t: i.createdGame, type: 'intel', icon: '📡', text: `${i.label}${i.confidence != null ? ` — pewność ${i.confidence}%` : ''}`, unitKey: i.route || i.pos ? 'i:' + i.id : null, important: true });
  });
  Object.values(S.data.blocs).forEach(b => {
    if (P && P !== 'gm' && (b.invites || []).includes(P)) items.push({ id: `b:${b.id}:${P}`, t: t, type: 'msg', icon: '🏛', text: `Zaproszenie do: ${b.name}`, important: true });
  });
  Object.values(S.data.messages).forEach(m => {
    if (!P || P === 'gm' || m.to !== P) return;
    items.push({ id: 'm:' + m.id + ':' + (m.status || ''), t: m.gameTime || 0, type: 'msg', icon: '🔒', text: `${m.kind === 'proposal' ? 'Propozycja' : 'Wiadomość'} od: ${cFlag(m.from)} ${cName(m.from)}${m.subject ? ' — ' + m.subject : ''}`, from: m.from, important: true });
  });
  return items.filter(i => i.t <= t || i.future).sort((a, b) => b.t - a.t).slice(0, 300);
}

// ───────── OPERACJE ATOMOWE + LOGI + UNDO ─────────
export const errId = () => `WW-${new Date(now()).getUTCFullYear()}-${String(Math.floor(Math.random() * 100000)).padStart(5, '0')}`;
export async function log(op, target, result = 'SUCCESS', error = '', errorId = '') {
  try {
    const id = newId();
    await DB.commit([{ t: 'set', path: 'logs/' + id, data: { tsMs: now(), uid: S.user?.uid || '?', user: S.me?.displayName || S.user?.name || '?', role: role(), op, target: String(target || '').slice(0, 200), result, error: String(error || '').slice(0, 500), errorId, turn: turn() } }]);
  } catch (e) { console.warn('log fail', e); }
}
function validate(ops) {
  for (const o of ops) {
    if (!o.path || o.path.split('/').length % 2 !== 0 || o.path.includes('undefined') || o.path.includes('//')) throw new Error('nieprawidłowa ścieżka dokumentu: ' + o.path);
    if (o.t === 'del') continue;
    const d = o.data || {};
    (d.route || []).forEach(p => { if (!p || !isFinite(p.lat) || !isFinite(p.lon)) throw new Error('nieprawidłowy cel / punkt trasy (' + (p?.name || 'NULL') + ')'); });
    if ('duration' in d && d.duration != null && (!isFinite(d.duration) || d.duration < 0)) throw new Error('nieprawidłowy czas podróży');
    if ('depTime' in d && d.depTime != null && !isFinite(d.depTime)) throw new Error('nieprawidłowy czas startu');
  }
}
export let toastFn = () => { };
// anty-spam: limit operacji graczy na minutę (ustawia admin w Porządkach). Chroni bazę przed zapychaniem przez przypadkowe klikanie / skrypty w konsoli
// ponytail: limit po stronie klienta; twardą granicą są limity rozmiaru w firestore.rules
const recent = [];
function rateLimit() {
  if (realGM()) return;
  const lim = S.admin?.playerRateLimit ?? 20, t = Date.now();
  while (recent.length && t - recent[0] > 60000) recent.shift();
  if (lim > 0 && recent.length >= lim) throw new Error(`limit ${lim} operacji na minutę — odczekaj chwilę`);
  recent.push(t);
}
export const setToast = f => toastFn = f;

// run(nazwa, cel, async w => { w.set(path,data); w.merge(); w.del(); }, {undo:true})
export async function run(name, target, build, opts = {}) {
  const ops = [];
  const w = { set: (p, d) => ops.push({ t: 'set', path: p, data: d }), merge: (p, d) => ops.push({ t: 'merge', path: p, data: d }), del: p => ops.push({ t: 'del', path: p }) };
  try {
    await build(w);
    if (!ops.length) return true;
    validate(ops);
    rateLimit();
    let prev = null;
    if (opts.undo !== false && realGM() && ops.length <= 60) {
      const paths = [...new Set(ops.map(o => o.path))];
      prev = await Promise.all(paths.map(async p => { const d = await DB.get(p); if (d) delete d.id; return { path: p, data: d }; }));
    }
    await DB.commit(ops);   // atomowo — przy błędzie nic się nie zapisuje
    if (prev) {
      const s = JSON.stringify(prev);
      if (s.length < 700000) { const id = newId(); await DB.commit([{ t: 'set', path: 'undo/' + id, data: { op: name, target, at: now(), user: S.me?.displayName || '?', prev: s } }]); pruneUndo(); }
    }
    if (!opts.quiet) log(name, target);
    return true;
  } catch (e) {
    const id = errId(); console.error(name, e);
    S.lastError = { id, op: name, target, msg: e.message, at: now() }; emit();
    log(name, target, 'ERROR', e.message, id);
    toastFn(`⚠️ ${name} nie powiodło się (${e.message}). Zmiana wycofana — poprzedni poprawny stan zachowany. Error ID: ${id}`, 'err', 9000);
    return false;
  }
}
function pruneUndo() {
  const list = Object.values(S.data.undo).sort((a, b) => b.at - a.at);
  if (list.length > 30) DB.commit(list.slice(30).map(u => ({ t: 'del', path: 'undo/' + u.id }))).catch(() => { });
}
export async function undoOp(u) {
  const prev = JSON.parse(u.prev);
  const ok = await run('UNDO', u.op + ' · ' + (u.target || ''), w => prev.forEach(p => p.data ? w.set(p.path, p.data) : w.del(p.path)));
  if (ok) await DB.commit([{ t: 'del', path: 'undo/' + u.id }]);
  return ok;
}

// ───────── zapis obiektu: prawda + projekcja publiczna ─────────
export function writeUnit(w, sec) {
  sec = { ...sec, updatedAt: now() };
  const id = sec.id; delete sec.key;
  w.set('unitSecrets/' + id, sec);
  const pub = projectUnit({ ...sec, id });
  if (pub) w.set('units/' + id, pub); else w.del('units/' + id);
}
export function writeChar(w, c) {
  const { id, mission, notes, locOverride, ...pub } = c;
  const classified = c.visibility === 'classified';
  w.set('charSecrets/' + id, { countryId: c.countryId, realName: c.name, mission: mission || '', notes: notes || '', locOverride: locOverride || null });
  w.set('characters/' + id, classified ? { countryId: c.countryId, title: c.title || '', name: '[CLASSIFIED]', icon: '🕵️', visibility: 'classified', status: 'Unknown', home: null } : { ...pub, visibility: c.visibility || 'public' });
}

// ───────── BACKUPY ─────────
export const BACKUP_COLS = ['countries', 'countryPrivate', 'characters', 'charSecrets', 'units', 'unitSecrets', 'intel', 'news', 'gmNotes', 'relations', 'treaties', 'messages', 'history', 'territories', 'images', 'blocs', 'statHistory', 'users', 'meta'];
export async function snapshotWorld() {
  const data = {};
  for (const c of BACKUP_COLS) data[c] = await DB.getAll(c);
  return { v: 1, app: 'worldwatch', at: now(), turn: turn(), gameTime: gameNow(), data };
}
export async function createBackup(label, { auto = false, reason = '', permanent = false, quiet = false } = {}) {
  try {
    const snap = await snapshotWorld();
    const s = JSON.stringify(snap), CH = 350000, parts = Math.ceil(s.length / CH);
    const id = newId(), nr = (S.game.backupCounter || 0) + 1;
    const ops = [];
    for (let i = 0; i < parts; i++) ops.push({ t: 'set', path: `backups/${id}/parts/${i}`, data: { i, data: s.slice(i * CH, (i + 1) * CH) } });
    ops.push({ t: 'set', path: 'backups/' + id, data: { nr, label: label || `Backup #${String(nr).padStart(3, '0')}`, createdAt: now(), turn: turn(), gameTime: gameNow(), auto, reason, permanent, size: s.length, parts, counts: Object.fromEntries(Object.entries(snap.data).map(([k, v]) => [k, v.length])) } });
    ops.push({ t: 'merge', path: 'meta/game', data: { backupCounter: nr, ...(auto ? { lastAutoBackup: now() } : {}) } });
    await DB.commit(ops);
    log('CREATE_BACKUP', `#${nr} ${label || ''} ${reason}`);
    if (auto) pruneBackups();
    if (!quiet) toastFn(`💾 Backup #${String(nr).padStart(3, '0')} zapisany`, 'ok');
    return id;
  } catch (e) {
    const eid = errId(); log('CREATE_BACKUP', label, 'ERROR', e.message, eid); S.lastError = { id: eid, op: 'CREATE_BACKUP', msg: e.message, at: now() };
    toastFn(`⚠️ Backup nieudany: ${e.message} (${eid})`, 'err', 8000); return null;
  }
}
export async function pruneBackups() {
  if (!isAdmin()) return;   // GM tworzy kopie, ale czyści je tylko admin
  const keep = S.game.keepAutoBackups || 20;
  const autos = Object.values(S.data.backups).filter(b => b.auto && !b.permanent).sort((a, b) => b.createdAt - a.createdAt);
  for (const b of autos.slice(keep)) await deleteBackup(b, true);
}
export async function deleteBackup(b, quiet) {
  const ops = []; for (let i = 0; i < (b.parts || 1); i++) ops.push({ t: 'del', path: `backups/${b.id}/parts/${i}` });
  ops.push({ t: 'del', path: 'backups/' + b.id });
  await DB.commit(ops); if (!quiet) log('DELETE_BACKUP', b.label);
}
export async function loadBackup(b) {
  let s = '';
  for (let i = 0; i < (b.parts || 1); i++) { const p = await DB.get(`backups/${b.id}/parts/${i}`); if (!p) throw new Error('brak części kopii nr ' + i); s += p.data; }
  return JSON.parse(s);
}
export async function restoreSnapshot(snap, label) {
  if (!snap?.data) throw new Error('nieprawidłowy plik kopii');
  const pre = await createBackup(`Przed przywróceniem: ${label}`, { auto: true, reason: 'pre-restore', quiet: true });
  if (!pre) throw new Error('nie udało się zrobić kopii bezpieczeństwa — przywracanie przerwane');
  try {
    const ops = [];
    for (const c of BACKUP_COLS) {
      const want = snap.data[c] || [], wantIds = new Set(want.map(d => d.id));
      if (c === 'users') { want.forEach(({ id, ...d }) => { if (id !== S.user.uid) ops.push({ t: 'merge', path: 'users/' + id, data: { role: d.role, countryId: d.countryId ?? null } }); }); continue; }
      const cur = await DB.getAll(c);
      cur.forEach(d => { if (!wantIds.has(d.id) && !(c === 'meta' && d.id !== 'clock' && d.id !== 'game')) ops.push({ t: 'del', path: `${c}/${d.id}` }); });
      want.forEach(({ id, ...d }) => ops.push({ t: 'set', path: `${c}/${id}`, data: c === 'meta' && id === 'game' ? { ...d, backupCounter: Math.max(d.backupCounter || 0, S.game.backupCounter || 0) + 1 } : d }));
    }
    await DB.commit(ops);
    log('RESTORE_BACKUP', label);
    return true;
  } catch (e) {
    const eid = errId(); log('RESTORE_BACKUP', label, 'ERROR', e.message, eid); S.lastError = { id: eid, op: 'RESTORE_BACKUP', msg: e.message, at: now() };
    toastFn(`⚠️ Przywracanie przerwane (${eid}). Kopia bezpieczeństwa „Before restore” jest dostępna na liście.`, 'err', 12000);
    return false;
  }
}

// ───────── sprzątanie logów (retencja) ─────────
export async function cleanupLogs(force) {
  if (!isAdmin()) return 0;
  const days = S.game.logRetentionDays ?? 7;
  if (days < 0 && !force) return 0;
  const cutoff = now() - Math.max(days, 0) * 86400000;
  const old = Object.values(S.data.logs).filter(l => (l.tsMs || 0) < cutoff);
  if (old.length) await DB.commit(old.map(l => ({ t: 'del', path: 'logs/' + l.id })));
  return old.length;
}

export { G, now, newId, isDemo, DB };
