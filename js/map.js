// Mapa świata (Leaflet): warstwy, markery ruchome, trasy, strefy, linie sojuszy, niepewność pozycji
import { S, travelRoute, motionOf, NAVAL, unitViews, posOf, gameNow, cColor, cFlag, cName, country, persp, gmView, KINDS, ZONE_TYPES, REL_COLOR, charView, charLocation, statusOf, G, myCountry, realGM } from './store.js';
import { h, esc, toast } from './ui.js';
import { CARTO_KEY } from './db.js';
import { COUNTRY_PRESETS, CITIES } from './places.js';
import { flagOf, tr as trl } from './store.js';
import * as SR from './searoute.js';

// Leaflet 1.9: tooltip otwierany (po przeciągnięciu mapy / focusie) na warstwie, której tooltip już usunięto → „_source of null”
{ const P = L.Layer.prototype;
  for (const k of ['_openTooltip', 'openTooltip']) { const f = P[k]; P[k] = function (...a) { return this._tooltip && this._map ? f.apply(this, a) : this; }; }
  const af = P._addFocusListenersOnLayer; if (af) P._addFocusListenersOnLayer = function (l) { const el = typeof l.getElement === 'function' && l.getElement(); if (el) { L.DomEvent.on(el, 'focus', function () { if (this._tooltip) { this._tooltip._source = l; this.openTooltip(); } }, this); L.DomEvent.on(el, 'blur', this.closeTooltip, this); } }; }

