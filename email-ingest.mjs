#!/usr/bin/env node

/**
 * email-ingest.mjs
 *
 * Long-running watcher that subscribes to a public ntfy.sh topic, parses
 * each forwarded job-search email with Claude, and auto-applies updates
 * to data/applications.md.
 *
 * Architecture:
 *   email → <topic>@ntfy.sh (email-to-publish) → ntfy topic
 *                                               → this watcher
 *                                                 → claude -p (parse)
 *                                                 → applications.md update
 *                                                 → log
 *
 * Usage:
 *   NTFY_TOPIC=your-topic node email-ingest.mjs
 *   (or set a default NTFY_TOPIC in the constants below)
 *
 * Every processed event is appended to data/email-ingest.log.
 * Unmatched / unparseable events are appended to data/email-ingest-review.md.
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Config ──────────────────────────────────────────────────────────

const NTFY_TOPIC = process.env.NTFY_TOPIC || 'career-ops-demo-topic';
const NTFY_URL = `https://ntfy.sh/${NTFY_TOPIC}/json`;

const APPS_PATH = resolve(__dirname, 'data/applications.md');
const LOG_PATH = resolve(__dirname, 'data/email-ingest.log');
const REVIEW_PATH = resolve(__dirname, 'data/email-ingest-review.md');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';
const ANTHROPIC_TIMEOUT_MS = 45_000;

if (!ANTHROPIC_API_KEY) {
  console.error('[email-ingest] FATAL: ANTHROPIC_API_KEY env var is not set.');
  console.error('  Get a key from https://console.anthropic.com/settings/keys');
  console.error('  Then: export ANTHROPIC_API_KEY=sk-ant-…');
  process.exit(1);
}

// Valid status values (mirrors templates/states.yml)
const CANONICAL_STATUSES = new Set([
  'Evaluated', 'Applied', 'Responded', 'Interview', 'Offer', 'Rejected', 'Discarded', 'SKIP',
]);

// ── Parser prompt ──────────────────────────────────────────────────

const PARSE_SYSTEM_PROMPT = `You extract structured data from forwarded job-search emails.

Return ONLY a single JSON object, no prose, no code fences. The JSON must match this schema:

{
  "company": string | null,          // Company name as best extracted (e.g. "LiveKit", "OpenAI"). null if not determinable.
  "event": "Applied" | "Responded" | "Interview" | "Offer" | "Rejected" | "Discarded" | "Followup" | "Ignore",
  "role": string | null,             // Job title if mentioned, else null
  "datetime": string | null,         // If an interview is being scheduled: "YYYY-MM-DD HH:MMam/pm TZ" format, else null. Examples: "2026-05-01 10:00am PDT", "2026-04-27 1:30pm PST".
  "interviewStage": string | null,   // If this is an interview, extract the stage from the subject line: "Recruiter Screen", "Fit Call", "Hiring Manager", "Zoom", or similar. null if not determinable or event is not Interview.
  "interviewer": string | null,      // Name/email of interviewer if mentioned
  "summary": string                  // One concise line summarizing what happened (<140 chars). No PII like phone numbers.
}

Event rules:
- "Rejected" — any rejection ("we've decided not to move forward", "pursue other candidates", "not the right fit").
- "Interview" — a specific interview is being scheduled or confirmed (with or without a time).
- "Offer" — an offer letter or offer discussion.
- "Responded" — recruiter replied but no interview scheduled yet (screening questions, follow-up asks).
- "Applied" — automatic "thanks for applying / we've received your application" confirmation.
- "Followup" — manual note / user added context about an application.
- "Ignore" — the email is not related to a job application (newsletter, spam, unrelated).

Interview stage detection: Look for keywords in the subject line like "Hiring Manager", "HM", "Recruiter Screen", "Fit Call", "Zoom", "Phone", "Technical", etc. Extract the most specific stage label you can find.

Return valid JSON only.`;

// ── LLM invocation ─────────────────────────────────────────────────

async function callClaude(userPrompt) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ANTHROPIC_TIMEOUT_MS);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 512,
        system: PARSE_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Anthropic API ${res.status}: ${body.slice(0, 300)}`);
    }
    const data = await res.json();
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    return text.trim();
  } finally {
    clearTimeout(timer);
  }
}

function extractJson(raw) {
  // Strip markdown fences if present
  let s = raw.trim();
  if (s.startsWith('```')) s = s.replace(/^```(json)?\s*/i, '').replace(/\s*```\s*$/, '');
  // Find first { and last } (defensive)
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first === -1 || last === -1) throw new Error(`no JSON object in parser output: ${raw.slice(0, 200)}`);
  return JSON.parse(s.slice(first, last + 1));
}

// ── Fuzzy company matching ─────────────────────────────────────────

function normalizeCompany(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[.,'"`()]/g, '')
    .replace(/\b(inc|llc|corp|corporation|ltd|limited|co|company)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseApplicationsTable() {
  if (!existsSync(APPS_PATH)) return { header: '', rows: [], rawLines: [] };
  const text = readFileSync(APPS_PATH, 'utf-8');
  const lines = text.split('\n');
  const rows = [];
  lines.forEach((line, i) => {
    // Skip headers/separators
    if (!line.startsWith('|')) return;
    if (/^\|\s*-+/.test(line)) return;
    if (/^\|\s*#\s*\|/.test(line)) return;
    const cells = line.split('|').map(c => c.trim());
    // Expected 10 cells: "", num, date, company, role, score, status, pdf, report, notes, ""
    if (cells.length < 10) return;
    rows.push({
      index: i,
      num: cells[1],
      date: cells[2],
      company: cells[3],
      role: cells[4],
      score: cells[5],
      status: cells[6],
      pdf: cells[7],
      report: cells[8],
      notes: cells[9],
      raw: line,
    });
  });
  return { rows, rawLines: lines };
}

function findBestMatch(rows, parsedCompany, parsedRole) {
  if (!parsedCompany) return null;
  const needle = normalizeCompany(parsedCompany);
  if (!needle) return null;

  // Exact-ish match first, then substring both ways
  const exact = rows.filter(r => normalizeCompany(r.company) === needle);
  const candidates = exact.length ? exact : rows.filter(r => {
    const h = normalizeCompany(r.company);
    return h && (h.includes(needle) || needle.includes(h));
  });

  if (candidates.length === 0) return null;

  // If role given, prefer matching role; else most recent row (highest #)
  if (parsedRole) {
    const roleN = parsedRole.toLowerCase();
    const roleMatch = candidates.find(r => r.role.toLowerCase().includes(roleN) || roleN.includes(r.role.toLowerCase()));
    if (roleMatch) return roleMatch;
  }
  candidates.sort((a, b) => (parseInt(b.num, 10) || 0) - (parseInt(a.num, 10) || 0));
  return candidates[0];
}

// ── Row update ─────────────────────────────────────────────────────

function applyUpdate(match, parsed) {
  const { rows, rawLines } = parseApplicationsTable();
  // Re-find by num (index in rawLines can shift if file changed during processing)
  const target = rows.find(r => r.num === match.num);
  if (!target) throw new Error(`row #${match.num} no longer in tracker`);

  const today = new Date().toISOString().slice(0, 10);
  let newStatus = target.status;
  if (CANONICAL_STATUSES.has(parsed.event)) {
    newStatus = parsed.event;
  } else if (parsed.event === 'Followup') {
    // keep existing status
  }

  // Build new note prefix
  let notePrefix = '';
  if (parsed.event === 'Interview' && parsed.datetime) {
    const stage = parsed.interviewStage ? `${parsed.interviewStage} ` : '';
    notePrefix = `${stage}Interview: ${parsed.datetime}. `;
  } else if (parsed.event === 'Rejected') {
    notePrefix = `Rejected ${today}${parsed.summary ? ` — ${parsed.summary}` : ''}. `;
  } else if (parsed.event === 'Offer') {
    notePrefix = `Offer ${today}${parsed.summary ? ` — ${parsed.summary}` : ''}. `;
  } else if (parsed.event === 'Applied') {
    notePrefix = `Applied ${today}${parsed.summary ? ` — ${parsed.summary}` : ''}. `;
  } else if (parsed.event === 'Responded') {
    notePrefix = `Responded ${today}${parsed.summary ? ` — ${parsed.summary}` : ''}. `;
  } else if (parsed.event === 'Followup') {
    notePrefix = `${today} — ${parsed.summary || 'follow-up noted'}. `;
  }

  // Preserve existing notes; prepend the new context
  const newNotes = (notePrefix + target.notes).trim();

  // Rebuild the row with the same column structure
  const newRow = `| ${target.num} | ${target.date} | ${target.company} | ${target.role} | ${target.score} | ${newStatus} | ${target.pdf} | ${target.report} | ${newNotes} |`;

  rawLines[target.index] = newRow;
  writeFileSync(APPS_PATH, rawLines.join('\n'), 'utf-8');
  return { num: target.num, company: target.company, oldStatus: target.status, newStatus, newNotes };
}

// ── Logging ────────────────────────────────────────────────────────

function ensureHeader() {
  if (!existsSync(LOG_PATH)) {
    writeFileSync(LOG_PATH, 'timestamp\ttopic\tcompany\tevent\tstatus\tmessage\n', 'utf-8');
  }
  if (!existsSync(REVIEW_PATH)) {
    writeFileSync(REVIEW_PATH, '# Email ingest — review queue\n\nEvents that could not be auto-applied land here.\n\n', 'utf-8');
  }
}

function logEvent({ company, event, status, message }) {
  const ts = new Date().toISOString();
  const line = `${ts}\t${NTFY_TOPIC}\t${company || ''}\t${event || ''}\t${status || ''}\t${(message || '').replace(/[\t\n]/g, ' ')}\n`;
  appendFileSync(LOG_PATH, line, 'utf-8');
}

function appendReview(title, body) {
  const ts = new Date().toISOString();
  appendFileSync(REVIEW_PATH, `\n## ${ts} — ${title}\n\n${body}\n`, 'utf-8');
}

// ── Main loop ──────────────────────────────────────────────────────

async function fetchAttachmentBody(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`attachment HTTP ${res.status}`);
    const text = await res.text();
    return text.slice(0, 12_000);
  } finally {
    clearTimeout(timer);
  }
}

