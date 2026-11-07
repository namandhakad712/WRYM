#!/usr/bin/env bash
# WRYRM frontier sweep — SINGLE-STREAM, time-sliced, CHECKPOINT-RESUMABLE.
# The sandbox kills processes between tool calls; the runner's --resume
# mode makes a level's run survive any number of process deaths: each
# invocation continues from /tmp/wyrm-ck-*.json, and the final artifact
# is byte-equivalent to an unbroken run.
#
#   bash scripts/frontier-slice.sh [window_seconds]   (default 520)
set -u
cd /home/z/my-project
WINDOW="${1:-520}"
START=$(date +%s)
Q="/tmp/wyrm-queue.txt"

while [ -s "$Q" ]; do
  LV="$(head -1 "$Q")"
  elapsed=$(( $(date +%s) - START ))
  if [ "$elapsed" -ge "$WINDOW" ]; then echo "[sweep] window closed at ${elapsed}s"; break; fi
  remain=$(( WINDOW - elapsed + 20 ))
  CK="/tmp/wyrm-ck-glm-4.6-${LV}.json"
  RESUME_NOTE=""
  [ -f "$CK" ] && RESUME_NOTE=" (resume from turn $(python3 -c "import json;print(json.loads(json.load(open('$CK'))['stateJson'])['n'])" 2>/dev/null || echo '?'))"
  echo "[sweep] $(date +%H:%M:%S) start $LV${RESUME_NOTE} (elapsed ${elapsed}s)"
  timeout "$remain" bun scripts/run-benchmark.ts --models glm-4.6 --attempts 1 --resume --levels "$LV" 2>&1 | grep -E "^\[[0-9]+/|resuming" || true
  if [ -f "results/runs/glm-4.6/${LV}.json" ]; then
    ART="results/runs/glm-4.6/${LV}.json"
    STATUS=$(python3 -c "import json;print(json.load(open('$ART'))['result']['status'])" 2>/dev/null || echo "?")
    if [ "$STATUS" = "aborted" ]; then
      echo "[sweep] $LV ABORTED (api) — artifact removed, checkpoint KEPT for resume; cooling down 200s"
      rm -f "$ART"
      sleep 200
    else
      sed -i '1d' "$Q"
      echo "[sweep] done $LV ($STATUS) — 30s breather for the gateway"
      sleep 30
    fi
  else
    echo "[sweep] window cut $LV mid-run — checkpoint retained, will resume"
  fi
done
echo "--- remaining: $(tr '\n' ' ' < "$Q" 2>/dev/null | head -c 400)"
