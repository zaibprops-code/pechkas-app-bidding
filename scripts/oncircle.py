"""
The 3D pictures of the work (A123): from Figma's flat backdrop onto the yellow circle.

Figma's image tool draws each 3D picture on its own, at 1024 x 1024, on a flat
pale yellow (#FFF1C7) backdrop. The app shows every picture of the work on the
bright yellow circle (the screw head), so this lifts the object off its
backdrop, keeps its soft shadow, and puts the circle behind it:
the backdrop colour B is read from the border, and each pixel C is split
into a pure darkening of B (a shadow, C = s*B), kept as a shadow over
whatever is behind it, and anything else (the object), kept as it is.
Output: no background, the yellow circle, the object, and the shadow falling on both.

Use: python3 scripts/oncircle.py OUT_DIR picture.png [picture.png ...]
(writes OUT_DIR/<same name>, at most 420 px). Pillow and numpy.
The backdrop may be any plain pale colour: an object with yellowish or beige
parts (a damp stain, an old faded wall) is drawn on pale blue (#DCE8F5)
instead, or those parts come out see-through; grey and white parts need the
yellow one, where they cannot pass for a shadow.
Put --circle 1.3 (or another size) before a boxy object (a house, a room
corner) whose corners would otherwise hide the circle; the default is 0.92 of
the object's longest side.
Check every picture by eye on white and on the cream boxes before it goes in.
"""
import sys, numpy as np
from PIL import Image, ImageFilter
YEL = np.array([255, 197, 61], float)
def convert(src, dst, circle=0.92, out=420):
    a = np.asarray(Image.open(src).convert('RGB')).astype(float)
    H, W, _ = a.shape
    border = np.concatenate([a[:8].reshape(-1, 3), a[-8:].reshape(-1, 3), a[:, :8].reshape(-1, 3), a[:, -8:].reshape(-1, 3)])
    B = np.median(border, 0)
    s = (a @ B) / (B @ B)                          # how much of the backdrop colour each pixel is
    r = np.linalg.norm(a - s[..., None] * B, axis=-1)  # what is left: the object's own colour
    obj = np.clip((r - 7) / 16, 0, 1)
    # A shadow only darkens the backdrop a little. Anything much darker (a black battery, a
    # recorder box, a lens) is the object itself, or it would come out see-through.
    obj = np.maximum(obj, np.clip((0.62 - s) / 0.12, 0, 1))
    # Fill tiny holes and soften the edge by a pixel.
    m = Image.fromarray((obj * 255).astype('uint8')).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.7))
    obj = np.asarray(m).astype(float) / 255
    shade = np.clip(s, 0, 1)                       # 1 = plain backdrop, <1 = shadow
    # Where is the object? Its bounding box decides where the circle goes.
    ys, xs = np.nonzero(obj > 0.5)
    cy, cx = (ys.min() + ys.max()) / 2, (xs.min() + xs.max()) / 2
    R = circle * max(ys.max() - ys.min(), xs.max() - xs.min()) / 2
    yy, xx = np.mgrid[0:H, 0:W]
    d = np.sqrt((yy - cy) ** 2 + (xx - cx) ** 2)
    circ = np.clip(R - d + 0.5, 0, 1)              # antialiased disc
    # Behind the object: the circle (shadowed) where it is, else a transparent shadow.
    bg_rgb = YEL[None, None] * shade[..., None]
    bg_a = np.maximum(circ, (1 - shade) * 0.9)
    bg_col = np.where(circ[..., None] > 0, bg_rgb, 0)
    out_a = obj + (1 - obj) * bg_a
    with np.errstate(invalid='ignore', divide='ignore'):
        col = (obj[..., None] * a + (1 - obj[..., None]) * bg_a[..., None] * bg_col) / np.maximum(out_a[..., None], 1e-6)
    img = Image.fromarray(np.dstack([np.clip(col, 0, 255), np.clip(out_a, 0, 1) * 255]).round().astype('uint8'), 'RGBA')
    img = img.crop(img.getbbox()); img.thumbnail((out, out), Image.LANCZOS)
    img.save(dst, optimize=True)
if __name__ == '__main__':
    import os
    os.makedirs(sys.argv[1], exist_ok=True)
    circle, args = 0.92, sys.argv[2:]
    while args:
        src = args.pop(0)
        if src == '--circle':
            circle = float(args.pop(0))
        else:
            convert(src, os.path.join(sys.argv[1], os.path.basename(src)), circle=circle)
