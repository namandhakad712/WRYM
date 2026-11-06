#!/usr/bin/env python3
"""Site QA sweep: internal links, placeholders, asset presence, data sanity."""
import json, os, re, sys

SITE = "site"
issues = []

# 1. internal link integrity
pages = [os.path.join(SITE, f) for f in os.listdir(SITE) if f.endswith(".html")]
for page in pages:
    html = open(page).read()
    for href in re.findall(r'(?:href|src)="([^"]+)"', html):
        if href.startswith(("http", "mailto:", "data:", "#", "javascript:")):
            continue
        target = href.split("#")[0].split("?")[0]
        if not target:
            continue
        path = os.path.join(SITE, target)
        if not os.path.exists(path):
            issues.append(f"{page}: broken local link -> {href}")

# 2. placeholder / junk scan
# NOTE: HTML placeholder="..." attributes, the "todo" CSS class,
# typeof ... !== "undefined" guards and the ICE glyph "_" runs inside
# level-grid strings are all legitimate — exclude them.
# case-sensitive: real leftover markers are uppercase (a "todo" css class is fine)
BAD = [r"\bTODO\b", r"\bFIXME\b", r"\bXXX\b", r"\bNaN\b", r"\blorem ipsum\b"]
for page in pages + [os.path.join(SITE, "assets", f) for f in os.listdir(os.path.join(SITE, "assets")) if f.endswith(".js")]:
    text = open(page).read()
    for pat in BAD:
        for m in re.finditer(pat, text):
            ctx = text[max(0, m.start()-40):m.end()+40].replace("\n", " ")
            issues.append(f"{os.path.basename(page)}: '{pat}' :: …{ctx}…")

# 3. JSON data files parse
for j in ["index.json", "levels.json", "models.json"]:
    try:
        json.load(open(os.path.join(SITE, "data", j)))
    except Exception as e:
        issues.append(f"data/{j}: {e}")

# 4. runs referenced by index exist
idx = json.load(open(os.path.join(SITE, "data", "index.json")))
run_dir = os.path.join(SITE, "data", "runs")
have = set(os.listdir(run_dir))
n_runs = idx["summary"].get("runs", 0)
if n_runs != len(have):
    issues.append(f"index.summary.runs={n_runs} but {len(have)} run docs on disk")

# 5. nav consistency: every page links every other page
for page in pages:
    html = open(page).read()
    base = os.path.basename(page)
    for other in pages:
        ob = os.path.basename(other)
        if ob == "run.html":
            continue  # replay detail page — linked contextually, not global nav
        if ob != base and f'href="./{ob}"' not in html:
            issues.append(f"{base}: nav missing ./{ob}")

# 6. pixel-art assets present
img_dir = os.path.join(SITE, "assets", "img")
imgs = sorted(os.listdir(img_dir)) if os.path.isdir(img_dir) else []
print(f"pixel assets in site/assets/img: {len(imgs)}")

print(f"pages: {len(pages)} · run docs on disk: {len(have)}")
if issues:
    print(f"\n{len(issues)} ISSUE(S):")
    for i in issues[:40]:
        print(" -", i)
    sys.exit(1)
print("site QA: CLEAN")
