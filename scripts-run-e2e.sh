#!/usr/bin/env bash
# Builds the client, starts server + static preview, runs the browser test, stops everything.
set -u
cd "$(dirname "$0")"
# refuse to run against a stale server/preview left over from something else
for i in 1 2 3 4 5 6 7 8 9 10; do  # give a previous run a few seconds to shut down
  if curl -s -o /dev/null http://localhost:2567/ || curl -s -o /dev/null http://localhost:4173/; then sleep 1; else break; fi
done
if curl -s -o /dev/null http://localhost:2567/ || curl -s -o /dev/null http://localhost:4173/; then
  echo "ports 2567/4173 already in use - stop the old server/preview first"; exit 1
fi
npm run build --workspace client >/tmp/bfb-build.log 2>&1 || { echo "client build failed"; tail -20 /tmp/bfb-build.log; exit 1; }
RECONNECT_WINDOW_S=120 DEV_TOOLS=1 COLYSEUS_LATENCY=${LATENCY:-} npx tsx server/src/index.ts >/tmp/bfb-server.log 2>&1 & SERVER=$!
(cd client && npx vite preview --port 4173 --strictPort >/tmp/bfb-preview.log 2>&1) & PREVIEW=$!
sleep 4
node tests/e2e-phase0.mjs; CODE=$?
# stop everything we started (npx/vite spawn child processes, so kill by command line too)
kill $SERVER $PREVIEW 2>/dev/null
pkill -f "tsx server/src/index.ts" 2>/dev/null
pkill -f "vite preview --port 4173" 2>/dev/null
wait 2>/dev/null
exit $CODE
