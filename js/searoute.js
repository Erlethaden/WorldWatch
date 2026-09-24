// Morskie szlaki: trasa po wodzie (A* na siatce 0,5°) zamiast prostej linii między stolicami.
// Maska lądu rysowana raz z konturów państw; kanały i wąskie cieśniny są „przekopane” ręcznie.
const RES = 2, W = 360 * RES, H = 180 * RES;           // siatka 0,5° (720 × 360): trasa światowa w ułamku sekundy
let land = null, ocean = null, coast = null;
const cache = new Map(), portCache = new Map();

// kanały i cieśniny zbyt wąskie dla siatki: [lon, lat] od → do
const PASSAGES = [
  [[32.35, 31.30], [32.55, 29.90]],   // Kanał Sueski
  [[32.55, 29.90], [33.90, 27.60]],   // Zatoka Sueska
  [[-79.95, 9.40], [-79.50, 8.85]],   // Kanał Panamski
  [[-5.90, 35.95], [-5.25, 36.00]],   // Gibraltar
  [[29.10, 41.25], [28.95, 40.95]],   // Bosfor
  [[26.15, 40.00], [26.75, 40.45]],   // Dardanele
  [[12.60, 56.15], [12.75, 55.45]],   // Sund
  [[10.85, 55.80], [11.05, 55.20]],   // Wielki Bełt
  [[9.15, 53.90], [10.15, 54.40]],    // Kanał Kiloński
  [[36.55, 45.45], [36.65, 45.25]],   // Cieśnina Kerczeńska
  [[103.40, 1.35], [104.30, 1.20]],   // Singapur
  [[15.60, 38.30], [15.65, 38.05]]    // Mesyna
];

const idx = (x, y) => y * W + ((x % W) + W) % W;
const toXY = (lat, lon) => [Math.floor((((lon + 180) % 360 + 360) % 360) * RES), Math.min(H - 1, Math.max(0, Math.floor((90 - lat) * RES)))];
const toLL = (x, y) => [90 - (y + 0.5) / RES, (x + 0.5) / RES - 180];

export const ready = () => !!ocean;

export function init(fc) {
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#000';
  const ring = (r, off) => r.forEach(([lon, lat], i) => { const x = (lon + 180 + off) * RES, y = (90 - lat) * RES; i ? g.lineTo(x, y) : g.moveTo(x, y); });
  for (const f of fc.features) {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const off of [-360, 0, 360]) { g.beginPath(); polys.forEach(p => p.forEach(r => ring(r, off))); g.fill('evenodd'); }
  }
  g.globalCompositeOperation = 'destination-out'; g.lineWidth = 1.6; g.lineCap = 'round';
  PASSAGES.forEach(([a, b]) => { g.beginPath(); g.moveTo((a[0] + 180) * RES, (90 - a[1]) * RES); g.lineTo((b[0] + 180) * RES, (90 - b[1]) * RES); g.stroke(); });
  const px = g.getImageData(0, 0, W, H).data;
  land = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) land[i] = px[i * 4 + 3] > 140 ? 1 : 0;
  coast = new Uint8Array(W * H);
  for (let y = 1; y < H - 1; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (land[i]) continue; for (let dy = -1; dy <= 1 && !coast[i]; dy++) for (let dx = -1; dx <= 1; dx++) if (land[idx(x + dx, y + dy)]) { coast[i] = 1; break; } }
  // ocean światowy = woda połączona z punktem na środku Atlantyku (bez Morza Kaspijskiego i jezior)
  ocean = new Uint8Array(W * H); const q = [idx(...toXY(0, -30))]; ocean[q[0]] = 1;
  while (q.length) { const i = q.pop(), x = i % W, y = (i - x) / W; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ny = y + dy; if (ny < 0 || ny >= H) continue; const j = idx(x + dx, ny); if (!land[j] && !ocean[j]) { ocean[j] = 1; q.push(j); } } }
  cache.clear(); portCache.clear();
}

