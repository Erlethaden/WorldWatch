// Generator gazet (sekcja 39) i grafik wydarzeń (sekcja 40) — render HTML → PNG (html2canvas)
import { S, run, now, newId, gameNow, turn, realGM, cFlag, cName, cDem, country, countriesSorted, NEWS_CATS, G } from './store.js';
import { h, modal, toast, esc } from './ui.js';

export const PAPER_STYLES = {
  modern: { pl: 'Współczesna gazeta', outlet: c => `The ${cap(c)} Herald` },
  tabloid: { pl: 'Tabloid', outlet: c => `${cDem(c).toUpperCase()} EXPRESS` },
  economic: { pl: 'Gazeta ekonomiczna', outlet: c => `The ${cap(c)} Economic Review` },
  military: { pl: 'Gazeta wojskowa', outlet: c => `${cDem(c)} Defence Journal` },
  state: { pl: 'Gazeta państwowa', outlet: c => `${cDem(c)} National Voice` },
  local: { pl: 'Lokalna gazeta', outlet: c => `${cap(c)} Evening Courier` },
  opposition: { pl: 'Gazeta opozycyjna', outlet: c => `Free ${cName(c)}` },
  foreign: { pl: 'Gazeta zagraniczna', outlet: () => 'The World Observer' },
  retro: { pl: 'Historyczna / retro', outlet: c => `The ${cap(c)} Chronicle` }
};
const cap = c => country(c)?.capital?.name || cName(c);
const FLAGIMG = c => { const iso = country(c)?.iso2; return iso ? `https://flagcdn.com/w80/${iso.toLowerCase()}.png` : null; };
const flagEl = (c, cls = 'fl') => { const u = FLAGIMG(c); const emo = () => h('span.' + cls + '.emo', cFlag(c)); if (!u) return emo(); const img = h('img.' + cls, { src: u, alt: cName(c), crossOrigin: 'anonymous' }); img.onerror = () => img.replaceWith(emo()); return img; };

// ───────── render gazety ─────────
export function renderPaper(p) {
  const d = p.date ?? gameNow();
  return h('div.paper.st-' + (p.style || 'modern'),
    h('div.masthead', h('div.mh-side', p.style === 'tabloid' ? 'ONLY' : `No. ${p.issue || 1}`), h('div.mh-name', p.outlet || 'The Herald'), h('div.mh-side', p.price || '')),
    h('div.dateline', h('span', G.fmtDate(d)), h('span', (p.category || '').toUpperCase()), h('span', `${p.city || ''}${p.style === 'state' ? ' · OFFICIAL EDITION' : ''}`)),
    h('div.paper-body',
      h('h1.p-head', p.headline || 'HEADLINE'),
      p.subheadline ? h('h2.p-sub', p.subheadline) : null,
      h('div.p-photo', p.imageUrl ? h('img', { src: p.imageUrl, alt: '', crossOrigin: 'anonymous' }) : h('div.p-flags', (p.flags || []).map(c => flagEl(c, 'pf')))),
      p.caption ? h('div.p-caption', p.caption) : null,
      h('div.p-cols', h('p', h('b', `${(p.city || '').toUpperCase()}${p.city ? ' — ' : ''}`), p.body || '')),
      p.editorial ? h('div.p-edit', h('b', p.style === 'opposition' ? 'OUR VIEW' : p.style === 'state' ? 'COMMENTARY' : 'EDITORIAL'), h('p', p.editorial)) : null),
    h('div.p-foot', h('span', `${p.outlet || ''} · ${G.fmtDate(d)}`), h('span', (p.flags || []).map(cFlag).join(' '))));
}

// ───────── render grafiki wydarzenia ─────────
export const SCENES = { meeting: ['🤝', 'Leaders meet'], signing: ['✍️', 'Treaty signing'], launch_ship: ['🚢', 'Ship launch'], rocket: ['🚀', 'Rocket launch'], exercise: ['🎯', 'Military exercises'], speech: ['🎙️', 'Royal / state address'], protest: ['📢', 'Demonstrations'], press: ['🎤', 'Press conference'], visit: ['🛬', 'Diplomatic visit'], disaster: ['🔥', 'Disaster'], inauguration: ['🏗️', 'Project inauguration'], sport: ['🏟️', 'Sporting event'], economy: ['📈', 'Economic event'] };
export function renderCard(c) {
  const [ic] = SCENES[c.scene] || SCENES.meeting;
  return h('div.ecard.tod-' + (c.tod || 'day') + '.st-' + (c.style || 'press') + '.grav-' + (c.gravity || 'normal'),
    c.imageUrl ? h('img.ec-bg', { src: c.imageUrl, alt: '', crossOrigin: 'anonymous' }) : h('div.ec-scene', h('div.ec-sky'), h('div.ec-ground'), c.flagsOn !== false ? h('div.ec-poles', (c.countries || []).map(x => h('div.pole', flagEl(x, 'pflag')))) : null, h('div.ec-icon', ic), c.media ? h('div.ec-media', '📸 🎥 📸 🎥 📸') : null),
    h('div.ec-top', c.style === 'tv' ? h('span.ec-live', '● LIVE') : h('span.ec-tag', c.style === 'official' ? 'OFFICIAL PHOTO' : c.style === 'propaganda' ? 'GLORY TO THE NATION' : 'PRESS PHOTO'), h('span', (c.countries || []).map(cFlag).join(' '))),
    h('div.ec-cap', h('b', c.title || ''), h('span', `${c.place || ''}${c.place ? ' · ' : ''}${G.fmtDT(c.date ?? gameNow())} UTC`), c.subtitle ? h('small', c.subtitle) : null));
}

