// Drobne narzędzia UI: h(), modal, formularze, toasty
import * as G from './geo.js';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// h('div.cls#id', {onclick, style}, children...)
export function h(tag, attrs, ...kids) {
  const [t, ...rest] = tag.split(/(?=[.#])/);
  const el = document.createElement(t || 'div');
  rest.forEach(r => r[0] === '.' ? el.classList.add(r.slice(1)) : el.id = r.slice(1));
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') for (const [sk, sv] of Object.entries(v)) sk.startsWith('--') ? el.style.setProperty(sk, sv) : (el.style[sk] = sv);
    else if (k in el && k !== 'list') { try { el[k] = v; } catch { el.setAttribute(k, v); } }
    else el.setAttribute(k, v);
  }
  kids.flat(9).forEach(k => k != null && k !== false && el.append(k instanceof Node ? k : document.createTextNode(k)));
  // klikalny div/article/span = przycisk dla klawiatury i czytnika ekranu
  if (attrs?.onclick && !NATIVE.has(el.tagName) && !el.hasAttribute('role')) { el.tabIndex = 0; el.setAttribute('role', 'button'); }
  return el;
}
const NATIVE = new Set(['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA', 'LABEL', 'SUMMARY', 'OPTION']);
document.addEventListener('keydown', e => {
  const t = e.target;
  if ((e.key === 'Enter' || e.key === ' ') && t.getAttribute?.('role') === 'button' && !NATIVE.has(t.tagName)) { e.preventDefault(); t.click(); }
  if (e.key === 'Escape') { const top = stack[stack.length - 1]; if (top && top.style.display !== 'none') { e.preventDefault(); top._requestClose(); } }
  if (e.key === 'Tab') { const top = stack[stack.length - 1]; if (top && top.style.display !== 'none') trapTab(e, top); }
});
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex="0"]';
function trapTab(e, wrap) {
  const f = [...wrap.querySelectorAll(FOCUSABLE)].filter(x => x.offsetParent !== null);
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (!wrap.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
  else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

// ───────── toast ─────────
export function toast(msg, kind = 'info', ms = 4500) {
  const box = $('#toasts') || document.body.appendChild(h('div#toasts'));
  const t = h('div.toast.' + kind, { onclick: () => t.remove() }, msg);
  box.prepend(t); setTimeout(() => t.classList.add('out'), ms); setTimeout(() => t.remove(), ms + 400);
}

// ───────── modal ─────────
let stack = [];
let mid = 0;
export function modal(title, body, { wide = false, actions = [], onClose } = {}) {
  const back = document.activeElement, tid = 'mt' + (++mid);
  let dirty = false;
  const close = () => { wrap.remove(); stack = stack.filter(x => x !== wrap); onClose && onClose(); if (back?.isConnected && !stack.length) back.focus?.(); };
  // kliknięcie obok okna / Esc nie kasuje wpisanych danych bez pytania
  const requestClose = async () => { if (!dirty || await confirmBox('Zamknąć bez zapisywania? Wpisane dane przepadną.', { ok: 'Zamknij', danger: true, title: 'Niezapisane zmiany' })) close(); };
  const wrap = h('div.modal-wrap', { onmousedown: e => { if (e.target === wrap) requestClose(); }, oninput: () => { dirty = true; }, onchange: () => { dirty = true; } },
    h('div.modal' + (wide ? '.wide' : ''), { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': tid },
      h('div.modal-head', h('h3', { id: tid }, title), h('button.icon-btn', { onclick: close, title: 'Zamknij', 'aria-label': 'Zamknij' }, '✕')),
      h('div.modal-body', body),
      actions.length ? h('div.modal-foot', actions.map(a => h('button.btn' + (a.kind ? '.' + a.kind : ''), { onclick: async () => { if (await a.do?.() !== false) close(); } }, a.label))) : null));
  wrap._requestClose = requestClose;
  document.body.append(wrap); stack.push(wrap);
  const first = wrap.querySelector('.modal-body input:not([type=hidden]):not([type=file]):not([type=checkbox]), .modal-body textarea, .modal-body select') || wrap.querySelector('.modal-foot .btn.primary, .modal-foot .btn, .modal-body button') || wrap.querySelector('.modal-head button');
  requestAnimationFrame(() => first?.focus({ preventScroll: true }));
  return { close, el: wrap };
}
export function hideModals(on) { stack.forEach(m => m.style.display = on ? 'none' : ''); }
export function confirmBox(msg, { ok = 'Potwierdź', danger = false, title = danger ? 'Na pewno?' : 'Potwierdzenie' } = {}) {
  return new Promise(res => {
    let done = false;
    modal(title, h('p', msg), { actions: [{ label: 'Anuluj', do: () => { done = true; res(false); } }, { label: ok, kind: danger ? 'danger' : 'primary', do: () => { done = true; res(true); } }], onClose: () => !done && res(false) });
  });
}

// ───────── formularze ─────────
export const hooks = { pickOnMap: null, placeList: () => [], uploadImage: null, loadImage: null };

// wyszukiwanie w długich listach (bez polskich znaków i wielkości liter): „pols” znajdzie „Polska”
export const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'l').toLowerCase();
export function searchable(sel, min = 12) {
  const all = [...sel.options];
  if (all.length < min) return sel;
  const q = h('input.search', { type: 'search', placeholder: '🔎 szukaj…', oninput: () => {
    const t = norm(q.value), keep = sel.value;
    const rank = o => { if (o.value === '' || !t) return o.value === '' ? -1 : 0; const n = norm(o.textContent).replace(/^[^a-z0-9]+/, ''); return n.startsWith(t) ? 0 : (' ' + n).includes(' ' + t) ? 1 : 2; };   // najpierw nazwy zaczynające się od frazy
    sel.replaceChildren(...all.filter(o => !t || norm(o.textContent).includes(t) || o.value === keep || o.value === '').sort((x, y) => rank(x) - rank(y)));
    sel.value = keep;
    sel.size = t ? Math.min(8, Math.max(2, sel.options.length)) : 0;   // podczas szukania wyniki widać od razu jako listę
  } });
  sel.addEventListener('change', () => { if (sel.size) { const v = sel.value; sel.size = 0; q.value = ''; sel.replaceChildren(...all); sel.value = v; } });
  return h('div.search-wrap', q, sel);
}
// obrazek: zwykły link albo „img:ID” (plik wgrany z komputera, trzymany w bazie)
export function img(ref, cls = '', attrs = {}) {
  const el = h('img' + cls, { alt: '', ...attrs });
  if (!ref) return el;
  if (ref.startsWith('img:') && hooks.loadImage) hooks.loadImage(ref).then(src => { if (src) el.src = src; }); else el.src = ref;
  return el;
}
const opt = o => Array.isArray(o) ? o : [o, o];

// fields: [{k,label,type,options,value,help,req,show:(vals)=>bool}]
export function form(title, fields, { submit = 'Zapisz', wide = false, extra } = {}) {
  return new Promise(res => {
    const inputs = {};
    const vals = () => Object.fromEntries(Object.entries(inputs).map(([k, f]) => [k, f.get()]));
    const refresh = () => { const v = vals(); fields.forEach(f => f.show && inputs[f.k]?.row && (inputs[f.k].row.style.display = f.show(v) ? '' : 'none')); };
    const rows = fields.map(f => {
      if (f.type === 'section') return h('div.form-section', f.label);
      if (f.type === 'info') return h('div.form-info', { html: f.html });
      let el, get;
      const v = f.value;
      switch (f.type) {
        case 'textarea': el = h('textarea', { rows: f.rows || 3, value: v ?? '', placeholder: f.ph || '' }); get = () => el.value.trim(); break;
        case 'number': el = h('input', { type: 'number', value: v ?? '', step: f.step || 'any', min: f.min, max: f.max }); get = () => el.value === '' ? null : +el.value; break;
        case 'range': { const out = h('span.range-val', (v ?? 50) + '%'); const r = h('input', { type: 'range', min: 0, max: 100, value: v ?? 50, oninput: () => out.textContent = r.value + '%' }); el = h('div.range', r, out); get = () => +r.value; break; }
        case 'check': el = h('input', { type: 'checkbox', checked: !!v }); get = () => el.checked; break;
        case 'color': el = h('input', { type: 'color', value: v || '#3fa7ff' }); get = () => el.value; break;
        case 'select': { const s = h('select', (f.options || []).map(o => { const [ov, ol] = opt(o); return h('option', { value: ov, selected: String(ov) === String(v ?? '') }, ol); })); el = searchable(s); get = () => s.value; break; }
        case 'multi': {
          const boxes = (f.options || []).map(o => { const [ov, ol] = opt(o); const c = h('input', { type: 'checkbox', value: ov, checked: (v || []).includes(ov) }); return h('label.chk', c, ' ', ol); });
          const box = h('div.multi', boxes.length ? boxes : h('span.muted', f.empty || '— brak —'));
          el = boxes.length > 10 ? h('div.search-wrap', h('input.search', { type: 'search', placeholder: '🔎 szukaj…', oninput: e => { const q = norm(e.target.value); boxes.forEach(b => b.style.display = !q || norm(b.textContent).includes(q) || b.firstChild.checked ? '' : 'none'); } }), box) : box;
          get = () => boxes.map(b => b.firstChild).filter(c => c.checked).map(c => c.value); break;
        }
        case 'image': {
          const inp = h('input', { value: v || '', placeholder: 'link https://… albo plik z komputera' });
          const prev = h('div.img-prev');
          const show = () => { prev.replaceChildren(inp.value ? img(inp.value) : ''); };
          const file = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: async () => { const fl = file.files[0]; if (!fl) return; up.disabled = true; up.textContent = '⏳'; try { inp.value = await hooks.uploadImage(fl); show(); } catch (e) { toast('Nie udało się wgrać obrazka: ' + e.message, 'err'); } up.disabled = false; up.textContent = '📁 Z komputera'; file.value = ''; } });
          const up = h('button.btn.sm', { type: 'button', onclick: () => file.click() }, '📁 Z komputera');
          inp.addEventListener('change', show);
          el = h('div.img-field', h('div.place', inp, up, h('button.btn.sm', { type: 'button', title: 'Usuń obrazek', onclick: () => { inp.value = ''; show(); } }, '✕')), file, prev); show();
          get = () => inp.value.trim(); break;
        }
        case 'datetime': { const now = f.now?.() ?? Date.now(); el = h('div.dt', h('input', { type: 'datetime-local', value: G.toLocalInput(v ?? now) }), h('button.btn.sm', { type: 'button', onclick: () => el.firstChild.value = G.toLocalInput(f.now?.() ?? Date.now()) }, 'teraz'), h('span.muted', ' UTC (czas gry)')); get = () => G.fromLocalInput(el.firstChild.value); break; }
        case 'duration': el = h('input', { value: v != null && v !== '' ? G.fmtDur(v) : '', placeholder: f.ph || 'np. 1h 35m · puste = auto' }); get = () => G.parseDur(el.value); break;
        case 'place': {
          const inp = h('input', { value: v ? (v.cc ? `${v.name}, ${v.cc}` : v.name) : '', list: 'dl-places', placeholder: 'miasto, akwen albo „lat, lon”' });
          inp._place = v || null;
          const pick = h('button.btn.sm', { type: 'button', title: 'Wskaż na mapie', onclick: async () => { if (!hooks.pickOnMap) return; hideModals(true); const p = await hooks.pickOnMap(); hideModals(false); if (p) { inp.value = `${p.lat.toFixed(3)}, ${p.lon.toFixed(3)}`; inp._place = null; } } }, '📍');
          el = h('div.place', inp, pick); get = () => { const s = inp.value.trim(); if (!s) return null; if (inp._place && s === (inp._place.cc ? `${inp._place.name}, ${inp._place.cc}` : inp._place.name)) return inp._place; return hooks.parsePlace(s) || { invalid: s }; }; break;
        }
        case 'places': { // lista punktów trasy
          const list = h('div.waypoints');
          const add = (p) => { const inp = h('input', { value: p ? (p.cc ? `${p.name}, ${p.cc}` : p.name) : '', list: 'dl-places', placeholder: 'punkt pośredni' }); inp._place = p || null; const row = h('div.wp', inp, h('button.btn.sm', { type: 'button', onclick: async () => { hideModals(true); const q = await hooks.pickOnMap(); hideModals(false); if (q) { inp.value = `${q.lat.toFixed(3)}, ${q.lon.toFixed(3)}`; inp._place = null; } } }, '📍'), h('button.btn.sm', { type: 'button', onclick: () => row.remove() }, '✕')); list.append(row); };
          (v || []).forEach(add);
          el = h('div', list, h('button.btn.sm', { type: 'button', onclick: () => add() }, '+ punkt pośredni'));
          get = () => [...list.querySelectorAll('input')].map(i => { const s = i.value.trim(); if (!s) return null; if (i._place && s === (i._place.cc ? `${i._place.name}, ${i._place.cc}` : i._place.name)) return i._place; return hooks.parsePlace(s) || { invalid: s }; }).filter(Boolean); break;
        }
        default: el = h('input', { type: f.type || 'text', value: v ?? '', placeholder: f.ph || '', list: f.list }); get = () => el.value.trim();
      }
      el.addEventListener?.('change', refresh); el.addEventListener?.('input', refresh);
      const row = h('label.frow' + (f.type === 'check' ? '.check' : '') + (f.full ? '.full' : ''), h('span.flabel', f.label + (f.req ? ' *' : '')), el, f.help ? h('small.help', f.help) : null);
      inputs[f.k] = { get, row, f };
      return row;
    });
    const err = h('div.form-err');
    let done = false;
    const m = modal(title, h('div.form' + (wide ? '.cols' : ''), rows, extra || null, err), {
      wide, onClose: () => !done && res(null),
      actions: [{ label: 'Anuluj', do: () => { } }, {
        label: submit, kind: 'primary', do: () => {
          const v = vals();
          for (const f of fields) {
            if (!f.k || (f.show && !f.show(v))) continue;
            const x = v[f.k];
            if (f.req && (x == null || x === '' || (Array.isArray(x) && !x.length))) { err.textContent = `Pole „${f.label}” jest wymagane.`; return false; }
            if ((f.type === 'place' && x?.invalid) || (f.type === 'places' && x?.some(p => p.invalid))) { err.textContent = `Nie rozpoznano lokalizacji „${x.invalid || x.find(p => p.invalid).invalid}”. Wybierz z listy, wpisz „lat, lon” albo wskaż na mapie.`; return false; }
          }
          done = true; res(v);
        }
      }]
    });
    setTimeout(refresh, 0);
    m.el.querySelector('input,select,textarea')?.focus();
  });
}

// ───────── drobiazgi ─────────
export const chip = (txt, cls = '') => h('span.chip' + (cls ? '.' + cls : ''), txt);
export const kv = (k, v) => h('div.kv', h('span.k', k), h('span.v', v));
export function download(name, text, type = 'application/json') {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name }); document.body.append(a); a.click(); a.remove();
}
export function pickFile(accept = '.json') {
  return new Promise(res => { const i = h('input', { type: 'file', accept, onchange: () => { const f = i.files[0]; if (!f) return res(null); const r = new FileReader(); r.onload = () => res(r.result); r.readAsText(f); } }); i.click(); });
}
export const ago = ms => { const s = Math.round((Date.now() - ms) / 1000); return s < 60 ? `${s}s temu` : s < 3600 ? `${Math.round(s / 60)} min temu` : s < 86400 ? `${Math.round(s / 3600)} h temu` : `${Math.round(s / 86400)} d temu`; };
