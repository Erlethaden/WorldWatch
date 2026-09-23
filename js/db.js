// Warstwa danych: Firestore (produkcja) albo DEMO (lokalnie, localStorage — do testów bez Firebase)
import { FIREBASE_CONFIG } from './firebase-config.js';

const FB = 'https://www.gstatic.com/firebasejs/10.12.4/';
export const isDemo = new URLSearchParams(location.search).has('demo') || !FIREBASE_CONFIG.apiKey || FIREBASE_CONFIG.apiKey.startsWith('WKLEJ');

let offset = 0;
export const now = () => Date.now() + offset;       // czas serwera (skorygowany)
export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const clean = d => JSON.parse(JSON.stringify(d ?? null));

// ───────────────────────── FIRESTORE ─────────────────────────
async function firebaseBackend() {
  const [{ initializeApp }, A, F] = await Promise.all([
    import(FB + 'firebase-app.js'), import(FB + 'firebase-auth.js'), import(FB + 'firebase-firestore.js')]);
  const app = initializeApp(FIREBASE_CONFIG);
  const auth = A.getAuth(app);
  const fs = F.getFirestore(app);
  const status = { fromCache: false, pending: false };
  const db = {
    kind: 'firebase', status,
    listen(col, filters, cb) {
      let q = F.collection(fs, col);
      if (filters && filters.length) q = F.query(q, ...filters.map(([f, op, v]) => F.where(f, op, v)));
      return F.onSnapshot(q, { includeMetadataChanges: false }, s => {
        status.fromCache = s.metadata.fromCache;
        cb(s.docs.map(d => ({ id: d.id, ...d.data() })));
      }, e => { console.warn('listen', col, e); cb([], e); });
    },
    listenDoc(path, cb) { return F.onSnapshot(F.doc(fs, path), s => cb(s.exists() ? { id: s.id, ...s.data() } : null), e => { console.warn('doc', path, e); cb(null, e); }); },
    async get(path) { const s = await F.getDoc(F.doc(fs, path)); return s.exists() ? { id: s.id, ...s.data() } : null; },
    async getAll(col) { const s = await F.getDocs(F.collection(fs, col)); return s.docs.map(d => ({ id: d.id, ...d.data() })); },
    async commit(ops) {
      for (let i = 0; i < ops.length; i += 450) {
        const b = F.writeBatch(fs);
        ops.slice(i, i + 450).forEach(o => {
          const r = F.doc(fs, o.path);
          if (o.t === 'del') b.delete(r); else b.set(r, clean(o.data), o.t === 'merge' ? { merge: true } : {});
        });
        await b.commit();
      }
    },
    async syncClock(uid) {
      try {
        const r = F.doc(fs, 'users/' + uid);
        await F.setDoc(r, { ping: F.serverTimestamp(), lastSeen: Date.now() }, { merge: true });
        const s = await F.getDoc(r, { source: 'server' });
        const p = s.data()?.ping; if (p) offset = p.toMillis() - Date.now();
      } catch (e) { console.warn('clock sync', e); }
    }
  };
  const authApi = {
    onChange: cb => A.onAuthStateChanged(auth, u => cb(u ? { uid: u.uid, email: u.email, name: u.displayName || u.email?.split('@')[0] || 'Gracz' } : null)),
    google: () => A.signInWithPopup(auth, new A.GoogleAuthProvider()),
    email: (e, p) => A.signInWithEmailAndPassword(auth, e, p),
    register: async (e, p, name) => { const c = await A.createUserWithEmailAndPassword(auth, e, p); if (name) await A.updateProfile(c.user, { displayName: name }); return c; },
    reset: e => A.sendPasswordResetEmail(auth, e),
    out: () => A.signOut(auth),
    // GM tworzy konto gracza bez wylogowania się (druga instancja aplikacji)
    async createForOther(email, pass, name) {
      const app2 = initializeApp(FIREBASE_CONFIG, 'secondary-' + Date.now());
      const a2 = A.getAuth(app2);
      const c = await A.createUserWithEmailAndPassword(a2, email, pass);
      if (name) await A.updateProfile(c.user, { displayName: name });
      const uid = c.user.uid; await A.signOut(a2); return uid;
    }
  };
  return { db, authApi };
}

// ───────────────────────── DEMO (lokalnie) ─────────────────────────
function demoBackend() {
  const KEY = 'ww_demo_v1';
  let store = {};
  try { store = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { store = {}; }
  const listeners = new Set();
  const split = p => { const i = p.lastIndexOf('/'); return [p.slice(0, i), p.slice(i + 1)]; };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { console.warn(e); } };
  const match = (d, filters) => (filters || []).every(([f, op, v]) => op === '==' ? d[f] === v : op === 'array-contains' ? Array.isArray(d[f]) && d[f].includes(v) : true);
  const fire = () => setTimeout(() => listeners.forEach(l => l()), 0);
  window.addEventListener('storage', e => { if (e.key === KEY) { try { store = JSON.parse(e.newValue || '{}'); } catch { } fire(); } });
  const status = { fromCache: false };
  const db = {
    kind: 'demo', status,
    listen(col, filters, cb) {
      const l = () => cb(Object.entries(store[col] || {}).filter(([, d]) => match(d, filters)).map(([id, d]) => ({ id, ...clean(d) })));
      listeners.add(l); l(); return () => listeners.delete(l);
    },
    listenDoc(path, cb) { const [c, id] = split(path); const l = () => cb(store[c]?.[id] ? { id, ...clean(store[c][id]) } : null); listeners.add(l); l(); return () => listeners.delete(l); },
    async get(path) { const [c, id] = split(path); return store[c]?.[id] ? { id, ...clean(store[c][id]) } : null; },
    async getAll(col) { return Object.entries(store[col] || {}).map(([id, d]) => ({ id, ...clean(d) })); },
    async commit(ops) {
      const next = clean(store);
      for (const o of ops) {
        const [c, id] = split(o.path);
        if (o.t === 'del') {
          if (next[c]) delete next[c][id];
          Object.keys(next).filter(k => k.startsWith(o.path + '/')).forEach(k => delete next[k]); // podkolekcje (demo)
          continue;
        }
        next[c] = next[c] || {};
        next[c][id] = o.t === 'merge' ? { ...(next[c][id] || {}), ...clean(o.data) } : clean(o.data);
      }
      store = next; save(); fire();
    },
    async syncClock() { },
    wipe() { store = {}; save(); fire(); }
  };
  let cur = null; try { cur = JSON.parse(sessionStorage.getItem('ww_demo_user') || 'null'); } catch { }
  const subs = new Set();
  const authApi = {
    onChange(cb) { subs.add(cb); setTimeout(() => cb(cur), 0); return () => subs.delete(cb); },
    demoLogin(u) { cur = u; sessionStorage.setItem('ww_demo_user', JSON.stringify(u)); subs.forEach(cb => cb(cur)); },
    out() { cur = null; sessionStorage.removeItem('ww_demo_user'); subs.forEach(cb => cb(null)); },
    async createForOther(email, pass, name) { return 'demo-' + newId(); }
  };
  return { db, authApi };
}

export let DB, AUTH;
export async function initBackend() {
  const b = isDemo ? demoBackend() : await firebaseBackend();
  DB = b.db; AUTH = b.authApi;
  return b;
}
