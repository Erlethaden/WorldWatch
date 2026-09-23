// Obrazki wgrywane z komputera: zmniejszane w przeglądarce i trzymane w Firestore (bez płatnego Storage).
import { DB, newId, now } from './db.js';
import { S } from './store.js';
import { hooks } from './ui.js';

const cache = new Map();
export function loadImage(ref) {
  if (!cache.has(ref)) cache.set(ref, DB.get('images/' + ref.slice(4)).then(d => d?.data || '').catch(() => ''));
  return cache.get(ref);
}
// ponytail: dokument Firestore ma limit 1 MB — skalujemy do ~1400 px i JPEG, aż zmieści się w 850 KB
export async function uploadImage(file) {
  if (!file.type.startsWith('image/')) throw new Error('to nie jest obrazek');
  const bmp = await createImageBitmap(file);
  let data = '';
  for (const [max, q] of [[1400, 0.82], [1100, 0.72], [800, 0.62], [600, 0.5]]) {
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height);
    data = c.toDataURL('image/jpeg', q);
    if (data.length < 850000) break;
  }
  if (data.length >= 850000) throw new Error('obrazek za duży nawet po zmniejszeniu');
  const id = newId();
  await DB.commit([{ t: 'set', path: 'images/' + id, data: { data, name: file.name.slice(0, 100), size: data.length, uid: S.user?.uid || '', createdAt: now() } }]);
  cache.set('img:' + id, Promise.resolve(data));
  return 'img:' + id;
}
// wszystkie odwołania „img:…” w danych gry (do sprzątania nieużywanych obrazków)
export function usedImageRefs() {
  const refs = new Set(), scan = o => { if (!o) return; if (typeof o === 'string') { if (o.startsWith('img:')) refs.add(o); } else if (typeof o === 'object') Object.values(o).forEach(scan); };
  ['news', 'characters', 'countries'].forEach(c => scan(S.data[c]));
  return refs;
}
hooks.uploadImage = uploadImage;
hooks.loadImage = loadImage;
