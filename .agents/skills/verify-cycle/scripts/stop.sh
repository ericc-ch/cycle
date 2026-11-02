#!/usr/bin/env bash
# Stop only the dev server this skill started. Evidence in .audit/ is kept.
set -euo pipefail

SKILL_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
ROOT=$(cd "$SKILL_DIR/../../.." && pwd)
RUN_DIR="${VERIFY_RUN_DIR:-$ROOT/.audit}"
PIDFILE="$RUN_DIR/dev-server.pid"

if [ ! -f "$PIDFILE" ]; then
  echo "nothing to stop: $PIDFILE does not exist"
  exit 0
fi

PID=$(cat "$PIDFILE")

if ! kill -0 "$PID" 2>/dev/null; then
  echo "pid $PID is already gone; removing $PIDFILE"
  rm -f "$PIDFILE"
  exit 0
fi

# Serve.sh starts the server with setsid, so the pid is the process group id.
kill -TERM -- "-$PID" 2>/dev/null || kill -TERM "$PID"

for _ in $(seq 1 40); do
  if ! kill -0 "$PID" 2>/dev/null; then
    rm -f "$PIDFILE"
    echo "stopped pid $PID"
    exit 0
  fi
  sleep 0.25
done

kill -KILL -- "-$PID" 2>/dev/null || kill -KILL "$PID" 2>/dev/null || true
rm -f "$PIDFILE"
echo "force-stopped pid $PID"
