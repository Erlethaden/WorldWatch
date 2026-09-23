// ───────────────────────────────────────────────────────────────
//  WORLDWATCH — konfiguracja Firebase
//  1. Firebase Console → Project settings → Your apps → Web app → skopiuj config tutaj.
//  2. Dopóki apiKey zaczyna się od "WKLEJ", aplikacja działa w TRYBIE DEMO (lokalnie, bez serwera).
//  3. ADMIN_UIDS: UID konta właściciela (ADMIN). Po pierwszym logowaniu zobaczysz swój UID na ekranie
//     "Oczekiwanie na zatwierdzenie" — wklej go tu ORAZ w firestore.rules (funkcja owner()).
// ───────────────────────────────────────────────────────────────
export const FIREBASE_CONFIG = {
  apiKey: "WKLEJ_API_KEY",
  authDomain: "twoj-projekt.firebaseapp.com",
  projectId: "twoj-projekt",
  storageBucket: "twoj-projekt.appspot.com",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:0000000000000000"
};

export const ADMIN_UIDS = [
  // "TWOJ_UID_TUTAJ"
];