export const LAYERS = [
  { k: 'aircraft', i: '✈️', l: 'Lotnictwo' }, { k: 'naval', i: '🚢', l: 'Marynarka' }, { k: 'military', i: '🪖', l: 'Wojsko' },
  { k: 'diplomacy', i: '🏛️', l: 'Dyplomacja' }, { k: 'news', i: '📰', l: 'Wiadomości' }, { k: 'satellites', i: '🛰️', l: 'Satelity' },
  { k: 'intel', i: '📡', l: 'Wywiad' }, { k: 'trade', i: '💰', l: 'Handel' }, { k: 'alliances', i: '🤝', l: 'Sojusze' },
  { k: 'conflicts', i: '⚠️', l: 'Konflikty' }, { k: 'exercises', i: '🎯', l: 'Ćwiczenia' }
];
let enabled = new Set(LAYERS.map(l => l.k).filter(k => k !== 'trade'));
try { const s = JSON.parse(localStorage.getItem('ww_layers') || 'null'); if (Array.isArray(s)) enabled = new Set(s); } catch { }
export const isOn = k => enabled.has(k);
// linie traktatów / handlu / konfliktów: GM i obserwator mogą widzieć wszystkie, inaczej tylko linie klikniętego (albo własnego) państwa
let lineFocus = null, linesAll = true;
export const canSeeAllLines = () => realGM() ? persp() === 'gm' || persp() === null : !myCountry();
export const linesMode = () => ({ all: canSeeAllLines() && linesAll, focus: lineFocus || (persp() !== 'gm' ? persp() : null) });
export function setLinesAll(v) { linesAll = v; render(); }
export function setLineFocus(id) { lineFocus = id; render(); }
const showPair = (a, b) => { const m = linesMode(); return m.all || (!!m.focus && (a === m.focus || b === m.focus)); };
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
  onSelect = onSelectUnit; onCountry = id => { lineFocus = id; render(); onCountryClick(id); };
  if (map) { map.remove(); markers.clear(); geo = null; }
  map = L.map(el, { worldCopyJump: true, minZoom: 2, maxZoom: CARTO_KEY ? 12 : 8, zoomControl: false, preferCanvas: false }).setView([50, 15], 4);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  map.createPane('land').style.zIndex = 350;
  map.createPane('labels').style.zIndex = 450; map.getPane('labels').style.pointerEvents = 'none';
  // Domyślnie mapa jest w 100% offline: ląd i granice z pliku Natural Earth (vendor/), bez kafelków i kluczy.
  if (CARTO_KEY) L.tileLayer(`https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png?key=${encodeURIComponent(CARTO_KEY)}`, { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>' }).addTo(map);
  else {
    map.attributionControl.addAttribution('Mapa: Natural Earth');
    const grid = []; for (let lon = -180; lon <= 180; lon += 30) grid.push([[-85, lon], [85, lon]]); for (let lat = -60; lat <= 60; lat += 30) grid.push([[lat, -540], [lat, 540]]);
    L.polyline(grid, { pane: 'land', color: '#16263a', weight: 1, interactive: false }).addTo(map);
    labels = L.layerGroup().addTo(map);
    map.on('moveend', drawLabels);
  }
  map.createPane('zones').style.zIndex = 380;
  map.createPane('lines').style.zIndex = 390;
  ['countries', 'static', 'lines', 'units', 'fuzz'].forEach(k => groups[k] = L.layerGroup().addTo(map));
  selLayer = L.layerGroup().addTo(map);
  fetch('vendor/countries-50m.json').then(r => { if (!r.ok) throw new Error(`vendor/countries-50m.json → HTTP ${r.status} (brak pliku na serwerze?)`); return r.json(); }).then(topo => {
    // wszystkie państwa i terytoria świata (241); brakujące/zdublowane ID zastępujemy stałym kluczem z nazwy
    const fc = topojson.feature(topo, topo.objects.countries), seen = new Set();
    fc.features.forEach(f => { let id = f.id ?? 'x-' + f.properties.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'); if (seen.has(id)) id += '-' + f.properties.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'); seen.add(id); f.id = id;
      // Rosja, Fidżi itp. przecinają 180° — „rozwijamy” długość geograficzną, żeby nie rysowało pasów przez cały świat
      if (f.properties.name === 'Antarctica') return;
      const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      polys.forEach(poly => poly.forEach(ring => { let off = 0; for (let i = 1; i < ring.length; i++) { const d = ring[i][0] + off - ring[i - 1][0]; if (d > 180) off -= 360; else if (d < -180) off += 360; ring[i][0] += off; } }));
    });
    if (!CARTO_KEY) L.geoJSON(fc, { pane: 'land', renderer: L.canvas({ pane: 'land', padding: 0.5 }), interactive: false, style: { stroke: false, fillColor: '#18222e', fillOpacity: 1 } }).addTo(map);
    setTimeout(() => { try { SR.init(fc); render(); } catch (e) { console.warn('searoute', e); } }, 50);   // maska wody dla szlaków morskich
    geo = L.geoJSON(fc, { style: styleCountry, onEachFeature: (f, l) => l.on('click', e => { if (pickCb || drawCb) return; const t = terrByIso(f.id), c = t && !(t.status === 'puppet' && byIsoN(f.id)) ? { id: t.controller } : byIsoN(f.id); if (c) { L.DomEvent.stop(e); onCountry(c.id); } }) }).addTo(groups.countries);
  }).catch(e => { console.error('geo', e); toast('⚠️ Nie wczytano konturów mapy: ' + e.message, 'err', 20000); });
  map.on('click', e => {
    if (drawCb) return drawCb(e);
    if (pickCb) { const cb = pickCb; pickCb = null; el.classList.remove('picking'); cb({ lat: e.latlng.lat, lon: ((e.latlng.lng + 540) % 360) - 180 }); return; }
    select(null);
  });
  map.on('zoomend', render);
  setTimeout(drawLabels, 0);
  if (!window._wwTick) window._wwTick = setInterval(tick, 1000);
  return map;
}
const byIsoN = n => Object.values(S.data.countries).find(c => String(c.isoN) === String(n));
// podbój: terytorium (cały kraj z mapy) pod kontrolą innego państwa
export const TERR_STATUS = { occupied: 'okupowane', annexed: 'zaanektowane', contested: 'sporne / walki', puppet: 'państwo marionetkowe' };
export const TERR_NOUN = { occupied: 'okupacja', annexed: 'aneksja', contested: 'walki', puppet: 'marionetka' };
export const TERR_ICON = { occupied: '🪖', annexed: '🏴', contested: '⚔️', puppet: '🎭' };
// powtórka: mapa pokazuje stan z chwili S.viewTime (tereny zajęte później jeszcze nie istnieją)
export const viewNow = () => S.viewTime ?? gameNow();
const terrNow = t => S.viewTime == null || (t.since || 0) <= S.viewTime;
const terrByIso = n => Object.values(S.data.territories).find(t => t.kind === 'country' && String(t.isoN) === String(n) && terrNow(t));
const terrStyle = t => { const col = cColor(t.controller); return { color: t.status === 'contested' ? '#ff4545' : col, weight: 1.6, opacity: 0.95, dashArray: t.status === 'annexed' ? null : t.status === 'puppet' ? '1 5' : '6 4', fillColor: col, fillOpacity: t.status === 'annexed' ? 0.24 : t.status === 'puppet' ? 0.1 : 0.16, ...(t.status === 'puppet' ? { weight: 2.4, lineCap: 'round' } : {}) }; };
// państwa spoza gry (NPC) istnieją na mapie, można je zająć, ale nie mają statystyk
export const npcOf = isoN => { const p = COUNTRY_PRESETS.find(x => x.n === String(isoN).padStart(3, '0')); return p ? { name: p.pl || p.name, flag: flagOf(p.c) } : null; };
export const prevLabel = t => t.previous ? `${cFlag(t.previous)} ${cName(t.previous)}` : t.previousName || '';
const terrTip = t => t.status === 'puppet' ? `🎭 <b>${esc(t.label || '')}</b> — państwo marionetkowe<br>zależne od: ${cFlag(t.controller)} ${esc(cName(t.controller))}` : `${cFlag(t.controller)} <b>${esc(cName(t.controller))}</b> — ${TERR_STATUS[t.status] || t.status}<br>${esc(t.label || '')}${prevLabel(t) ? `<br><small>wcześniej: ${esc(prevLabel(t))}</small>` : ''}`;
// część kraju: narysowany obszar przycięty do granic tego kraju (polygon-clipping)
const featureOf = isoN => geo?.getLayers().find(l => String(l.feature.id) === String(isoN));
const clipCache = new Map();
export function clipToCountry(points, isoN) {
  const f = featureOf(isoN); if (!f || !window.polygonClipping) return null;
  const g = f.feature.geometry, target = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  const ring = points.map(p => [p.lon, p.lat]); ring.push(ring[0]);
  try { return polygonClipping.intersection([ring], target); } catch (e) { console.warn('clip', e); return null; }
}
// kształt obszaru: nowy format = MultiPolygon [lon,lat] zapisany jako JSON w t.geo (już przycięty); stary = t.points (+ clipIso)
export function areaGeo(t) {
  if (t.geo) { try { return JSON.parse(t.geo); } catch { return []; } }
  if (!t.points?.length) return [];
  if (t.clipIso) return clipToCountry(t.points, t.clipIso) || [[t.points.map(p => [p.lon, p.lat])]];
  return [[t.points.map(p => [p.lon, p.lat])]];
}
function areaShape(t) {
  const key = t.id + (t.geo || JSON.stringify(t.points) + t.clipIso);
  if (!clipCache.has(key)) clipCache.set(key, areaGeo(t).map(poly => poly.map(r => r.map(([x, y]) => [y, x]))));
  return clipCache.get(key);
}
export function shapeCenter(mp) {
  let a = 180, b = -180, c = 90, d = -90;
  (mp || []).forEach(poly => (poly[0] || []).forEach(([x, y]) => { a = Math.min(a, x); b = Math.max(b, x); c = Math.min(c, y); d = Math.max(d, y); }));
  return a > b ? null : { lat: +((c + d) / 2).toFixed(3), lon: +((a + b) / 2).toFixed(3) };
}
export function focusCountry(isoN) { const f = featureOf(isoN); if (f) map.fitBounds(f.getBounds(), { padding: [30, 30], maxZoom: 6 }); }
export const worldFeatures = () => geo ? geo.getLayers().map(l => l.feature) : [];
export const geoNames = () => geo ? geo.getLayers().map(l => ({ isoN: String(l.feature.id), name: npcOf(l.feature.id)?.name || l.feature.properties.name })).sort((a, b) => a.name.localeCompare(b.name)) : [];
function styleCountry(f) {
  // podświetlony sojusz (Dyplomacja → Pokaż na mapie)
  const fb = S.focusBloc && S.data.blocs?.[S.focusBloc];
  if (fb && (fb.members || []).some(m => String(m).startsWith('n:') ? m.slice(2) === String(f.id) : String(S.data.countries[m]?.isoN) === String(f.id))) return { color: fb.color, weight: 2.5, opacity: 1, fillColor: fb.color, fillOpacity: 0.35 };
  const t = terrByIso(f.id); if (t) return terrStyle(t);
  const c = byIsoN(f.id);
  if (!c) return { color: '#3a4a5e', weight: 0.7, opacity: 0.8, fillColor: '#8a93a0', fillOpacity: 0.05 };   // NPC
  const mine = c.id === persp();
  return { color: c.color || '#3fa7ff', weight: mine ? 2 : 1, opacity: mine ? 0.95 : 0.6, fillColor: c.color || '#3fa7ff', fillOpacity: mine ? 0.2 : 0.12 };
}

