#!/usr/bin/env python3
"""Extract the true WOIM palette from official screenshots + owner reference."""
from PIL import Image
import glob, os
from collections import Counter

RESEARCH = "/home/z/my-project/upload/woim-research"

def dominant_colors(img, n=8):
    """Quantize to find dominant color clusters."""
    small = img.convert("RGB").resize((160, 90))
    # adaptive palette quantize
    q = small.quantize(colors=n, method=Image.MEDIANCUT)
    pal = q.getpalette()
    counts = Counter(q.getdata())
    out = []
    for idx, cnt in counts.most_common(n):
        r, g, b = pal[idx*3:idx*3+3]
        out.append((f"#{r:02x}{g:02x}{b:02x}", cnt))
    return out

files = sorted(glob.glob(os.path.join(RESEARCH, "ss-*.jpg"))) + [os.path.join(RESEARCH, "ref-owner.jpg")]

print("=" * 70)
print("PER-IMAGE DOMINANT PALETTE (top 8 clusters)")
print("=" * 70)
for f in files:
    img = Image.open(f)
    name = os.path.basename(f)
    cols = dominant_colors(img)
    total = sum(c for _, c in cols)
    row = "  ".join(f"{hex} {cnt*100//total}%" for hex, cnt in cols)
    print(f"{name:16s} {row}")

# Aggregate: count pixels near key hues across ALL images
print()
print("=" * 70)
print("GLOBAL COLOR CENSUS (all 14 images, hue buckets)")
print("=" * 70)
buckets = Counter()
samples = {}
for f in files:
    img = Image.open(f).convert("RGB").resize((192, 108))
    for (r, g, b) in img.getdata():
        # skip near-black and near-white
        if r + g + b < 60 or r + g + b > 720:
            continue
        mx, mn = max(r, g, b), min(r, g, b)
        sat = (mx - mn) / mx if mx else 0
        if sat < 0.12:
            buckets["neutral/gray"] += 1
            samples.setdefault("neutral/gray", (r, g, b))
            continue
        # rough hue classification
        import colorsys
        h, s, v = colorsys.rgb_to_hsv(r/255, g/255, b/255)
        hd = h * 360
        if hd < 15 or hd >= 345: bucket = "red"
        elif hd < 45: bucket = "orange/brown"
        elif hd < 70: bucket = "yellow/gold"
        elif hd < 160: bucket = "green"
        elif hd < 200: bucket = "cyan"
        elif hd < 260: bucket = "blue"
        elif hd < 300: bucket = "purple"
        else: bucket = "pink/magenta"
        buckets[bucket] += 1
        # keep darkest-then-richest sample
        if bucket not in samples or s > samples[bucket][3]:
            samples[bucket] = (r, g, b, s)

total = sum(buckets.values())
for name, cnt in buckets.most_common():
    smp = samples.get(name, (0, 0, 0, 0))
    hexv = f"#{smp[0]:02x}{smp[1]:02x}{smp[2]:02x}"
    print(f"  {name:14s} {cnt*100/total:5.1f}%   richest sample {hexv}")

# Contact sheet for one-shot viewing
print()
print("Building contact sheet...")
TH_W, TH_H = 480, 270
COLS = 4
rows = (len(files) + COLS - 1) // COLS
sheet = Image.new("RGB", (COLS * TH_W, rows * TH_H), (20, 16, 12))
for i, f in enumerate(files):
    img = Image.open(f).convert("RGB").resize((TH_W, TH_H))
    x = (i % COLS) * TH_W
    y = (i // COLS) * TH_H
    sheet.paste(img, (x, y))
sheet.save(os.path.join(RESEARCH, "contact-sheet.jpg"), quality=82)
print("saved contact-sheet.jpg", sheet.size)
