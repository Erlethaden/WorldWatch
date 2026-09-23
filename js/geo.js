// Geometria, ruch obiektów, rozmycie pozycji (OSINT), formatowanie czasu gry
const R = 6371, D2R = Math.PI / 180;

export function distKm(a, b) {
  const dLat = (b.lat - a.lat) * D2R, dLon = (b.lon - a.lon) * D2R;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * D2R) * Math.cos(b.lat * D2R) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
export function routeKm(route) { let s = 0; for (let i = 1; i < route.length; i++) s += distKm(route[i - 1], route[i]); return s; }

// interpolacja po wielkim kole
export function gcInterp(a, b, f) {
  const φ1 = a.lat * D2R, λ1 = a.lon * D2R, φ2 = b.lat * D2R, λ2 = b.lon * D2R;
  const d = distKm(a, b) / R;
  if (d < 1e-9) return { lat: a.lat, lon: a.lon };
  const A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
  const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
  const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
  const z = A * Math.sin(φ1) + B * Math.sin(φ2);
  return { lat: Math.atan2(z, Math.sqrt(x * x + y * y)) / D2R, lon: Math.atan2(y, x) / D2R };
}
export function bearing(a, b) {
  const φ1 = a.lat * D2R, φ2 = b.lat * D2R, Δλ = (b.lon - a.lon) * D2R;
  const y = Math.sin(Δλ) * Math.cos(φ2), x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) / D2R + 360) % 360;
}
export function destPoint(p, brgDeg, km) {
  const δ = km / R, θ = brgDeg * D2R, φ1 = p.lat * D2R, λ1 = p.lon * D2R;
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return { lat: φ2 / D2R, lon: ((λ2 / D2R + 540) % 360) - 180 };
}
// punkty linii (z "rozwinięciem" długości geograficznej przez antypołudnik)
export function gcLine(route, samplesPerSeg = 48) {
  const pts = [];
  for (let i = 1; i < route.length; i++) {
    for (let s = (i === 1 ? 0 : 1); s <= samplesPerSeg; s++) pts.push(gcInterp(route[i - 1], route[i], s / samplesPerSeg));
  }
  if (route.length === 1) pts.push(route[0]);
  return unwrap(pts);
}
export function unwrap(pts) {
  const out = []; let off = 0;
  pts.forEach((p, i) => {
    if (i) { const d = p.lon + off - out[i - 1][1]; if (d > 180) off -= 360; else if (d < -180) off += 360; }
    out.push([p.lat, p.lon + off]);
  });
  return out;
}

// Stan ruchu obiektu w chwili t (czas gry, ms)
// m = { route:[{lat,lon,name}], depTime, duration, delay, holdAt }
export function motion(m, t) {
  const route = (m.route || []).filter(p => isFinite(p.lat) && isFinite(p.lon));
  if (!route.length) return null;
  if (route.length === 1 || !m.duration) return { pos: route[0], phase: 'static', progress: 1, heading: m.heading || 0, seg: 0 };
  const start = (m.depTime || 0) + (m.delay || 0), end = start + m.duration;
  const tt = m.holdAt ? Math.min(t, m.holdAt) : t;
  if (tt < start) return { pos: route[0], phase: 'before', progress: 0, heading: bearing(route[0], route[1]), start, end, seg: 0 };
  if (tt >= end) { const n = route.length; return { pos: route[n - 1], phase: 'after', progress: 1, heading: bearing(route[n - 2], route[n - 1]), start, end, seg: n - 2 }; }
  const f = (tt - start) / m.duration, total = routeKm(route);
  let target = f * total, acc = 0;
  for (let i = 1; i < route.length; i++) {
    const L = distKm(route[i - 1], route[i]);
    if (acc + L >= target || i === route.length - 1) {
      const lf = L ? (target - acc) / L : 1;
      const pos = gcInterp(route[i - 1], route[i], Math.max(0, Math.min(1, lf)));
      const ahead = gcInterp(route[i - 1], route[i], Math.min(1, lf + 0.01));
      return { pos, phase: m.holdAt && t >= m.holdAt ? 'hold' : 'moving', progress: f, heading: bearing(pos, ahead), start, end, seg: i - 1, segFrac: lf };
    }
    acc += L;
  }
}

