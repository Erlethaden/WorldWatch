// Morskie szlaki: trasa po wodzie (A* na siatce 0,25°) zamiast prostej linii między stolicami.
// Maska lądu rysowana raz z konturów państw; kanały i wąskie cieśniny są „przekopane” ręcznie.
const RES = 4, W = 360 * RES, H = 180 * RES;           // siatka 0,25° (1440 × 720): widać wyspy duńskie i cieśniny
let land = null, ocean = null, coast = null, owner = null;
const cache = new Map(), portCache = new Map(), pathCache = new Map();

// cieśniny zbyt wąskie dla siatki: [lon, lat] od → do (bez Kanału Kilońskiego — duże okręty opływają Danię)
const PASSAGES = [
  [[32.35, 31.30], [32.55, 29.90]],   // Kanał Sueski
  [[32.55, 29.90], [33.90, 27.60]],   // Zatoka Sueska
  [[-79.95, 9.40], [-79.50, 8.85]],   // Kanał Panamski
  [[-5.90, 35.95], [-5.25, 36.00]],   // Gibraltar
  [[29.10, 41.25], [28.95, 40.95]],   // Bosfor
  [[26.15, 40.00], [26.75, 40.45]],   // Dardanele
  [[12.60, 56.15], [12.75, 55.45]],   // Sund
  [[10.95, 55.95], [11.05, 55.05]],   // Wielki Bełt
  [[36.55, 45.45], [36.65, 45.25]],   // Cieśnina Kerczeńska
  [[103.40, 1.35], [104.30, 1.20]],   // Singapur
  [[15.60, 38.30], [15.65, 38.05]]    // Mesyna
];

const idx = (x, y) => y * W + ((x % W) + W) % W;
const toXY = (lat, lon) => [Math.floor((((lon + 180) % 360 + 360) % 360) * RES), Math.min(H - 1, Math.max(0, Math.floor((90 - lat) * RES)))];
const toLL = (x, y) => [90 - (y + 0.5) / RES, (x + 0.5) / RES - 180];
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export const ready = () => !!ocean;

export function init(fc) {
  const mk = () => { const cv = document.createElement('canvas'); cv.width = W; cv.height = H; return cv.getContext('2d', { willReadFrequently: true }); };
  const g = mk(), go = mk();
  const ring = (c, r, off) => r.forEach(([lon, lat], i) => { const x = (lon + 180 + off) * RES, y = (90 - lat) * RES; i ? c.lineTo(x, y) : c.moveTo(x, y); });
  g.fillStyle = '#000';
  fc.features.forEach((f, fi) => {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates, id = fi + 1;
    go.fillStyle = `rgb(${id >> 8},${id & 255},77)`;   // mapa „czyj to ląd” — port wybieramy na wybrzeżu właściwego państwa
    for (const off of [-360, 0, 360]) for (const c of [g, go]) { c.beginPath(); polys.forEach(p => p.forEach(r => ring(c, r, off))); c.fill('evenodd'); }
  });
  g.globalCompositeOperation = 'destination-out'; g.lineWidth = 2; g.lineCap = 'round';
  PASSAGES.forEach(([a, b]) => { g.beginPath(); g.moveTo((a[0] + 180) * RES, (90 - a[1]) * RES); g.lineTo((b[0] + 180) * RES, (90 - b[1]) * RES); g.stroke(); });
  const px = g.getImageData(0, 0, W, H).data, po = go.getImageData(0, 0, W, H).data;
  land = new Uint8Array(W * H); owner = new Uint16Array(W * H);
  for (let i = 0; i < W * H; i++) { land[i] = px[i * 4 + 3] > 140 ? 1 : 0; if (po[i * 4 + 3] > 200) owner[i] = (po[i * 4] << 8) | po[i * 4 + 1]; }
  coast = new Uint8Array(W * H);
  for (let y = 1; y < H - 1; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (land[i]) continue; for (let dy = -1; dy <= 1 && !coast[i]; dy++) for (let dx = -1; dx <= 1; dx++) if (land[idx(x + dx, y + dy)]) { coast[i] = 1; break; } }
  // ocean światowy = woda połączona z punktem na środku Atlantyku (bez Morza Kaspijskiego i jezior)
  ocean = new Uint8Array(W * H); const q = [idx(...toXY(0, -30))]; ocean[q[0]] = 1;
  while (q.length) { const i = q.pop(), x = i % W, y = (i - x) / W; for (const [dx, dy] of N4) { const ny = y + dy; if (ny < 0 || ny >= H) continue; const j = idx(x + dx, ny); if (!land[j] && !ocean[j]) { ocean[j] = 1; q.push(j); } } }
  cache.clear(); portCache.clear(); pathCache.clear();
}

