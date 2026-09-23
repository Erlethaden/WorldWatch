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
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k in el && k !== 'list') { try { el[k] = v; } catch { el.setAttribute(k, v); } }
    else el.setAttribute(k, v);
  }
  kids.flat(9).forEach(k => k != null && k !== false && el.append(k instanceof Node ? k : document.createTextNode(k)));
  return el;
}

// ───────── toast ─────────
export function toast(msg, kind = 'info', ms = 4500) {
  const box = $('#toasts') || document.body.appendChild(h('div#toasts'));
  const t = h('div.toast.' + kind, { onclick: () => t.remove() }, msg);
  box.prepend(t); setTimeout(() => t.classList.add('out'), ms); setTimeout(() => t.remove(), ms + 400);
}

// ───────── modal ─────────
let stack = [];
export function modal(title, body, { wide = false, actions = [], onClose } = {}) {
  const close = () => { wrap.remove(); stack = stack.filter(x => x !== wrap); onClose && onClose(); };
  const wrap = h('div.modal-wrap', { onmousedown: e => { if (e.target === wrap) close(); } },
    h('div.modal' + (wide ? '.wide' : ''),
      h('div.modal-head', h('h3', title), h('button.icon-btn', { onclick: close, title: 'Zamknij', 'aria-label': 'Zamknij' }, '✕')),
      h('div.modal-body', body),
      actions.length ? h('div.modal-foot', actions.map(a => h('button.btn' + (a.kind ? '.' + a.kind : ''), { onclick: async () => { if (await a.do?.() !== false) close(); } }, a.label))) : null));
  document.body.append(wrap); stack.push(wrap);
  return { close, el: wrap };
}
export function hideModals(on) { stack.forEach(m => m.style.display = on ? 'none' : ''); }
export function confirmBox(msg, { ok = 'Potwierdź', danger = false } = {}) {
  return new Promise(res => {
    let done = false;
    modal('Potwierdzenie', h('p', msg), { actions: [{ label: 'Anuluj', do: () => { done = true; res(false); } }, { label: ok, kind: danger ? 'danger' : 'primary', do: () => { done = true; res(true); } }], onClose: () => !done && res(false) });
  });
}

// ───────── formularze ─────────
export const hooks = { pickOnMap: null, placeList: () => [] };
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
        case 'select': el = h('select', (f.options || []).map(o => { const [ov, ol] = opt(o); return h('option', { value: ov, selected: String(ov) === String(v ?? '') }, ol); })); get = () => el.value; break;
        case 'multi': {
          const boxes = (f.options || []).map(o => { const [ov, ol] = opt(o); const c = h('input', { type: 'checkbox', value: ov, checked: (v || []).includes(ov) }); return h('label.chk', c, ' ', ol); });
          el = h('div.multi', boxes.length ? boxes : h('span.muted', f.empty || '— brak —')); get = () => boxes.map(b => b.firstChild).filter(c => c.checked).map(c => c.value); break;
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
