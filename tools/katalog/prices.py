import fitz, re, json
imap = json.load(open('imgs/map.json'))
PRICE = re.compile(r'^\d+,\d{2}$')
out = {}
doc = fitz.open('folders/lot.pdf')
pages = {}
for key, m in imap.items():
    if m['src'] != 'lot.pdf': continue
    pi = m['page'] - 1
    if pi not in pages:
        pages[pi] = [w for w in doc[pi].get_text('words')]
    words = pages[pi]
    cx, cy = m['x'], m['y']
    # current price: number on the "Opakowanie" line just above the "Kod:" line, right of it
    cands = [w for w in words if PRICE.match(w[4]) and cy - 16 <= w[1] <= cy + 1 and cx - 5 <= w[0] <= cx + 150]
    cands.sort(key=lambda w: (abs(w[1] - (cy - 9)), w[0]))
    out[key] = float(cands[0][4].replace(',', '.')) if cands else None
missing = [k for k, v in out.items() if v is None]
print('lot prices', len(out), 'missing', missing)
for k in ['LOTPURPAS', 'LOTPURMAN', 'LOTPURPIN', 'LOTPURPIN__2', 'LOTMIXIND', 'LOTMIXLEM', 'LOTSUG', '250LOTMAP', 'LOTUBE', '500LOTUBE', 'LOTDRDAPL', '500LOTMATKUL', '500LOTMATKUL__2', 'LOTMATLUK']:
    print(k, out.get(k))
json.dump(out, open('lot_prices.json', 'w'), indent=1)
