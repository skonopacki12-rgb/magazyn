# Magazyn

Aplikacja do prowadzenia magazynu brand ambasadora (syropy, puree, napoje, akcesoria):
stany, lista „Do zamówienia”, inwentaryzacja i karta produktu, z logowaniem i rejestracją.
Działa na telefonie, tablecie i laptopie.

- **Frontend:** React 18 + TypeScript + Vite
- **Backend:** Cloudflare Worker (`worker/`) — API pod `/api/*`; ten sam Worker serwuje aplikację
- **Dane:** Cloudflare D1 (SQLite) — użytkownicy, sesje i magazyn każdego użytkownika

## Wdrożenie na Cloudflare

Potrzebne: konto Cloudflare i Node.js 20+.

```bash
npm install
npx wrangler login
npx wrangler d1 create magazyn
```

Skopiuj `database_id` wypisany przez ostatnią komendę do `wrangler.jsonc`
(pole `d1_databases[0].database_id`), potem:

```bash
npm run db:migrate:remote
npm run deploy
```

Aplikacja będzie pod adresem `https://magazyn.<twoja-subdomena>.workers.dev`.
Własną domenę podłączysz w panelu Cloudflare: Workers & Pages → magazyn → Settings → Domains & Routes.

Kolejne wdrożenia: `npm run deploy`. Nowe migracje z katalogu `migrations/`: `npm run db:migrate:remote`.

### Automatyczne wdrożenia z GitHuba (opcjonalnie)

W panelu Cloudflare: Workers & Pages → magazyn → Settings → Builds → połącz repozytorium.
Komenda budowania: `npm run build`, komenda wdrożenia: `npx wrangler deploy`.

## Praca lokalna

```bash
npm install
npm run db:migrate:local   # tworzy lokalną bazę D1 w .wrangler/
npm run dev                # http://localhost:5173 — aplikacja + API + lokalna D1
```

## Jak to działa

- **Rejestracja / logowanie** (`/rejestracja`, `/logowanie`): hasła hashowane PBKDF2-SHA256
  (100 000 iteracji, losowa sól), sesja w ciasteczku `HttpOnly`, `SameSite=Lax`, `Secure` na HTTPS,
  ważna 30 dni. W bazie jest tylko skrót SHA-256 tokenu sesji.
- **Rejestracja jest zamknięta**, gdy w bazie istnieje już konto (aplikacja dla jednego właściciela).
  Dodatkowe adresy można dopuścić zmienną `ALLOWED_EMAILS` (lista po przecinku, `*@domena` = cała domena)
  w panelu Cloudflare: Workers & Pages → magazyn2 → Settings → Variables and Secrets.
- **Nowe konto** dostaje magazyn z 18 przykładowymi produktami.
- **Zapis danych:** zmiany widać od razu, a ok. 0,6 s później zapisują się w D1
  (natychmiast przy ukryciu/zamknięciu karty). Brak sieci → komunikat i ponawianie.
- **Zapis po częściach:** magazyn jest zapisywany jako 6 niezależnych części (produkty, inwentaryzacja,
  zamówienia, szkolenie, półki, dziennik), każda z własną wersją i limitem ~1,9 MB. Urządzenie wysyła
  tylko zmienione części.
- **Kilka urządzeń:** jeśli inne urządzenie zapisało tę samą część wcześniej, aplikacja scala zmiany
  element po elemencie (3-way): różne produkty/półki/partie łączą się; dopiero gdy oba urządzenia
  zmieniły ten sam element, wygrywa wersja z serwera (z komunikatem). Dziennik ruchów jest scalany zawsze.
- Migracje bazy: `npm run db:migrate:remote` (0002 tworzy tabelę `warehouse_parts`; stare dane przenoszą się
  same przy pierwszym odczycie).

### API

| Metoda | Ścieżka              | Opis                                       |
| ------ | -------------------- | ------------------------------------------ |
| POST   | `/api/auth/register` | `{ name, email, password }`                |
| POST   | `/api/auth/login`    | `{ email, password }`                      |
| POST   | `/api/auth/logout`   |                                            |
| GET    | `/api/auth/me`       | zalogowany użytkownik lub `null`           |
| GET    | `/api/state`         | magazyn użytkownika `{ data, version }`    |
| PUT    | `/api/state`         | `{ data, version }` → 409 przy konflikcie  |

