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
- **Nowe konto** dostaje magazyn z 18 przykładowymi produktami.
- **Zapis danych:** zmiany widać od razu, a ok. 0,6 s później zapisują się w D1
  (natychmiast przy ukryciu/zamknięciu karty). Brak sieci → komunikat i ponawianie.
- **Kilka urządzeń:** każdy zapis ma numer wersji. Jeśli inne urządzenie zapisało wcześniej,
  aplikacja wczytuje najnowszą wersję i pokazuje komunikat, zamiast po cichu nadpisać cudze zmiany.

### API

| Metoda | Ścieżka              | Opis                                       |
| ------ | -------------------- | ------------------------------------------ |
| POST   | `/api/auth/register` | `{ name, email, password }`                |
| POST   | `/api/auth/login`    | `{ email, password }`                      |
| POST   | `/api/auth/logout`   |                                            |
| GET    | `/api/auth/me`       | zalogowany użytkownik lub `null`           |
| GET    | `/api/state`         | magazyn użytkownika `{ data, version }`    |
| PUT    | `/api/state`         | `{ data, version }` → 409 przy konflikcie  |

## Produkty z folderów

Przycisk **„Dodaj produkty z folderów (domyślne)”** (`/katalog`) otwiera listę 244 produktów
z folderów 1883 Maison Routin (03/2026) i Lord of Taste (10/2026) — ze zdjęciami, kodami i pojemnościami.
Można szukać, filtrować po marce i kategorii, zaznaczyć wiele naraz, ustawić minimum i jednostkę
(szt., op., ml, kg). Dodane produkty mają stan „Niepoliczony”, dopóki nie przejdą inwentaryzacji,
więc nie trafiają od razu na listę „Do zamówienia”. Produktów już dodanych nie da się dodać drugi raz.

Dane i zdjęcia: `public/katalog/` (zdjęcia wycięte z PDF, `.webp`). Jak odświeżyć z nowych folderów:
`tools/katalog/README.md`.

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
