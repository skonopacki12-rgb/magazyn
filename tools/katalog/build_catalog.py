import re, json, shutil, os, sys
OUT = sys.argv[1]
os.makedirs(f'{OUT}/img', exist_ok=True)
imap = json.load(open('imgs/map.json'))
items = []

def add(id, code, name, brand, cat, size, img_key, source):
    items.append({'id': id, 'code': code, 'name': name, 'brand': brand, 'cat': cat, 'size': size,
                  'image': f'/katalog/img/{id}.webp' if img_key in imap else None, '_img': img_key, 'source': source})

# ---------- 1883 (price list pages 2–3) ----------
SECTION = None
sections = {
    'Syropy Routin 1883 1L': ('syropy', None), 'Syropy Routin 1883 Sugar Free 1L': ('syropy', None),
    'Syropy Routin 1883 0,25L': ('syropy', '250 ml'), 'Puree Routin 1883 1L': ('puree', '1 l'),
    'Sosy Routin 1883 0,5L': ('sosy', '0,5 l'), 'Sosy Routin 1883 1,89L': ('sosy', '1,89 l'),
    'ARTONIC': ('napoje', None), 'Pompki Routin 1883': ('akcesoria', None),
}
row = re.compile(r'^\s*(\S+)\s+(.+?)\s{2,}\d+,\d{2}')
for line in open('folders/1883.txt', encoding='utf-8'):
    m = re.search(r'CENNIK (.+?)\s*$', line)
    if m: SECTION = m.group(1).strip(); continue
    if not SECTION or SECTION not in sections: continue
    r = row.match(line)
    if not r or not re.match(r'^(250RT\d+|PUR[A-Z]+RT\d+|ART\d+|RT\d?POMP|RT\d+)$', r.group(1)): continue
    code, raw = r.group(1), r.group(2).strip()
    cat, size = sections[SECTION]
    if cat == 'syropy':
        base = re.sub(r'^Syrop 1883 Routin ', '', raw)
        if '700ml' in base: size = '700 ml'
        elif '250ml' in base: size = '250 ml'
        else: size = size or '1 l'
        pet = 'PET' in base
        base = re.sub(r',?\s*(szklana|plastikowa|platikowa)?\s*butelka.*$', '', base).strip().rstrip(',')
        base = re.sub(r'\s*butelka PET 1L$', '', base)
        name = f'Syrop 1883 {base} {size}' + (' (PET)' if pet else '')
    elif cat == 'puree':
        name = 'Puree 1883 ' + re.sub(r'^Puree Owocowe 1883 Routin | 1L$', '', raw) + ' 1 l'
    elif cat == 'sosy':
        name = 'Sos 1883 ' + re.sub(r'^Sos 1883 Routin | 0,5L$| 1,89L$', '', raw) + f' {size}'
    elif cat == 'napoje':
        m2 = re.match(r'(.+) (0,7L|0,75L)$', raw)
        size = '700 ml' if m2.group(2) == '0,7L' else '750 ml'
        n = m2.group(1).title().replace('Artonic', 'Artonic')
        name = f'{n} {size}'
    else:
        size = '15 ml' if '15ml' in raw else '8 ml'
        what = 'do puree' if 'puree' in raw else 'do syropów'
        fits = 'butelka szklana 1 l' if 'szklanej' in raw else 'butelka PET 1 l'
        name = f'Pompka 1883 {what} {size} ({fits})'
    name = re.sub(r'\s+', ' ', name)
    add(code, code, name, 'Artonic' if code.startswith('ART') else '1883 Maison Routin', cat, size, code, '1883 — cennik 03/2026')

# ---------- Lord of Taste (folder 10/2026) ----------
LOT = 'Lord of Taste'
def lot(code, name, cat, size, id=None, img=None):
    add(id or code, code, name, LOT, cat, size, img or code, 'Lord of Taste — folder 10/2026')
for code, n in [('LOTPURPAS','Marakuja'),('LOTPURMAN','Mango'),('LOTPURPLM','Śliwka'),('LOTPURAPL','Jabłko'),('LOTPURBAN','Banan'),
                ('LOTPURPEA','Gruszka'),('LOTPURRCU','Czerwona porzeczka'),('LOTPURRAS','Malina'),('LOTPURCUR','Czarna porzeczka'),
                ('LOTPURCHR','Wiśnia'),('LOTPURSTR','Truskawka'),('LOTPURPEC','Brzoskwinia'),('LOTPURLEM','Cytryna'),
                ('LOTPURGOL','Miechunka'),('LOTPURRED','Czerwone owoce'),('LOTPURAPR','Morela'),('LOTPURBLU','Borówka'),
                ('LOTPURSEA','Rokitnik'),('LOTPURWCU','Biała porzeczka'),('LOTPURPNG','Pink Guava'),('LOTPURPIN','Ananas')]:
    lot(code, f'Puree Lord of Taste {n} 1 kg', 'puree', '1 kg')