// ───────── NARZĘDZIE RYSOWANIA TERENU ─────────
// Przytrzymaj i obrysuj teren (mysz / palec). Każdy obrys DODAJE się do obszaru, gumka ODEJMUJE.
// Przy „części państwa” wynik jest od razu przycinany do granic kraju — widać go na żywo.
let drawCb = null;
export function drawArea({ clipIso = null, initial = null } = {}) {
  const PC = window.polygonClipping;
  return new Promise(res => {
    const el = map.getContainer(), f = clipIso ? featureOf(clipIso) : null;
    const target = f ? (f.feature.geometry.type === 'Polygon' ? [f.feature.geometry.coordinates] : f.feature.geometry.coordinates) : null;
    let shape = initial || [], mode = 'draw', drawing = false, pts = [];
    const hist = [];
    const guide = target ? L.geoJSON({ type: 'MultiPolygon', coordinates: target }, { interactive: false, style: { color: '#3fd0ff', weight: 2, dashArray: '6 5', fill: false } }).addTo(map) : null;
    const prev = L.geoJSON(null, { interactive: false, style: { color: '#f5b301', weight: 2, fillColor: '#f5b301', fillOpacity: 0.3 } }).addTo(map);
    const stroke = L.polyline([], { color: '#ffffff', weight: 2, dashArray: '4 4', interactive: false }).addTo(map);
    const btn = (m, label, title) => h('button.btn.sm' + (m === mode ? '.primary' : ''), { title, 'data-m': m, onclick: () => setMode(m) }, label);
    const modes = h('div.btn-row', btn('draw', '✏️ Rysuj', 'Dodawanie terenu'), btn('erase', '🧽 Gumka', 'Odejmowanie terenu'), btn('pan', '✋ Przesuń', 'Przesuwanie mapy'));
    const info = h('span.draw-info');
    const bar = h('div.draw-bar',
      h('div.draw-hint', target ? 'Przytrzymaj i obrysuj zajętą część — wszystko poza granicą kraju (niebieska linia) zostanie obcięte.' : 'Przytrzymaj i obrysuj zajęty teren. Kolejne obrysy dodają teren, gumka go odejmuje.'),
      h('div.draw-tools', modes,
        h('div.btn-row', h('button.btn.sm', { onclick: undo, title: 'Cofnij ostatni obrys' }, '↶ Cofnij'), h('button.btn.sm', { onclick: () => { if (shape.length) { hist.push(shape); shape = []; redraw(); } } }, '🗑 Wyczyść'), info),
        h('div.btn-row', h('button.btn.sm', { onclick: () => done(null) }, 'Anuluj'), h('button.btn.sm.primary', { onclick: () => done(shape.length ? shape : null) }, '✓ Gotowe'))));
    function setMode(m) { mode = m; modes.querySelectorAll('button').forEach(b => b.classList.toggle('primary', b.dataset.m === m)); m === 'pan' ? map.dragging.enable() : map.dragging.disable(); el.style.cursor = m === 'pan' ? '' : 'crosshair'; }
    function redraw() { prev.clearLayers(); if (shape.length) prev.addData({ type: 'MultiPolygon', coordinates: shape }); info.textContent = shape.length ? `obszarów: ${shape.length}` : 'nic nie zaznaczono'; }
    function undo() { if (hist.length) { shape = hist.pop(); redraw(); } }
    function apply(ring) {
      const poly = [[...ring, ring[0]]];
      try {
        let next;
        if (mode === 'erase') { if (!shape.length) return; next = PC.difference(shape, poly); }
        else { next = shape.length ? PC.union(shape, poly) : [poly]; if (target) next = PC.intersection(next, target); }
        if (mode !== 'erase' && target && !next.length) return toast('Ten obrys jest całkiem poza granicą wybranego państwa', 'info', 3000);
        hist.push(shape); shape = next.map(p => p.map(r => r.map(([x, y]) => [+x.toFixed(3), +y.toFixed(3)]))); redraw();
      } catch (e) { console.warn(e); toast('Nie udało się połączyć obrysu — spróbuj narysować prościej', 'err'); }
    }
    const add = e => { const ll = map.mouseEventToLatLng(e); pts.push(ll); stroke.addLatLng(ll); };
    const down = e => { if (mode === 'pan' || e.button > 0 || e.target.closest('.leaflet-control')) return; drawing = true; pts = []; el.setPointerCapture?.(e.pointerId); add(e); e.preventDefault(); e.stopPropagation(); };
    const move = e => { if (drawing) { add(e); e.preventDefault(); } };
    const up = () => {
      if (!drawing) return; drawing = false; stroke.setLatLngs([]);
      if (pts.length < 3) return;
      const simp = L.LineUtil.simplify(pts.map(ll => map.latLngToLayerPoint(ll)), 2).map(p => map.layerPointToLatLng(p));
      if (simp.length >= 3) apply(simp.map(ll => [ll.lng, ll.lat]));
    };
    const key = e => { if (e.key === 'Escape') done(null); else if (e.key === 'Enter') done(shape.length ? shape : null); else if ((e.ctrlKey || e.metaKey) && e.key === 'z') undo(); };
    function done(r) {
      drawCb = null; [guide, prev, stroke].forEach(l => l && l.remove()); bar.remove();
      el.removeEventListener('pointerdown', down, true); el.removeEventListener('pointermove', move, true); window.removeEventListener('pointerup', up, true);
      document.removeEventListener('keydown', key); map.dragging.enable(); el.style.cursor = ''; el.style.touchAction = '';
      res(r);
    }
    drawCb = () => { };   // blokuje zaznaczanie obiektów i krajów podczas rysowania
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', down, true); el.addEventListener('pointermove', move, true); window.addEventListener('pointerup', up, true);
    document.addEventListener('keydown', key);
    el.parentElement.append(bar); setMode('draw'); redraw();
  });
}
// podpisy miejsc (offline): stolice od zoomu 5, duże miasta od 7 — tylko w widocznym obszarze
let labels = null;
const CAPS = COUNTRY_PRESETS.filter(p => p.cap).map(p => ({ name: p.cap, lat: p.lat, lon: p.lon, cap: true }));
const BIG = CITIES.map(([name, , lat, lon]) => ({ name, lat, lon }));
function drawLabels() {
  if (!labels) return; labels.clearLayers();
  const z = map.getZoom(); if (z < 5) return;
  const b = map.getBounds().pad(0.1), seen = new Set();
  [...CAPS, ...(z >= 7 ? BIG : [])].filter(p => { if (seen.has(p.name) || !b.contains([p.lat, p.lon])) return false; seen.add(p.name); return true; }).slice(0, 250)
    .forEach(p => L.marker([p.lat, p.lon], { pane: 'labels', interactive: false, keyboard: false, icon: L.divIcon({ className: '', iconSize: [0, 0], html: `<div class="plabel${p.cap ? ' cap' : ''}">${esc(p.name)}</div>` }) }).addTo(labels));
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
    html: `<div class="${cls}" style="color:${col}">${v.groupN > 1 ? `<b class="u-cnt">${v.groupN}</b>` : ''}<svg viewBox="0 0 24 24" width="24" height="24" style="transform:rotate(${rot}deg)" fill="${col}">${ICON[k]}</svg>${showLbl ? `<span class="u-lbl">${esc(v.label)}</span>` : ''}</div>`
  });
}

