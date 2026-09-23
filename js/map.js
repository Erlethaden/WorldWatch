// Mapa świata (Leaflet): warstwy, markery ruchome, trasy, strefy, linie sojuszy, niepewność pozycji
import { S, unitViews, posOf, gameNow, cColor, cFlag, cName, country, persp, gmView, KINDS, ZONE_TYPES, REL_COLOR, charView, charLocation, statusOf, G, myCountry, realGM } from './store.js';
import { h, esc } from './ui.js';
import { COUNTRY_PRESETS } from './places.js';
import { flagOf } from './store.js';

export const LAYERS = [
  { k: 'aircraft', i: '✈️', l: 'Aircraft' }, { k: 'naval', i: '🚢', l: 'Naval' }, { k: 'military', i: '🪖', l: 'Military' },
  { k: 'diplomacy', i: '🏛️', l: 'Diplomacy' }, { k: 'news', i: '📰', l: 'News' }, { k: 'satellites', i: '🛰️', l: 'Satellites' },
  { k: 'intel', i: '📡', l: 'Intelligence' }, { k: 'trade', i: '💰', l: 'Trade' }, { k: 'alliances', i: '🤝', l: 'Alliances' },
  { k: 'conflicts', i: '⚠️', l: 'Conflicts' }, { k: 'exercises', i: '🎯', l: 'Exercises' }
];
let enabled = new Set(LAYERS.map(l => l.k).filter(k => k !== 'trade'));
try { const s = JSON.parse(localStorage.getItem('ww_layers') || 'null'); if (Array.isArray(s)) enabled = new Set(s); } catch { }
export const isOn = k => enabled.has(k);
export function toggleLayer(k) { enabled.has(k) ? enabled.delete(k) : enabled.add(k); try { localStorage.setItem('ww_layers', JSON.stringify([...enabled])); } catch { } render(); }

let map, geo, groups = {}, markers = new Map(), selLayer, selected = null, pickCb = null, onSelect = () => { }, onCountry = () => { };
export const getMap = () => map;
export const selectedKey = () => selected;

const ICON = {
  aircraft: '<path d="M12 1.5l1.6 7.2 7.9 4.3v1.8l-7.9-2.2-.5 5.6 2.6 2v1.3L12 20.6l-3.7.9v-1.3l2.6-2-.5-5.6-7.9 2.2V13l7.9-4.3z"/>',
  ship: '<path d="M12 2l4.5 6.5V20L12 22.5 7.5 20V8.5z"/><rect x="10.3" y="9" width="3.4" height="5" rx=".6" fill="rgba(0,0,0,.35)"/>',
  submarine: '<path d="M12 2.5c2 0 3.2 3 3.2 6.5v9.5c0 2.3-1.6 3.5-3.2 3.5s-3.2-1.2-3.2-3.5V9c0-3.5 1.2-6.5 3.2-6.5z"/><rect x="10.8" y="8" width="2.4" height="4" rx=".8" fill="rgba(0,0,0,.4)"/>',
  ground: '<rect x="3" y="6" width="18" height="12" rx="1.5"/><path d="M3.8 6.8l16.4 10.4M20.2 6.8L3.8 17.2" stroke="rgba(0,0,0,.55)" stroke-width="1.6"/>',
  satellite: '<rect x="9" y="9" width="6" height="6" rx="1"/><rect x="1.5" y="10" width="6" height="4" opacity=".8"/><rect x="16.5" y="10" width="6" height="4" opacity=".8"/>',
  contact: '<path d="M12 2l10 10-10 10L2 12z" fill-opacity=".25" stroke="currentColor" stroke-width="1.8"/><text x="12" y="16" text-anchor="middle" font-size="11" font-weight="700" fill="currentColor">?</text>',
  base: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M12 7l1.5 3.3 3.5.3-2.7 2.3.9 3.5L12 14.6l-3.2 1.8.9-3.5L7 10.6l3.5-.3z" fill="rgba(0,0,0,.5)"/>'
};
const ROTATE = new Set(['aircraft', 'ship', 'submarine']);

export function layerOf(v) {
  if (v.src === 'intel' || v.kind === 'contact') return 'intel';
  if (v.kind === 'zone') return ZONE_TYPES[v.zoneType]?.layer || 'exercises';
  return KINDS[v.kind]?.layer || 'military';
}
export function colorOf(v) {
  if (v.src === 'intel' || v.gmIntel) return '#3fd0ff';
  if (!v.countryId) return '#ff9d3d';
  return cColor(v.countryId);
}

