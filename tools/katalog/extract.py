import fitz, re, json, sys, io, os
from PIL import Image
out = sys.argv[1]; os.makedirs(out, exist_ok=True)
CODE_1883 = re.compile(r'^(250RT\d+|PUR[A-Z]{2,3}RT\d+|ART\d+|RT\d?POMP|RT\d+)$')
CODE_LOT = re.compile(r'^(\d{3})?LOT[A-Z]+$')
result, log = {}, []

def save_xref(doc, xref, smask, code):
    pix = fitz.Pixmap(doc, xref)
    if smask:
        mask = fitz.Pixmap(doc, smask)
        try: pix = fitz.Pixmap(pix, mask)
        except Exception: pass
    if pix.n - pix.alpha >= 4: pix = fitz.Pixmap(fitz.csRGB, pix)
    img = Image.open(io.BytesIO(pix.tobytes('png'))).convert('RGBA')
    bg = Image.new('RGBA', img.size, (255, 255, 255, 255)); bg.alpha_composite(img)
    img = bg.convert('RGB')
    # trim white margins
    from PIL import ImageChops
    diff = ImageChops.difference(img, Image.new('RGB', img.size, (255,255,255)))
    bbox = diff.point(lambda v: 255 if v > 12 else 0).getbbox()
    if bbox: img = img.crop(bbox)
    img.thumbnail((240, 320), Image.LANCZOS)
    pad = Image.new('RGB', (max(img.width, 1), max(img.height, 1)), 'white'); pad.paste(img)
    pad.save(f'{out}/{code}.webp', 'WEBP', quality=82, method=6)
    return pad.size

for fname, rx, pages in (('1883.pdf', CODE_1883, range(3, 16)), ('lot.pdf', CODE_LOT, range(1, 8))):
    doc = fitz.open(fname)
    for pi in pages:
        page = doc[pi]
        words = page.get_text('words')
        codes = [(w[4], fitz.Rect(w[:4])) for w in words if rx.match(w[4])]
        imgs = []
        for im in page.get_image_info(xrefs=True):
            r = fitz.Rect(im['bbox'])
            if 25 < r.width < 240 and 60 < r.height < 300 and im['xref'] and not (r.width > 200 and r.height < 120):
                imgs.append((r, im['xref']))
        smasks = {x[0]: x[1] for x in page.get_images(full=True)}
        used = set()
        for code, cr in codes:
            cx = (cr.x0 + cr.x1) / 2
            best = None
            for idx, (r, xref) in enumerate(imgs):
                if idx in used: continue
                if not (r.x0 - 30 <= cx <= r.x1 + 30): continue
                gap = cr.y0 - r.y1
                if -15 <= gap <= 120 and (best is None or gap < best[0]): best = (gap, idx)
            if best is None:
                log.append(f'NO IMAGE {fname} p{pi+1} {code}'); continue
            used.add(best[1]); r, xref = imgs[best[1]]
            key = code
            n = 2
            while key in result: key = f'{code}__{n}'; n += 1
            if key != code: log.append(f'DUP {code} -> {key} p{pi+1}')
            size = save_xref(doc, xref, smasks.get(xref, 0), key)
            result[key] = {'file': f'{key}.webp', 'page': pi + 1, 'src': fname, 'size': size, 'y': round(cr.y0), 'x': round(cr.x0)}
        for idx, (r, xref) in enumerate(imgs):
            if idx not in used: log.append(f'unused image {fname} p{pi+1} {tuple(round(v) for v in r)}')
json.dump(result, open(f'{out}/map.json', 'w'), indent=1)
print(len(result), 'images'); print('\n'.join(log))
