# Community Levels

Submit a level to the WRYM arena **without leaving your browser**:

1. Open the **[Level Forge](https://namandhakad712.github.io/WRYM/forge.html)**
   on the docs site, paint your level, press **Certify** (the real engine +
   BFS validator run in your tab), playtest it, then hit
   **Submit via pull request** — GitHub opens a PR with your file pre-filled.
2. Or hand-write a JSON file here and open a PR yourself:

```json
{
  "schema": "wyrm.level/community-1",
  "name": "My Level",
  "slug": "my-level",
  "author": "your-handle",
  "grid": [
    "#########",
    "#..o@.*.#",
    "#.......#",
    "#..X....#",
    "#########"
  ],
  "turnLimit": 60
}
```

Rules of the house (CI enforces them):

- exactly one `@` worm head, one `X` heart goal, rectangular grid
- the level must be **solvable** under the exhaustive BFS validator
- difficulty is re-certified by CI on every PR — the number on the site is
  always the authoritative computation, never a claim
- one file per level, `<slug>.json`, submitted under `community-levels/`

Once merged, the level joins the public ladder (atlas, replays, and every
future benchmark run) automatically.
