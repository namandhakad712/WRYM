#!/usr/bin/env python3
"""Sample exact worm pixel colors from the references."""
from PIL import Image
from collections import Counter
import os

R = "/home/z/my-project/upload/woim-research"

def sample_worm(name, cx, cy, rad=90):
    img = Image.open(os.path.join(R, f"{name}.jpg")).convert("RGB")
    cnt = Counter()
    for y in range(max(0, cy - rad), min(img.height, cy + rad)):
        for x in range(max(0, cx - rad), min(img.width, cx + rad)):
            r, g, b = img.getpixel((x, y))
            if r > 150 and b > 120 and r > b > g and (r - g) > 25:
                # quantize to 8-level to cluster
                q = (r // 12 * 12, g // 12 * 12, b // 12 * 12)
                cnt[q] += 1
    print(f"\n{name} @ ({cx},{cy}) — pink-family clusters:")
    for (r, g, b), n in cnt.most_common(7):
        print(f"  #{r:02x}{g:02x}{b:02x}  x{n}")

# worm centers found earlier
specs = [
    ("ss-01", 996, 456), ("ss-03", 924, 288), ("ss-07", 816, 516),
    ("ss-09", 972, 600), ("ss-13", 1036, 276), ("ref-owner", 876, 536),
]
for s in specs:
    sample_worm(*s)

# Eye sampling: find white blobs near worm center (sclera) and their size
def sample_eyes(name, cx, cy, rad=120):
    img = Image.open(os.path.join(R, f"{name}.jpg")).convert("RGB")
    whites = []
    for y in range(max(0, cy - rad), min(img.height, cy + rad)):
        for x in range(max(0, cx - rad), min(img.width, cx + rad)):
            r, g, b = img.getpixel((x, y))
            if r > 225 and g > 218 and b > 210 and abs(r - g) < 22 and abs(g - b) < 22:
                whites.append((x, y))
    if whites:
        xs = [p[0] for p in whites]; ys = [p[1] for p in whites]
        # cluster by x gaps
        xs_sorted = sorted(set(xs))
        clusters = []
        cur = [xs_sorted[0]]
        for a, b2 in zip(xs_sorted, xs_sorted[1:]):
            if b2 - a > 14:
                clusters.append(cur); cur = [b2]
            else:
                cur.append(b2)
        clusters.append(cur)
        big = [c for c in clusters if len(c) > 8]
        print(f"\n{name} white-blob x-clusters (candidate eyes): {len(big)}")
        for c in big[:6]:
            cxm = sum(c) / len(c)
            rows = [y for (x, y) in whites if abs(x - cxm) < 30]
            print(f"   cluster at x~{cxm:.0f} width~{c[-1]-c[0]} y-range {min(rows)}..{max(rows)}")

for s in specs[:6]:
    sample_eyes(*s)
