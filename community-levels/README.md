# Community Levels

Submit a level to the WRYM arena **without leaving your browser** — through a
full professional review framework:

1. Open the **[Level Forge](https://namandhakad712.github.io/WRYM/forge.html)**
   on the docs site, paint your level, press **Certify** (the real engine +
   BFS validator run in your tab), playtest it, fill the **submission card**
   (contributor name, GitHub handle, design intent, tags), then hit
   **Submit via pull request** — GitHub opens a PR with your file pre-filled.
2. **wyrm-bot** certifies the machine half within a minute (schema, structure,
   solvability, certificate honesty) and posts a structured review card with
   labels. Failed submissions are **returned to you** with exact fixes;
   pushing a fix re-certifies automatically.
3. A **maintainer** judges the human half (design, fun, originality) and
   either approves (`/wyrm approve` — auto-merge) or returns it with notes
   (`/wyrm request-changes <reason>`).
4. Merged levels go live on the public ladder with **your name on the
   certificate** — every future benchmark run plays them.

Or hand-write a JSON file here and open a PR yourself:

```json
{
  "schema": "wyrm.level/community-2",
  "name": "My Level",
  "slug": "my-level",
  "author": "your-handle",
  "grid": [
    "#########",
    "#..o@.*.#",
    "#..%..D.#",
    "#..X....#",
    "#########"
  ],
  "turnLimit": 60,
  "contributor": {
    "name": "Your Name",
    "github": "yourhandle",
    "intent": "what makes this level interesting - the idea a maintainer judges",
    "tags": ["logic"]
  }
}
```

Rules of the house (wyrm-bot enforces them):

- exactly one `@` worm head, one `X` heart goal, rectangular grid
- board 6–22 × 6–18, turn limit 4–240 (and ≥ optimal par)
- the level must be **solvable** under the exhaustive BFS validator
- the search space must stay under 25M states (CI terminates)
- no slug collisions with the official ladder
- the `contributor` card is required (name, valid GitHub handle, ≥ 20-char intent)
- difficulty is re-certified by CI on every PR — the number on the site is
  always the authoritative computation, never a claim
- one file per level, `<slug>.json`, submitted under `community-levels/`

Full governance: **[docs/COMMUNITY_PIPELINE.md](../docs/COMMUNITY_PIPELINE.md)** ·
watch the pipeline live: **[community board](https://namandhakad712.github.io/WRYM/community.html)**