## Raport i zużycie

Menu konta → **Raport i zużycie** (`/raporty`; link też po zakończeniu inwentaryzacji):
- wybór inwentaryzacji i porównanie z poprzednią: było, dostawy, straty (wyrzucone/inne), jest, **zużycie**
  (= było + dostawy + korekty − jest − straty) i średnie zużycie na miesiąc; wartości netto; eksport CSV,
- **sugerowane minimum** = średnie zużycie × zapas na 7–45 dni; zaznaczasz i „Ustaw zaznaczone minima”.

## Kopia zapasowa i eksport

Menu konta → **Kopia zapasowa i eksport** (`/kopia`):
- **Pobierz kopię** — pełny stan magazynu w pliku `.json`; **Przywróć z pliku** — zastępuje dane kopią (z potwierdzeniem).
- **Eksport CSV** dla Excela/Numbers: stany (z wartością), partie i terminy, historia inwentaryzacji, dziennik ruchów.

## Produkty z folderów

Przycisk **„Dodaj produkty z folderów (domyślne)”** (`/katalog`) otwiera listę 244 produktów
z folderów 1883 Maison Routin (03/2026) i Lord of Taste (10/2026) — ze zdjęciami, kodami i pojemnościami.
Można szukać, filtrować po marce i kategorii, zaznaczyć wiele naraz, ustawić minimum i jednostkę
(szt., op., ml, kg). Dodane produkty mają stan „Niepoliczony”, dopóki nie przejdą inwentaryzacji,
więc nie trafiają od razu na listę „Do zamówienia”. Produktów już dodanych nie da się dodać drugi raz.

**Ceny netto** pochodzą z folderów (1883: cena bazowa z cennika; Lord of Taste: aktualna cena z folderu)
i są w polu „Cena netto” produktu. Produkty dodane wcześniej dostają cenę automatycznie. Aplikacja pokazuje
wartość magazynu (lista stanów, eksport CSV) i przybliżoną wartość zamówienia.

Dane i zdjęcia: `public/katalog/` (zdjęcia wycięte z PDF, `.webp`). Jak odświeżyć z nowych folderów:
`tools/katalog/README.md`.

## FIFO: otwarte butelki i daty ważności

W inwentaryzacji przy każdym produkcie jest rozwijane „Otwarte i daty ważności”. Tam rozpisujesz sztuki
na partie: ile sztuk, zamknięta czy otwarta, data otwarcia i data ważności. Suma partii wpisuje się sama
jako „policzone”. „Bez zmian” przenosi partie z poprzedniej inwentaryzacji; wpisanie liczby ręcznie
usuwa rozpisanie na partie.

Po zakończeniu inwentaryzacji:
- karta produktu pokazuje partie w kolejności FIFO (najpierw otwarte, potem najkrótszy termin) z „Zużyj najpierw”,
- ekran **Terminy i otwarte** (`/terminy`, baner na liście i menu konta) zbiera partie po terminie,
  z terminem ≤ 14 dni i wszystkie otwarte butelki.

## Zamówienia i dostawy

**Zamówienia** (`/zamowienia`, zakładka „Do zamówienia” w menu):
- **Do zamówienia** — lista tworzy się sama z produktów poniżej minimum (po odjęciu tego, co już jest
  w drodze). Każdą pozycję można odznaczyć, zmienić jej ilość albo dopisać inny produkt z magazynu.
  Poniżej jest gotowa **lista kodów** (`kod ⇥ ilość`) i przycisk „Kopiuj kody”.
- **Dodaj do stanów jako oczekujące** — zaznaczone pozycje trafiają do zakładki **W drodze**.
- **W drodze** — przy dostawie wpisujesz ile dotarło, **półkę** i **datę ważności**, potem „Przyjmij”.
  Towar dochodzi do stanu jako nowa partia (zamknięta). Jeśli dotarło mniej, brakująca część zostaje
  jako oczekująca. Pozycję można też anulować. Dostawy trafiają do dziennika ruchów.

## Objętość i szybkie dodawanie w inwentaryzacji