async function toPng(el, name) {
  if (!window.html2canvas) return toast('Brak html2canvas', 'err');
  try {
    await document.fonts?.ready;
    const canvas = await html2canvas(el, { backgroundColor: null, scale: 2, useCORS: true, logging: false });
    const a = h('a', { href: canvas.toDataURL('image/png'), download: name }); document.body.append(a); a.click(); a.remove();
  } catch (e) { toast('Nie udało się zapisać PNG: ' + e.message, 'err'); }
}

// ───────── edytor z podglądem (wspólny) ─────────
function editor(title, fields, cfg, renderFn, onPublish, fileName) {
  const preview = h('div.preview');
  const inputs = {};
  const upd = () => { fields.forEach(f => { const el = inputs[f.k]; if (!el) return; cfg[f.k] = f.type === 'multi' ? [...el.querySelectorAll('input:checked')].map(i => i.value) : f.type === 'check' ? el.checked : f.type === 'number' ? +el.value : el.value; }); preview.replaceChildren(renderFn(cfg)); };
  const rows = fields.map(f => {
    let el;
    if (f.type === 'select') el = h('select', f.options.map(([v, l]) => h('option', { value: v, selected: cfg[f.k] === v }, l)));
    else if (f.type === 'textarea') el = h('textarea', { rows: f.rows || 3, value: cfg[f.k] || '' });
    else if (f.type === 'multi') el = h('div.multi', f.options.map(([v, l]) => h('label.chk', h('input', { type: 'checkbox', value: v, checked: (cfg[f.k] || []).includes(v) }), ' ', l)));
    else if (f.type === 'check') el = h('input', { type: 'checkbox', checked: cfg[f.k] !== false && !!cfg[f.k] });
    else el = h('input', { type: f.type || 'text', value: cfg[f.k] ?? '' });
    el.addEventListener('input', upd); el.addEventListener('change', upd);
    inputs[f.k] = el;
    return h('label.frow' + (f.type === 'check' ? '.check' : ''), h('span.flabel', f.label), el);
  });
  const aud = h('select', h('option', { value: '' }, 'dla wszystkich'), countriesSorted().map(c => h('option', { value: c.id }, `tylko ${c.flag} ${c.name}`)));
  modal(title, h('div.editor', h('div.ed-form', rows, realGM() ? h('label.frow', h('span.flabel', 'Publikacja — odbiorcy (inna narracja dla każdego państwa)'), aud) : null), h('div.ed-prev', preview)), {
    wide: true, actions: [
      { label: '⬇ Pobierz PNG', do: () => { toPng(preview.firstChild, fileName()); return false; } },
      ...(realGM() ? [{ label: '📰 Publikuj w feedzie', kind: 'primary', do: () => onPublish(cfg, aud.value) }] : [])
    ]
  });
  upd();
}