export function initMap(el, { onSelectUnit, onCountryClick }) {
  onSelect = onSelectUnit; onCountry = onCountryClick;
  if (map) { map.remove(); markers.clear(); geo = null; }
  map = L.map(el, { worldCopyJump: true, minZoom: 2, maxZoom: 12, zoomControl: false, preferCanvas: false }).setView([50, 15], 4);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { subdomains: 'abcd', maxZoom: 19, attribution: '© OpenStreetMap © CARTO' }).addTo(map);
  map.createPane('zones').style.zIndex = 380;
  map.createPane('lines').style.zIndex = 390;
  ['countries', 'static', 'lines', 'units', 'fuzz'].forEach(k => groups[k] = L.layerGroup().addTo(map));
  selLayer = L.layerGroup().addTo(map);
  fetch('vendor/countries-50m.json').then(r => r.json()).then(topo => {
    // wszystkie państwa i terytoria świata (241); brakujące/zdublowane ID zastępujemy stałym kluczem z nazwy
    const fc = topojson.feature(topo, topo.objects.countries), seen = new Set();
    fc.features.forEach(f => { let id = f.id ?? 'x-' + f.properties.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'); if (seen.has(id)) id += '-' + f.properties.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'); seen.add(id); f.id = id;
      // Rosja, Fidżi itp. przecinają 180° — „rozwijamy” długość geograficzną, żeby nie rysowało pasów przez cały świat
      if (f.properties.name === 'Antarctica') return;
      const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      polys.forEach(poly => poly.forEach(ring => { let off = 0; for (let i = 1; i < ring.length; i++) { const d = ring[i][0] + off - ring[i - 1][0]; if (d > 180) off -= 360; else if (d < -180) off += 360; ring[i][0] += off; } }));
    });
    geo = L.geoJSON(fc, { style: styleCountry, onEachFeature: (f, l) => l.on('click', e => { if (pickCb || drawCb) return; const t = terrByIso(f.id), c = t ? { id: t.controller } : byIsoN(f.id); if (c) { L.DomEvent.stop(e); onCountry(c.id); } }) }).addTo(groups.countries);
  }).catch(e => console.warn('geo', e));
  map.on('click', e => {
    if (drawCb) return drawCb(e);
    if (pickCb) { const cb = pickCb; pickCb = null; el.classList.remove('picking'); cb({ lat: e.latlng.lat, lon: ((e.latlng.lng + 540) % 360) - 180 }); return; }
    select(null);
  });
  map.on('zoomend', render);
  if (!window._wwTick) window._wwTick = setInterval(tick, 1000);
  return map;
}
const byIsoN = n => Object.values(S.data.countries).find(c => String(c.isoN) === String(n));
// podbój: terytorium (cały kraj z mapy) pod kontrolą innego państwa
export const TERR_STATUS = { occupied: 'okupowane', annexed: 'zaanektowane', contested: 'sporne / walki' };
const terrByIso = n => Object.values(S.data.territories).find(t => t.kind === 'country' && String(t.isoN) === String(n));
const terrStyle = t => { const col = cColor(t.controller); return { color: t.status === 'contested' ? '#ff4545' : col, weight: 1.6, opacity: 0.95, dashArray: t.status === 'annexed' ? null : '6 4', fillColor: col, fillOpacity: t.status === 'annexed' ? 0.24 : 0.16 }; };
// państwa spoza gry (NPC) istnieją na mapie, można je zająć, ale nie mają statystyk
export const npcOf = isoN => { const p = COUNTRY_PRESETS.find(x => x.n === String(isoN).padStart(3, '0')); return p ? { name: p.name, flag: flagOf(p.c) } : null; };
export const prevLabel = t => t.previous ? `${cFlag(t.previous)} ${cName(t.previous)}` : t.previousName || '';
const terrTip = t => `${cFlag(t.controller)} <b>${esc(cName(t.controller))}</b> — ${TERR_STATUS[t.status] || t.status}<br>${esc(t.label || '')}${prevLabel(t) ? `<br><small>wcześniej: ${esc(prevLabel(t))}</small>` : ''}`;
// część kraju: narysowany obszar przycięty do granic tego kraju (polygon-clipping)
const featureOf = isoN => geo?.getLayers().find(l => String(l.feature.id) === String(isoN));
const clipCache = new Map();
export function clipToCountry(points, isoN) {
  const f = featureOf(isoN); if (!f || !window.polygonClipping) return null;
  const g = f.feature.geometry, target = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  const ring = points.map(p => [p.lon, p.lat]); ring.push(ring[0]);
  try { return polygonClipping.intersection([ring], target); } catch (e) { console.warn('clip', e); return null; }
}
function areaShape(t) {
  const raw = [t.points.map(p => [p.lat, p.lon])];
  if (!t.clipIso) return raw;
  const key = t.id + t.clipIso + JSON.stringify(t.points);
  if (!clipCache.has(key)) { const mp = clipToCountry(t.points, t.clipIso); if (!mp) return raw; clipCache.set(key, mp.map(poly => poly.map(r => r.map(([x, y]) => [y, x])))); }
  return clipCache.get(key);
}
export function focusCountry(isoN) { const f = featureOf(isoN); if (f) map.fitBounds(f.getBounds(), { padding: [30, 30], maxZoom: 6 }); }
export const geoNames = () => geo ? geo.getLayers().map(l => ({ isoN: String(l.feature.id), name: npcOf(l.feature.id)?.name || l.feature.properties.name })).sort((a, b) => a.name.localeCompare(b.name)) : [];
function styleCountry(f) {
  const t = terrByIso(f.id); if (t) return terrStyle(t);
  const c = byIsoN(f.id);
  if (!c) return { color: '#3a4a5e', weight: 0.7, opacity: 0.8, fillColor: '#8a93a0', fillOpacity: 0.05 };   // NPC
  const mine = c.id === persp();
  return { color: c.color || '#3fa7ff', weight: mine ? 2 : 1, opacity: mine ? 0.95 : 0.6, fillColor: c.color || '#3fa7ff', fillOpacity: mine ? 0.2 : 0.12 };
}