lot('LOTBASCLD', 'Baza lemoniadowa Lord of Taste 1 kg', 'puree', '1 kg')
lot('LOTPURPIN', 'Baza lemoniadowa Lord of Taste Mango 1 kg', 'puree', '1 kg', id='LOTPURPIN-BAZA', img='LOTPURPIN__2')
lot('LOTBASPEC', 'Baza lemoniadowa Lord of Taste Brzoskwiniowa 1 kg', 'puree', '1 kg')
for code, n in [('LOTMIXALE','Ginger Ale'),('LOTMIXGBE','Ginger Beer'),('LOTMIXIND','Indian Tonic Water'),('LOTMIXELD','Elderflower Tonic Water'),
                ('LOTMIXHIB','Hibiscus Tonic Water'),('LOTMIXLEM','Lemonade'),('LOTMIXROS','Rose Lemonade'),('LOTMIXWAT','Watermelon Lemonade'),
                ('LOTMIXCOK','Colonial Coke'),('LOTMIXGRA','Pink Grapefruit Lemonade'),('LOTMIXSAK','Sakura Tonic Water')]:
    lot(code, f'Lord of Taste Premium {n} 200 ml', 'napoje', '200 ml')
    items[-1]['packSize'] = 12  # folder: "OPAKOWANIE ZBIORCZE TACKA - 12 szt."
for code, n, s in [('LOTSUG','z trzciny cukrowej','700 ml'),('LOTELD','z kwiatu bzu','700 ml'),('LOTAGV','z agawy 100%','700 ml'),
                   ('LOTROS','z kwiatu róży','700 ml'),('LOTWLS','poziomkowy','700 ml'),('LOTQIN','z owoców pigwowca japońskiego','700 ml'),
                   ('LOTRAB','z rabarbaru','700 ml'),('LOTGOS','z agrestu','700 ml'),('LOTSLO','z tarniny','700 ml'),('250LOTMAP','klonowy 100%','250 ml')]:
    lot(code, f'Syrop Lord of Taste {n} {s}', 'syropy', s)
for code, n, s in [('LOTLIOORG','Pomarańcza bez skórki liofilizowana (puder)','50 g'),('LOTLIORAS','Malina liofilizowana (puder)','50 g'),
                   ('LOTLIOSTR','Truskawka liofilizowana (puder)','50 g'),('LOTLIOBET','Burak liofilizowany (puder)','50 g'),
                   ('LOTUBE','Proszek Ube Purple Magic','100 g'),('500LOTUBE','Proszek Ube Purple Magic','500 g'),
                   ('LOTDRDAPL','Jabłko suszone','70 g'),('LOTDRDLIM','Limonka suszona','100 g'),('LOTDRDLEM','Cytryna suszona','100 g'),
                   ('LOTDRDGRP','Grejpfrut suszony','90 g'),('LOTDRDBLO','Krwista pomarańcza suszona','100 g'),('LOTDRDPIN','Ananas suszony','100 g'),
                   ('LOTDRDORG','Pomarańcza suszona','100 g'),('LOTLOVPET','Posypka Miłość','50 g'),('LOTROSBUD','Suszone pąki róży','100 g'),
                   ('LOTROSPET','Suszone płatki róży','50 g'),('LOTEVEPETRED','Suszony wiecznik kulisty czerwony','50 g'),
                   ('LOTEVEPETVIO','Suszony wiecznik kulisty fioletowy','50 g'),
                   ('LOTMATCOD','Matcha codzienna','30 g'),('LOTMATTRA','Matcha tradycyjna','30 g'),('LOTMATLUK','Matcha luksusowa','30 g'),
                   ('500LOTMATCOD','Matcha codzienna','500 g'),('500LOTMATTRA','Matcha tradycyjna','500 g'),('500LOTMATKUL','Matcha kulinarna','500 g')]:
    lot(code, f'{n} Lord of Taste {s}', 'dodatki', s)
lot('500LOTMATKUL', 'Matcha kulinarna Lord of Taste 100 g', 'dodatki', '100 g', id='500LOTMATKUL-100G', img='500LOTMATKUL__2')

# ---------- checks & output ----------
ids = [i['id'] for i in items]
assert len(ids) == len(set(ids)), [x for x in ids if ids.count(x) > 1]
missing = [i['id'] for i in items if not i['image']]
used = {i['_img'] for i in items}
print('products', len(items), '| 1883', sum(i['brand'] != LOT for i in items), '| LoT', sum(i['brand'] == LOT for i in items))
print('no image:', missing); print('unused images:', sorted(set(imap) - used))
for i in items:
    if i['image']: shutil.copy(f"imgs/{imap[i['_img']]['file']}", f"{OUT}/img/{i['id']}.webp")
    del i['_img']
json.dump({'version': 1, 'sources': ['1883 Maison Routin — cennik dystrybutorów 03/2026', 'Lord of Taste — folder APS 10/2026'],
           'items': items}, open(f'{OUT}/katalog.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
