#!/usr/bin/env python3
"""Regenerate README images from fresh QA captures (new worm + sprites)."""
from PIL import Image

QA = "/tmp/qa"
OUT = "/home/z/my-project/site/assets/img"

def save(img, name, target_wh):
    """Center-crop to target aspect, resize, save."""
    tw, th = target_wh
    src_ratio = img.width / img.height
    dst_ratio = tw / th
    if src_ratio > dst_ratio:  # too wide → crop width
        nw = int(img.height * dst_ratio)
        x0 = (img.width - nw) // 2
        img = img.crop((x0, 0, x0 + nw, img.height))
    else:  # too tall → crop height
        nh = int(img.width / dst_ratio)
        y0 = (img.height - nh) // 2
        img = img.crop((0, y0, img.width, y0 + nh))
    img = img.resize((tw, th), Image.LANCZOS)
    img.save(f"{OUT}/{name}.png")
    print(name, "->", img.size)

# replay-llm: the glm-4.6 run viewer (board + mind side by side)
save(Image.open(f"{QA}/site-run-llm.png"), "replay-llm", (1440, 1000))
# replay-bfs: the wyrm-bfs run viewer
save(Image.open(f"{QA}/site-run2.png"), "replay-bfs", (1440, 1000))
# levels: the gallery page (full height ~ matches old 4402)
img = Image.open(f"{QA}/site-levels.png")
img.save(f"{OUT}/levels.png")
print("levels ->", img.size)
# leaderboard: the index page
img = Image.open(f"{QA}/site-index.png")
img.save(f"{OUT}/leaderboard.png")
print("leaderboard ->", img.size)
