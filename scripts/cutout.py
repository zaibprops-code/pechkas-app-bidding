"""
Cutting the Figma pictures out of their backgrounds (A120, A121).

The pictures are made in Figma's image tool on a flat background: chroma green
(#00FF00) for the work pictures, cream for two of the welcome pictures. Cutting
at a fixed colour level left a thin green or olive rim round every picture,
because the soft edge pixels are part drawing, part background. This does it
properly:

1. the background is found (green by how much greener it is than its other
   channels; cream by filling in from the edges, so white clothes are safe);
2. the two pixels next to the background are always treated as edge;
3. every edge pixel takes the colour of the drawing just inside it, and its
   transparency is solved exactly from C = a*F + (1-a)*B.

Use: python3 scripts/cutout.py sheet.png COLS ROWS name1 name2 ... --out apps/mobile/assets/work
(cuts a sheet of COLS x ROWS pictures, left to right, top to bottom). Pillow and numpy.
Check every new picture by eye on yellow, white and a dark background before it goes in.
"""
from PIL import Image
import numpy as np

def unmix(img):
    """Chroma-key a pure-green background (0,255,0) cleanly.
    1. Pixels with no green spill are the drawing (opaque); pure green is background.
    2. Every edge pixel in between takes the colour of the nearest drawing pixel, so no
       green or olive is left in it.
    3. Its transparency is then solved exactly from that colour: C = a*F + (1-a)*G."""
    a = np.asarray(img.convert('RGB')).astype(np.float64)
    spill = a[..., 1] - np.maximum(a[..., 0], a[..., 2])
    bg = spill >= 240
    # The outer two pixels next to the background are always treated as edge, even when only
    # slightly green: those faint olive pixels are what drew a line round every picture.
    near = spill > 100
    for _ in range(2):
        near = near | np.roll(near, 1, 0) | np.roll(near, -1, 0) | np.roll(near, 1, 1) | np.roll(near, -1, 1)
    opaque = (spill <= 10) & ~near
    F = a.copy(); known = opaque.copy()
    for _ in range(8):                                   # grow the drawing's colours outward
        acc = np.zeros_like(F); cnt = np.zeros(known.shape)
        for dy, dx in ((-1,0),(1,0),(0,-1),(0,1),(-1,-1),(-1,1),(1,-1),(1,1)):
            sh = np.roll(np.roll(known, dy, 0), dx, 1); sf = np.roll(np.roll(F, dy, 0), dx, 1)
            acc += sf * sh[..., None]; cnt += sh
        new = (~known) & (cnt > 0)
        F[new] = acc[new] / cnt[new][:, None]
        known |= new
    spillF = F[..., 1] - np.maximum(F[..., 0], F[..., 2])
    with np.errstate(divide='ignore', invalid='ignore'):
        alpha = np.clip((255.0 - spill) / np.maximum(255.0 - spillF, 1), 0, 1)
    alpha[opaque] = 1.0; alpha[bg] = 0.0; alpha[~known] = 0.0
    alpha[alpha < 0.05] = 0.0
    out = np.dstack([np.clip(F, 0, 255), alpha * 255]).round().astype('uint8')
    return Image.fromarray(out, 'RGBA')

def cells(sheet, cols, rows, names, maxpx=300, edits=None):
    out = unmix(sheet)
    cw, ch = out.width // cols, out.height // rows
    res = {}
    for i, n in enumerate(names):
        t = out.crop(((i % cols) * cw, (i // cols) * ch, (i % cols + 1) * cw, (i // cols + 1) * ch))
        t = t.crop(t.getbbox())
        s = max(t.size) + 8
        sq = Image.new('RGBA', (s, s), (0, 0, 0, 0)); sq.paste(t, ((s - t.width) // 2, (s - t.height) // 2))
        if edits and n in edits: sq = edits[n](sq)
        if s > maxpx: sq = sq.resize((maxpx, maxpx), Image.LANCZOS)
        res[n] = sq
    return res

def save(img, path):
    img.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).save(path, optimize=True)

def _grow(F, known, steps=8):
    for _ in range(steps):
        acc = np.zeros_like(F); cnt = np.zeros(known.shape)
        for dy, dx in ((-1,0),(1,0),(0,-1),(0,1),(-1,-1),(-1,1),(1,-1),(1,1)):
            sh = np.roll(np.roll(known, dy, 0), dx, 1); sf = np.roll(np.roll(F, dy, 0), dx, 1)
            acc += sf * sh[..., None]; cnt += sh
        new = (~known) & (cnt > 0)
        F[new] = acc[new] / cnt[new][:, None]
        known = known | new
    return F, known

def unmix_flat(img, seeds_from=('top', 'left', 'right'), tol=22):
    """A plain (cream) background: found by filling from the chosen borders through pixels close
    to the corner colour, so white clothes inside the drawing are never taken as background.
    The two pixels next to it are recoloured from inside and given their exact transparency."""
    from PIL import ImageDraw
    a = np.asarray(img.convert('RGB')).astype(np.float64)
    B = a[3, 3].copy()
    near = (np.abs(a - B).max(axis=2) < tol)
    m = Image.fromarray((near * 255).astype('uint8'), 'L').copy()
    H, W = near.shape
    pts = []
    if 'top' in seeds_from: pts += [(x, 0) for x in range(0, W, 4)]
    if 'left' in seeds_from: pts += [(0, y) for y in range(0, H, 4)]
    if 'right' in seeds_from: pts += [(W - 1, y) for y in range(0, H, 4)]
    for p in pts:
        if m.getpixel(p) == 255: ImageDraw.floodfill(m, p, 128)
    bg = np.asarray(m) == 128
    ring = bg.copy()
    for _ in range(2):
        ring = ring | np.roll(ring, 1, 0) | np.roll(ring, -1, 0) | np.roll(ring, 1, 1) | np.roll(ring, -1, 1)
    ring &= ~bg
    inside = ~bg & ~ring
    F, _ = _grow(a.copy(), inside.copy())
    d = F - B
    with np.errstate(divide='ignore', invalid='ignore'):
        alpha = np.clip(((a - B) * d).sum(2) / np.maximum((d * d).sum(2), 1), 0, 1)
    alpha[inside] = 1.0; alpha[bg] = 0.0
    alpha[alpha < 0.05] = 0.0
    return Image.fromarray(np.dstack([np.clip(F, 0, 255), alpha * 255]).round().astype('uint8'), 'RGBA')

def frame_like(new, old_size=720, margin=0):
    t = new.crop(new.getbbox()); s = max(t.size) + margin
    sq = Image.new('RGBA', (s, s), (0, 0, 0, 0)); sq.paste(t, ((s - t.width) // 2, (s - t.height) // 2))
    return sq.resize((old_size, old_size), Image.LANCZOS)


if __name__ == '__main__':
    import argparse, os
    p = argparse.ArgumentParser()
    p.add_argument('sheet'); p.add_argument('cols', type=int); p.add_argument('rows', type=int)
    p.add_argument('names', nargs='+'); p.add_argument('--out', default='.')
    o = p.parse_args()
    for n, im in cells(Image.open(o.sheet), o.cols, o.rows, o.names).items():
        save(im, os.path.join(o.out, n + '.png'))