// rysowanie obszaru: klik = punkt, „Zakończ” = gotowe (min. 3 punkty), Esc/„Anuluj” = przerwij
let drawCb = null;
export function drawArea() {
  return new Promise(res => {
    const pts = [], line = L.polygon([], { color: '#f5b301', weight: 2, dashArray: '5 5', fillOpacity: 0.1, interactive: false }).addTo(map);
    const bar = h('div.draw-bar', h('span', '✏️ Klikaj na mapie, aby obrysować zajęty obszar · punkty: ', h('b', '0')),
      h('button.btn.sm', { onclick: () => { pts.pop(); upd(); } }, '↶'), h('button.btn.sm', { onclick: () => done(null) }, 'Anuluj'), h('button.btn.sm.primary', { onclick: () => done(pts.length > 2 ? pts : null) }, 'Zakończ'));
    const upd = () => { line.setLatLngs(pts.map(p => [p.lat, p.lon])); bar.querySelector('b').textContent = pts.length; };
    const key = e => e.key === 'Escape' && done(null);
    const done = r => { drawCb = null; line.remove(); bar.remove(); document.removeEventListener('keydown', key); res(r); };
    drawCb = e => { pts.push({ lat: +e.latlng.lat.toFixed(3), lon: +(((e.latlng.lng + 540) % 360) - 180).toFixed(3) }); upd(); };
    document.addEventListener('keydown', key);
    map.getContainer().parentElement.append(bar);
  });
}
export function pickOnMap() {
  return new Promise(res => {
    pickCb = res; map.getContainer().classList.add('picking');
    const esc = e => { if (e.key === 'Escape') { document.removeEventListener('keydown', esc); if (pickCb) { pickCb = null; map.getContainer().classList.remove('picking'); res(null); } } };
    document.addEventListener('keydown', esc);
  });
}

function unitIcon(v, heading) {
  const col = colorOf(v), k = ICON[v.kind] ? v.kind : 'contact', rot = ROTATE.has(k) ? heading || 0 : 0;
  const cls = ['u-ico', v.src, v.countryId && v.countryId === persp() ? 'own' : '', selected === v.key ? 'sel' : '', v.statusOverride === 'EMERGENCY' ? 'emg' : ''].join(' ');
  const showLbl = map.getZoom() >= 4;
  return L.divIcon({
    className: '', iconSize: [26, 26], iconAnchor: [13, 13],
    html: `<div class="${cls}" style="color:${col}"><svg viewBox="0 0 24 24" width="24" height="24" style="transform:rotate(${rot}deg)" fill="${col}">${ICON[k]}</svg>${showLbl ? `<span class="u-lbl">${esc(v.label)}</span>` : ''}</div>`
  });
}

