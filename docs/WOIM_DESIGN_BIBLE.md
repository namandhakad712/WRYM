# The WOIM Design Bible

> **Source of truth for every pixel in WRYM.**
> Nothing in the renderer was invented. Every element below was researched
> from the real game — *WOIM* (Steam app `4272020`, developer **dogspawn**,
> released Oct 21 2026, "Very Positive" 97 %) — via its store page, its 13
> official 1920×1080 screenshots (analyzed with a vision model, color-picked),
> its demo footage, and reference captures supplied by the project owner.
> Where the engine's mechanic needed a name, the real game's vocabulary won.

---

## 1 · The worm

The single most important asset. Extracted constants — re-verified
Nov 2026 against **all 13 official 1920×1080 screenshots** plus the
owner's reference build (pixel-cluster sampling + 3×-zoom vision
analysis):

| Trait | Value | Notes |
| --- | --- | --- |
| Body | `#f09c9c` salmon-pink | dominant pixel cluster in every capture (the earlier `#fca5b8` read too magenta) |
| Head segment | `#ea6a65` **coral** | the head segment IS coral in the real game — confirmed at 3× zoom across six captures |
| Saddle (clitellum) | `#ea6a65` coral | worn on **segments 1–3** behind the head |
| Outline | **thin dark tube rim** `#2b1f1e` | around the whole body and each knuckle — the game outlines its worm |
| Body width | ≈ 72 % of a grid cell | continuous rounded tube, knuckle joint per segment |
| Eye | **ONE big googly eye** | re-confirmed at 3× zoom (low-zoom passes misread 2); white sclera `#ffffff`, dark rim `#2b1c1d`, pupil `#0a0a0a` (~50 % of sclera) offset toward heading, small white gleam, occasional blink |
| Tail | white circle badge `#ffffff` + `#111` digit | displays current length (≥ 4 segments) — seen in captures |
| Idle worms | closed-eye arc `⌒` | severed halves sleep; breathing bubble |
| Shadow | soft dark ellipse under body | `rgba(0,0,0,0.30)` |

**Rule:** never two eyes, never a snake wedge head, never scales, never
a flat un-outlined tube. It is a coral-headed, dark-rimmed, salmon,
googly-eyed worm and it is beloved.

## 2 · Soil strata — six palettes

The world is layered earth. Each level gets one palette, chosen by a
deterministic hash of its grid (same on every machine, zero config).

| Theme | Base | Wave 1 | Wave 2 | Tunnel | Ridge | Seen in |
| --- | --- | --- | --- | --- | --- | --- |
| Moss | `#586248` | `#4a533c` | `#687455` | `#1c1b18` | `#282522` | owner's capture L1 |
| Grass | `#7a965a` | `#5c733e` | `#8fae6c` | `#1e2b18` | `#2a3a20` | garden screenshots (daisies) |
| Clay | `#874936` | `#743d2c` | `#9e5640` | `#1d1310` | `#2a1a15` | owner's capture L2 |
| Sand | `#9c6b43` | `#7a5032` | `#b07f52` | `#3e2723` | `#4d302a` | desert screenshots |
| Rust | `#a4443b` | `#732820` | `#b95a4e` | `#2b1010` | `#3a1815` | red-clay screenshots |
| Slate | `#2b3a42` | `#3e5866` | `#223038` | `#11151c` | `#1a2129` | dungeon/sewer screenshots |

Soil anatomy (from the real captures):

- **Wavy horizontal bands** — two alternating shades, sine undulation,
  amplitude ≈ 0.55 cell, wavelength ≈ 6 cells.
- **Fossil glyphs** scattered sparsely (~38 % of glyph slots): ammonite
  spirals, fishbones, insect trails; **daisies** (white petals `rgba(250,246,230,.75)`
  + `#f4c430` core) in the grass theme only.
- **Tunnels** are carved: near-black chamber fill + a soft inner ridge band,
  with an **organic carved edge** (`rgba(12,9,6,.85)`, ≈ 11 % cell) wherever
  tunnel meets soil — never a sterile grid line.

## 3 · Element registry (the real game's set)

