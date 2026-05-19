#!/bin/bash
# scan-with-notify.sh
#   1. Scan portals via scan.mjs (zero-token API scan — Greenhouse/Ashby/Lever).
#   2. Scan job boards via scan-job-boards.mjs (Indeed/LinkedIn/Glassdoor/ZipRecruiter/Adzuna).
#   3. Run Playwright watchers (zero-token).
#   4. Push Telegram + ntfy notification if any new offers were added.
#      Evaluation is left manual — run /career-ops pipeline when convenient.

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || true)}"
if [[ -z "$REPO_ROOT" ]]; then
    REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
fi
cd "$REPO_ROOT"

NODE_BIN="${NODE_BIN:-$(command -v node || true)}"
if [[ -z "$NODE_BIN" ]]; then
    echo "Error: node not found on PATH. Set NODE_BIN=/path/to/node and retry." >&2
    exit 1
fi

NTFY_TOPIC="${NTFY_TOPIC:-career-ops-demo-topic}"
NTFY_URL="https://ntfy.sh/${NTFY_TOPIC}"
HERMES_ENV_FILE="${HERMES_ENV_FILE:-$HOME/.hermes/.env}"
TELEGRAM_CHAT_ID="${TELEGRAM_CHAT_ID:-}"

# Load Telegram bot credentials for direct scan notifications.
# Keep this parser narrow so we do not source arbitrary shell from the env file.
if [[ -z "${TELEGRAM_BOT_TOKEN:-}" && -f "$HERMES_ENV_FILE" ]]; then
    set -a
    # shellcheck disable=SC1090
    . "$HERMES_ENV_FILE"
    set +a
fi
export TELEGRAM_BOT_TOKEN TELEGRAM_CHAT_ID

SCAN_OUTPUT=$(mktemp -t career-ops-scan.XXXXXX)
JB_OUTPUT=$(mktemp -t career-ops-jb.XXXXXX)
trap 'rm -f "$SCAN_OUTPUT" "$JB_OUTPUT"' EXIT

DATE=$(date +"%Y-%m-%d")
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

notify() {
    local title="$1"
    local body="$2"
    local priority="${3:-default}"
    curl -sS --max-time 10 \
        -H "Title: ${title}" \
        -H "Priority: ${priority}" \
        -H "Tags: briefcase" \
        -d "${body}" \
        "${NTFY_URL}" >/dev/null || log "WARN: ntfy push failed"

    if [[ -n "${TELEGRAM_BOT_TOKEN:-}" && -n "${TELEGRAM_CHAT_ID:-}" ]]; then
        curl -sS --max-time 10 \
            -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
            -d "chat_id=${TELEGRAM_CHAT_ID}" \
            --data-urlencode "text=${title}

${body}" \
            -d "disable_web_page_preview=true" \
            >/dev/null || log "WARN: Telegram push failed"
    else
        log "WARN: Telegram notification skipped (missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID)"
    fi
}

# ── 1. Scan ─────────────────────────────────────────────────────────
log "Scanning portals..."
"$NODE_BIN" scan.mjs > "$SCAN_OUTPUT" 2>&1
SCAN_EXIT=$?
cat "$SCAN_OUTPUT"

if [[ $SCAN_EXIT -ne 0 ]]; then
    log "ERROR: scan.mjs exited $SCAN_EXIT"
    notify "career-ops scan FAILED" "scan.mjs exited ${SCAN_EXIT} on ${DATE}" "high"
    exit $SCAN_EXIT
fi

# ── 2. Job board scan (Indeed / LinkedIn / Glassdoor / ZipRecruiter / Adzuna) ──
log "Scanning job boards..."
"$NODE_BIN" scan-job-boards.mjs > "$JB_OUTPUT" 2>&1
JB_EXIT=$?
cat "$JB_OUTPUT"

if [[ $JB_EXIT -ne 0 ]]; then
    log "WARN: scan-job-boards.mjs exited $JB_EXIT (non-fatal, continuing)"
fi

# ── 3. Page watchers (Playwright-based, non-API portals) ────────────
#     Each watcher self-notifies via ntfy if it finds a new match.
if [[ -d "$PROJECT_DIR/watchers" ]]; then
    for watcher in "$PROJECT_DIR"/watchers/*.mjs; do
        [[ -e "$watcher" ]] || continue
        log "Running watcher: $(basename "$watcher")"
        "$NODE_BIN" "$watcher" >> "$PROJECT_DIR/logs/scan.log" 2>&1 || \
            log "WARN: watcher $(basename "$watcher") failed"
    done
fi

# ── 4. Notify if new offers added ───────────────────────────────────
PORTAL_COUNT=$(awk -F: '/^New offers added:/ {gsub(/ /,"",$2); print $2; exit}' "$SCAN_OUTPUT")
JB_COUNT=$(awk -F: '/^New offers added:/ {gsub(/ /,"",$2); print $2; exit}' "$JB_OUTPUT")
PORTAL_COUNT=${PORTAL_COUNT:-0}
JB_COUNT=${JB_COUNT:-0}
NEW_COUNT=$(( PORTAL_COUNT + JB_COUNT ))

if [[ "$NEW_COUNT" -eq 0 ]]; then
    log "No new offers. Silent exit."
    exit 0
fi

# Offer summary lines from both scanners (format: "  + company | title | ...")
PORTAL_SUMMARY=$(grep -E '^[[:space:]]*\+ ' "$SCAN_OUTPUT" | head -5)
JB_SUMMARY=$(grep -E '^[[:space:]]*\+ ' "$JB_OUTPUT" | head -5)
SUMMARY=$(printf '%s\n%s' "$PORTAL_SUMMARY" "$JB_SUMMARY" | grep -v '^$' | head -10)

TITLE="career-ops: ${NEW_COUNT} new offer(s)"
BODY="${DATE} — run /career-ops pipeline to evaluate
(portals: ${PORTAL_COUNT} | job boards: ${JB_COUNT})

${SUMMARY}"

notify "$TITLE" "$BODY" "default"
log "Notified: $NEW_COUNT new offer(s) queued for manual evaluation (portals: $PORTAL_COUNT, job boards: $JB_COUNT)."
