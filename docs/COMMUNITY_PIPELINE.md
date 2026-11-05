# WRYM · Community Level Pipeline — Governance

This document is the governance contract for community levels: how a submission
becomes arena canon, who checks what, and how failures are returned to their
contributors. The machinery is fully automated; the human judgement is
deliberately explicit.

```
Forge (browser)  →  pull request  →  wyrm-bot certification  →  maintainer approval  →  merge  →  live on the ladder
                                        ↑      ↓ returns with fixes                      ↓
                                        └────── push fixes, restart automatically         celebrate + credit
```

## The submission envelope (`wyrm.level/community-2`)

The Level Forge produces this file automatically; hand-written PRs should match it:

```json
{
  "schema": "wyrm.level/community-2",
  "name": "Squeeze Play",
  "slug": "squeeze-play",
  "author": "Ada Digger",
  "grid": ["#########", "#..o@.*.#", "#..%..D.#", "#..X....#", "#########"],
  "turnLimit": 60,
  "contributor": {
    "name": "Ada Digger",
    "github": "adadigger",
    "intent": "A plate must be held while the heart is reached - flesh must be paid.",
    "tags": ["logic"]
  },
  "certified": { "difficulty": 4.2, "tier": "CORE", "minMoves": 21,
                 "statesExplored": 1893, "splitsRequired": true }
}
```

`contributor` is **required** for community-2: it is what the review card shows,
what the community board credits, and what a maintainer reads when judging
intent. Legacy `community-1` files (bare `author`) still validate but are
flagged with a warning.

## What wyrm-bot checks (the machine half)

On every PR that touches `community-levels/`, the `wyrm-bot` workflow runs
`scripts/review-community.ts`, which validates **every changed level** and
re-validates the **entire existing community ladder** (regressions fail CI):

| check | policy |
|---|---|
| schema | name (≤ 40 chars), slug (kebab-case, no official collision), rectangular grid, 6–22 × 6–18 |
| budget | turn limit 4–240, and ≥ optimal par |
| structure | exactly one `@` head, one `X` heart, known characters only |
| solvability | exhaustive BFS — the same engine the Forge runs in the browser |
| search ceiling | ≤ 25,000,000 states (CI must terminate) |
| certificate honesty | claimed difficulty vs computed (site always shows the computed value) |
| credit | community-2 requires contributor name, valid GitHub handle, ≥ 20-char design intent |

The bot then posts/updates a **review card** on the PR (verdict table + per-file
details with fix hints) and labels the PR:

| label | meaning |
|---|---|
| `community-level` | touches the community ladder |
| `bot:validated` + `bot:awaiting-review` | every machine check passed |
| `bot:needs-revision` | returned to contributor — exact fixes listed |
| `bot:approved` | maintainer approved, merge cleared |
| `bot:changes-requested` | maintainer returned it with notes |

A failed submission is not dead: the bot @-mentions the author with what to fix,
and pushing to the branch re-runs certification automatically.

## What maintainers check (the human half)

Only logins listed in the repository's `MAINTAINERS` file may command the bot:

- **Design quality** — is the idea interesting, or a corridor with apples?
- **Fairness** — hard but honest: no pixel-perfect luck, no unreadable ambiguity.
- **Originality** — does it use the vocabulary (valves, ice, splits, bridges) in a new way?
- **Difficulty placement** — does the tier fit the ladder's curve?
- **Credit & intent** — honest, legible contributor card.

### Slash commands (PR comments)

```
/wyrm approve [note]           # label bot:approved, enable auto-merge (squash)
/wyrm request-changes <reason> # return to contributor with notes
/wyrm revalidate               # re-run certification on the current head
/wyrm help                     # command reference
```

Non-maintainers who try are politely refused.

## Enforcing the framework (repo owner, one-time setup)

The bot works advisory-only out of the box. To make the framework *mandatory*:

1. **Settings → Branches → Add branch protection rule** for `main`
2. **Require status checks**: select `wyrm-bot / review` (and `benchmark-site / verify`)
3. **Require a pull request review before merging** (the human half)
4. Optionally: **Require conversation resolution** and restrict who can dismiss reviews

With that, a level literally cannot reach `main` without both signatures.

## After the merge

1. `wyrm-bot` posts a welcome comment crediting the contributor
2. The `benchmark-site` workflow re-exports the archive — the level appears on
   the public ladder (atlas + certificate + contributor credit) within minutes
3. Every future benchmark run plays the level; every leaderboard refresh
   includes it. Community levels are permanent arena canon.

## Local testing

```bash
bun scripts/review-community.ts                # validate everything, print report
bun scripts/review-community.ts --md out.md --json out.json
```

The board for all of this is public: **[the community page](https://namandhakad712.github.io/WRYM/community.html)**
on the docs site, live from the GitHub API.