// ─── pełne przerysowanie po zmianie danych ───
export function render() {
  if (!map) return;
  // kontury państw nie są przystankami klawisza Tab (inaczej ~250 kroków do panelu)
  setTimeout(() => map.getContainer().querySelectorAll('path.leaflet-interactive').forEach(p => p.setAttribute('tabindex', '-1')));
  if (geo) { geo.setStyle(styleCountry); geo.eachLayer(l => { const t = terrByIso(l.feature.id), g = byIsoN(l.feature.id), n = npcOf(l.feature.id); if (t) l.bindTooltip(terrTip(t), { sticky: true }); else if (!g) l.bindTooltip(`${n?.flag || '🏳️'} ${esc(n?.name || l.feature.properties.name)} <small>· NPC, bez statystyk</small>`, { sticky: true }); else l.unbindTooltip(); }); }
  groups.static.clearLayers(); groups.lines.clearLayers();
  Object.values(S.data.territories).filter(t => t.kind === 'area' && (t.geo || t.points?.length > 2) && terrNow(t)).forEach(t =>
    L.polygon(areaShape(t), { ...terrStyle(t), pane: 'zones' }).bindTooltip(terrTip(t), { sticky: true }).on('click', e => { if (drawCb || pickCb) return; L.DomEvent.stop(e); onCountry(t.controller); }).addTo(groups.static));
  const t = viewNow(), views = unitViews(), keys = new Set();
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
    const p = posOf(v, t); if (!p || landed(v, p)) return;
    keys.add(v.key);
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
  const line = (a, b, style, tip) => { if (!showPair(a, b)) return; const A = cap(a), B = cap(b); if (!A || !B) return; L.polyline(G.gcLine([A, B], 32), { pane: 'lines', ...style }).bindTooltip(tip, { sticky: true }).addTo(groups.lines); };
  // szlak handlowy: stolica → port (przerywana) → trasa po morzu → port → stolica
  const seaLine = (a, b, secret, tip) => {
    if (!showPair(a, b)) return;
    const A = cap(a), B = cap(b); if (!A || !B) return;
    const r = SR.seaRoute(A, B);
    if (!r) return line(a, b, { color: '#f5b301', weight: 1.5, opacity: 0.7, dashArray: '2 6' }, tip);
    const g = L.featureGroup().bindTooltip(tip, { sticky: true }).addTo(groups.lines);
    // trasa przez Pacyfik wychodzi poza ±180°, więc rysujemy też kopie przesunięte o 360°
    [-360, 0, 360].forEach(o => L.polyline(o ? r.sea.map(([la, lo]) => [la, lo + o]) : r.sea, { pane: 'lines', color: '#f5b301', weight: 2, opacity: 0.8, dashArray: secret ? '2 6' : null, lineJoin: 'round' }).addTo(g));
    [[[A.lat, A.lon], r.from], [r.to, [B.lat, B.lon + 360 * Math.round((r.to[1] - B.lon) / 360)]]].forEach(seg => L.polyline(seg, { pane: 'lines', color: '#f5b301', weight: 1, opacity: 0.5, dashArray: '1 5' }).addTo(g));
  };
  Object.values(S.data.treaties).forEach(tr => {
    if (tr.status === 'ended' || tr.status === 'proposed') return;
    const trade = /Trade|Technology/.test(tr.type);
    if (!isOn(trade ? 'trade' : 'alliances')) return;
    const ps = tr.parties || [];
    const tip = `${tr.secret ? '🔒 ' : ''}${esc(tr.name)} · ${esc(trl('treaty', tr.type))}`;
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++)
      trade ? seaLine(ps[i], ps[j], tr.secret, tip) : line(ps[i], ps[j], { color: '#3fa7ff', weight: 2, opacity: 0.7, dashArray: tr.secret ? '2 6' : null }, tip);
  });
  if (isOn('conflicts')) Object.values(S.data.relations).forEach(r => { if (r.status === 'At War' || r.status === 'Hostile') line(r.parties[0], r.parties[1], { color: REL_COLOR[r.status], weight: r.status === 'At War' ? 3 : 1.5, opacity: 0.8, dashArray: r.status === 'At War' ? '10 6' : '4 8' }, `${cFlag(r.parties[0])} ${cFlag(r.parties[1])} ${trl('relation', r.status)}`); });

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
  if (isOn('news') || isOn('conflicts')) Object.values(S.data.news).forEach(n => {
    if (!n.place || (n.gameTime || 0) > t || !isOn(n.battle ? 'conflicts' : 'news') && !(n.battle && isOn('news'))) return;
    if (!gmView() && !n.audienceAll && !(n.audience || []).includes(persp())) return;
    L.marker([n.place.lat, n.place.lon], { icon: L.divIcon({ className: '', iconSize: [22, 22], iconAnchor: [11, 11], html: n.battle ? `<div class="news-pin battle-pin">💥</div>` : `<div class="news-pin${n.breaking ? ' br' : ''}">📰</div>` }) })
      .bindTooltip(`<b>${esc(n.headline)}</b><br><small>${esc(trl('news', n.category))} · ${esc(trl('reliability', n.reliability))}</small>`, { direction: 'top' }).on('click', () => window.dispatchEvent(new CustomEvent('ww:news', { detail: n.id }))).addTo(groups.static);
  });
  drawSelection();
}

