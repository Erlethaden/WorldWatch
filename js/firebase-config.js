// ───────────────────────────────────────────────────────────────
//  WORLDWATCH — konfiguracja Firebase
//  1. Firebase Console → Project settings → Your apps → Web app → skopiuj config tutaj.
//  2. Dopóki apiKey zaczyna się od "WKLEJ", aplikacja działa w TRYBIE DEMO (lokalnie, bez serwera).
//  3. ADMIN_UIDS: UID konta właściciela (ADMIN). Po pierwszym logowaniu zobaczysz swój UID na ekranie
//     "Oczekiwanie na zatwierdzenie" — wklej go tu ORAZ w firestore.rules (funkcja owner()).
// ───────────────────────────────────────────────────────────────
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBxpMhVyAn_fiixGNw-20v9hR9jxzxXAFY",
  authDomain: "world-watch-a8eaf.firebaseapp.com",
  projectId: "world-watch-a8eaf",
  storageBucket: "world-watch-a8eaf.firebasestorage.app",
  messagingSenderId: "836732716712",
  appId: "1:836732716712:web:67fc1851a950cfb893a49d"
};

export const ADMIN_UIDS = [
  // "TWOJ_UID_TUTAJ"
];