// czy przy komórce wody (±2) leży ląd danego państwa
function nearOwner(i, o) {
  const x = i % W, y = (i - x) / W;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const ny = y + dy; if (ny >= 0 && ny < H && owner[idx(x + dx, ny)] === o) return true; }
  return false;
}
// najbliższa komórka oceanu (port) do punktu na lądzie — na wybrzeżu tego samego państwa, jeśli ma dostęp do morza
function port(lat, lon) {
  const k = lat.toFixed(2) + ',' + lon.toFixed(2); if (portCache.has(k)) return portCache.get(k);
  const [sx, sy] = toXY(lat, lon), start = idx(sx, sy), o = owner[start], seen = new Set([start]);
  let q = [start], found = -1, anyOcean = -1;
  for (let r = 0; r < 320 && q.length && found < 0; r++) {
    const nq = [];
    for (const i of q) {
      if (ocean[i]) { if (anyOcean < 0) anyOcean = i; if (!o || nearOwner(i, o)) { found = i; break; } }
      const x = i % W, y = (i - x) / W;
      for (const [dx, dy] of N4) { const ny = y + dy; if (ny < 0 || ny >= H) continue; const j = idx(x + dx, ny); if (!seen.has(j)) { seen.add(j); nq.push(j); } }
    }
    if (anyOcean >= 0 && r > 220) break;   // państwo bez morza: najbliższe wybrzeże w ogóle
    q = nq;
  }
  if (found < 0) found = anyOcean;
  portCache.set(k, found); return found;
}

// A* po wodzie; koszt ~ odległość, przy brzegu i w lodach drożej (trasy trzymają się otwartego morza, omijają Arktykę)
// pass = null → trasa mieszana: ląd i ocean, każda zmiana ląd↔morze kosztuje PORT (przeładunek w porcie)
const PORT = 10, LAND = 1.8;   // km po lądzie „droższy” niż po morzu: długie trasy idą statkiem, sąsiedzi drogą
function astar(s, t, pass = ocean, maxCost = Infinity) {
  const sea = pass === ocean, mix = !pass;
  const cosT = new Float32Array(H); for (let y = 0; y < H; y++) cosT[y] = Math.max(0.05, Math.cos((90 - (y + 0.5) / RES) * Math.PI / 180));
  const tx = t % W, ty = (t - tx) / W, EPS = sea || mix ? 0.35 : 0.9;   // słaba heurystyka: przy biegunach ruch w długości jest „tani”, mocniejsza psuje wyszukiwanie
  const hf = i => { const x = i % W, y = (i - x) / W; let dx = Math.abs(x - tx); dx = Math.min(dx, W - dx); return Math.hypot(dx * cosT[Math.round((y + ty) / 2)], y - ty); };
  const gS = new Float32Array(W * H).fill(Infinity), from = new Int32Array(W * H).fill(-1);
  // kopiec na zwykłych tablicach liczb (szybszy niż tablica par)
  const K = [], V = [];
  const push = (k, v) => { let i = K.length; K.push(k); V.push(v); while (i) { const p = (i - 1) >> 1; if (K[p] <= k) break; K[i] = K[p]; V[i] = V[p]; i = p; } K[i] = k; V[i] = v; };
  const pop = () => { const v = V[0], lk = K.pop(), lv = V.pop(); const n = K.length; if (n) { let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = -1, mk = lk; if (l < n && K[l] < mk) { m = l; mk = K[l]; } if (r < n && K[r] < mk) { m = r; mk = K[r]; } if (m < 0) break; K[i] = K[m]; V[i] = V[m]; i = m; } K[i] = lk; V[i] = lv; } return v; };
  gS[s] = 0; push(hf(s), s);
  const done = new Uint8Array(W * H);
  let steps = 0;
  while (K.length && steps++ < 4000000) {
    const i = pop(); if (done[i]) continue; done[i] = 1; if (i === t) break; if (gS[i] > maxCost) break;
    const x = i % W, y = (i - x) / W, gi = gS[i];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue; const ny = y + dy; if (ny < 0 || ny >= H) continue;
      const j = idx(x + dx, ny); if (done[j] || !(mix ? land[j] || ocean[j] : pass[j])) continue;
      if (!mix && dx && dy && !pass[idx(x + dx, y)] && !pass[idx(x, ny)]) continue;
      if (mix && dx && dy && land[i] !== land[j]) continue;   // port tylko przez bok komórki   // bez „przeciskania się” po skosie między lądem
      const lat = 90 - (ny + 0.5) / RES;
      const w = mix ? (ocean[j] ? (coast[j] ? 1.6 : 1) * (Math.abs(lat) > 64 ? 5 : 1) : LAND * (Math.abs(lat) > 62 ? 3 : 1)) : (sea && coast[j] ? 2.2 : 1) * (sea && Math.abs(lat) > 64 ? 5 : 1);
      const c = Math.hypot(dx * cosT[ny], dy) * w + (mix && land[i] !== land[j] ? PORT : 0);
      if (gi + c < gS[j]) { gS[j] = gi + c; from[j] = i; push(gS[j] + EPS * hf(j), j); }
    }
  }
  if (from[t] < 0 && s !== t) return null;
  const path = []; for (let i = t; i !== -1; i = from[i]) path.push(i);
  return path.reverse();
}