Researched from the Steam description ("push blocks, flip switches, eat
apples, cut yourself in half… rock pushing, egg cracking, worm snipping"),
the store's element emoji set, and the screenshots. **Implemented in WRYM's
engine → rendered exactly so:**

| Element | Engine token | Visual (color-picked) | Behavior |
| --- | --- | --- | --- |
| Apple | `*` | body `#e82f3a`, contour `#9c1c24`, shine `#ff878f`, leaf `#5fb833`, stem `#6b4226`; bob animation | eat → grow one segment |
| Split (scissors) | `split` action | (action, not a tile — the real game cuts on scissor tiles; our engine cuts on demand to keep determinism) | sever body; tail half becomes weighted, sleeping remains |
| Walnut (pushable rock) | `$` | shell gradient `#dda15e → #c48957 → #9a683c`, seam `#7a4f28`, bumps, outline `#7a4f28` | sokoban push; parks on buttons |
| Floor button | `%` | platter `#ffcf33` / pressed `#e6b422`, rim `#b88914`, shine `#ffea75`; **visibly depresses** under weight | weighted (worm segment / walnut / remains) → gates open |
| Gate | `D` | sealed: dark chamber `#161310` + golden bars `#d99f18`/`#fce570`; open: **glowing portal** `#ffffff → #fce570 → #e8b630` | opens while all buttons are weighted |
| Heart (goal) | `X` | `#ff3377`, rim `#d11a58`, shine `#ffb3cc`, orbiting sparkles `#ffd1e0`, glow | the win — "WOIM IN LOVE!" |
| Dirt | `+` | soil block `#9a7648 → #7d5c34 → #5f4426`, pebbles, root, rounded corners | dig through, costs a turn |
| Spikes | `~` | steel teeth `#aab3bd → #6d7681 → #454c55`, base `#4a4a52`, outline `#26262c` | instant death, even mid-slide |
| One-way valve | `> < ^ v` | wooden sign `#543b2d`/`#6b4c38` + cream chevron `#fdeccc` | enter only with the arrow |
| Ice | `_` | frost tile `#e8f7fe → #c7e9f8 → #a5d8ef`, gloss, snowflake crystals | slide until stopped; one action, many cells |
| Bridge | `=` | planks `#a07a48`/`#8d6a3d`, nails `#4a3a22` | crumbles when the last weight leaves |
| Key | `k` | gold `#f2c232` + `#8a6210`, bob + spawn animation | pickup, inventory |
| Padlock | `L` | body `#f2c232 → #c9920f`, shackle `#8a6210`, keyhole `#6b4a08` | consumed on entry with a key |
| Egg | `O` | shell gradient `#ffffff → #f7f1e6 → #e8dcc6`, outline `#8a7a66`, warm speckles `rgba(190,168,132,.55)`, gleam; drawn perched on the southern lip of its cell so it visibly RESTS on its support; nervous wobble while the worm carries it | **gravity:** the cell directly below must be solid (wall/dirt/bridge/lock/crate/remains/egg/**any worm segment**); support removed ⇒ the egg falls, cracks, run LOST — even on the winning move. Crumbled-bridge rubble is loose debris: the egg falls through. Never pushable, never enterable; your body beneath it IS the carry |

**Researched but not yet in the engine** (the real game's remaining set —
the roadmap in §5): **hats** 👒 (cosmetic worm wear, e.g. white dome
beanie), **jigsaw pieces**
🧩 (rest-stop mini-puzzles), **macarons** (spotted in capture ss-07: a
purple macaron ~`#765693`; pink `#eaaecb`, peach `#f4a261`, blue `#90caf9`,
mint `#a5d6a7`, purple `#c77dff` — each opens the **matching-color gate**),
**water & pipes** (`#48cae4`/`#00e5ff` with white bubble particles, red
valves `#d32f2f`), **pads/coins**, **secret rooms**.

Additional world strata observed in the official captures but not yet
themed: **purple deep-earth** (`#765693` base), **lava/volcanic**
(`#dd4e06`/`#f06f2a` with molten glow), **sewer brick** (slate world with
man-made brick pattern `#252533`), **sand dunes** (rolling `#b08d57`),
**tree roots** dangling from ceilings (`#6b4423`), and **daisies** growing
on grass-world surfaces (white petals, gold core).

## 4 · UI language

From the game's own chrome (and the owner's reference build):

| Role | Value |
| --- | --- |
| Display type | **Fredoka** (Google Fonts) 400/500/600/700 — rounded, friendly |
| Body type | Inter (dashboard) / Fredoka (site) |
| Telemetry type | IBM Plex Mono |
| Page soil | `#2b221a`, deeper `#221a13` |
| Panels | `#3a2e24`, raised `#443627`, inset `#2f251c` |
| Panel edge | `#6b5545` |
| Lettering | cream `#fce8d5` |
| Accent 1 (coral) | `#ea6a65` — actions, live states |
| Accent 2 (gold) | `#ffcf33` — kickers, highlights, rank #1 |
| Win / heart | `#ff7090` / `#ff3377` |
| Go (certified) | `#7ec46a` |
| Frost | `#9bd4ef` |
| Radius | generous (12–18 px), pill buttons |
| Depth | soft dark shadows + a 3–4 px "pop" under chips — game HUD feel |
| Win screen voice | **"WOIM IN LOVE!"** 💗 |

The **dashboard** ("underground control room") and the **static site** share
this system; the AI-view terminal is a darker soil (`#1c150e`) so the
machine's world reads as *underground* against the game's surface.

## 5 · Toward a multi-game arena (researched)

WRYM's engine is game-agnostic underneath (deterministic state + ASCII
projection + BFS certification + checker replay). The genre has a deep bench
of *design-adjacent* games an arena could absorb next, researched from
publications & the thinky-games canon:

| Candidate | Why it fits |
| --- | --- |
| **Snakebird** / **Snakebird Primer** | body-geometry + gravity, brutal combinatorics; the classic "LLMs fail here" reference |
| **A Snake's Tale** | cramped snakes + eggs + buttons — nearly our mechanic set |
| **Can of Wormholes** | worm-body-as-tool puzzles; deep spatial reasoning |
| **Snekburd**, **Ssspicy!**, **We Are Gum**, **Squid Grid**, **Prickle** | modern snake-likes with novel twists |
| **Jelly Is Sticky** | sticky-body geometry — a natural engine extension |
| **Sokobond Express** | sokoban × path chemistry; pure determinism |
| **Would You Love Me If I Was a Snake?** | the sibling "misspelled worms" bundle title |

Eggs 🥚 shipped in engine v4 (Tier VI — THE HATCHERY, see
`src/lib/wyrm/levels.ts`): gravity-bound fragile cargo straight from the
real game's "carrying eggs / egg cracking" mechanic list, with the
dig-carry-split / push-carry-split / bridge-custody / living-wire design
grammar documented in `docs/DESIGN_RESEARCH.md` §6.

Priority after WOIM-parity: **macarons + colored gates, hats** (engine
mechanics), then a second game family (Snakebird-class gravity) behind the
same bench harness.

## 6 · Method note

Colors above are vision-model estimates from official 1920×1080 captures
(±5 %); where the owner's reference build disagreed, the owner's values won
(they color-picked the actual game). The renderer keeps every constant in
one palette object per surface (`site/assets/wyrm-render.js`,
`src/components/wyrm/StageCanvas.tsx`, `src/lib/wyrm/sprites.ts`) so future
corrections are one-line changes — no pixel is ever re-guessed.

## 7 · The sprite system (Nov 2026)

Every element also exists as a **standalone mini-tile** for icon surfaces:

- `src/lib/wyrm/sprites.ts` — the canonical TypeScript sprite painter
  (`drawSpriteCell` / `paintSprite`), used by the dashboard
- `src/components/wyrm/WyrmSprite.tsx` — React canvas icon
- `WyrmRender.spriteIcon(canvas, ch, size, opts)` — the vanilla twin for
  the static site (legend on `levels.html`)

The Feature Builder palette, the forge editor grid and the site legend all
render **the real tiles** through these — soil strata walls, carved tunnel
floors, the actual worm head/body — never flat colour swatches or abstract
_glyphs_. The tile you pick is the tile the AI must survive.