// ─── pełne przerysowanie po zmianie danych ───
export function render() {
  if (!map) return;
  if (geo) { geo.setStyle(styleCountry); geo.eachLayer(l => { const t = terrByIso(l.feature.id), g = byIsoN(l.feature.id), n = npcOf(l.feature.id); if (t) l.bindTooltip(terrTip(t), { sticky: true }); else if (!g) l.bindTooltip(`${n?.flag || '🏳️'} ${esc(n?.name || l.feature.properties.name)} <small>· NPC, bez statystyk</small>`, { sticky: true }); else l.unbindTooltip(); }); }
  groups.static.clearLayers(); groups.lines.clearLayers();
  Object.values(S.data.territories).filter(t => t.kind === 'area' && t.points?.length > 2).forEach(t =>
    L.polygon(areaShape(t), { ...terrStyle(t), pane: 'zones' }).bindTooltip(terrTip(t), { sticky: true }).on('click', e => { if (drawCb || pickCb) return; L.DomEvent.stop(e); onCountry(t.controller); }).addTo(groups.static));
  const t = gameNow(), views = unitViews(), keys = new Set();
  views.forEach(v => {
    const lay = layerOf(v);
    if (v.kind === 'zone') {
      if (!isOn(lay)) return;
      const c = v.route?.[0]; if (!c) return;
      const zc = ZONE_TYPES[v.zoneType]?.color || '#f5b301';
      L.circle([c.lat, c.lon], { radius: (v.radiusKm || 50) * 1000, color: zc, weight: 1.5, dashArray: v.visibility === 'limited' || v.src !== 'full' && v.fuzzKm ? '6 6' : null, fillOpacity: 0.12, pane: 'zones' })
        .bindTooltip(`${v.countryId ? cFlag(v.countryId) + ' ' : ''}${esc(v.label)}`, { sticky: true }).on('click', e => { L.DomEvent.stop(e); select(v.key); }).addTo(groups.static);
      return;
    }
    if (!isOn(lay)) return;
    keys.add(v.key);
    const p = posOf(v, t); if (!p) return;
    let mk = markers.get(v.key);
    const sig = `${v.label}|${colorOf(v)}|${v.src}|${v.kind}|${selected === v.key}|${map.getZoom() >= 4}|${v.statusOverride}|${Math.round((p.heading || 0) / 5)}`;
    if (!mk) {
      mk = { m: L.marker([p.pos.lat, p.pos.lon], { icon: unitIcon(v, p.heading), zIndexOffset: v.kind === 'aircraft' ? 500 : 0 }).on('click', e => { L.DomEvent.stop(e); select(v.key); }).addTo(groups.units), sig };
      markers.set(v.key, mk);
    } else if (mk.sig !== sig) { mk.m.setIcon(unitIcon(v, p.heading)); mk.sig = sig; }
    mk.v = v;
    if (v.fuzzKm) {
      if (!mk.c) mk.c = L.circle([p.pos.lat, p.pos.lon], { radius: v.fuzzKm * 1000, color: colorOf(v), weight: 1, dashArray: '3 5', fillOpacity: 0.06, interactive: false }).addTo(groups.fuzz);
      else mk.c.setRadius(v.fuzzKm * 1000);
    } else if (mk.c) { mk.c.remove(); mk.c = null; }
    if (v.kind === 'satellite' && v.sat && isOn('satellites')) L.polyline(G.satTrack(v.sat, t), { color: colorOf(v), weight: 1, opacity: selected === v.key ? 0.7 : 0.18, interactive: false }).addTo(groups.static);
  });
  for (const [k, mk] of markers) if (!keys.has(k)) { mk.m.remove(); mk.c && mk.c.remove(); markers.delete(k); }

  // linie traktatów i wojen
  const cap = id => country(id)?.capital;
  const line = (a, b, style, tip) => { const A = cap(a), B = cap(b); if (!A || !B) return; L.polyline(G.gcLine([A, B], 32), { pane: 'lines', ...style }).bindTooltip(tip, { sticky: true }).addTo(groups.lines); };
  Object.values(S.data.treaties).forEach(tr => {
    if (tr.status === 'ended' || tr.status === 'proposed') return;
    const trade = /Trade|Technology/.test(tr.type);
    if (!isOn(trade ? 'trade' : 'alliances')) return;
    const ps = tr.parties || [];
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++)
      line(ps[i], ps[j], { color: trade ? '#f5b301' : '#3fa7ff', weight: trade ? 1.5 : 2, opacity: 0.7, dashArray: tr.secret ? '2 6' : null }, `${tr.secret ? '🔒 ' : ''}${esc(tr.name)} · ${esc(tr.type)}`);
  });
  if (isOn('conflicts')) Object.values(S.data.relations).forEach(r => { if (r.status === 'At War' || r.status === 'Hostile') line(r.parties[0], r.parties[1], { color: REL_COLOR[r.status], weight: r.status === 'At War' ? 3 : 1.5, opacity: 0.8, dashArray: r.status === 'At War' ? '10 6' : '4 8' }, `${cFlag(r.parties[0])} ${cFlag(r.parties[1])} ${r.status}`); });

  // dyplomaci na ziemi
  if (isOn('diplomacy')) {
    const spots = {};
    Object.keys(S.data.characters).forEach(id => {
      const c = charView(id); if (!c || c.visibility === 'classified' && !c.full) return;
      const loc = charLocation(id, t); if (!loc || loc.state === 'transit' || !loc.pos) return;
      const cap0 = cap(c.countryId); if (loc.state === 'home' && !c.full && !gmView()) return;
      if (cap0 && G.distKm(cap0, loc.pos) < 30 && loc.state === 'home') return; // w domu — nie zaśmiecamy mapy
      const k = loc.pos.lat.toFixed(2) + ',' + loc.pos.lon.toFixed(2);
      (spots[k] = spots[k] || { pos: loc.pos, list: [] }).list.push(c);
    });
    Object.values(spots).forEach(s => L.marker([s.pos.lat, s.pos.lon], { icon: L.divIcon({ className: '', iconSize: [22, 22], iconAnchor: [11, 11], html: `<div class="dip-pin">🏛️<b>${s.list.length}</b></div>` }) })
      .bindTooltip(s.list.map(c => `${cFlag(c.countryId)} ${esc(c.icon || '')} ${esc(c.title || '')} ${esc(c.name)}`).join('<br>'), { direction: 'top' }).addTo(groups.static));
  }
  if (isOn('news')) Object.values(S.data.news).forEach(n => {
    if (!n.place || (n.gameTime || 0) > t) return;
    if (!gmView() && !n.audienceAll && !(n.audience || []).includes(persp())) return;
    L.marker([n.place.lat, n.place.lon], { icon: L.divIcon({ className: '', iconSize: [22, 22], iconAnchor: [11, 11], html: `<div class="news-pin${n.breaking ? ' br' : ''}">📰</div>` }) })
      .bindTooltip(`<b>${esc(n.headline)}</b><br><small>${esc(n.category || '')} · ${esc(n.reliability || '')}</small>`, { direction: 'top' }).on('click', () => window.dispatchEvent(new CustomEvent('ww:news', { detail: n.id }))).addTo(groups.static);
  });
  drawSelection();
}

