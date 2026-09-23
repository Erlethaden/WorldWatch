# 🌍 WORLDWATCH

Aplikacja pomocnicza do geopolitycznego RPG: mapa świata w stylu FlightRadar24, podróże dyplomatów, okręty, wywiad/OSINT, breaking news, prywatne kanały dyplomatyczne, kronika świata, generator gazet i panel GM z backupami.

Statyczna strona (GitHub Pages) + Firebase (logowanie + Firestore). Bez kroku budowania: wrzucasz pliki i działa.

---

## 1. Szybki podgląd (tryb demo)

Dopóki `js/firebase-config.js` ma `apiKey: "WKLEJ_API_KEY"`, aplikacja działa w **trybie demo**: dane zapisują się tylko w przeglądarce, a na ekranie logowania wybierasz, kim jesteś (GM, Szwecja, Polska, USA, Chiny, obserwator). Otwórz dwie karty jako różni gracze i zobaczysz, że każdy widzi świat inaczej.

Lokalnie: `python3 -m http.server` w folderze i wejdź na `http://localhost:8000` (moduły ES nie działają z `file://`).
Tryb demo można też wymusić dopisując `?demo` do adresu.

## 2. Firebase

1. [console.firebase.google.com](https://console.firebase.google.com) → **Add project**.
2. **Build → Authentication → Get started**. Włącz **Google** i/lub **Email/Password**.
3. **Authentication → Settings → Authorized domains** → dodaj `twojlogin.github.io`.
4. **Build → Firestore Database → Create database** (tryb produkcyjny, dowolny region, np. `eur3`).
5. **Project settings → Your apps → Web (</>)** → skopiuj obiekt `firebaseConfig` do `js/firebase-config.js`.

Wystarczy darmowy plan Spark: aplikacja nie używa Cloud Functions ani Storage.

## 3. Konto admina (właściciel)

1. Wgraj stronę (punkt 4), wejdź na nią i zaloguj się.
2. Zobaczysz ekran **„Oczekiwanie na zatwierdzenie”** z Twoim **UID**. Skopiuj go.
3. Wklej UID w dwóch miejscach:
   - `js/firebase-config.js` → `ADMIN_UIDS = ["TWÓJ_UID"]`
   - `firestore.rules` → `function owner() { ... in ['TWÓJ_UID']; }`
4. **Firestore → Rules** → wklej całą zawartość `firestore.rules` → **Publish**.
5. Wgraj poprawiony `firebase-config.js` i odśwież stronę. Jesteś teraz **adminem** (ma wszystko, co GM, i więcej).
6. Na start: **GM → System → Ustawienia → Wczytaj przykładowy świat** albo dodaj państwa ręcznie (**GM → Państwa**).

## 4. GitHub Pages

1. Nowe repozytorium → wrzuć **zawartość** tego folderu (`index.html` w katalogu głównym).
2. **Settings → Pages → Deploy from a branch → main / root**.
3. Po minucie strona działa pod `https://twojlogin.github.io/nazwa-repo/`.

## 5. Role

| Rola | Co może |
|---|---|
| **Admin** (domyślnie właściciel) | wszystko co GM, a do tego: nadaje i odbiera rolę GM/Admin, usuwa graczy, państwa, newsy, wpisy kroniki, traktaty i wiadomości, przegląda i kasuje logi, zarządza backupami, Porządkami i własnymi polami państw |
| **GM** | prowadzi grę: świat, obiekty, postacie, statystyki, newsy, tury, zegar, przypisuje graczy do państw (bez ról GM/Admin), cofa operacje; może tworzyć backupy, ale nie może ich oglądać ani usuwać |
| **Country Leader** | swoje państwo |
| **Observer** | tylko ogląda |

**Porządki** (System → 🧹, tylko admin), czyli ochrona przed duchami i zapychaniem bazy:
- konta „oczekuje”, których nikt nie zatwierdził przez N dni,
- osierocone dokumenty po usuniętych państwach i obiektach (obiekty, postacie, raporty wywiadu, relacje, wiadomości),
- gracze przypisani do nieistniejącego państwa i uszkodzone trasy,
- stare logi i nadmiarowe automatyczne backupy,
- nieaktywni gracze — tych usuwasz tylko ręcznie.

Bezpieczne kategorie sprzątają się same raz na dobę, gdy admin jest online (można to wyłączyć). Przed ręcznym sprzątaniem robi się backup. Graczy dodatkowo chroni limit operacji na minutę (ustawiany przez admina), a serwer odrzuca zbyt długie teksty.

**Pola państw** (System → 🧩): admin dodaje własne pola informacji (np. „Rezerwy złota”) do wybranej sekcji, jawne albo niejawne. Wartości wpisuje GM w 📊 Statystykach.

**Podbój** (GM → ⚔️ Terytoria albo ＋ Wydarzenie → ⚔️ Podbój terenu): pod kontrolę innego państwa przechodzi całe państwo, część państwa (rysujesz obszar, a aplikacja sama przycina go do granic tego kraju) albo dowolny narysowany obszar. Statusy: okupowane (przerywana granica), zaanektowane (pełny kolor), sporne (czerwona granica). Opcjonalnie powstaje news i wpis w kronice. 🕊️ zwraca teren poprzedniemu właścicielowi. Zająć można też państwa spoza gry (NPC). Istnieją na mapie (po najechaniu widać nazwę), ale nie mają statystyk.

**Rysowanie terenu**: przytrzymaj palec/mysz i zamaluj obszar (✏️ Rysuj). 🧽 Gumka wycina fragmenty, ✋ Przesuń przesuwa mapę, ↶ cofa ostatni obrys. Przy zajęciu części państwa rysunek jest na bieżąco przycinany do jego granic. Edycja istniejącego terenu otwiera narysowany wcześniej kształt.

**Własne obrazki**: w polach „Zdjęcie” (gazeta, grafika wydarzenia, wiadomość, awatar postaci) jest przycisk 📁 Z komputera. Plik jest zmniejszany do JPG (< ok. 850 KB) i trzymany w bazie (kolekcja `images`). Nieużywane obrazki usuwa admin w System → Porządki.

**Wyszukiwanie**: dłuższe listy (np. państwa do podboju, wybór kraju) mają pole 🔎 szukaj — polskie znaki nie są wymagane (wpisz „polska” albo „pol”).

## 6. Gracze

- Gracz wchodzi na stronę i loguje się (Google albo e-mail + hasło). Trafia do listy **oczekujących**.
- **GM → Gracze**: wybierasz mu państwo, a rola zmienia się sama na *Country Leader*. Możesz też ustawić *Observer*, *GM* albo *zablokowany*.
- Możesz też założyć konto za gracza (**+ Utwórz konto gracza**) i podać mu e-mail oraz hasło.
- **✋ przejmij**: GM czasowo zabiera graczowi państwo (gracz widzi świat jako obserwator). **↩ oddaj** przywraca.
- Selektor u góry (**👁 jako …**) pozwala GM-owi zobaczyć świat dokładnie tak, jak widzi go dany gracz.

---

## Jak działa ukrywanie informacji

Każdy obiekt ma dwie wersje:

| Kolekcja | Zawartość | Kto czyta |
|---|---|---|
| `unitSecrets`, `charSecrets` | prawda: trasa, pasażerowie, misja | właściciel + GM |
| `units`, `characters` | publiczna projekcja zależna od widoczności | wszyscy |
| `intel` | raport o obiekcie dla konkretnego państwa (rozmyta pozycja, pewność %) | to państwo + GM |

Reguły Firestore egzekwują to po stronie serwera, więc gracz nie podejrzy cudzych tajemnic nawet przez narzędzia deweloperskie.

- **PUBLIC**: znak, trasa, misja (albo „Government activity”). Pasażerowie jako CLASSIFIED, chyba że są jawni.
- **LIMITED**: „Swedish Government Aircraft, heading toward Poland, diplomatic mission suspected”. Cel jest rozmyty o około 90 km.
- **CLASSIFIED**: „Unknown aircraft”, bez państwa, pozycja rozmyta o 80–150 km, z procentem pewności.
- **HIDDEN**: widzi tylko właściciel i GM. Inni dowiadują się wyłącznie przez raporty wywiadu (📡 w karcie obiektu).

Wyjątek: zaplanowane newsy (z datą w przyszłości) są ukrywane tylko w interfejsie, bo reguły nie znają czasu gry.

## Czas gry

Kliknij zegar (GM): pauza, tempo (×1, „1 min = 10 min”, „1 dzień = 1 tydzień”…), skok ±, konkretna data, nowa tura. Wszystkie loty liczą się w czasie gry, a ETA przesuwa się samo przy opóźnieniu lub zmianie czasu lotu.

## Bezpieczeństwo danych

- Każda operacja to **atomowy batch**: przy błędzie nic się nie zapisuje, a GM dostaje **Error ID** (`WW-2026-xxxxx`).
- **Cofanie**: 30 ostatnich operacji GM można cofnąć jednym kliknięciem.
- **Backupy**: automatycznie co X minut (gdy GM jest online), na końcu tury i przed ryzykownymi operacjami (usunięcie państwa, restore, import, masowa zmiana statystyk). Ręczne backupy z opisem i ⭐ KEEP FOREVER. Eksport i import do pliku JSON.
- **Restore** zawsze najpierw robi kopię obecnego stanu.
- **Logi techniczne** mają retencję od 24 h do bezterminowej i czyszczą się automatycznie. **Kronika świata** i backupy nie są z nimi kasowane.
- **Diagnostyka**: stan bazy, aktywni gracze, ostatni błąd, test spójności z automatyczną naprawą.

## Struktura

```
index.html            powłoka strony
css/style.css         wygląd (ciemna konsola, gazety, grafiki)
js/firebase-config.js ← TU wklejasz config i UID
js/app.js             start, logowanie, zegar, karta obiektu, powiadomienia
js/store.js           stan, widoczność, projekcje, operacje atomowe, backupy
js/map.js             mapa Leaflet i warstwy
js/units.js           samoloty, okręty, podróże, wywiad
js/panels.js          Feed, Kraj, Dyplomacja, Wywiad, Kronika
js/gm.js              panel GM
js/press.js           generator gazet i grafik wydarzeń
js/seed.js            przykładowy świat
js/places.js          249 państw, 640 miast, akweny i bazy (mapa: 241 państw i terytoriów)
vendor/               Leaflet, topojson, html2canvas, kontury państw, font flag
firestore.rules       reguły bezpieczeństwa
```

## Podkład mapy

Mapa działa **w 100% offline**, bez kluczy i zewnętrznych serwisów: ląd, granice 241 państw i terytoriów (Natural Earth, domena publiczna), siatka południków oraz podpisy stolic (od przybliżenia 5) i dużych miast (od 7). Nic nie trzeba aktualizować.

Opcjonalnie możesz wkleić darmowy klucz CARTO do `CARTO_KEY` w `js/firebase-config.js`. Dostaniesz wtedy szczegółowy podkład z drogami i rzekami oraz większe przybliżenie.
