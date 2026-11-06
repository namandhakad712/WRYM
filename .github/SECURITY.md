# WRYM Security Policy

The worm arena is a **static, secrets-free** system by design. This policy
says what that means, what we promise, and how to report a problem.

## Design invariants (what an attacker cannot find here)

1. **No secrets in the repo — ever.** Benchmark runs happen locally on each
   contributor's machine; only their JSON artifacts are committed. API keys
   live in the contributor's environment (`apiKeyEnv` indirection in
   `bench/models.json`) and never in Git. CI enforces this with a
   credential-scan unit test (`tests/secret-scan.test.ts`) that fails the
   build on live token patterns.
2. **No untrusted code execution in CI.** Community level PRs carry *data*
   only (`community-levels/*.json`). The wyrm-bot reviewer always checks out
   **main** (trusted code) and materialises the PR's data directory for
   validation — a submitted level can never execute its own reviewer.
   `pull_request_target` is used exclusively on the `closed` event (the
   welcome comment), never to run PR code.
3. **Deterministic grading.** Scores are computed by the BFS validator and
   replayed by the engine — never parsed out of model output — so a model
   cannot talk its way up the leaderboard, and a community level cannot
   fake a certificate.
4. **Pinned supply chain.** Every GitHub Actions reference is pinned to a
   full 40-character commit SHA (see the comment next to each `uses:`).
   Dependabot watches those pins and the npm dependency tree
   (`.github/dependabot.yml`).
5. **Least-privilege tokens.** Each workflow declares the minimum
   `permissions:` block it needs; the Pages deploy uses the OIDC
   `id-token` flow rather than a stored PAT.

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Use [GitHub private vulnerability reporting](https://github.com/namandhakad712/WRYM/security/advisories/new)
for this repository. Please include:

- the file / workflow / endpoint involved,
- a minimal reproduction or proof of concept,
- the impact you believe it has.

We aim to acknowledge reports within **72 hours** and will coordinate a
fix + disclosure timeline with you.

## Scope

| In scope | Out of scope |
|---|---|
| GitHub Actions workflows in this repo | Your own API keys / rate limits |
| The static docs site (`site/`, served via GitHub Pages) | GitHub's platform itself |
| Level / result parsing (malformed JSON, hostile level data) | Models' outputs (they are data, graded deterministically) |
| `mcp/llm-bridge.mjs` and the MCP transport | Local servers you choose to launch yourself |

## Hardening checklist for maintainers

- [x] Actions pinned by commit SHA
- [x] Dependabot: github-actions + npm ecosystems, weekly
- [x] Credential scan as a unit test
- [x] Least-privilege `permissions:` per workflow
- [x] `CODEOWNERS` requires maintainer review on workflow / engine changes
- [x] Branch protection hint: require `benchmark-site / verify` + a review
      before merge (Settings → Branches → main)
