#!/usr/bin/env bash
# ── WRYM · one-command repo update ────────────────────────────────────────────
# Syncs this tree into your clone of github.com/namandhakad712/WRYM,
# commits with a dated message, and pushes. No manual staging, ever.
#
# Usage (run from inside the extracted WRYM folder):
#   bash scripts/update-repo.sh                 # push to main
#   bash scripts/update-repo.sh --pr            # push a dated branch + print PR link
#   bash scripts/update-repo.sh --dry-run       # preview only, touches nothing
#   bash scripts/update-repo.sh --pr ~/code/WRYM
#
# DEST defaults to ./WRYM next to this folder; cloned automatically if absent.
# Credentials stay on YOUR machine (git credential manager / gh auth login).

set -euo pipefail

SRC="$(cd "$(dirname "$0")/.." && pwd)"
MODE="main"; DRY=0; DEST=""
for a in "$@"; do
  case "$a" in
    --pr) MODE="pr";;
    --dry-run) DRY=1;;
    -h|--help) sed -n '2,12p' "$0"; exit 0;;
    *) DEST="$a";;
  esac
done
[ -n "$DEST" ] || DEST="$(dirname "$SRC")/WRYM"
REPO="https://github.com/namandhakad712/WRYM.git"

# 1 · destination is a live clone of the right repo
if [ ! -d "$DEST/.git" ]; then
  echo "· no clone at $DEST — cloning…"
  [ $DRY -eq 1 ] || git clone "$REPO" "$DEST"
fi
cd "$DEST"
REMOTE_URL="$(git remote get-url origin 2>/dev/null || true)"
case "$REMOTE_URL" in
  *namandhakad712/WRYM*) : ;;
  *) echo "✗ $DEST is not a clone of namandhakad712/WRYM (origin=$REMOTE_URL)"; exit 1;;
esac
git config core.fileMode false          # zips lose exec bits; ignore mode noise

# 2 · sync the tree: wipe git-tracked files (keeps .git and your untracked
#     secrets like .env), copy the new tree in, let `git add -A` see everything
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ $DRY -eq 0 ]; then
  git ls-files -z | xargs -0 rm -f
  tar -C "$SRC" -cf - \
      --exclude='./.git' \
      --exclude='./node_modules' \
      --exclude='./.next' \
      --exclude='./upload' \
      --exclude='./.env' \
      --exclude='./.env.local' \
      --exclude='./dist' \
      --exclude='./coverage' \
      --exclude='./.turbo' \
      --exclude='*.tsbuildinfo' \
      . | tar -xf -
fi
git add -A
CHANGED="$(git diff --cached --numstat | wc -l | tr -d ' ')"
echo "· synced: $CHANGED file(s) changed"
if [ "$CHANGED" = "0" ] && [ "$(git log --oneline origin/"$BRANCH"..HEAD 2>/dev/null | wc -l | tr -d ' ')" = "0" ]; then
  echo "✓ already up to date — nothing to do."; exit 0
fi

# 3 · commit + push
if [ $DRY -eq 1 ]; then
  git diff --cached --stat | tail -5
  echo "· dry-run complete — nothing was written."; exit 0
fi
STAMP="$(date +%Y-%m-%d)"
if [ $CHANGED -gt 0 ]; then
  git commit -m "sync: WRYM benchmark update — $STAMP ($CHANGED files)"
fi

if [ "$MODE" = "pr" ]; then
  SLUG="wrym-sync-$(date +%Y%m%d-%H%M%S)"
  git push origin "HEAD:refs/heads/$SLUG"
  echo
  echo "✓ branch pushed: $SLUG"
  echo "→ open your PR (one click, needs your GitHub login):"
  echo "  https://github.com/namandhakad712/WRYM/compare/main...$SLUG?expand=1"
else
  git push origin "HEAD:$BRANCH"
  echo
  echo "✓ pushed to main."
  echo "→ site: https://namandhakad712.github.io/WRYM/  (enable once: Settings → Pages → Source: GitHub Actions)"
fi
