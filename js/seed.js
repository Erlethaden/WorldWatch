// Przykładowy świat (demo + przycisk GM „Wczytaj przykładowy świat”)
import { S, DB, now, newId, writeUnit, writeChar, flagOf, presetByIso } from './store.js';
import { buildIntel } from './units.js';

const H = 3600000, M = 60000;
export async function seedWorld(keepClock) {
  const T0 = keepClock && S.clock ? (S.clock.running ? S.clock.anchorGame + (now() - S.clock.anchorReal) * (S.clock.rate || 1) : S.clock.anchorGame) : Date.UTC(2026, 8, 23, 12, 0);
  const ops = [], w = { set: (p, d) => ops.push({ t: 'set', path: p, data: d }), merge: (p, d) => ops.push({ t: 'merge', path: p, data: d }), del: p => ops.push({ t: 'del', path: p }) };
  const C = (iso, color, extra) => { const p = presetByIso(iso); return { id: iso.toLowerCase(), name: p.name, iso2: iso, isoN: p.n, demonym: p.dem, flag: flagOf(iso), color, capital: { name: p.cap, lat: p.lat, lon: p.lon }, publicStats: false, ...extra }; };
  const countries = [
    C('SE', '#ffcc00', { official: 'Kingdom of Sweden', government: { system: 'Constitutional monarchy', headTitle: 'Monarch', head: 'King Erik XVII', headOfGov: 'PM Linnea Håkansson', rulingParty: 'Moderate Coalition' } }),
    C('PL', '#ff5a5f', { official: 'Republic of Poland', government: { system: 'Parliamentary republic', headTitle: 'President', head: 'President Tomasz Wierzbicki', headOfGov: 'PM Agnieszka Lis', rulingParty: 'Civic Alliance' } }),
    C('US', '#3fa7ff', { tag: 'USA', official: 'United States of America', government: { system: 'Federal presidential republic', headTitle: 'President', head: 'President Daniel Mercer', headOfGov: 'President Daniel Mercer', rulingParty: 'Republican Party' } }),
    C('CN', '#e84a4a', { tag: 'ChRL', official: "People's Republic of China", government: { system: 'One-party socialist state', headTitle: 'President', head: 'President Liu Wenhao', headOfGov: 'Premier Zhao Min', rulingParty: 'Communist Party' } }),
    C('MX', '#4fd1c5', { official: 'United Mexican States', government: { system: 'Federal presidential republic', headTitle: 'President', head: 'President Valeria Ortega', headOfGov: 'President Valeria Ortega', rulingParty: 'MORENA' } }),
    C('FI', '#c792ea', { official: 'Republic of Finland', government: { system: 'Parliamentary republic', headTitle: 'President', head: 'President Aleksi Virtanen', headOfGov: 'PM Sanna Koivu', rulingParty: 'National Coalition' } }),
    C('RU', '#ff9d3d', { tag: 'RUS', official: 'Russian Federation', government: { system: 'Semi-presidential federation', headTitle: 'President', head: 'President Viktor Orlov', headOfGov: 'PM Sergei Bykov', rulingParty: 'United Russia' } }),
    C('DE', '#a3be8c', { official: 'Federal Republic of Germany', government: { system: 'Federal parliamentary republic', headTitle: 'President', head: 'President Karl Brenner', headOfGov: 'Chancellor Miriam Albers', rulingParty: 'CDU/CSU' } })
  ];
  countries.forEach(({ id, ...c }) => { w.set('countries/' + id, c); S.data.countries[id] = { id, ...c }; });
  const stats = (id, e, m, t, lvl, projects = []) => w.set('countryPrivate/' + id, { countryId: id, economy: e, military: m, tech: t, intelLevel: lvl, projects, notes: '' });
  stats('se', { gdp: '$640B', budget: '$28B', civ: 42, mic: 18, nic: 12, population: '10.6M', stability: '82%', resources: 'Iron ore, timber, hydropower' }, { army: 'Moderate', navy: 'Modernising', airforce: 'JAS 39 fleet', missiles: 'Limited', intelligence: 'MUST / FRA', manpower: '55,000', service: 'Selective conscription' }, { level: 8, research: 'JAS-X, A26 subs', space: 'Esrange', cyber: 'High' }, 4,
    [{ id: 'vasa', name: 'PROJECT VASA', desc: 'Long-term national modernisation programme.', phases: [['Economic modernization', true], ['Industrial expansion', true], ['Naval modernization', false], ['Air force modernization', false], ['Energy independence', false], ['Space program', false]].map(([name, done]) => ({ name, done })), cost: '$42B', duration: '8 turns', risk: 'Medium', secrecy: 'Restricted', effects: '+CIV, +MIC, +Navy' },
      { id: 'jasx', name: 'JAS-X Development', desc: '6th-generation fighter study.', phases: [{ name: 'Concept', done: true }, { name: 'Prototype', done: false }, { name: 'Serial production', done: false }], cost: '$12B', risk: 'High', secrecy: 'Secret' }]);
  stats('pl', { gdp: '$840B', budget: '$37B', civ: 38, mic: 26, nic: 9, population: '37.6M', stability: '74%', resources: 'Coal, copper, silver' }, { army: 'Large & expanding', navy: 'Small', airforce: 'F-35 / F-16', missiles: 'HIMARS, K239', intelligence: 'AW / SKW', manpower: '190,000', service: 'Voluntary + reserve' }, { level: 7, research: 'Borsuk IFV', space: 'Minimal', cyber: 'Medium' }, 3);
  stats('us', { gdp: '32 384,00', budget: '$880B defence', civ: 1295.36, mic: 64.768, nic: 60, population: '349 035 494', stability: 100, warSupport: '5%', resources: 'Oil, gas, rare earths' }, { army: 'Global', navy: '11 carrier groups', airforce: 'Global', missiles: 'Strategic triad', intelligence: 'CIA / NSA', manpower: '3 490 354', service: '1%' }, { level: 1, research: 'Hypersonics, AI', space: 'NASA / USSF', cyber: 'Very high' }, 5);
  stats('cn', { gdp: '19 373,00', budget: '$300B defence (est.)', civ: 774.92, mic: 15.4984, nic: 70, population: '1 412 914 089', stability: 90, warSupport: '2%', resources: 'Rare earths, coal' }, { army: 'Very large', navy: 'Largest by hull count', airforce: 'J-20 fleet', missiles: 'DF series', intelligence: 'MSS', manpower: '14 129 140', service: '1%' }, { level: 9, research: 'Quantum, hypersonics', space: 'CNSA', cyber: 'Very high' }, 4);
  stats('mx', { gdp: '$1.9T', budget: '$14B', civ: 44, mic: 6, nic: 11, population: '130M', stability: '58%', resources: 'Oil, silver' }, { army: 'Medium', navy: 'Coastal', airforce: 'Limited', missiles: '—', intelligence: 'CNI', manpower: '260,000', service: 'Mandatory (lottery)' }, { level: 5, research: '—', space: 'AEM', cyber: 'Low' }, 2);
  stats('ru', { gdp: '2161', civ: 86.44, mic: 21.61, population: '146 238 185', stability: 65, warSupport: '25%' }, { manpower: '1 462 381', service: '1%' }, { level: 1 }, 3);
  ['fi', 'de'].forEach(id => stats(id, {}, {}, {}, 3));

  const cap = id => countries.find(c => c.id === id).capital;
  const chars = [
    ['se-king', 'se', 'Erik XVII', 'King', '👑', 61], ['se-pm', 'se', 'Linnea Håkansson', 'Prime Minister', '👔', 52], ['se-mod', 'se', 'Gustav Lindqvist', 'Minister of Defence', '🛡️', 58],
    ['se-fm', 'se', 'Ingrid Sjöberg', 'Foreign Minister', '🌍', 49], ['se-int', 'se', 'Director “N”', 'Director of Intelligence', '🕵️', null, 'classified'], ['se-navy', 'se', 'Adm. Karl Nyström', 'Chief of Navy', '⚓', 55],
    ['pl-pres', 'pl', 'Tomasz Wierzbicki', 'President', '👔', 57], ['pl-fm', 'pl', 'Marta Zielińska', 'Foreign Minister', '🌍', 46], ['pl-mod', 'pl', 'Paweł Król', 'Minister of Defence', '🛡️', 51],
    ['us-pres', 'us', 'Daniel Mercer', 'President', '👔', 63], ['us-sos', 'us', 'Rachel Kaine', 'Secretary of State', '🌍', 55],
    ['cn-pres', 'cn', 'Liu Wenhao', 'President', '👔', 66], ['cn-fm', 'cn', 'Chen Yiran', 'Foreign Minister', '🌍', 58],
    ['mx-pres', 'mx', 'Valeria Ortega', 'President', '👔', 54], ['mx-eco', 'mx', 'Luis Carrasco', 'Minister of Economy', '🏭', 48]
  ];
  chars.forEach(([id, c, name, title, icon, age, vis]) => {
    const doc = { id, name, title, icon, countryId: c, age, status: 'Active', visibility: vis || 'public', home: { name: cap(c).name, lat: cap(c).lat, lon: cap(c).lon }, mission: id === 'se-int' ? 'Assess Chinese submarine activity' : '', notes: '' };
    writeChar(w, doc);
    S.data.characters[id] = vis === 'classified' ? { id, countryId: c, title, name: '[CLASSIFIED]', icon: '🕵️' } : { id, ...doc }; S.data.charSecrets[id] = { id, countryId: c, realName: name };
  });

  const P = (name, lat, lon, cc = '') => ({ name, lat, lon, cc });
  const units = [
    { id: 'se-royal01', kind: 'aircraft', countryId: 'se', callsign: 'SE-ROYAL01', type: 'Government Jet', operator: 'Swedish Government', category: 'Government', route: [P('Stockholm', 59.33, 18.07, 'SE'), P('Warsaw', 52.23, 21.01, 'PL')], depTime: T0 - 40 * M, duration: 105 * M, passengers: ['se-king', 'se-fm', 'se-mod'], mission: 'Diplomatic', missionVisible: true, passengersVisible: false, visibility: 'public', eventType: 'State Visit' },
    { id: 'se-sub', kind: 'submarine', countryId: 'se', callsign: 'HSwMS Västergötland', type: 'Submarine', operator: 'Swedish Navy', category: 'Military', route: [P('Karlskrona', 56.16, 15.59, 'SE'), P('Gotland', 57.2, 18.9), P('Baltic Sea', 58.4, 20.2)], depTime: T0 - 6 * H, duration: 30 * H, mission: 'Military', missionVisible: false, visibility: 'limited' },
    { id: 'cn-sub', kind: 'submarine', countryId: 'cn', callsign: 'Changzheng-19', type: 'Nuclear attack submarine', operator: 'PLA Navy', category: 'Military', route: [P('North Sea', 57.0, 5.0), P('Skagerrak', 57.8, 9.5), P('Gotland', 57.0, 19.3)], depTime: T0 - 20 * H, duration: 60 * H, mission: 'Intelligence', missionVisible: false, visibility: 'hidden', confidence: 40 },
    { id: 'us-cvn', kind: 'ship', countryId: 'us', callsign: 'USS Harbor Star', type: 'Aircraft carrier', operator: 'US Navy', category: 'Military', route: [P('North Atlantic', 55.0, -20.0), P('North Sea', 57.0, 3.5)], depTime: T0 - 30 * H, duration: 70 * H, mission: 'Military', missionVisible: true, visibility: 'public' },
    { id: 'us-ex', kind: 'zone', countryId: 'us', callsign: 'Exercise NORTHERN SHIELD', type: 'Naval exercise', zoneType: 'exercise', radiusKm: 180, route: [P('North Sea', 56.8, 4.0)], mission: 'Military', missionVisible: true, visibility: 'public' },
    { id: 'us-sam', kind: 'aircraft', countryId: 'us', callsign: 'SAM-27', type: 'C-32A', operator: 'USAF', category: 'Government', route: [P('Washington', 38.9, -77.04, 'US'), P('Ramstein AB', 49.44, 7.6, 'DE')], depTime: T0 - 3 * H, duration: 8 * H + 20 * M, passengers: ['us-sos'], mission: 'Diplomatic', missionVisible: false, visibility: 'limited' },
    { id: 'mx-gob', kind: 'aircraft', countryId: 'mx', callsign: 'MX-GOB01', type: 'Boeing 787', operator: 'Mexican Government', category: 'Government', route: [P('Mexico City', 19.43, -99.13, 'MX'), P('Washington', 38.9, -77.04, 'US')], depTime: T0 + 30 * M, duration: 4 * H + 10 * M, passengers: ['mx-pres', 'mx-eco'], mission: 'Trade', missionVisible: true, passengersVisible: true, visibility: 'public' },
    { id: 'cn-sat', kind: 'satellite', countryId: 'cn', callsign: 'TIANYAN-7', type: 'Reconnaissance satellite', category: 'Military', route: [P('Orbit', 0, 100)], sat: { inclination: 63, periodMin: 96, lon0: 100, epoch: T0 - 20 * M }, mission: 'Intelligence', missionVisible: false, visibility: 'classified', confidence: 70 },
    { id: 'ru-conv', kind: 'ground', countryId: 'ru', callsign: '11th Army Corps convoy', type: 'Armoured column', category: 'Military', route: [P('Kaliningrad', 54.71, 20.51), P('Gusev', 54.59, 22.2)], depTime: T0 - 1 * H, duration: 5 * H, mission: 'Military', missionVisible: false, visibility: 'limited' },
    { id: 'pl-gdy', kind: 'base', countryId: 'pl', callsign: 'Gdynia Naval Base', type: 'Naval base', route: [P('Gdynia', 54.52, 18.53, 'PL')], mission: 'Military', missionVisible: true, visibility: 'public' },
    { id: 'gm-cont', kind: 'contact', countryId: '__gm', callsign: 'UNKNOWN NAVAL CONTACT', guess: 'Possible submarine', confidence: 54, fuzzKm: 35, route: [P('Contact track', 57.6, 17.6), P('Contact track', 58.1, 17.9)], depTime: T0 - 2 * H, duration: 14 * H, visibility: 'public' }
  ];
  units.forEach(u => writeUnit(w, u));
  // Wywiad: prawda o chińskim okręcie — różne państwa wiedzą różne rzeczy
  const cnSub = units.find(u => u.id === 'cn-sub');
  w.set('intel/cn-sub__se', { ...buildIntel(cnSub, 'se', 'suspected', 81, 'Acoustic signature consistent with a PLA Navy SSN.'), createdGame: T0 - 2 * H });
  w.set('intel/cn-sub__pl', { ...buildIntel(cnSub, 'pl', 'detected', 42, 'Possible naval contact reported by allied patrol aircraft.'), createdGame: T0 - 1 * H });
  const note = (id, to, category, label, text, confidence) => w.set('intel/' + id, { toCountry: to, category, label, text, confidence, kind: 'contact', pos: null, fuzzKm: 0, lines: [], createdGame: T0 - 5 * H, createdAt: now(), source: 'gm', level: 'report' });
  note('se-k1', 'se', 'known', 'Swedish naval expansion approved', 'Budget line confirmed by the Riksdag.', 100);
  note('se-k2', 'se', 'known', 'Polish diplomatic meetings with Finland', '', 90);
  note('se-k3', 'se', 'known', 'American naval exercises in the North Sea', 'Exercise NORTHERN SHIELD, carrier group present.', 95);
  note('se-s1', 'se', 'suspected', 'New Polish-Swedish defence agreement being drafted in Warsaw', '', 60);
  note('se-u1', 'se', 'unknown', 'Exact Chinese military budget', '', 20);
  note('se-u2', 'se', 'unknown', 'Secret US deployment plans', '', 10);
  note('pl-s1', 'pl', 'suspected', 'Russian armour moving east of Kaliningrad', 'Satellite imagery, 12h old.', 70);

  const news = (id, t, headline, extra) => w.set('news/' + id, { headline, body: '', category: 'Politics', reliability: 'Confirmed', breaking: false, countries: [], gameTime: t, createdAt: now(), audienceAll: true, audience: [], source: 'gm', ...extra });
  news('n1', T0 - 3 * H, '🇸🇪 Sweden announces major naval expansion', { category: 'Military', breaking: true, countries: ['se'], body: 'The Swedish government has unveiled plans to double its submarine fleet and commission four new frigates by 2032.', place: { name: 'Stockholm', lat: 59.33, lon: 18.07 } });
  news('n2', T0 - 2 * H, 'Sources claim Sweden is considering a new strategic weapons program', { category: 'Intelligence', reliability: 'Unverified', reliabilityPct: 32, leak: true, countries: ['se'] });
  w.set('gmNotes/news_n2', { truth: 'false' });
  news('n3', T0 - 5 * H, '🇨🇳 China announces new industrial program', { category: 'Economy', countries: ['cn'], body: 'Beijing presented a ten-year plan focused on shipbuilding and semiconductors.' });
  news('n4', T0 - 1 * H, '🇺🇸 USA begins Exercise NORTHERN SHIELD in the North Sea', { category: 'Military', countries: ['us'], place: { name: 'North Sea', lat: 56.8, lon: 4.0 } });
  news('n5', T0 - 40 * M + 105 * M + 20 * M, '🇸🇪🇵🇱 Swedish and Polish officials begin talks in Warsaw', { category: 'Diplomacy', countries: ['se', 'pl'], auto: true, unitId: 'se-royal01', place: { name: 'Warsaw', lat: 52.23, lon: 21.01 } });
  news('n6', T0 - 30 * M, 'Polish Navy reports possible foreign submarine near Gotland', { category: 'Military', reliability: 'Reliable', audienceAll: false, audience: ['pl'], countries: ['pl'] });

  const rel = (a, b, s) => w.set('relations/' + [a, b].sort().join('__'), { parties: [a, b].sort(), status: s, updatedAt: now() });
  rel('se', 'pl', 'Strategic Partner'); rel('se', 'fi', 'Ally'); rel('us', 'cn', 'Hostile'); rel('us', 'pl', 'Ally'); rel('ru', 'pl', 'Hostile'); rel('us', 'mx', 'Partner'); rel('de', 'pl', 'Ally'); rel('us', 'se', 'Ally');
  w.set('treaties/t1', { name: 'Baltic Strategic Partnership', type: 'Strategic partnership', parties: ['pl', 'se'], secret: false, status: 'active', text: 'Joint naval patrols and intelligence sharing in the Baltic.', signedAt: T0 - 60 * 86400000, createdAt: now() });
  w.set('treaties/t2', { name: 'Project Northern Light', type: 'Technology programme', parties: ['fi', 'se'], secret: true, status: 'active', text: 'Secret joint quantum-sensing research for submarine detection.', signedAt: T0 - 20 * 86400000, createdAt: now() });
  w.set('treaties/t3', { name: 'North American Trade Framework', type: 'Trade agreement', parties: ['mx', 'us'], secret: false, status: 'active', text: '', signedAt: T0 - 300 * 86400000, createdAt: now() });
  w.set('messages/m1', { from: 'se', to: 'pl', parties: ['pl', 'se'], kind: 'proposal', status: 'pending', subject: 'Naval missile system', text: 'Sweden proposes joint development of a new naval missile system, with final assembly in Gdynia.', treaty: { name: 'Baltic Strike Initiative', type: 'Military agreement', secret: true }, createdAt: now(), gameTime: T0 - 90 * M });
  const hist = (id, turn, t, text, countries) => w.set('history/' + id, { turn, gameTime: t, text, countries, createdAt: now() });
  hist('h1', 1, Date.UTC(2026, 0, 15), 'Sweden begins economic modernization.', ['se']);
  hist('h2', 2, Date.UTC(2026, 3, 2), 'Poland and Sweden establish strategic partnership.', ['pl', 'se']);
  hist('h3', 3, Date.UTC(2026, 6, 20), 'USA announces naval exercise in the North Atlantic.', ['us']);
  hist('h4', 3, Date.UTC(2026, 7, 11), 'China increases military production.', ['cn']);
  hist('h5', 4, T0 - 3 * H, 'Sweden announces major naval expansion.', ['se']);
  ops.push({ t: 'merge', path: 'meta/game', data: { turn: 4, logRetentionDays: 7, autoBackupMinutes: 60, keepAutoBackups: 20, turnAdvance: 0, name: 'WorldWatch' } });
  if (!(keepClock && S.clock)) ops.push({ t: 'set', path: 'meta/clock', data: { running: true, rate: 10, anchorGame: T0, anchorReal: now() } });
  await DB.commit(ops);
}
