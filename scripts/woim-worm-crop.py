#!/usr/bin/env python3
"""Auto-locate the pink worm in WOIM screenshots and crop close-ups."""
from PIL import Image
import glob, os

RESEARCH = "/home/z/my-project/upload/woim-research"

def find_pink_bbox(img):
    """Find the largest concentration of pastel-pink pixels (the worm)."""
    w, h = img.size
    small = img.convert("RGB").resize((w // 4, h // 4))
    sw, sh = small.size
    px = small.load()
    pts = []
    for y in range(sh):
        for x in range(sw):
            r, g, b = px[x, y]
            # pastel pink: high R, mid G, mid-high B, R > B > G roughly
            if r > 180 and 110 < g < 190 and 130 < b < 200 and r > b > g:
                pts.append((x, y))
    if not pts:
        return None
    # largest cluster = simple bbox of dense region via median center
    xs = sorted(p[0] for p in pts)
    ys = sorted(p[1] for p in pts)
    cx, cy = xs[len(xs)//2], ys[len(ys)//2]
    # bbox around center covering 80% of points
    x0, x1 = xs[int(len(xs)*0.1)], xs[int(len(xs)*0.9)]
    y0, y1 = ys[int(len(ys)*0.1)], ys[int(len(ys)*0.9)]
    return (cx * 4, cy * 4, x0 * 4, x1 * 4, y0 * 4, y1 * 4)

crops = []
for f in sorted(glob.glob(os.path.join(RESEARCH, "ss-*.jpg"))) + [os.path.join(RESEARCH, "ref-owner.jpg")]:
    img = Image.open(f)
    bbox = find_pink_bbox(img)
    name = os.path.basename(f).replace(".jpg", "")
    if bbox:
        cx, cy, x0, x1, y0, y1 = bbox
        # crop a generous square around the worm
        pad = 220
        L = max(0, cx - pad); T = max(0, cy - pad)
        R = min(img.width, cx + pad); B = min(img.height, cy + pad)
        crop = img.crop((L, T, R, B)).resize((440, 440))
        crops.append((name, crop))
        print(f"{name}: worm center at ({cx},{cy})")
    else:
        print(f"{name}: no pink found")

# Stack crops into a grid
if crops:
    COLS = 4
    rows = (len(crops) + COLS - 1) // COLS
    sheet = Image.new("RGB", (COLS * 440, rows * 440), (25, 20, 15))
    from PIL import ImageDraw
    d = ImageDraw.Draw(sheet)
    for i, (name, crop) in enumerate(crops):
        x = (i % COLS) * 440
        y = (i // COLS) * 440
        sheet.paste(crop, (x, y))
        d.rectangle([x+2, y+2, x+120, y+26], fill=(0, 0, 0))
        d.text((x+8, y+8), name, fill=(255, 220, 180))
    sheet.save(os.path.join(RESEARCH, "worm-crops.jpg"), quality=88)
    print("saved worm-crops.jpg", sheet.size, "with", len(crops), "crops")