// Satelita: prosta orbita kołowa -> ślad naziemny
export function satPos(s, t) {
  const P = (s.periodMin || 95) * 60000, inc = (s.inclination ?? 55) * D2R;
  const θ = 2 * Math.PI * ((t - (s.epoch || 0)) / P);
  const lat = Math.asin(Math.sin(inc) * Math.sin(θ)) / D2R;
  const earth = ((t - (s.epoch || 0)) / 86164000) * 360;
  let lon = (s.lon0 || 0) + Math.atan2(Math.cos(inc) * Math.sin(θ), Math.cos(θ)) / D2R - earth;
  lon = ((lon % 360) + 540) % 360 - 180;
  return { lat, lon };
}
export function satTrack(s, t) {
  const P = (s.periodMin || 95) * 60000, pts = [];
  for (let i = -40; i <= 80; i++) pts.push(satPos(s, t + (i / 80) * P));
  return unwrap(pts);
}

// Deterministyczne rozmycie (seed -> ten sam wynik)
export function rng(seed) { let h = 2166136261; for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return () => { h += 0x6D2B79F5; let x = h; x = Math.imul(x ^ x >>> 15, x | 1); x ^= x + Math.imul(x ^ x >>> 7, x | 61); return ((x ^ x >>> 14) >>> 0) / 4294967296; }; }
export function fuzzPoint(p, km, seed) { const r = rng(seed); const q = destPoint(p, r() * 360, km * (0.3 + r() * 0.7)); return { lat: +q.lat.toFixed(3), lon: +q.lon.toFixed(3) }; }
export function posRange(p, km) {
  const dLat = km / 111, dLon = km / (111 * Math.max(0.2, Math.cos(p.lat * D2R)));
  const f = (a, b, pos, neg) => `${Math.abs(a).toFixed(1)}–${Math.abs(b).toFixed(1)} ${a >= 0 ? pos : neg}`;
  return `${f(p.lat - dLat, p.lat + dLat, 'N', 'S')} · ${f(p.lon - dLon, p.lon + dLon, 'E', 'W')}`;
}
export function compass(deg) { return ['Północ', 'Północny wschód', 'Wschód', 'Południowy wschód', 'Południe', 'Południowy zachód', 'Zachód', 'Północny zachód'][Math.round(((deg % 360) + 360) % 360 / 45) % 8]; }

// ── czas ──
const MON = ['STY', 'LUT', 'MAR', 'KWI', 'MAJ', 'CZE', 'LIP', 'SIE', 'WRZ', 'PAŹ', 'LIS', 'GRU'];
const p2 = n => String(n).padStart(2, '0');
export function fmtTime(ms) { if (!isFinite(ms)) return '—'; const d = new Date(ms); return `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`; }
export function fmtDate(ms) { if (!isFinite(ms)) return '—'; const d = new Date(ms); return `${p2(d.getUTCDate())} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`; }
export function fmtDT(ms) { return `${fmtDate(ms)} ${fmtTime(ms)}`; }
export function fmtDur(ms) { if (!isFinite(ms)) return '—'; const neg = ms < 0; ms = Math.abs(ms); const m = Math.round(ms / 60000), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60; return (neg ? '-' : '') + [d ? d + 'd' : '', h ? h + 'h' : '', (mm || (!d && !h)) ? mm + 'm' : ''].filter(Boolean).join(' '); }
export function parseDur(s) { // "1h 35m", "95", "2d 3h", "1:35"
  s = String(s || '').trim().toLowerCase(); if (!s) return null;
  if (/^\d+:\d+$/.test(s)) { const [h, m] = s.split(':').map(Number); return (h * 60 + m) * 60000; }
  if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s) * 60000;
  let ms = 0, ok = false; s.replace(/(\d+(?:\.\d+)?)\s*(d|h|m|min)/g, (_, n, u) => { ok = true; ms += parseFloat(n) * (u === 'd' ? 86400000 : u === 'h' ? 3600000 : 60000); });
  return ok ? ms : null;
}
export function toLocalInput(ms) { const d = new Date(ms); return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}T${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`; }
export function fromLocalInput(s) { const t = Date.parse(s + ':00Z'); return isFinite(t) ? t : null; }
