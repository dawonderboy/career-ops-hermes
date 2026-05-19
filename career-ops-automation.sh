#!/usr/bin/env bash
# Unified controller for Career-Ops automation.
# Thin wrapper only: delegates to existing scripts instead of reimplementing them.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PID_FILE="/tmp/career-ops-email-ingest.pid"
EMAIL_LOG="logs/email-ingest.out"
EMAIL_EVENT_LOG="data/email-ingest.log"
EMAIL_REVIEW="data/email-ingest-review.md"
SCAN_LOG="logs/scan.log"
SCAN_SCRIPT="./scan-with-notify.sh"
INGEST_SCRIPT="./ingest-email.sh"
VERIFY_SCRIPT="./verify-pipeline.mjs"
PIPELINE_FILE="data/pipeline.md"

usage() {
  cat <<'EOF'
Usage: ./career-ops-automation.sh <command> [args]

Status / inspection:
  status                 Show combined automation health summary
  logs email [lines]     Show recent email-ingest log lines
  logs scan [lines]      Show recent scan log lines
  cron-status            Show installed scan cron entry, if present
  verify                 Run node verify-pipeline.mjs

Safe actions:
  restart-email          Restart the ntfy email ingest watcher
  scan-now               Run scan-with-notify.sh immediately
  replay-email [since]   Replay ntfy email backlog, default: 24h

Other:
  help                   Show this help
EOF
}

section() {
  printf '\n%s\n' "$1"
  printf '%s\n' "$(printf '─%.0s' {1..60})"
}

file_tail() {
  local file="$1"
  local lines="${2:-20}"
  echo "$file"
  if [[ -f "$file" ]]; then
    tail -n "$lines" "$file"
  else
    echo "(missing)"
  fi
}