// „naciąganie sznurka”: zostają tylko punkty zwrotne, między którymi widać otwarte morze
function visible(a, b, pass = ocean) {
  const ax = a % W, ay = (a - ax) / W, bx = b % W, by = (b - bx) / W;
  let dx = bx - ax; if (dx > W / 2) dx -= W; if (dx < -W / 2) dx += W;
  const n = Math.max(Math.abs(dx), Math.abs(by - ay)) * 2 || 1;
  for (let k = 1; k < n; k++) { const j = idx(Math.round(ax + dx * k / n), Math.round(ay + (by - ay) * k / n)); if (!pass[j] || pass === ocean && coast[j] && k > 2 && k < n - 2) return false; }
  return true;
}
function pull(path, pass = ocean) {
  const out = [path[0]]; let a = 0;
  while (a < path.length - 1) { let b = Math.min(path.length - 1, a + 120); while (b > a + 1 && !visible(path[a], path[b], pass)) b--; out.push(path[b]); a = b; }
  return out;
}
// wygładzenie Chaikina: łagodne łuki zamiast ostrych załamań
// wygładzenie: narożnik ścinany najwyżej o ~0,3° i tylko wtedy, gdy ścięty punkt dalej leży na morzu
function smooth(pts, n = 2, pass = ocean) {
  const wet = (lat, lon) => !!pass[idx(...toXY(lat, lon))];
  for (let r = 0; r < n; r++) {
    const o = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const [p, c, q] = [pts[i - 1], pts[i], pts[i + 1]];
      const cut = (a, len) => { const d = Math.min(0.3, len * 0.2) / (len || 1); return [c[0] + (a[0] - c[0]) * d, c[1] + (a[1] - c[1]) * d]; };
      const A = cut(p, Math.hypot(p[0] - c[0], p[1] - c[1])), B = cut(q, Math.hypot(q[0] - c[0], q[1] - c[1]));
      if (wet(...A) && wet(...B) && wet((A[0] + B[0]) / 2, (A[1] + B[1]) / 2)) o.push(A, B); else o.push(c);
    }
    o.push(pts[pts.length - 1]); pts = o;
  }
  return pts;
}
// zagęszczenie co ≤0,5°: mapa (Mercator) rysuje wtedy dokładnie ten odcinek, który sprawdziliśmy na siatce
function densify(pts) {
  const o = [pts[0]];
  for (let i = 1; i < pts.length; i++) { const [a, b] = [pts[i - 1], pts[i]], k = Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) / 0.5); for (let j = 1; j <= k; j++) o.push([a[0] + (b[0] - a[0]) * j / k, a[1] + (b[1] - a[1]) * j / k]); }
  return o;
}

// trasa morska między dwoma punktami na lądzie: { sea: [[lat,lon]…], from: port A, to: port B } albo null
export function seaRoute(A, B) {
  if (!ocean) return null;
  const key = `${A.lat.toFixed(2)},${A.lon.toFixed(2)}|${B.lat.toFixed(2)},${B.lon.toFixed(2)}`;
  if (cache.has(key)) return cache.get(key);
  const s = port(A.lat, A.lon), t = port(B.lat, B.lon);
  let res = null;
  if (s >= 0 && t >= 0) {
    const p = s === t ? [s] : astar(s, t);
    if (p) {
      const ll = pull(p).map(i => { const x = i % W; return toLL(x, (i - x) / W); });
      for (let i = 1; i < ll.length; i++) { const d = ll[i][1] - ll[i - 1][1]; if (d > 180) ll[i][1] -= 360 * Math.round(d / 360); else if (d < -180) ll[i][1] += 360 * Math.round(-d / 360); }   // ciągłość przez 180°
      res = { sea: densify(smooth(ll)), from: ll[0], to: ll[ll.length - 1] };
    }
  }
  cache.set(key, res); return res;
}