async function processMessage(msg) {
  const subject = msg.title || '(no subject)';
  let body = msg.message || '';
  const attachmentUrl = msg.attachment?.url;
  const attachmentType = msg.attachment?.type || '';
  if (attachmentUrl && attachmentType.startsWith('text/')) {
    try {
      const attachmentBody = await fetchAttachmentBody(attachmentUrl);
      body = attachmentBody || body;
    } catch (err) {
      appendReview('Attachment fetch failed', `Error: ${err.message}\nURL: ${attachmentUrl}\nSubject: ${subject}`);
      logEvent({ event: 'attachment_error', status: 'review', message: err.message });
    }
  }
  const rawInput = `Email subject:\n${subject}\n\nEmail body:\n${body}`;

  let parsed;
  try {
    const out = await callClaude(rawInput);
    parsed = extractJson(out);
  } catch (err) {
    appendReview('Parser error', `Error: ${err.message}\n\nSubject: ${subject}\n\nBody:\n${body.slice(0, 2000)}`);
    logEvent({ company: null, event: 'parse_error', status: 'review', message: err.message });
    return;
  }

  if (parsed.event === 'Ignore') {
    logEvent({ company: parsed.company, event: 'ignore', status: 'skipped', message: parsed.summary || subject });
    return;
  }

  const { rows } = parseApplicationsTable();
  const match = findBestMatch(rows, parsed.company, parsed.role);

  if (!match) {
    appendReview(`No tracker match — ${parsed.company || 'unknown'} (${parsed.event})`,
      `Parsed: ${JSON.stringify(parsed, null, 2)}\n\nSubject: ${subject}\n\nBody:\n${body.slice(0, 2000)}`);
    logEvent({ company: parsed.company, event: parsed.event, status: 'no_match', message: parsed.summary });
    return;
  }

  try {
    const result = applyUpdate(match, parsed);
    logEvent({ company: result.company, event: parsed.event, status: `${result.oldStatus}→${result.newStatus}`, message: parsed.summary });
    console.log(`[${new Date().toISOString()}] updated #${result.num} ${result.company}: ${result.oldStatus} → ${result.newStatus} — ${parsed.summary || ''}`);
  } catch (err) {
    appendReview(`Update failed — #${match.num} ${match.company}`,
      `Error: ${err.message}\n\nParsed: ${JSON.stringify(parsed, null, 2)}\n\nSubject: ${subject}`);
    logEvent({ company: match.company, event: parsed.event, status: 'update_error', message: err.message });
  }
}