email_running() {
  [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null
}

email_pid() {
  [[ -f "$PID_FILE" ]] && cat "$PID_FILE" || true
}

process_started() {
  local pid="$1"
  ps -p "$pid" -o lstart= 2>/dev/null | sed 's/^ *//' || true
}

process_workdir() {
  local pid="$1"
  if [[ -L "/proc/$pid/cwd" ]]; then
    readlink "/proc/$pid/cwd" 2>/dev/null || true
    return
  fi
  if command -v lsof >/dev/null 2>&1; then
    lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | awk '/^n/ {sub(/^n/, ""); print; exit}' || true
  fi
}

process_env_dump() {
  local pid="$1"
  if [[ -r "/proc/$pid/environ" ]]; then
    tr '\0' '\n' < "/proc/$pid/environ" 2>/dev/null || true
    return
  fi
  ps eww -p "$pid" -o command= 2>/dev/null | tr ' ' '\n' | grep '=' || true
}

process_env_has() {
  local pid="$1"
  local key="$2"
  process_env_dump "$pid" | grep -q "^${key}="
}

process_env_value() {
  local pid="$1"
  local key="$2"
  process_env_dump "$pid" | awk -F= -v key="$key" '$1 == key {sub(/^[^=]*=/, ""); print; exit}'
}

last_tracker_update() {
  if [[ -f "$EMAIL_EVENT_LOG" ]]; then
    tail -n 1 "$EMAIL_EVENT_LOG" | awk -F'\t' '{if (NF >= 6) print $1 " — " $3 " " $4 " " $5 " — " $6; else print $0}'
  else
    echo "(no email ingest event log yet)"
  fi
}

review_count() {
  if [[ -f "$EMAIL_REVIEW" ]]; then
    grep -c '^## ' "$EMAIL_REVIEW" || true
  else
    echo 0
  fi
}

cron_line() {
  crontab -l 2>/dev/null | grep 'scan-with-notify.sh' || true
}

last_scan_summary() {
  if [[ ! -f "$SCAN_LOG" ]]; then
    echo "(no scan log yet)"
    return
  fi
  local last_scan new_count errors
  last_scan=$(grep -n 'Portal Scan' "$SCAN_LOG" | tail -n 1 | cut -d: -f1 || true)
  if [[ -n "$last_scan" ]]; then
    sed -n "${last_scan},$((last_scan + 18))p" "$SCAN_LOG" | grep -E 'Portal Scan|Companies scanned:|Aggregators scanned:|Total jobs found:|New offers added:|Errors \(' || true
  else
    tail -n 8 "$SCAN_LOG"
  fi
}

pending_count() {
  if [[ -f "$PIPELINE_FILE" ]]; then
    grep -c '^- \[ \]' "$PIPELINE_FILE" || true
  else
    echo "missing"
  fi
}

status() {
  echo "Career-Ops Automation Status"
  echo "Generated: $(date '+%Y-%m-%d %H:%M:%S %Z')"

  section "Email ingest:"
  if email_running; then
    local pid
    local started workdir topic
    pid="$(email_pid)"
    echo "Running: yes"
    echo "PID: $pid"
    started="$(process_started "$pid")"
    workdir="$(process_workdir "$pid")"
    topic="$(process_env_value "$pid" NTFY_TOPIC)"
    echo "Started: ${started:-unknown}"
    echo "Working dir: ${workdir:-unknown}"
    echo "Parser: Codex CLI"
    if command -v codex >/dev/null 2>&1; then
      echo "Codex CLI: $(codex --version | head -1)"
    else
      echo "Codex CLI: missing"
    fi
    if [[ -f "$HOME/.codex/auth.json" ]]; then
      echo "Codex auth file: present"
    else
      echo "Codex auth file: missing"
    fi
    echo "NTFY_TOPIC: ${topic:-default from email-ingest.mjs}"
  else
    echo "Running: no"
  fi
  echo "Last tracker update: $(last_tracker_update)"
  echo "Review queue: $(review_count) item(s)"

  section "Scanner:"
  local cron
  cron="$(cron_line)"
  if [[ -n "$cron" ]]; then
    echo "Cron installed: yes"
    echo "Cron: $cron"
  else
    echo "Cron installed: no"
  fi
  echo "Last scan summary:"
  last_scan_summary | sed 's/^/  /'

  section "Pipeline:"
  echo "Pending items: $(pending_count)"
  if [[ -x "$SCAN_SCRIPT" ]]; then
    echo "Scan script: present/executable ($SCAN_SCRIPT)"
  else
    echo "Scan script: missing or not executable ($SCAN_SCRIPT)"
  fi
  if [[ -f "$VERIFY_SCRIPT" ]]; then
    echo "Verify script: present ($VERIFY_SCRIPT)"
  else
    echo "Verify script: missing ($VERIFY_SCRIPT)"
  fi
}

logs_cmd() {
  local which="${1:-}"
  local lines="${2:-40}"
  case "$which" in
    email) file_tail "$EMAIL_LOG" "$lines" ;;
    scan) file_tail "$SCAN_LOG" "$lines" ;;
    *) echo "Usage: ./career-ops-automation.sh logs {email|scan} [lines]" >&2; exit 2 ;;
  esac
}

cron_status() {
  local cron
  cron="$(cron_line)"
  if [[ -n "$cron" ]]; then
    echo "$cron"
  else
    echo "No scan-with-notify.sh cron entry found."
    exit 1
  fi
}

restart_email() {
  "$INGEST_SCRIPT" stop || true
  "$INGEST_SCRIPT" start
  "$INGEST_SCRIPT" status
}

scan_now() {
  "$SCAN_SCRIPT"
}

verify_pipeline() {
  node "$VERIFY_SCRIPT"
}

replay_email() {
  local since="${1:-24h}"
  set -a
  source .env
  set +a
  node email-ingest.mjs --replay "$since"
}

cmd="${1:-help}"
shift || true
case "$cmd" in
  help|-h|--help) usage ;;
  status) status ;;
  logs) logs_cmd "$@" ;;
  cron-status) cron_status ;;
  restart-email) restart_email ;;
  scan-now) scan_now ;;
  verify) verify_pipeline ;;
  replay-email) replay_email "$@" ;;
  *)
    echo "Unknown command: $cmd" >&2
    usage >&2
    exit 2
    ;;
esac
