// Przykładowy świat (demo + przycisk GM „Wczytaj przykładowy świat”)
import { S, DB, now, newId, writeUnit, writeChar, flagOf, presetByIso } from './store.js';
import { buildIntel } from './units.js';

const H = 3600000, M = 60000;
export async function seedWorld(keepClock) {
  const T0 = keepClock && S.clock ? (S.clock.running ? S.clock.anchorGame + (now() - S.clock.anchorReal) * (S.clock.rate || 1) : S.clock.anchorGame) : Date.UTC(2026, 8, 23, 12, 0);
  const ops = [], w = { set: (p, d) => ops.push({ t: 'set', path: p, data: d }), merge: (p, d) => ops.push({ t: 'merge', path: p, data: d }), del: p => ops.push({ t: 'del', path: p }) };
  const C = (iso, color, extra) => { const p = presetByIso(iso); return { id: iso.toLowerCase(), name: p.pl || p.name, iso2: iso, isoN: p.n, demonym: p.dem, flag: flagOf(iso), color, capital: { name: p.cap, lat: p.lat, lon: p.lon }, publicStats: false, ...extra }; };
  const countries = [
    C('SE', '#ffcc00', { official: 'Królestwo Szwecji', government: { system: 'Monarchia konstytucyjna', headTitle: 'Monarcha', head: 'Król Eryk XVII', headOfGov: 'Premier Linnea Håkansson', rulingParty: 'Koalicja Umiarkowanych' } }),
    C('PL', '#ff5a5f', { official: 'Rzeczpospolita Polska', government: { system: 'Republika parlamentarna', headTitle: 'Prezydent', head: 'Prezydent Tomasz Wierzbicki', headOfGov: 'Premier Agnieszka Lis', rulingParty: 'Sojusz Obywatelski' } }),
    C('US', '#3fa7ff', { tag: 'USA', official: 'Stany Zjednoczone Ameryki', government: { system: 'Federalna republika prezydencka', headTitle: 'Prezydent', head: 'Prezydent Daniel Mercer', headOfGov: 'Prezydent Daniel Mercer', rulingParty: 'Partia Republikańska' } }),
    C('CN', '#e84a4a', { tag: 'ChRL', official: 'Chińska Republika Ludowa', government: { system: 'Jednopartyjne państwo socjalistyczne', headTitle: 'Przewodniczący', head: 'Przewodniczący Liu Wenhao', headOfGov: 'Premier Zhao Min', rulingParty: 'Komunistyczna Partia Chin' } }),
    C('MX', '#4fd1c5', { official: 'Meksykańskie Stany Zjednoczone', government: { system: 'Federalna republika prezydencka', headTitle: 'Prezydent', head: 'Prezydent Valeria Ortega', headOfGov: 'Prezydent Valeria Ortega', rulingParty: 'MORENA' } }),
    C('FI', '#c792ea', { official: 'Republika Finlandii', government: { system: 'Republika parlamentarna', headTitle: 'Prezydent', head: 'Prezydent Aleksi Virtanen', headOfGov: 'Premier Sanna Koivu', rulingParty: 'Koalicja Narodowa' } }),
    C('RU', '#ff9d3d', { tag: 'RUS', official: 'Federacja Rosyjska', government: { system: 'Federacja półprezydencka', headTitle: 'Prezydent', head: 'Prezydent Wiktor Orłow', headOfGov: 'Premier Siergiej Bykow', rulingParty: 'Jedna Rosja' } }),
    C('DE', '#a3be8c', { official: 'Republika Federalna Niemiec', government: { system: 'Federalna republika parlamentarna', headTitle: 'Prezydent', head: 'Prezydent Karl Brenner', headOfGov: 'Kanclerz Miriam Albers', rulingParty: 'CDU/CSU' } })
  ];
  countries.forEach(({ id, ...c }) => { w.set('countries/' + id, c); S.data.countries[id] = { id, ...c }; });
  const stats = (id, lvl, projects = []) => w.set('countryPrivate/' + id, { countryId: id, intelLevel: lvl, projects, notes: '' });   // pola statystyk dodaje admin (System → Pola państw)
  stats('se', 4,
    [{ id: 'vasa', name: 'PROJECT VASA', desc: 'Długoterminowy narodowy program modernizacji.', phases: [['Modernizacja gospodarki', true], ['Rozbudowa przemysłu', true], ['Modernizacja marynarki', false], ['Modernizacja lotnictwa', false], ['Niezależność energetyczna', false], ['Program kosmiczny', false]].map(([name, done]) => ({ name, done })), cost: '42 mld $', duration: '8 tur', risk: 'Medium', secrecy: 'Restricted', effects: '+CIV, +MIC, +Navy' },
      { id: 'jasx', name: 'Rozwój JAS-X', desc: 'Studium myśliwca 6. generacji.', phases: [{ name: 'Koncepcja', done: true }, { name: 'Prototyp', done: false }, { name: 'Produkcja seryjna', done: false }], cost: '12 mld $', risk: 'High', secrecy: 'Secret' }]);
  stats('pl', 3);
  stats('us', 5);
  stats('cn', 4);
  stats('mx', 2);
  stats('ru', 3);
  ['fi', 'de'].forEach(id => stats(id, 3));

  const cap = id => countries.find(c => c.id === id).capital;
  const chars = [
    ['se-king', 'se', 'Eryk XVII', 'Król', '👑', 61], ['se-pm', 'se', 'Linnea Håkansson', 'Premier', '👔', 52], ['se-mod', 'se', 'Gustav Lindqvist', 'Minister obrony', '🛡️', 58],
    ['se-fm', 'se', 'Ingrid Sjöberg', 'Minister spraw zagranicznych', '🌍', 49], ['se-int', 'se', 'Dyrektor „N”', 'Dyrektor wywiadu', '🕵️', null, 'classified'], ['se-navy', 'se', 'Adm. Karl Nyström', 'Dowódca marynarki', '⚓', 55],
    ['pl-pres', 'pl', 'Tomasz Wierzbicki', 'Prezydent', '👔', 57], ['pl-fm', 'pl', 'Marta Zielińska', 'Minister spraw zagranicznych', '🌍', 46], ['pl-mod', 'pl', 'Paweł Król', 'Minister obrony', '🛡️', 51],
    ['us-pres', 'us', 'Daniel Mercer', 'Prezydent', '👔', 63], ['us-sos', 'us', 'Rachel Kaine', 'Sekretarz stanu', '🌍', 55],
    ['cn-pres', 'cn', 'Liu Wenhao', 'Prezydent', '👔', 66], ['cn-fm', 'cn', 'Chen Yiran', 'Minister spraw zagranicznych', '🌍', 58],
    ['mx-pres', 'mx', 'Valeria Ortega', 'Prezydent', '👔', 54], ['mx-eco', 'mx', 'Luis Carrasco', 'Minister gospodarki', '🏭', 48]
  ];
  chars.forEach(([id, c, name, title, icon, age, vis]) => {
    const doc = { id, name, title, icon, countryId: c, age, status: 'Active', visibility: vis || 'public', home: { name: cap(c).name, lat: cap(c).lat, lon: cap(c).lon }, mission: id === 'se-int' ? 'Ocena aktywności chińskich okrętów podwodnych' : '', notes: '' };
    writeChar(w, doc);
    S.data.characters[id] = vis === 'classified' ? { id, countryId: c, title, name: '[TAJNE]', icon: '🕵️' } : { id, ...doc }; S.data.charSecrets[id] = { id, countryId: c, realName: name };
  });

  const P = (name, lat, lon, cc = '') => ({ name, lat, lon, cc });
  const units = [
    { id: 'se-royal01', kind: 'aircraft', countryId: 'se', callsign: 'SE-ROYAL01', type: 'Samolot rządowy', operator: 'Rząd Szwecji', category: 'Government', route: [P('Stockholm', 59.33, 18.07, 'SE'), P('Warszawa', 52.23, 21.01, 'PL')], depTime: T0 - 40 * M, duration: 105 * M, passengers: ['se-king', 'se-fm', 'se-mod'], mission: 'Diplomatic', missionVisible: true, passengersVisible: false, visibility: 'public', eventType: 'State Visit' },
    { id: 'se-sub', kind: 'submarine', countryId: 'se', callsign: 'HSwMS Västergötland', type: 'Okręt podwodny', operator: 'Marynarka Wojenna Szwecji', category: 'Military', route: [P('Karlskrona', 56.16, 15.59, 'SE'), P('Gotland', 57.2, 18.9), P('Morze Bałtyckie', 58.4, 20.2)], depTime: T0 - 6 * H, duration: 30 * H, mission: 'Military', missionVisible: false, visibility: 'limited' },
    { id: 'cn-sub', kind: 'submarine', countryId: 'cn', callsign: 'Changzheng-19', type: 'Atomowy okręt podwodny', operator: 'Marynarka ChAL-W', category: 'Military', route: [P('Morze Północne', 57.0, 5.0), P('Skagerrak', 57.8, 9.5), P('Gotland', 57.0, 19.3)], depTime: T0 - 20 * H, duration: 60 * H, mission: 'Intelligence', missionVisible: false, visibility: 'hidden', confidence: 40 },
    { id: 'us-cvn', kind: 'ship', countryId: 'us', callsign: 'USS Harbor Star', type: 'Lotniskowiec', operator: 'US Navy', group: true, composition: '1× lotniskowiec USS Harbor Star\n1× krążownik rakietowy\n3× niszczyciel typu Arleigh Burke\n1× okręt zaopatrzeniowy', category: 'Military', route: [P('Północny Atlantyk', 55.0, -20.0), P('Morze Północne', 57.0, 3.5)], depTime: T0 - 30 * H, duration: 70 * H, mission: 'Military', missionVisible: true, visibility: 'public' },
    { id: 'us-ex', kind: 'zone', countryId: 'us', callsign: 'Ćwiczenia NORTHERN SHIELD', type: 'Ćwiczenia morskie', zoneType: 'exercise', radiusKm: 180, route: [P('Morze Północne', 56.8, 4.0)], mission: 'Military', missionVisible: true, visibility: 'public' },
    { id: 'us-sam', kind: 'aircraft', countryId: 'us', callsign: 'SAM-27', type: 'C-32A', operator: 'USAF', category: 'Government', route: [P('Waszyngton', 38.9, -77.04, 'US'), P('Baza Ramstein', 49.44, 7.6, 'DE')], depTime: T0 - 3 * H, duration: 8 * H + 20 * M, passengers: ['us-sos'], mission: 'Diplomatic', missionVisible: false, visibility: 'limited' },
    { id: 'mx-gob', kind: 'aircraft', countryId: 'mx', callsign: 'MX-GOB01', type: 'Boeing 787', operator: 'Rząd Meksyku', category: 'Government', route: [P('Meksyk', 19.43, -99.13, 'MX'), P('Waszyngton', 38.9, -77.04, 'US')], depTime: T0 + 30 * M, duration: 4 * H + 10 * M, passengers: ['mx-pres', 'mx-eco'], mission: 'Trade', missionVisible: true, passengersVisible: true, visibility: 'public' },
    { id: 'cn-sat', kind: 'satellite', countryId: 'cn', callsign: 'TIANYAN-7', type: 'Satelita rozpoznawczy', category: 'Military', route: [P('Orbita', 0, 100)], sat: { inclination: 63, periodMin: 96, lon0: 100, epoch: T0 - 20 * M }, mission: 'Intelligence', missionVisible: false, visibility: 'classified', confidence: 70 },
    { id: 'ru-conv', kind: 'ground', countryId: 'ru', callsign: 'Konwój 11. Korpusu Armijnego', type: 'Kolumna pancerna', category: 'Military', route: [P('Kaliningrad', 54.71, 20.51), P('Gusiew', 54.59, 22.2)], depTime: T0 - 1 * H, duration: 5 * H, mission: 'Military', missionVisible: false, visibility: 'limited' },
    { id: 'pl-gdy', kind: 'base', countryId: 'pl', callsign: 'Baza Marynarki Wojennej Gdynia', type: 'Baza morska', route: [P('Gdynia', 54.52, 18.53, 'PL')], mission: 'Military', missionVisible: true, visibility: 'public' },
    { id: 'gm-cont', kind: 'contact', countryId: '__gm', callsign: 'NIEZIDENTYFIKOWANY KONTAKT MORSKI', guess: 'Możliwy okręt podwodny', confidence: 54, fuzzKm: 35, route: [P('Ślad kontaktu', 57.6, 17.6), P('Ślad kontaktu', 58.1, 17.9)], depTime: T0 - 2 * H, duration: 14 * H, visibility: 'public' }
  ];
  units.forEach(u => writeUnit(w, u));
  // Wywiad: prawda o chińskim okręcie — różne państwa wiedzą różne rzeczy
  const cnSub = units.find(u => u.id === 'cn-sub');
  w.set('intel/cn-sub__se', { ...buildIntel(cnSub, 'se', 'suspected', 81, 'Sygnatura akustyczna zgodna z atomowym okrętem podwodnym Marynarki ChAL-W.'), createdGame: T0 - 2 * H });
  w.set('intel/cn-sub__pl', { ...buildIntel(cnSub, 'pl', 'detected', 42, 'Możliwy kontakt morski zgłoszony przez sojuszniczy samolot patrolowy.'), createdGame: T0 - 1 * H });
  const note = (id, to, category, label, text, confidence) => w.set('intel/' + id, { toCountry: to, category, label, text, confidence, kind: 'contact', pos: null, fuzzKm: 0, lines: [], createdGame: T0 - 5 * H, createdAt: now(), source: 'gm', level: 'report' });
  note('se-k1', 'se', 'known', 'Zatwierdzono rozbudowę szwedzkiej marynarki', 'Pozycja budżetowa potwierdzona przez Riksdag.', 100);
  note('se-k2', 'se', 'known', 'Polskie spotkania dyplomatyczne z Finlandią', '', 90);
  note('se-k3', 'se', 'known', 'Amerykańskie ćwiczenia morskie na Morzu Północnym', 'Ćwiczenia NORTHERN SHIELD, obecna grupa lotniskowcowa.', 95);
  note('se-s1', 'se', 'suspected', 'W Warszawie powstaje nowe polsko-szwedzkie porozumienie obronne', '', 60);
  note('se-u1', 'se', 'unknown', 'Dokładny chiński budżet wojskowy', '', 20);
  note('se-u2', 'se', 'unknown', 'Tajne plany rozmieszczenia sił USA', '', 10);
  note('pl-s1', 'pl', 'suspected', 'Rosyjskie wojska pancerne na wschód od Kaliningradu', 'Zdjęcia satelitarne sprzed 12 h.', 70);

  const news = (id, t, headline, extra) => w.set('news/' + id, { headline, body: '', category: 'Politics', reliability: 'Confirmed', breaking: false, countries: [], gameTime: t, createdAt: now(), audienceAll: true, audience: [], source: 'gm', ...extra });
  news('n1', T0 - 3 * H, '🇸🇪 Szwecja ogłasza dużą rozbudowę marynarki', { category: 'Military', breaking: true, countries: ['se'], body: 'Szwedzki rząd przedstawił plan podwojenia floty okrętów podwodnych i wprowadzenia czterech nowych fregat do 2032 roku.', place: { name: 'Stockholm', lat: 59.33, lon: 18.07 } });
  news('n2', T0 - 2 * H, 'Źródła: Szwecja rozważa nowy program broni strategicznej', { category: 'Intelligence', reliability: 'Unverified', reliabilityPct: 32, leak: true, countries: ['se'] });
  w.set('gmNotes/news_n2', { truth: 'false' });
  news('n3', T0 - 5 * H, '🇨🇳 Chiny ogłaszają nowy program przemysłowy', { category: 'Economy', countries: ['cn'], body: 'Pekin przedstawił dziesięcioletni plan skupiony na przemyśle stoczniowym i półprzewodnikach.' });
  news('n4', T0 - 1 * H, '🇺🇸 USA rozpoczynają ćwiczenia NORTHERN SHIELD na Morzu Północnym', { category: 'Military', countries: ['us'], place: { name: 'Morze Północne', lat: 56.8, lon: 4.0 } });
  news('n5', T0 - 40 * M + 105 * M + 20 * M, '🇸🇪🇵🇱 Rozmowy delegacji Szwecji i Polski w Warszawie', { category: 'Diplomacy', countries: ['se', 'pl'], auto: true, unitId: 'se-royal01', place: { name: 'Warszawa', lat: 52.23, lon: 21.01 } });
  news('n6', T0 - 30 * M, 'Marynarka Wojenna RP: możliwy obcy okręt podwodny w pobliżu Gotlandii', { category: 'Military', reliability: 'Reliable', audienceAll: false, audience: ['pl'], countries: ['pl'] });

  const rel = (a, b, s) => w.set('relations/' + [a, b].sort().join('__'), { parties: [a, b].sort(), status: s, updatedAt: now() });
  rel('se', 'pl', 'Strategic Partner'); rel('se', 'fi', 'Ally'); rel('us', 'cn', 'Hostile'); rel('us', 'pl', 'Ally'); rel('ru', 'pl', 'Hostile'); rel('us', 'mx', 'Partner'); rel('de', 'pl', 'Ally'); rel('us', 'se', 'Ally');
  w.set('blocs/b1', { name: 'Pakt Bałtycki', tag: 'PB', type: 'Sojusz wojskowy', color: '#3fa7ff', secret: false, charter: 'Wzajemna obrona i wspólne patrole na Bałtyku.', members: ['pl', 'se'], invites: ['de'], founder: 'se', createdAt: now(), gameTime: T0 - 30 * 86400000 });
  w.set('treaties/t1', { name: 'Bałtyckie Partnerstwo Strategiczne', type: 'Strategic partnership', parties: ['pl', 'se'], secret: false, status: 'active', text: 'Wspólne patrole morskie i wymiana informacji wywiadowczych na Bałtyku.', signedAt: T0 - 60 * 86400000, createdAt: now() });
  w.set('treaties/t2', { name: 'Projekt Northern Light', type: 'Technology programme', parties: ['fi', 'se'], secret: true, status: 'active', text: 'Tajne wspólne badania nad sensorami kwantowymi do wykrywania okrętów podwodnych.', signedAt: T0 - 20 * 86400000, createdAt: now() });
  w.set('treaties/t3', { name: 'Północnoamerykańskie Ramy Handlowe', type: 'Trade agreement', parties: ['mx', 'us'], secret: false, status: 'active', text: '', signedAt: T0 - 300 * 86400000, createdAt: now() });
  w.set('messages/m1', { from: 'se', to: 'pl', parties: ['pl', 'se'], kind: 'proposal', status: 'pending', subject: 'Morski system rakietowy', text: 'Szwecja proponuje wspólne opracowanie nowego morskiego systemu rakietowego z montażem końcowym w Gdyni.', treaty: { name: 'Bałtycka Inicjatywa Uderzeniowa', type: 'Military agreement', secret: true }, createdAt: now(), gameTime: T0 - 90 * M });
  const hist = (id, turn, t, text, countries) => w.set('history/' + id, { turn, gameTime: t, text, countries, createdAt: now() });
  hist('h1', 1, Date.UTC(2026, 0, 15), 'Szwecja rozpoczyna modernizację gospodarki.', ['se']);
  hist('h2', 2, Date.UTC(2026, 3, 2), 'Polska i Szwecja zawierają partnerstwo strategiczne.', ['pl', 'se']);
  hist('h3', 3, Date.UTC(2026, 6, 20), 'USA ogłaszają ćwiczenia morskie na Północnym Atlantyku.', ['us']);
  hist('h4', 3, Date.UTC(2026, 7, 11), 'Chiny zwiększają produkcję wojskową.', ['cn']);
  hist('h5', 4, T0 - 3 * H, 'Szwecja ogłasza dużą rozbudowę marynarki.', ['se']);
  ops.push({ t: 'merge', path: 'meta/game', data: { turn: 4, logRetentionDays: 7, autoBackupMinutes: 60, keepAutoBackups: 20, turnAdvance: 0, name: 'WorldWatch' } });
  if (!(keepClock && S.clock)) ops.push({ t: 'set', path: 'meta/clock', data: { running: true, rate: 10, anchorGame: T0, anchorReal: now() } });
  await DB.commit(ops);
}
