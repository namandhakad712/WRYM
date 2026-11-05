# WRYM · Extreme Level Design Research Dossier

*Deep research conducted 2026-11-05 to build Tier V — "The Fifth Circle".*
*Every claim below is sourced from public pages actually consulted. The five
Tier V levels (`27`–`31`) are direct implementations of the patterns this
research surfaced.*

---

## 1 · The game we benchmark against — WOIM (Dogspawn, 2026)

WOIM is the commercial grid-worm puzzler whose design DNA this benchmark
follows. Verified facts from its Steam store page and press coverage:

- **Developer/Publisher:** dogspawn.net · **Released:** Oct 21, 2026 · $9.99 ·
  "Very Positive" (97% of 67 reviews) — source:
  <https://store.steampowered.com/app/4272020/WOIM>
- **Genre tags:** Puzzle · Sokoban · Snake · grid-based, **no timing or
  dexterity, no elements of chance** — sources: Steam tags; Thinky Games
  catalog entry <https://thinkygames.com/games/woim>
- **Core verbs (from the Steam description):** eating apples, opening doors,
  pushing rocks, carrying eggs, pressing buttons, unlocking padlocks — and
  the signature mechanic: **"cut yourself in half… making new friends (that
  were once part of you)"**. The worm's own body is a consumable resource.
- Built in Godot (demo thread on r/godot). A playable demo shipped before
  release.

**What we adopted:** the split action (front half keeps the head, back half
becomes inert "remains" that carry plate weight and block slides), apples as
growth currency, padlocks/keys, buttons/doors, and the strictly
turn-based/no-luck contract that makes the game a *computable* benchmark.

## 2 · The genre's hardest public designs — and why they're hard