function drawSelection() {
  selLayer.clearLayers();
  const mk = selected && markers.get(selected); const v = mk?.v || (selected && unitViews().find(x => x.key === selected));
  if (!v) return;
  const t = viewNow();
  if (v.route && v.route.length > 1) {
    const m = motionOf(v, t), col = colorOf(v), path = travelRoute(v);
    const draw = pts => NAVAL.has(v.kind) ? G.unwrap(pts) : G.gcLine(pts);   // szlak morski ma już gęste punkty
    if (!v.hideFuture) L.polyline(draw(path), { color: col, weight: 2, opacity: 0.8, dashArray: '6 6', interactive: false }).addTo(selLayer);
    if (m && m.phase !== 'before') {
      const done = path.slice(0, m.seg + 1).concat([m.pos]);
      L.polyline(draw(done), { color: col, weight: 3, opacity: 0.95, interactive: false }).addTo(selLayer);
    }
    const wps = NAVAL.has(v.kind) ? path.filter(p => p.wp) : v.route;
    if (!v.hideFuture) wps.forEach((p, i) => L.circleMarker([p.lat, p.lon], { radius: i === 0 || i === wps.length - 1 ? 5 : 3, color: col, fillColor: '#0b0f14', fillOpacity: 1, weight: 2 }).bindTooltip(esc(p.name || '?')).addTo(selLayer));
  }
}