Produkt ma **objętość butelki/opakowania** (pole w formularzu, ml lub g). Produkty z folderów mają ją
z rozmiaru („1 l” → 1000 ml), a pozostałe — z końca nazwy („… 0,7 l” → 700 ml), dopóki nie wpiszesz jej ręcznie.

W inwentaryzacji przy każdym produkcie są przyciski:
- **+ Pełna butelka** — dodaje jedną zamkniętą, pełną butelkę jako partię FIFO (+1 szt.; przy liczeniu w ml
  dodaje pojemność, np. +700 ml). Kolejne kliknięcia zwiększają tę samą partię.
- **+ Zgrzewka (12 szt.)** — przy produktach w zgrzewkach (mixery Lord of Taste) dodaje pełną zgrzewkę.

- **+ Otwarta butelka** — dodaje otwartą butelkę (data otwarcia: dziś). Przy liczeniu w ml pyta, ile zostało:
  ¾, ½, ¼ pojemności albo wpisane ml; przy sztukach dodaje 1 otwartą.

## Skanowanie kodów

Aparat telefonu/tabletu czyta kody kreskowe (EAN) i kody produktów (biblioteka ZXing — działa też w Safari
na iPhonie/iPadzie; ładuje się dopiero po otwarciu skanera). Kod można też wpisać ręcznie.
- **Nieznany kod** → wybierasz produkt, kod zapisuje się w polu „Kod kreskowy (EAN)” i następnym razem rozpozna się sam.
- **Wyszukiwanie** (ikona obok „+” / obok pola szukania) — otwiera zeskanowany produkt.
- **Inwentaryzacja** — „Skanuj butelki”: każdy skan = +1 pełna butelka. Ta sama butelka liczy się raz,
  dopóki nie zniknie z kadru (przesuń na następną).
- **Szkolenie** — skan dodaje kod do listy; **liczenie półki** — skan = +1 na tej półce.
- Formularz produktu — pole EAN z przyciskiem skanowania.

## Inwentaryzacja po półkach

`/inwentaryzacja/polki` (przycisk „Po półkach” w inwentaryzacji, „Policz tę półkę” w układzie półki):
- lista półek (z partii i z układów) ze statusem: nie sprawdzona / sprawdzone N z M / sprawdzona dziś,
- na półce: podgląd i lista produktów (wg partii na tej półce, a gdy ich brak — wg ułożenia);
  przy każdym **− / +** albo wpisana ilość oraz **„Zgadza się”**,
- **kliknięcie butelki** na podglądzie usuwa ją z półki i ze stanu,
- **„Znaleziony produkt na tej półce”** dodaje produkt na stan i na półkę,
- **każda zmiana zapisuje się od razu**: stan produktu, partie na tej półce (zmniejszanie zabiera najpierw
  to, co w FIFO jest na końcu, więc otwarte butelki zostają) i ułożenie butelek w miejscach;
  w dzienniku wpis „Korekta na półce”,
- **„Półka sprawdzona”** zamyka półkę i przechodzi do następnej.

## Zgrzewki

Produkt może mieć **opakowanie zbiorcze** (pole w formularzu produktu, np. 12). Mixery Lord of Taste
mają 12 automatycznie (folder: „tacka 12 szt.”).
- W inwentaryzacji wpisujesz liczbę butelek i klikasz **„Rozłóż na zgrzewki po 12”** — np. 30 → 12 + 12 + 6.
  Każda zgrzewka to siatka **3 × 4** butelek: klik w k-tą butelkę = k butelek w zgrzewce.
  Partię można przełączyć na **Luzem**, dodać zgrzewkę albo butelki luzem; „Półka i data jak w 1.
  dla wszystkich” kopiuje półkę i datę.
- Każda zgrzewka to osobna partia (z półką i datą), więc działa w FIFO, szkoleniu i terminach.
- Dostawa produktu w zgrzewkach sama rozkłada się na zgrzewki po 12.

## Układ półek (planogram)

**Półki** (`/polki`, link w górnym pasku, ikona na telefonie i w menu konta):
- Półka (nazwa jak w polu „Półka” w partiach, np. `A2`) ma **rzędy**, a rząd ma **miejsca** — w każdym
  miejscu stoi jedna butelka. Liczbę miejsc ustawiasz graficznie: klik w k-ty kwadrat = k miejsc
  (klik w ostatni zaznaczony usuwa jedno). Rzędy można dodawać, usuwać i przesuwać.