### Snakebird (Noumenon Games)
"Quite possibly the hardest puzzle game on Android… fiendishly difficult"
— r/AndroidGaming ode thread; the Black Box review
(<https://noplatform.wordpress.com/2015/08/14/indie-game-radar-snakebird>)
identifies the exact difficulty mechanism:

> "you really have to plan ahead to avoid putting yourself in unwinnable
> situations, which can occur with a single wrong button press."

Each biome adds a gimmick and "immediately tosses you into shockingly complex
applications". **Patterns adopted:** (a) one-wrong-press unwinnability —
our threat dimension measures exactly this; (b) fruit-order length
contracts — eating in the wrong order leaves the worm the wrong length for a
later squeeze (see `28-salamis`: rows are single sweeps, apple order *is*
the puzzle); (c) the body as terrain.

### Stephen's Sausage Roll (increpare)
"meticulous puzzle design and tough-as-nails difficulty" — Thinky Games
10-year retrospective (<https://thinkygames.com/features/10-years-of-grilling-...>).
Its signature is **chains of irreversible acts**: every push permanently
changes the world, and the fork cannot strafe while holding a sausage
(Wikipedia). **Adopted:** our irreversibility dimension counts permanent
mutations on the optimal line (digs, unlocks, valve lock-ins, burned
bridges, splits). `30-six-seals` is six permanent acts on one committed
line.

### Sokoban — the complexity gold standard
Sokoban is **PSPACE-complete** (Culberson 1997,
<http://sokoban.dk/wp-content/uploads/2016/02/Sokoban-is-PSPACE-complete.pdf>;
Hearn & Demaine's sliding-block proof, arXiv cs/0205005). The proofs build
levels out of **corridor "registers"** — long one-way commitment structures.
**Adopted:** valve corridors as commitment devices; the engine's
`stateKey` folds mutable terrain exactly like a Sokoban deadlock analysis.
Sokoban wiki research index: <http://sokobano.de/wiki/index.php?title=Scientific_research>

### Snake / Nibbler — PSPACE-complete too
De Biasi 2018, *The complexity of snake and undirected NCL variants*
(<https://www.sciencedirect.com/science/article/pii/S0304397517307946>):
collecting items in arbitrarily sized Snake levels is PSPACE-complete —
**growth management is the complexity engine**. Our apple/growth/split
economy is a bounded instance of exactly this.

### Would You Love Me If I Was a Snake? (Icely Puzzles, 2026)
"Bite your own tail off to create new blocks… Push objects, block lasers,
teleport" — Steam <https://store.steampowered.com/app/4284670/> and Thinky
Games. **Adopted:** body-as-consumable-tool. Our `29-absolute-zero` forces
the worm to **split mid-slide so its own remains become the stop-block the
next slide needs** — the certified optimal line does this twice.

### Can of Wormholes / nuworm / Pipe Push Paradise
- Can of Wormholes: "wriggle worms into position" — worm segments as
  terrain (Thinky Games).
- nuworm devlog (<https://cubestudio.itch.io/nuworm/devlog/1033903/>):
  the author hunts for "action at a distance" rules — effects that are
  neither global nor adjacent (islands, linked blocks). **Adopted:**
  plate-in-one-room opens a door across the map.
- Pipe Push Paradise review (Steam): pieces that *spin* when pushed one
  way but slide when pushed another — **orientation-dependent pushes**
  → our valve arrows (`> < ^ v`) are the movement-side analogue.

## 3 · The ten extreme-difficulty patterns (and where they live in Tier V)

| # | Pattern (source game) | Implementation recipe | Tier V level |
|---|---|---|---|
| 1 | One-wrong-press unwinnability (Snakebird) | dense spike lattice; every legal alternative probed for fatality | `28-salamis`, threat dim |
| 2 | Fruit-order length contracts (Snakebird) | apples sequenced so wrong order = wrong length later | `28-salamis` |
| 3 | Irreversible act chains (SSR) | dig → unlock → valve → bridge-burn → split in forced order | `30-six-seals` |
| 4 | Body as consumable resource (WOIM) | split drops remains that hold plates / block slides | `27`, `29`, `31` |
| 5 | Remains-as-infrastructure (WYLMIIWAS) | split mid-route so remains stop the NEXT slide | `29-absolute-zero`, `31` |
| 6 | Corridor registers (Sokoban PSPACE proof) | 1-high rows + one-way valves = no reversal, ever | `28`, `30` |
| 7 | Action at a distance (nuworm) | plate in chamber A gates door in chamber B | `27`, `31` |
| 8 | Entry-vector commitment (Pipe Push Paradise) | ice slide stops only on islands; wrong entry = spike | `29`, `31` |
| 9 | Drape-proofing (our own) | door ≥ body-length from the last plate so passing over it can't hold it open | `30`, `31` |
| 10 | Par+2 economy (all) | turnLimit set 2 above certified par — no wasted moves | every Tier V |

## 4 · Certified results (difficulty index v3, exhaustive BFS)

| Level | Score | Tier | Par | States | Specialist dimension |
|---|---|---|---|---|---|
| 27 The Reliquary | 7.9 | GAUNTLET | 30/32 | 44,069 | choreography 96 |
| 28 Salamis | 6.3 | ADVANCED | 51/54 | 52 | threat 69 · depth 92 (purity exhibit) |
| 29 Absolute Zero | 8.2 | ABYSS | 20/21 | 4,287 | simulation 100 |
| 30 Six Seals | 7.8 | GAUNTLET | 27/29 | 121,335 | search 100 · budget 90 |
| **31 The Rubicon** | **9.0** | **NIGHTMARE** | 38/40 | 23,992 | all seven ≥ 65; the only NIGHTMARE in the ladder |

## 5 · Design workflow that produced them

1. Draft grid by hand against the engine's exact rule set.
2. `bun scripts/nightmare-probe.ts` — exhaustive BFS certifies solvability,
   optimal par, state count, and the 7-dimension difficulty profile.
3. Read the certified optimal line (`scripts/nightmare-line.ts`) and tune
   geometry against the *real* line (never intuition).
4. Fix turnLimit to par+2, re-certify, bake into `src/lib/wyrm/levels.ts`.
5. CI re-certifies the whole ladder on every push.

The difficulty index refuses to inflate: a level that contains no ice can
never score on simulation; no spikes, never on threat. A 9.0 must be
extreme in *every measured dimension simultaneously* — which is why only
one level in thirty-one reaches it.
