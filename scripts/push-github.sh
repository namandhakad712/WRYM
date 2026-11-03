#!/usr/bin/env bash
# ── WRYM · push the benchmark to github.com/namandhakad712/WRYM ──────
#
# The repo is fully committed on `main` (5 commits ahead of origin).
# This sandbox holds no GitHub credentials by design — authenticate once,
# then run this script (or plain `git push`).
#
# Option A — GitHub CLI (recommended):
#   gh auth login                # follow the browser/device flow once
#   bash scripts/push-github.sh
#
# Option B — personal access token (fine-grained, repo scope):
#   git remote set-url origin https://<YOUR_TOKEN>@github.com/namandhakad712/WRYM.git
#   bash scripts/push-github.sh
#   (then remove the token from the URL again:
#    git remote set-url origin https://github.com/namandhakad712/WRYM.git)
#
# After the first successful push, enable Pages once:
#   GitHub → WRYM → Settings → Pages → Source: "GitHub Actions"
# The benchmark-site workflow then publishes site/ automatically on
# every push: https://namandhakad712.github.io/WRYM/

set -euo pipefail
cd "$(dirname "$0")/.."

echo "· remote: $(git remote get-url origin)"
echo "· commits to push:"
git log --oneline @{u}..HEAD 2>/dev/null || git log --oneline -5

git push origin main

echo
echo "✓ pushed. If this was the first push, enable Pages:"
echo "  Settings → Pages → Build and deployment → Source: GitHub Actions"
echo "  Site: https://namandhakad712.github.io/WRYM/"