- **Produkty** — klikasz miejsce i wybierasz produkt (opcja: wypełnij wszystkie puste miejsca w rzędzie).
  Produkty, które według partii leżą na tej półce, są podpowiadane jako pierwsze.
- Na półkę wstawiasz **tylko produkty ze stanem** (policzone w inwentaryzacji lub przyjęte z dostawy).
  Jedno miejsce = jedna butelka, więc produktu nie da się postawić więcej razy, niż jest butelek na stanie
  (licząc wszystkie półki). Gdy stan spadnie (szkolenie, wyrzucenie), nadmiarowe miejsca są czerwone
  i można je opróżnić jednym przyciskiem.
- **Podgląd** — półka „jak w rzeczywistości”: deski i zdjęcia butelek w miejscach; opcjonalnie stany na
  tej półce (wg partii), otwarte butelki i terminy oraz podpisy.

- **Drukuj planogram** (w podglądzie) — kartka A4 w poziomie: nazwa półki, data, półka ze zdjęciami
  i podpisami oraz lista butelek rząd po rzędzie (z kodami) — do powieszenia przy regale.

Przy przyjęciu dostawy **„Podziel na partie”** pozwala rozpisać jedną pozycję na kilka partii —
każda z własną ilością, półką i datą ważności.

## Półki i szkolenie

Każda partia ma pole **Półka** (np. A2) — wpisujesz je w inwentaryzacji; aplikacja podpowiada półki już używane.

**Szkolenie** (`/szkolenie`, zakładka w menu):
1. Wklejasz listę kodów (każdy w nowej linii albo po przecinku/spacji; ten sam kod 2× = 2 szt.).
2. Aplikacja układa listę do zebrania **według półek** i dla każdego produktu podsuwa partię FIFO:
   najpierw otwartą, potem z najkrótszą datą (przeterminowane na końcu). Można wybrać inną partię.
   Nieznane kody i produkty bez stanu są wypisane osobno. Sesja zapisuje się w chmurze.
   Zamiast wklejać kody można wybrać półkę i **klikać butelki na jej podglądzie** — każde kliknięcie dodaje kod.
3. **Koniec szkolenia** — dla każdej pozycji: *Odłóż* (na półkę, z której wzięto, albo inną; zejście —
   ile zużyto; zaznaczenie „otwarta”), *Zużyte do końca*, *Wyrzuć — zepsute* albo *Inne* (z powodem).
4. **Zatwierdź** aktualizuje stany i partie, a ruchy trafiają do dziennika „Ostatnie ruchy”.

## Ekrany

| Ścieżka           | Telefon (< 768px)            | Tablet (768–1279px)                 | Laptop (≥ 1280px)              |
| ----------------- | ---------------------------- | ----------------------------------- | ------------------------------ |
| `/`               | Wyszukiwarka + lista         | Lista po lewej, szczegóły po prawej | Tabela + panel „Do zamówienia” |
| `/zamowienia`     | Lista do odhaczenia + kopiuj | Panel zamówień                      | Panel zamówień                 |
| `/inwentaryzacja` | Lista do liczenia            | Karty z − / +                       | Tabela z filtrem i różnicą     |
| `/produkt/:id`    | Karta produktu i historia    | Wybrany produkt                     | Wybrany produkt                |
| `/katalog`        | Lista z folderów             | Lista z folderów (siatka)           | Lista z folderów (siatka)      |
| `/produkt/nowy`   | Formularz nowego produktu    | Formularz w panelu                  | Formularz w panelu             |

## Struktura

- `worker/` — API (logowanie, stan magazynu), hashowanie haseł
- `migrations/` — schemat bazy D1
- `src/auth.tsx`, `src/screens/AuthScreen.tsx` — logowanie i rejestracja
- `src/store.tsx` — stan magazynu i synchronizacja z serwerem
- `src/components/`, `src/screens/` — interfejs (telefon / tablet / laptop)
- `src/styles/app.css` — tokeny kolorów i style komponentów