function drawSelection() {
  selLayer.clearLayers();
  const mk = selected && markers.get(selected); const v = mk?.v || (selected && unitViews().find(x => x.key === selected));
  if (!v) return;
  const t = gameNow();
  if (v.route && v.route.length > 1) {
    const m = G.motion(v, t), col = colorOf(v);
    if (!v.hideFuture) L.polyline(G.gcLine(v.route), { color: col, weight: 2, opacity: 0.8, dashArray: '6 6', interactive: false }).addTo(selLayer);
    if (m && m.phase !== 'before') {
      const done = v.route.slice(0, m.seg + 1).concat([m.pos]);
      L.polyline(G.gcLine(done), { color: col, weight: 3, opacity: 0.95, interactive: false }).addTo(selLayer);
    }
    if (!v.hideFuture) v.route.forEach((p, i) => L.circleMarker([p.lat, p.lon], { radius: i === 0 || i === v.route.length - 1 ? 5 : 3, color: col, fillColor: '#0b0f14', fillOpacity: 1, weight: 2 }).bindTooltip(esc(p.name || '?')).addTo(selLayer));
  }
}

export function select(key, fly) {
  selected = key; onSelect(key);
  render();
  if (fly && key) { const v = unitViews().find(x => x.key === key); const p = v && posOf(v); if (p) map.flyTo([p.pos.lat, p.pos.lon], Math.max(map.getZoom(), 5), { duration: 0.8 }); }
}
export function flyTo(lat, lon, z = 5) { map && map.flyTo([lat, lon], z, { duration: 0.8 }); }

function tick() {
  const t = gameNow();
  for (const [, mk] of markers) {
    const p = posOf(mk.v, t); if (!p) continue;
    mk.m.setLatLng([p.pos.lat, p.pos.lon]); mk.c && mk.c.setLatLng([p.pos.lat, p.pos.lon]);
    if (ROTATE.has(mk.v.kind)) { const svg = mk.m.getElement()?.querySelector('svg'); if (svg) svg.style.transform = `rotate(${p.heading || 0}deg)`; }
  }
  if (selected) drawSelection();
  window.dispatchEvent(new Event('ww:tick'));
}
export { tick };
