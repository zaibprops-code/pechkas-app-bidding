# Put a trade's "now" and "new" screens side by side for the owner (A123 mocks).
# Use: python3 scripts/shots/compare.py NOW_DIR NEW_DIR OUT_PREFIX "New (3D)"
# writes OUT_PREFIX-390.jpg and OUT_PREFIX-320.jpg. Pillow.
import sys
from PIL import Image, ImageDraw, ImageFont
now, new, out = sys.argv[1:4]
label = sys.argv[4] if len(sys.argv) > 4 else 'New (3D)'
try: f = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 30)
except OSError: f = ImageFont.load_default()
for W in (390, 320):
    names = ['p1-page', 'p1b-page-down', 'p2-post', 'p3-home']
    rows = [[Image.open(f'{d}/{n}-{W}.jpg') for n in names] for d in (now, new)]
    w, h = rows[0][0].size; g = 24
    c = Image.new('RGB', (4 * w + 5 * g, 2 * h + 3 * g + 90), (255, 255, 255)); dr = ImageDraw.Draw(c)
    for r, (lab, row) in enumerate(zip(['Now', label], rows)):
        y = g + r * (h + g + 45); dr.text((g, y), lab, fill=(20, 23, 26), font=f)
        for i, im in enumerate(row): c.paste(im, (g + i * (w + g), y + 45))
    c.save(f'{out}-{W}.jpg', quality=86)
