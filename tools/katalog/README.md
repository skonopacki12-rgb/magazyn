# Katalog „Dodaj produkty z folderów”

Lista produktów i zdjęcia w `public/katalog/` powstały automatycznie z folderów dostawców:

- `1883.pdf` — 1883 Maison Routin, cennik dystrybutorów 03/2026 (174 pozycje: syropy 1 l / 250 ml / Sugar Free, puree, sosy, Artonic, pompki)
- `lot.pdf` — Lord of Taste, folder APS 10/2026 (70 pozycji: puree, bazy lemoniadowe, mixery, syropy, proszki, susz, matcha)

Gdy przyjdzie nowy folder (w katalogu roboczym obok tych skryptów):

```bash
python3 -m venv venv && ./venv/bin/pip install pymupdf pillow
mkdir folders && cp <nowy-1883>.pdf folders/1883.pdf && cp <nowy-lot>.pdf folders/lot.pdf
pdftotext -layout folders/1883.pdf folders/1883.txt
cd folders && ../venv/bin/python ../extract.py ../imgs && cd ..
python3 build_catalog.py <ścieżka-do-repo>/public/katalog
```

- `extract.py` wycina zdjęcia i dopasowuje je do kodu podpisanego pod zdjęciem; wypisuje kody bez zdjęcia
  i zdjęcia bez kodu — sprawdź je ręcznie.
- `build_catalog.py` czyta cennik 1883 z tekstu PDF; lista Lord of Taste jest w nim wpisana ręcznie
  (folder nie ma tabeli), więc nowe pozycje dopisz tam.

Uwagi do folderów 2026:
- Lord of Taste: „Ananas” i „Baza lemoniadowa Mango” mają w folderze ten sam kod `LOTPURPIN`;
  „Matcha kulinarna 100g” ma kod `500LOTMATKUL` (jak wersja 500 g). Kody zostawiono jak w folderze,
  zdjęcia przypisano po położeniu na stronie.
- Ceny nie są importowane.