export function select(key, fly) {
  selected = key; onSelect(key);
  render();
  const phone = matchMedia('(max-width: 820px)').matches;
  if (key && (fly || phone)) {
    const v = unitViews().find(x => x.key === key); const p = v && posOf(v); if (!p) return;
    const z = fly ? Math.max(map.getZoom(), 5) : map.getZoom();
    // telefon: karta zasłania dół ekranu, więc obiekt ląduje w górnej, widocznej części mapy
    const c = phone ? map.unproject(map.project([p.pos.lat, p.pos.lon], z).add([0, map.getSize().y * 0.27]), z) : [p.pos.lat, p.pos.lon];
    fly ? map.flyTo(c, z, { duration: 0.8 }) : map.panTo(c, { duration: 0.4 });
  }
}
export function flyTo(lat, lon, z = 5) { map && map.flyTo([lat, lon], z, { duration: 0.8 }); }

// samolot po wylądowaniu znika z mapy (zostaje na listach; wraca po wybraniu go albo przy nowej podróży)
const landed = (v, p) => v.kind === 'aircraft' && p.phase === 'after' && selected !== v.key;
function tick() {
  const t = viewNow();
  for (const [, mk] of markers) {
    const p = posOf(mk.v, t); if (!p) continue;
    if (landed(mk.v, p)) { render(); break; }
    mk.m.setLatLng([p.pos.lat, p.pos.lon]); mk.c && mk.c.setLatLng([p.pos.lat, p.pos.lon]);
    if (ROTATE.has(mk.v.kind)) { const svg = mk.m.getElement()?.querySelector('svg'); if (svg) svg.style.transform = `rotate(${p.heading || 0}deg)`; }
  }
  if (selected) drawSelection();
  window.dispatchEvent(new Event('ww:tick'));
}
export { tick };