export function newspaper(pre = {}) {
  const n = pre.newsId ? S.data.news[pre.newsId] : null;
  const c0 = n?.countries?.[0] || n?.authorCountry || countriesSorted()[0]?.id;
  const cfg = { style: 'modern', country: c0, outlet: PAPER_STYLES.modern.outlet(c0), headline: (n?.headline || '').replace(/^[\u{1F1E6}-\u{1F1FF}\s]+/u, '').toUpperCase(), subheadline: '', body: n?.body || '', category: n?.category || 'Politics', city: cap(c0), date: n?.gameTime ?? gameNow(), issue: 1000 + turn() * 7, price: '€2.50', flags: n?.countries || [c0].filter(Boolean), imageUrl: n?.imageUrl || '', caption: '', editorial: '', ...(pre.cfg || {}) };
  const cOpts = countriesSorted().map(c => [c.id, `${c.flag} ${c.name}`]);
  const fields = [
    { k: 'style', label: 'Styl', type: 'select', options: Object.entries(PAPER_STYLES).map(([k, s]) => [k, s.pl]) },
    { k: 'country', label: 'Gazeta z kraju (narracja)', type: 'select', options: cOpts },
    { k: 'outlet', label: 'Nazwa gazety' }, { k: 'headline', label: 'Nagłówek' }, { k: 'subheadline', label: 'Podtytuł' },
    { k: 'body', label: 'Treść artykułu', type: 'textarea', rows: 5 }, { k: 'city', label: 'Miejsce (dateline)' },
    { k: 'category', label: 'Kategoria', type: 'select', options: NEWS_CATS.map(c => [c, c]) }, { k: 'issue', label: 'Numer wydania', type: 'number' }, { k: 'price', label: 'Cena' },
    { k: 'flags', label: 'Flagi', type: 'multi', options: cOpts }, { k: 'imageUrl', label: 'Zdjęcie (URL, opcjonalnie)' }, { k: 'caption', label: 'Podpis zdjęcia' },
    { k: 'editorial', label: 'Komentarz redakcji', type: 'textarea', rows: 2 }
  ];
  let lastStyle = cfg.style, lastC = cfg.country;
  const render = c => { if (c.style !== lastStyle || c.country !== lastC) { const auto = PAPER_STYLES[lastStyle].outlet(lastC); if (!c.outlet || c.outlet === auto) { c.outlet = PAPER_STYLES[c.style].outlet(c.country); const i = document.querySelectorAll('.ed-form input')[0]; if (i) i.value = c.outlet; } lastStyle = c.style; lastC = c.country; } return renderPaper(c); };
  editor('🗞️ GENERATE NEWSPAPER', fields, cfg, render, (c, aud) => publish({ headline: `${c.outlet}: ${c.headline}`, paper: { ...c }, countries: c.flags, category: c.category, place: null }, aud, pre.newsId), () => `gazeta-${(cfg.outlet || 'paper').replace(/\W+/g, '-')}.png`);
}

export function eventCard(pre = {}) {
  const n = pre.newsId ? S.data.news[pre.newsId] : null;
  const cfg = { scene: 'meeting', title: n?.headline?.replace(/^[\u{1F1E6}-\u{1F1FF}\s]+/u, '') || '', subtitle: '', countries: n?.countries || [], place: n?.place?.name || '', tod: 'day', style: 'press', gravity: 'normal', flagsOn: true, media: true, imageUrl: n?.imageUrl || '', date: n?.gameTime ?? gameNow() };
  const cOpts = countriesSorted().map(c => [c.id, `${c.flag} ${c.name}`]);
  editor('🖼️ EVENT → GENERATE IMAGE', [
    { k: 'scene', label: 'Scena', type: 'select', options: Object.entries(SCENES).map(([k, [i, l]]) => [k, `${i} ${l}`]) },
    { k: 'title', label: 'Tytuł / podpis' }, { k: 'subtitle', label: 'Dopisek' }, { k: 'countries', label: 'Państwa (flagi)', type: 'multi', options: cOpts }, { k: 'place', label: 'Miejsce' },
    { k: 'tod', label: 'Pora dnia', type: 'select', options: [['dawn', 'Świt'], ['day', 'Dzień'], ['dusk', 'Zmierzch'], ['night', 'Noc']] },
    { k: 'style', label: 'Styl', type: 'select', options: [['press', 'Zdjęcie prasowe'], ['official', 'Oficjalne'], ['tv', 'Relacja TV (LIVE)'], ['propaganda', 'Propagandowe'], ['doc', 'Dokumentalne (sepia)']] },
    { k: 'gravity', label: 'Poziom powagi', type: 'select', options: [['light', 'Lekki'], ['normal', 'Normalny'], ['grave', 'Poważny'], ['crisis', 'Kryzys']] },
    { k: 'flagsOn', label: 'Flagi w kadrze', type: 'check' }, { k: 'media', label: 'Obecność mediów', type: 'check' },
    { k: 'imageUrl', label: 'Własne zdjęcie (URL) — zastępuje scenę' }
  ], cfg, renderCard, (c, aud) => publish({ headline: c.title || SCENES[c.scene][1], card: { ...c }, countries: c.countries, category: 'Politics' }, aud, pre.newsId), () => `wydarzenie-${Date.now()}.png`);
}

async function publish(doc, audience, attachTo) {
  if (attachTo && S.data.news[attachTo] && confirm('Dołączyć do istniejącej wiadomości zamiast tworzyć nową?')) {
    return run('ATTACH_MEDIA', doc.headline, w => w.merge('news/' + attachTo, doc.paper ? { paper: doc.paper } : { card: doc.card }));
  }
  const ok = await run('PUBLISH_MEDIA', doc.headline, w => w.set('news/' + newId(), { body: '', reliability: 'Confirmed', breaking: false, gameTime: gameNow(), createdAt: now(), audienceAll: !audience, audience: audience ? [audience] : [], source: 'gm', ...doc }));
  if (ok) toast('📰 Opublikowano', 'ok');
}