// najbliższa komórka oceanu (port) do punktu na lądzie
function port(lat, lon) {
  const k = lat.toFixed(2) + ',' + lon.toFixed(2); if (portCache.has(k)) return portCache.get(k);
  const [sx, sy] = toXY(lat, lon), start = idx(sx, sy), seen = new Set([start]); let q = [start], found = -1;
  for (let r = 0; r < 200 && q.length && found < 0; r++) {
    const nq = [];
    for (const i of q) { if (ocean[i]) { found = i; break; } const x = i % W, y = (i - x) / W; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ny = y + dy; if (ny < 0 || ny >= H) continue; const j = idx(x + dx, ny); if (!seen.has(j)) { seen.add(j); nq.push(j); } } }
    q = nq;
  }
  portCache.set(k, found); return found;
}

// A* po wodzie; koszt ~ odległość, przy brzegu i w lodach drożej (trasy trzymają się otwartego morza, omijają Arktykę)
function astar(s, t) {
  const cosT = new Float32Array(H); for (let y = 0; y < H; y++) cosT[y] = Math.max(0.05, Math.cos((90 - (y + 0.5) / RES) * Math.PI / 180));
  const tx = t % W, ty = (t - tx) / W;
  const hf = i => { const x = i % W, y = (i - x) / W; let dx = Math.abs(x - tx); dx = Math.min(dx, W - dx); return Math.hypot(dx * cosT[Math.round((y + ty) / 2)], y - ty); };
  const gS = new Float32Array(W * H).fill(Infinity), from = new Int32Array(W * H).fill(-1);
  const heap = [[hf(s), s, 0]]; gS[s] = 0; const EPS = 0.35;   // słaba heurystyka: przy biegunach ruch w długości jest „tani”, więc mocniejsza przeszacowuje i psuje wyszukiwanie
  const push = n => { heap.push(n); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  let steps = 0;
  while (heap.length && steps++ < 3000000) {
    const [, i, gq] = pop(); if (i === t) break; if (gq > gS[i]) continue;
    const x = i % W, y = (i - x) / W, gi = gS[i];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue; const ny = y + dy; if (ny < 0 || ny >= H) continue;
      const j = idx(x + dx, ny); if (!ocean[j]) continue;
      const lat = 90 - (ny + 0.5) / RES;
      const c = Math.hypot(dx * cosT[ny], dy) * (coast[j] ? 2.2 : 1) * (Math.abs(lat) > 64 ? 5 : 1);
      if (gi + c < gS[j]) { gS[j] = gi + c; from[j] = i; push([gS[j] + EPS * hf(j), j, gS[j]]); }
    }
  }
  if (from[t] < 0 && s !== t) return null;
  const path = []; for (let i = t; i !== -1; i = from[i]) path.push(i);
  return path.reverse();
}

// „naciąganie sznurka”: zostają tylko punkty zwrotne, między którymi widać otwarte morze
function visible(a, b) {
  const ax = a % W, ay = (a - ax) / W, bx = b % W, by = (b - bx) / W;
  let dx = bx - ax; if (dx > W / 2) dx -= W; if (dx < -W / 2) dx += W;
  const n = Math.max(Math.abs(dx), Math.abs(by - ay)) * 2 || 1;
  for (let k = 1; k < n; k++) { const j = idx(Math.round(ax + dx * k / n), Math.round(ay + (by - ay) * k / n)); if (!ocean[j] || coast[j] && k > 2 && k < n - 2) return false; }
  return true;
}
function pull(path) {
  const out = [path[0]]; let a = 0;
  while (a < path.length - 1) { let b = Math.min(path.length - 1, a + 400); while (b > a + 1 && !visible(path[a], path[b])) b--; out.push(path[b]); a = b; }
  return out;
}
// wygładzenie Chaikina: łagodne łuki zamiast ostrych załamań
function chaikin(pts, n = 2, k = .15) {   // małe k = łagodne ścięcie narożników, żeby łuki nie wchodziły na ląd
  for (let r = 0; r < n; r++) { const o = [pts[0]]; for (let i = 0; i < pts.length - 1; i++) { const [a, b] = [pts[i], pts[i + 1]]; o.push([a[0] * (1 - k) + b[0] * k, a[1] * (1 - k) + b[1] * k], [a[0] * k + b[0] * (1 - k), a[1] * k + b[1] * (1 - k)]); } o.push(pts[pts.length - 1]); pts = o; }
  return pts;
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
      res = { sea: chaikin(ll), from: ll[0], to: ll[ll.length - 1] };
    }
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
const pathCache = new Map();
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
