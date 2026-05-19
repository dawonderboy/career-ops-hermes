#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT/career-ops-automation.sh"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

assert_contains() {
  local haystack="$1"
  local needle="$2"
  [[ "$haystack" == *"$needle"* ]] || fail "expected output to contain: $needle"
}

[[ -x "$SCRIPT" ]] || fail "career-ops-automation.sh should exist and be executable"

HELP_OUTPUT="$($SCRIPT help)"
assert_contains "$HELP_OUTPUT" "Usage: ./career-ops-automation.sh"
assert_contains "$HELP_OUTPUT" "status"
assert_contains "$HELP_OUTPUT" "logs email"
assert_contains "$HELP_OUTPUT" "logs scan"
assert_contains "$HELP_OUTPUT" "scan-now"
assert_contains "$HELP_OUTPUT" "restart-email"
assert_contains "$HELP_OUTPUT" "verify"
assert_contains "$HELP_OUTPUT" "replay-email [since]"

STATUS_OUTPUT="$($SCRIPT status)"
assert_contains "$STATUS_OUTPUT" "Career-Ops Automation Status"
assert_contains "$STATUS_OUTPUT" "Email ingest:"
assert_contains "$STATUS_OUTPUT" "Scanner:"
assert_contains "$STATUS_OUTPUT" "Pipeline:"
assert_contains "$STATUS_OUTPUT" "Review queue:"
assert_contains "$STATUS_OUTPUT" "Last tracker update:"
assert_contains "$STATUS_OUTPUT" "Running:"

if [[ "$STATUS_OUTPUT" == *"Running: yes"* ]]; then
  assert_contains "$STATUS_OUTPUT" "PID:"
  assert_contains "$STATUS_OUTPUT" "Started:"
  assert_contains "$STATUS_OUTPUT" "Working dir:"
  assert_contains "$STATUS_OUTPUT" "Parser: Codex CLI"
  assert_contains "$STATUS_OUTPUT" "Codex CLI:"
  assert_contains "$STATUS_OUTPUT" "Codex auth file:"
  assert_contains "$STATUS_OUTPUT" "NTFY_TOPIC:"
fi

CRON_OUTPUT="$($SCRIPT cron-status)"
assert_contains "$CRON_OUTPUT" "scan-with-notify.sh"

EMAIL_LOG_OUTPUT="$($SCRIPT logs email 5)"
assert_contains "$EMAIL_LOG_OUTPUT" "logs/email-ingest.out"

SCAN_LOG_OUTPUT="$($SCRIPT logs scan 5)"
assert_contains "$SCAN_LOG_OUTPUT" "logs/scan.log"

set +e
UNKNOWN_OUTPUT="$($SCRIPT not-a-command 2>&1)"
UNKNOWN_EXIT=$?
set -e
[[ "$UNKNOWN_EXIT" -ne 0 ]] || fail "unknown command should exit non-zero"
assert_contains "$UNKNOWN_OUTPUT" "Unknown command"

echo "career-ops-automation tests passed"
