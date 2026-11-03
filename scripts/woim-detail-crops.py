#!/usr/bin/env python3
"""Ultra-tight worm face crops + object detail crops at full resolution."""
from PIL import Image, ImageDraw
import os

R = "/home/z/my-project/upload/woim-research"

# --- Face crops: find white eye blobs inside pink regions, crop tight ---
def face_crop(img, cx, cy, size=240, scale=3):
    L, T = max(0, cx - size), max(0, cy - size)
    Rr, B = min(img.width, cx + size), min(img.height, cy + size)
    crop = img.crop((L, T, Rr, B))
    return crop.resize((crop.width * scale, crop.height * scale), Image.LANCZOS)

specs = [
    ("ss-01", 996, 456), ("ss-03", 924, 288), ("ss-07", 816, 516),
    ("ss-13", 1036, 276), ("ref-owner", 876, 536), ("ss-09", 972, 600),
]
face_crops = []
for name, cx, cy in specs:
    img = Image.open(os.path.join(R, f"{name}.jpg"))
    face_crops.append((name, face_crop(img, cx, cy)))

W = max(c.width for _, c in face_crops)
H = max(c.height for _, c in face_crops)
sheet = Image.new("RGB", (3 * W, 2 * H), (25, 20, 15))
d = ImageDraw.Draw(sheet)
for i, (name, crop) in enumerate(face_crops):
    x, y = (i % 3) * W, (i // 3) * H
    sheet.paste(crop, (x, y))
    d.rectangle([x + 4, y + 4, x + 200, y + 36], fill=(0, 0, 0))
    d.text((x + 12, y + 10), f"{name} (3x zoom)", fill=(255, 220, 180))
sheet.save(os.path.join(R, "face-crops.jpg"), quality=90)
print("face-crops.jpg", sheet.size)

# --- Object montage: 400x400 crops from interesting areas ---
obj_specs = [
    ("ss-01", 400, 300, "garden top: flowers/soil"), ("ss-01", 1000, 700, "worm + tunnel"),
    ("ss-04", 500, 400, "clay world objects"), ("ss-04", 1300, 600, "gate/keys area"),
    ("ss-11", 700, 500, "slate bricks spikes"), ("ss-11", 1300, 500, "sliding gates"),
    ("ss-13", 600, 500, "red world worm+objects"), ("ss-13", 1200, 700, "red world details"),
    ("ss-02", 800, 500, "grey world + cyan pipes"), ("ss-08", 900, 600, "water area"),
    ("ss-06", 900, 500, "roots world"), ("ss-10", 800, 500, "grass world 2"),
    ("ss-05", 800, 500, "sand world"), ("ss-12", 700, 500, "lava world"),
]
crops = []
for name, cx, cy, label in obj_specs:
    img = Image.open(os.path.join(R, f"{name}.jpg"))
    half = 200
    L, T = max(0, cx - half), max(0, cy - half)
    Rr, B = min(img.width, cx + half), min(img.height, cy + half)
    crops.append((f"{name}: {label}", img.crop((L, T, Rr, B)).resize((400, 400), Image.LANCZOS)))

sheet2 = Image.new("RGB", (4 * 400, 4 * 400), (25, 20, 15))
d2 = ImageDraw.Draw(sheet2)
for i, (label, crop) in enumerate(crops):
    x, y = (i % 4) * 400, (i // 4) * 400
    sheet2.paste(crop, (x, y))
    d2.rectangle([x + 2, y + 2, x + 398, y + 26], fill=(0, 0, 0))
    d2.text((x + 8, y + 7), label, fill=(255, 220, 180))
sheet2.save(os.path.join(R, "object-crops.jpg"), quality=88)
print("object-crops.jpg", sheet2.size)
