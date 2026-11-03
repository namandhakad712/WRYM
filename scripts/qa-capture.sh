#!/bin/bash
# Visual QA: boot server, capture every view, then shut down.
set -u
cd /home/z/my-project
mkdir -p /tmp/qa

# kill anything on 3000
pkill -f "next dev" 2>/dev/null; pkill -f "next-server" 2>/dev/null; sleep 1

setsid nohup bash -c 'exec bun run dev' > /tmp/wyrm-dev.out 2>&1 < /dev/null &
SERVER_PID=$!

# wait for ready
for i in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://127.0.0.1:3000/api/models 2>/dev/null)
  if [ "$code" = "200" ]; then echo "server up after ${i}s"; break; fi
  sleep 1
done

sleep 3
agent-browser set viewport 1600 1000 >/dev/null 2>&1

shot() { # shot <path> <name>
  agent-browser open "http://127.0.0.1:3000$1" >/dev/null 2>&1
  sleep 2.5
  agent-browser wait --load networkidle >/dev/null 2>&1
  agent-browser screenshot --full "/tmp/qa/$2.png" >/dev/null 2>&1
  echo "captured $2"
}

# SPA — tabs are internal state; use the app then click through tabs
agent-browser open "http://127.0.0.1:3000/" >/dev/null 2>&1
sleep 6
agent-browser wait --load networkidle >/dev/null 2>&1
sleep 2
agent-browser screenshot --full /tmp/qa/01-overview.png >/dev/null 2>&1
echo "captured 01-overview"

# click tabs by text
for pair in "Plays:02-plays" "Arena:03-arena" "Levels:04-levels" "Forge:05-forge" "The Loop:06-loop" "Insights:07-insights" "Leaderboard:08-leaderboard" "Admin:09-admin"; do
  label="${pair%%:*}"; name="${pair##*:}"
  agent-browser find text "$label" click >/dev/null 2>&1
  sleep 2.5
  agent-browser wait --load networkidle >/dev/null 2>&1
  agent-browser screenshot --full "/tmp/qa/$name.png" >/dev/null 2>&1
  echo "captured $name"
done

# open the trial run detail (Plays → first run)
agent-browser find text "Plays" click >/dev/null 2>&1
sleep 2
agent-browser find text "WYRM Trial" click >/dev/null 2>&1 || agent-browser find text "12-wyrm-trial" click >/dev/null 2>&1
sleep 3
agent-browser screenshot --full /tmp/qa/10-playdetail.png >/dev/null 2>&1
echo "captured 10-playdetail"

agent-browser errors 2>&1 | tail -5
kill $SERVER_PID 2>/dev/null
pkill -f "next dev" 2>/dev/null; pkill -f "next-server" 2>/dev/null
echo "QA capture complete"
