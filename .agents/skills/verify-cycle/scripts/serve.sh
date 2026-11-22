#!/usr/bin/env bash
# Start the cycle dev server on an isolated port and record its pid.
set -euo pipefail

SKILL_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
ROOT=$(cd "$SKILL_DIR/../../.." && pwd)
PORT=${VERIFY_PORT:-5273}
RUN_DIR="${VERIFY_RUN_DIR:-$ROOT/.audit}"
LOG="$RUN_DIR/dev-server.log"
PIDFILE="$RUN_DIR/dev-server.pid"

mkdir -p "$RUN_DIR"

if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  echo "already running: pid $(cat "$PIDFILE") on http://127.0.0.1:$PORT/"
  exit 0
fi

: > "$LOG"
setsid bash -c "cd '$ROOT/apps/web' && exec pnpm exec vite --host 127.0.0.1 --port '$PORT' --strictPort" \
  >> "$LOG" 2>&1 &
echo $! > "$PIDFILE"

for _ in $(seq 1 120); do
  if curl -fsS "http://127.0.0.1:$PORT/" > /dev/null 2>&1; then
    echo "ready on http://127.0.0.1:$PORT/ (pid $(cat "$PIDFILE"))"
    exit 0
  fi
  sleep 0.5
done

echo "dev server did not become ready; last log lines:" >&2
tail -30 "$LOG" >&2
exit 1