// szlak handlowy: najkrótsza trasa mieszana (ląd + morze, przeładunek w porcie kosztuje PORT)
// → { segs: [{ mode: 'land'|'sea', pts: [[lat,lon]…] }…] } albo null
const landCell = (lat, lon) => { const [x, y] = toXY(lat, lon); for (let r = 0; r <= 3; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const j = idx(x + dx, Math.min(H - 1, Math.max(0, y + dy))); if (land[j]) return j; } return -1; };
export function tradeRoute(A, B) {
  if (!ocean) return null;
  const key = `T${A.lat.toFixed(2)},${A.lon.toFixed(2)}|${B.lat.toFixed(2)},${B.lon.toFixed(2)}`;
  if (cache.has(key)) return cache.get(key);
  const s = landCell(A.lat, A.lon), t = landCell(B.lat, B.lon);
  let res = null;
  const p = s >= 0 && t >= 0 ? (s === t ? [s] : astar(s, t, null)) : null;
  if (p) {
    // podział na odcinki lądowe i morskie; sąsiednie odcinki dzielą punkt styku (port)
    const runs = []; let cur = [p[0]];
    for (let k = 1; k < p.length; k++) { if (!!land[p[k]] !== !!land[p[k - 1]]) { runs.push(cur); cur = [p[k - 1]]; } cur.push(p[k]); }
    runs.push(cur);
    const segs = runs.map(r => { const mode = land[r[r.length - 1]] ? 'land' : 'sea', mask = mode === 'sea' ? ocean : land;
      const ll = pull(r, mask).map(i => { const x = i % W; return toLL(x, (i - x) / W); });
      return { mode, pts: ll, mask }; });
    segs[0].pts[0] = [A.lat, A.lon]; segs[segs.length - 1].pts.push([B.lat, B.lon]);
    let last = null;   // ciągłość długości geograficznej przez 180°
    segs.forEach(sg => { sg.pts.forEach(q => { if (last) q[1] += 360 * Math.round((last[1] - q[1]) / 360); last = q; }); sg.pts = densify(smooth(sg.pts, 2, sg.mask)); delete sg.mask; });
    const tiny = sg => sg.pts.every(q => Math.abs(q[0] - sg.pts[0][0]) + Math.abs(q[1] - sg.pts[0][1]) < 0.15);   // np. stolica nad samym morzem
    const kept = segs.filter((sg, k) => !(tiny(sg) && segs.length > 1 && (k === 0 || k === segs.length - 1)));
    if (kept.length < segs.length) { kept[0].pts.unshift([A.lat, A.lon]); kept[kept.length - 1].pts.push([B.lat, B.lon]); }
    res = { segs: kept };
  }
  cache.set(key, res); return res;
}

// punkt na lądzie → najbliższe miejsce na otwartym morzu (okręt staje przy brzegu, nie wpływa w ląd)
export function snap(p) {
  const wp = { ...p, wp: true };
  if (!ocean || ocean[idx(...toXY(+p.lat, +p.lon))]) return wp;
  const i = port(+p.lat, +p.lon); if (i < 0) return wp;
  const x = i % W, [lat, lon] = toLL(x, (i - x) / W);
  return { ...wp, lat, lon: lon + 360 * Math.round((+p.lon - lon) / 360) };
}
// pełna trasa okrętu: punkty z rozkazu połączone odcinkami po morzu (wynik zapamiętany)
export function seaPath(route) {
  const key = route.map(p => `${(+p.lat).toFixed(3)},${(+p.lon).toFixed(3)}`).join(';');
  if (pathCache.has(key)) return pathCache.get(key);
  const pts = route.map(snap), out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], r = seaRoute(a, b);
    if (r) r.sea.forEach(([lat, lon]) => out.push({ lat, lon: lon + 360 * Math.round((out[out.length - 1].lon - lon) / 360) }));
    out.push(b);
  }
  pathCache.set(key, out); return out;
}
