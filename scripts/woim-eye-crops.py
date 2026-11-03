#!/usr/bin/env python3
"""Definitive head/eye crops at 4x zoom from official screenshots."""
from PIL import Image, ImageDraw
import os

R = "/home/z/my-project/upload/woim-research"

# (name, cx, cy, label) — centers on white eye blobs found by pixel scan
specs = [
    ("ss-07", 722, 477, "ss-07 blob A"),
    ("ss-07", 928, 477, "ss-07 blob B"),
    ("ss-03", 828, 324, "ss-03 eye"),
    ("ss-01", 966, 447, "ss-01 head"),
    ("ss-13", 1036, 276, "ss-13 head"),
    ("ss-09", 972, 600, "ss-09 head"),
]
CROP, ZOOM = 130, 3
tiles = []
for name, cx, cy, label in specs:
    img = Image.open(os.path.join(R, f"{name}.jpg")).convert("RGB")
    L, T = max(0, cx - CROP), max(0, cy - CROP)
    Rp, B = min(img.width, cx + CROP), min(img.height, cy + CROP)
    c = img.crop((L, T, Rp, B))
    c = c.resize((c.width * ZOOM, c.height * ZOOM), Image.LANCZOS)
    tiles.append((label, c))

W = max(c.width for _, c in tiles)
H = max(c.height for _, c in tiles)
sheet = Image.new("RGB", (3 * W, 2 * H), (25, 20, 15))
d = ImageDraw.Draw(sheet)
for i, (label, c) in enumerate(tiles):
    x, y = (i % 3) * W, (i // 3) * H
    sheet.paste(c, (x, y))
    d.rectangle([x + 6, y + 6, x + 460, y + 44], fill=(0, 0, 0))
    d.text((x + 14, y + 14), f"{label} (3x)", fill=(255, 220, 180))
sheet = sheet.resize((sheet.width // 2, sheet.height // 2), Image.LANCZOS)
sheet.save(os.path.join(R, "eye-crops.jpg"), quality=90)
print("eye-crops.jpg", sheet.size)