async function subscribe() {
  console.log(`[email-ingest] subscribing to ${NTFY_URL}`);
  console.log(`[email-ingest] forward emails to: ${NTFY_TOPIC}@ntfy.sh`);

  while (true) {
    try {
      const res = await fetch(NTFY_URL);
      if (!res.ok) throw new Error(`ntfy HTTP ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line) continue;
          let event;
          try { event = JSON.parse(line); } catch { continue; }
          if (event.event !== 'message') continue;
          processMessage(event).catch(err => {
            console.error('[email-ingest] unhandled error:', err.message);
            logEvent({ event: 'unhandled_error', status: 'error', message: err.message });
          });
        }
      }
      console.log('[email-ingest] stream ended, reconnecting in 5s');
    } catch (err) {
      console.error('[email-ingest] subscribe error:', err.message);
    }
    await new Promise(r => setTimeout(r, 5000));
  }
}

// ── Replay mode ────────────────────────────────────────────────────

async function replayBacklog(since = '24h') {
  const url = `https://ntfy.sh/${NTFY_TOPIC}/json?poll=1&since=${encodeURIComponent(since)}`;
  console.log(`[email-ingest] replaying backlog from ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ntfy HTTP ${res.status}`);
  const body = await res.text();
  const lines = body.split('\n').filter(Boolean);
  console.log(`[email-ingest] fetched ${lines.length} messages`);
  let processed = 0;
  for (const line of lines) {
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    if (event.event !== 'message') continue;
    try {
      await processMessage(event);
      processed++;
    } catch (err) {
      console.error('[email-ingest] replay error:', err.message);
      logEvent({ event: 'unhandled_error', status: 'error', message: err.message });
    }
  }
  console.log(`[email-ingest] replay done — ${processed} messages processed`);
}

// ── Entry ─────────────────────────────────────────────────────────

ensureHeader();

const args = process.argv.slice(2);
if (args[0] === '--replay') {
  replayBacklog(args[1] || '24h').catch(err => {
    console.error('[email-ingest] replay fatal:', err);
    process.exit(1);
  });
} else {
  subscribe().catch(err => {
    console.error('[email-ingest] fatal:', err);
    process.exit(1);
  });
}
