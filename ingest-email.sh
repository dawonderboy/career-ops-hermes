#!/usr/bin/env bash
# Bootstrap the email-ingest watcher in the background with a rolling log.
#
# Usage:
#   ./ingest-email.sh start     # launch in background (nohup)
#   ./ingest-email.sh stop      # kill the running watcher
#   ./ingest-email.sh status    # show PID + tail of the log
#   ./ingest-email.sh tail      # tail the live log
#
# Env:
#   NTFY_TOPIC   override the ntfy topic (defaults to the value in email-ingest.mjs)

set -euo pipefail

cd "$(dirname "$0")"

# Load .env so nohup inherits NTFY_TOPIC and any optional Codex overrides.
if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

PID_FILE="/tmp/career-ops-email-ingest.pid"
LOG_FILE="logs/email-ingest.out"
mkdir -p logs

cmd="${1:-status}"

case "$cmd" in
  start)
    if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
      echo "already running (pid $(cat "$PID_FILE"))"
      exit 0
    fi
    NODE_BIN="${NODE_BIN:-$(command -v node || true)}"
    if [[ -z "$NODE_BIN" ]]; then
      echo "node not found. Install Node.js or set NODE_BIN=/path/to/node" >&2
      exit 1
    fi
    export NTFY_TOPIC ANTHROPIC_API_KEY
    nohup "$NODE_BIN" email-ingest.mjs >> "$LOG_FILE" 2>&1 &
    echo $! > "$PID_FILE"
    echo "started pid $(cat "$PID_FILE") — log: $LOG_FILE"
    ;;
  stop)
    if [[ -f "$PID_FILE" ]]; then
      pid=$(cat "$PID_FILE")
      if kill -0 "$pid" 2>/dev/null; then
        kill "$pid"
        echo "killed pid $pid"
      else
        echo "pid $pid not running"
      fi
      rm -f "$PID_FILE"
    else
      echo "no pid file; looking for stray processes"
      pkill -f "node email-ingest.mjs" || true
    fi
    ;;
  status)
    if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
      echo "running (pid $(cat "$PID_FILE"))"
    else
      echo "not running"
    fi
    echo "--- last 10 log lines ---"
    [[ -f "$LOG_FILE" ]] && tail -n 10 "$LOG_FILE" || echo "(no log yet)"
    ;;
  tail)
    touch "$LOG_FILE"
    tail -f "$LOG_FILE"
    ;;
  *)
    echo "usage: $0 {start|stop|status|tail}" >&2
    exit 1
    ;;
esac
