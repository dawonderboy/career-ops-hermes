#!/usr/bin/env node
/**
 * web-dashboard.react.mjs — React-frontend variant of the career-ops dashboard.
 *
 * Same backend as web-dashboard.mjs (parses applications.md, watches files,
 * exposes /api/state, /api/stream SSE, /api/pipeline trigger, /api/update),
 * but serves the React mock at "Career Ops Dashboard.html" instead of the
 * inline HTML.
 *
 * Usage:
 *   node web-dashboard.react.mjs [--port 3939] [--path .] [--host 0.0.0.0]
 *
 * Run alongside the original (port 3737) so you can compare. Once you're
 * happy with this design, point your shortcuts at port 3939 and retire
 * web-dashboard.mjs.
 *
 * Layout expected:
 *   ./web-dashboard.mjs          (original — left untouched, used for parsers)
 *   ./web-dashboard-lib.mjs      (existing import target)
 *   ./data/applications.md
 *   ./data/pipeline.md
 *   ./reports/
 *   ./interview-prep/
 *   ./mock/                      (this dir — drop the React UI files here)
 *     ├── Career Ops Dashboard.html
 *     ├── data.js                (static fallback)
 *     ├── ui-shell.jsx
 *     ├── pipeline-view.jsx
 *     ├── progress-view.jsx
 *     ├── scan-queue.jsx
 *     ├── calendar-view.jsx
 *     ├── drawer.jsx
 *     └── tweaks-panel.jsx
 *
 * If --mock-dir is not passed, defaults to ./mock relative to this script.
 */

import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { createSecureContext } from 'node:tls';
import { readFileSync, writeFileSync, existsSync, watch, readdirSync, statSync, appendFileSync, mkdirSync, createReadStream } from 'node:fs';
import { resolve, join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import yaml from 'js-yaml';
import {
  classifyPriority, buildActionQueue, parseInterviewMeta,
  classifyInterviewStage, parsePendingItem, parsePostingDateFromReport,
  summarizeReadiness, normalizeKanban,
  defaultKanbanState as sharedDefaultKanbanState,
  readKanbanState as sharedReadKanbanState,
  writeKanbanState as sharedWriteKanbanState,
  upsertKanbanRecord as sharedUpsertKanbanRecord,
} from './web-dashboard-lib.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── CLI ──────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flag = (k, fallback) => {
  const i = args.indexOf(k);
  return i !== -1 ? args[i + 1] : fallback;
};

const optionalFlag = (k, fallback = '') => {
  const i = args.indexOf(k);
  if (i === -1) return fallback;
  return args[i + 1] || fallback;
};

const PORT     = Number(flag('--port', 3940));
const ROOT     = resolve(flag('--path', __dirname));
const HOST     = flag('--host', '0.0.0.0');
const MOCK_DIR = resolve(flag('--mock-dir', join(__dirname, 'mock')));
const CERT     = optionalFlag('--cert', process.env.DASHBOARD_TLS_CERT || '');
const KEY      = optionalFlag('--key', process.env.DASHBOARD_TLS_KEY || '');
const CERT2    = optionalFlag('--cert2', process.env.DASHBOARD_TLS_CERT2 || '');
const KEY2     = optionalFlag('--key2', process.env.DASHBOARD_TLS_KEY2 || '');
const PUBLIC_HOST = optionalFlag('--public-host', process.env.DASHBOARD_PUBLIC_HOST || '');

const APPS_PATH     = join(ROOT, 'data', 'applications.md');
const PIPELINE_PATH = join(ROOT, 'data', 'pipeline.md');
const KANBAN_PATH   = join(ROOT, 'data', 'kanban-pipeline.json');
const REPORTS_DIR   = join(ROOT, 'reports');
const PREP_DIR      = join(ROOT, 'interview-prep');
const PROFILE_PATH  = join(ROOT, 'config', 'profile.yml');
const GOOGLE_API_SCRIPT = join(process.env.HOME || '', '.hermes', 'skills', 'productivity', 'google-workspace', 'scripts', 'google_api.py');

const HTML_FILE = join(MOCK_DIR, 'Career Ops Dashboard.html');

const parseYaml = yaml.load;
const defaultInterviewKeywords = [
  'interview', 'interviews', 'screen', 'screening', 'recruiter', 'hiring manager',
  'hm', 'phone screen', 'technical', 'tech', 'fit call', 'intro chat', 'chat',
];

function loadProfileConfig() {
  try {
    if (!existsSync(PROFILE_PATH)) return {};
    return parseYaml(readFileSync(PROFILE_PATH, 'utf-8')) || {};
  } catch {
    return {};
  }
}

const PROFILE = loadProfileConfig();
function sanitizeFileStem(value) {
  return String(value || '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '');
}
function getPreferredResumeFilenames() {
  const fullName = PROFILE?.candidate?.full_name || PROFILE?.candidate?.name || '';
  const compactName = String(fullName || '').replace(/\s+/g, '');
  const names = [
    fullName ? `${fullName}-Resume.pdf` : '',
    compactName ? `${compactName}-Resume.pdf` : '',
    fullName ? `${sanitizeFileStem(fullName)}-Resume.pdf` : '',
    fullName ? `${sanitizeFileStem(fullName)}.pdf` : '',
  ].filter(Boolean);
  return [...new Set(names)];
}
function findResumePdf(outputDir, folderName) {
  const folder = join(outputDir, folderName);
  for (const file of getPreferredResumeFilenames()) {
    const candidate = join(folder, file);
    if (existsSync(candidate)) return candidate;
  }
  try {
    const pdfs = readdirSync(folder).filter(name => /\.pdf$/i.test(name)).sort();
    return pdfs.length ? join(folder, pdfs[0]) : null;
  } catch {
    return null;
  }
}
function looksLikeEmail(value) {
  return typeof value === 'string' && /@/.test(value);
}
function getGoogleCalendarConfig() {
  const raw = PROFILE?.calendar?.google || PROFILE?.calendar || {};
  const keywords = Array.isArray(raw.title_keywords) && raw.title_keywords.length
    ? raw.title_keywords
    : defaultInterviewKeywords;
  const calendarId = raw.calendar_id || raw.calendarId || 'primary';
  return {
    enabled: raw.enabled !== false,
    calendarId,
    authUser: raw.authuser_email || raw.authuserEmail || raw.account_email || raw.accountEmail || (looksLikeEmail(calendarId) ? calendarId : null),
    keywords: keywords.map(k => String(k).toLowerCase()),
  };
}
function withGoogleAuthUser(rawUrl, authUser = getGoogleCalendarConfig().authUser) {
  if (!rawUrl || !authUser) return rawUrl || null;
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase();
    const isGoogleCalendar = host === 'calendar.google.com' || (host === 'www.google.com' && url.pathname.startsWith('/calendar/'));
    const isGoogleMeet = host === 'meet.google.com';
    if (!isGoogleCalendar && !isGoogleMeet) return rawUrl;
    url.searchParams.set('authuser', authUser);
    return url.toString();
  } catch {
    return rawUrl;
  }
}

function toIsoDateTimeRange(daysBack = 7, daysForward = 14) {
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - daysBack);
  const end = new Date(now);
  end.setDate(end.getDate() + daysForward);
  return { start: start.toISOString(), end: end.toISOString() };
}

function normalizeGoogleEventText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}


function normalizeCalendarStage(raw, summary = '', description = '') {
  const text = `${raw || ''} ${summary || ''} ${description || ''}`.toLowerCase();
  if (text.includes('recruiter') || text.includes('intro') || text.includes('phone screen')) return 'recruiter';
  if (text.includes('technical') || text.includes('tech')) return 'tech';
  if (text.includes('hiring manager') || text.includes('hm')) return 'hm';
  if (text.includes('fit')) return 'fit';
  return 'other';
}

function googleEventToCalendarItem(event, apps) {
  const summary = normalizeGoogleEventText(event.summary || '(no title)');
  const description = normalizeGoogleEventText(event.description || '');
  const meta = parseInterviewMeta(`${summary}\n${description}`);
  const start = event.start || '';
  const end = event.end || '';
  const startDate = start.slice(0, 10);
  const startTime = start.includes('T') ? new Date(start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
  return {
    n: null,
    date: startDate,
    time: startTime,
    co: summary,
    kind: meta.interviewType || 'Interview',
    stage: normalizeCalendarStage(meta.stage || meta.stageKey || meta.interviewType || summary, summary, description),
    who: meta.interviewer || '—',
    meetingLink: withGoogleAuthUser(event.htmlLink || meta.meetingLink || null),
    past: false,
    title: summary,
    description,
    end,
    source: 'google-calendar',
  };
}

function fetchGoogleCalendarEvents(apps) {
  const cfg = getGoogleCalendarConfig();
  if (!cfg.enabled) {
    return { events: [], source: 'disabled', error: null };
  }
  if (!existsSync(GOOGLE_API_SCRIPT)) {
    return { events: [], source: 'missing-script', error: `google_api.py not found at ${GOOGLE_API_SCRIPT}` };
  }
  const { start, end } = toIsoDateTimeRange(7, 14);
  const result = spawnSync('python3', [
    GOOGLE_API_SCRIPT,
    'calendar', 'list',
    '--calendar', cfg.calendarId,
    '--start', start,
    '--end', end,
    '--max', '100',
  ], { encoding: 'utf-8' });
  if (result.status !== 0) {
    return {
      events: [],
      source: 'google-error',
      error: (result.stderr || result.stdout || `calendar list exited ${result.status}`).trim(),
    };
  }
  let raw = [];
  try {
    raw = JSON.parse(result.stdout || '[]');
  } catch (err) {
    return { events: [], source: 'google-error', error: `invalid JSON from google calendar: ${err.message}` };
  }
  const filtered = raw;
  const mapped = filtered
    .map(e => googleEventToCalendarItem(e, apps))
    .filter(e => e.date);
  mapped.sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.time || '').localeCompare(b.time || ''));
  return { events: mapped, source: 'google-calendar', error: null };
}

function buildTrackerCalendarEvents(apps) {
  return apps
    .filter(a => a.interviewDate)
    .map(a => ({
      n: a.n ?? a.num,
      date: a.interviewDate,
      time: a.interviewTime || '',
      co: a.company,
      kind: a.interviewType || a.stageLabel || a.stage || 'Interview',
      stage: a.stageKey && a.stageKey !== 'other'
      ? a.stageKey
      : normalizeCalendarStage(a.stage || a.interviewType || a.stageLabel, a.interviewType || a.stageLabel || ''),
      who: a.interviewer || null,
      meetingLink: withGoogleAuthUser(a.meetingLink || null),
      past: false,
      source: 'tracker',
    }))
    .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.time || '').localeCompare(b.time || ''));
}

// ── Applications parser (kept identical to web-dashboard.mjs) ────

const reportMetaCache = new Map();

// Build a URL → first_seen date map from scan-history.tsv for posting date fallback
function loadScanHistory() {
  const map = new Map();
  const tsvPath = join(dirname(fileURLToPath(import.meta.url)), 'data', 'scan-history.tsv');
  if (!existsSync(tsvPath)) return map;
  try {
    const lines = readFileSync(tsvPath, 'utf-8').split('\n');
    for (const line of lines) {
      const [url, first_seen] = line.split('\t');
      if (url && first_seen && /^\d{4}-\d{2}-\d{2}$/.test(first_seen.trim())) {
        map.set(url.trim(), first_seen.trim());
      }
    }
  } catch {}
  return map;
}
const scanHistoryDates = loadScanHistory();

function extractReportMeta(reportFile) {
  if (!reportFile) return { url: null, postingCreatedAt: null, postingCreatedDisplay: null, comp: null, remote: null, archetype: null, tldr: null };
  const full = join(REPORTS_DIR, reportFile);
  if (!existsSync(full)) return { url: null, postingCreatedAt: null, postingCreatedDisplay: null, comp: null, remote: null, archetype: null, tldr: null };
  try {
    const stat = statSync(full);
    const cached = reportMetaCache.get(reportFile);
    if (cached && cached.mtime === stat.mtimeMs) return cached.meta;
    const content = readFileSync(full, 'utf-8');
    const header = content.slice(0, 4096);
    const urlMatch = header.match(/\*\*URL:\*\*\s*(https?:\/\/\S+)/i);
    const postingCreated = parsePostingDateFromReport(content);
    const cleanCell = s => s.replace(/\*\*/g, '').replace(/\s*\|.*$/, '').trim();
    const remoteMatch = header.match(/\|\s*\*{0,2}Remote(?:\/[^|]*)?\*{0,2}\s*\|\s*([^|\n]+)/i);
    const compMatch = header.match(/\|\s*\*{0,2}Comp\*{0,2}\s*\|\s*([^|\n]+)/i);
    const rawComp = compMatch ? cleanCell(compMatch[1]) : null;
    const comp = rawComp && /^\d+\.?\d*\/5$/.test(rawComp) ? null : rawComp;
    const remote = remoteMatch ? cleanCell(remoteMatch[1]) : null;
    const archetypeMatch = header.match(/^(?!\|)\*\*(?:Archetype|Arquetipo)(?:\s+detectado)?:?\*\*:?\s*(.+)/im)
      || header.match(/\|\s*\*{0,2}(?:Archetype|Arquetipo)(?:\s+detectado)?\*{0,2}\s*\|\s*([^|\n]+)/i);
    const archetype = archetypeMatch ? cleanCell(archetypeMatch[1]) : null;
    const tldrMatch = header.match(/\|\s*TL;DR\s*\|\s*([^|\n]+)/i)
      || header.match(/\*\*TL;DR:\*\*\s*(.+)/i)
      || header.match(/^TL;DR:\s*(.+)/im);
    const rawTldr = tldrMatch ? cleanCell(tldrMatch[1]) : null;
    const tldr = rawTldr && rawTldr.length > 140 ? rawTldr.slice(0, 137) + '...' : rawTldr;
    const meta = {
      url: urlMatch ? urlMatch[1].replace(/[.,;)]+$/, '') : null,
      postingCreatedAt: postingCreated?.sortKey || null,
      postingCreatedDisplay: postingCreated?.display || null,
      comp, remote, archetype, tldr,
    };
    reportMetaCache.set(reportFile, { mtime: stat.mtimeMs, meta });
    return meta;
  } catch {
    return { url: null, postingCreatedAt: null, postingCreatedDisplay: null, comp: null, remote: null, archetype: null, tldr: null };
  }
}

function parseApplications() {
  if (!existsSync(APPS_PATH)) return [];
  const lines = readFileSync(APPS_PATH, 'utf-8').split('\n');
  const apps = [];
  for (const rawLine of lines) {
    const line = rawLine.startsWith('|| ') ? rawLine.slice(1) : rawLine;
    if (!line.startsWith('| ')) continue;
    const cells = line.split('|').slice(1, -1).map(s => s.trim());
    if (cells.length < 6) continue;
    if (cells[0] === '#' || /^-+$/.test(cells[0])) continue;
    // Short-format rows (6 cols) are missing Status | PDF | Report — infer and expand
    if (cells.length < 9) {
      const notes = cells[5] || '';
      const inferredStatus = /\bskip\b/i.test(notes) ? 'SKIP' : 'Discarded';
      cells.splice(5, 1, inferredStatus, '❌', '', notes);
    }
    const num = Number(cells[0]);
    if (!Number.isFinite(num)) continue;
    const scoreMatch = cells[4].match(/([\d.]+)\s*\/\s*5/);
    const reportMatch = cells[7].match(/\(reports\/([^)]+)\)/);
    const notesUrlMatch = cells[8].match(/https?:\/\/\S+/);
    const report = reportMatch ? reportMatch[1] : null;
    const reportMeta = extractReportMeta(report);
    const url = notesUrlMatch ? notesUrlMatch[0] : reportMeta.url;
    const { interviewType, interviewDate, interviewTime, interviewer, meetingLink, stage, stageKey } = parseInterviewMeta(cells[8]);
    apps.push({
      num,
      n: num, // alias the React mock uses
      date: cells[1],
      company: cells[2],
      role: cells[3],
      scoreRaw: cells[4],
      score: scoreMatch ? Number(scoreMatch[1]) : null,
      status: cells[5].replace(/\*\*/g, ''),
      pdf: cells[6].includes('✅'),
      report,
      notes: cells[8],
      note: cells[8], // alias
      url,
      postingCreatedAt: reportMeta.postingCreatedAt || (url ? scanHistoryDates.get(url) || null : null),
      postingCreatedDisplay: reportMeta.postingCreatedDisplay || (url ? scanHistoryDates.get(url) || null : null),
      comp: reportMeta.comp,
      remote: reportMeta.remote,
      archetype: reportMeta.archetype,
      tldr: reportMeta.tldr,
      interviewType, interviewDate, interviewTime, interviewer, meetingLink: withGoogleAuthUser(meetingLink), stage, stageKey,
    });
  }
  return apps.sort((a, b) => b.num - a.num);
}

function computeMetrics(apps) {
  const byStatus = {};
  let scoreSum = 0, scoreCount = 0, pdfCount = 0, reportCount = 0;
  for (const a of apps) {
    byStatus[a.status] = (byStatus[a.status] || 0) + 1;
    if (a.score != null) { scoreSum += a.score; scoreCount++; }
    if (a.pdf) pdfCount++;
    if (a.report) reportCount++;
  }
  return {
    total: apps.length,
    avgScore: scoreCount ? (scoreSum / scoreCount).toFixed(2) : '0.00',
    pdfPct: apps.length ? Math.round(100 * pdfCount / apps.length) : 0,
    reportPct: apps.length ? Math.round(100 * reportCount / apps.length) : 0,
    byStatus,
  };
}

function loadReport(reportFile) {
  if (!reportFile) return null;
  const full = join(REPORTS_DIR, reportFile);
  if (!existsSync(full)) return null;
  return readFileSync(full, 'utf-8');
}

function listInterviewPrep() {
  if (!existsSync(PREP_DIR)) return [];
  const items = [];
  const walk = (dir, relPrefix = '') => {
    for (const entry of readdirSync(dir)) {
      if (entry.startsWith('.') || entry.startsWith('._')) continue;
      const full = join(dir, entry);
      const rel = relPrefix ? `${relPrefix}/${entry}` : entry;
      try {
        const stat = statSync(full);
        if (stat.isDirectory()) walk(full, rel);
        else if (stat.isFile() && /\.(md|pdf)$/i.test(entry)) {
          items.push({
            file: rel, folder: relPrefix || null, name: entry,
            mtime: stat.mtimeMs,
            type: entry.toLowerCase().endsWith('.pdf') ? 'pdf' : 'md',
          });
        }
      } catch {}
    }
  };
  walk(PREP_DIR);
  return items.sort((a, b) => b.mtime - a.mtime);
}

function loadPrep(prepFile) {
  if (!prepFile || prepFile.includes('..')) return null;
  const full = join(PREP_DIR, prepFile);
  const prefix = PREP_DIR.endsWith('/') ? PREP_DIR : PREP_DIR + '/';
  if (!full.startsWith(prefix)) return null;
  if (!existsSync(full)) return null;
  return readFileSync(full, 'utf-8');
}

function loadKanbanRaw() {
  return sharedReadKanbanState(KANBAN_PATH);
}

function defaultKanbanState() {
  return sharedDefaultKanbanState();
}

function readKanbanState() {
  return sharedReadKanbanState(KANBAN_PATH);
}

function writeKanbanState(raw) {
  const next = sharedWriteKanbanState(KANBAN_PATH, raw);
  emitUpdate();
  return next;
}

function upsertKanbanRecord(input = {}) {
  const result = sharedUpsertKanbanRecord({ path: KANBAN_PATH, input, apps: parseApplications() });
  emitUpdate();
  return result;
}

function parsePendingInbox() {
  if (!existsSync(PIPELINE_PATH)) return [];
  const pending = [];
  const lines = readFileSync(PIPELINE_PATH, 'utf-8').split('\n');
  for (const line of lines) {
    if (!line.startsWith('- [ ]')) continue;
    pending.push(line.slice(5).trim());
  }
  return pending;
}

// ── SSE subscribers ──────────────────────────────────────────────

const subscribers = new Set();
function broadcast(event) {
  const payload = `event: ${event}\ndata: ${Date.now()}\n\n`;
  for (const res of subscribers) {
    try { res.write(payload); } catch {}
  }
}

let debounceTimer = null;
function emitUpdate() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => broadcast('update'), 250);
}

function startWatchers() {
  try {
    if (existsSync(APPS_PATH))     watch(APPS_PATH, emitUpdate);
    if (existsSync(PIPELINE_PATH)) watch(PIPELINE_PATH, emitUpdate);
    if (existsSync(KANBAN_PATH))   watch(KANBAN_PATH, emitUpdate);
    if (existsSync(REPORTS_DIR))   watch(REPORTS_DIR, emitUpdate);
    if (existsSync(PREP_DIR))      watch(PREP_DIR, emitUpdate);
  } catch (err) {
    console.error('[react] Watcher setup failed:', err.message);
  }
}

// ── Pipeline trigger ─────────────────────────────────────────────

const PIPELINE_LOG = join(ROOT, 'logs', 'pipeline-trigger.log');
const pipelineState = {
  running: false, startedAt: null, finishedAt: null,
  exitCode: null, lastError: null,
};

const SCAN_LOG = join(ROOT, 'logs', 'scan-trigger.log');
const scanState = {
  running: false, startedAt: null, finishedAt: null,
  exitCode: null, lastError: null,
};

// ── Seed last-run timestamps from existing log files on boot ─────────────
// Prevents "last: never" from showing after a server restart when runs have
// actually happened in previous sessions. Parses the last exit= line from
// each log to recover finishedAt and exitCode.
(function seedStateFromLogs() {
  function parseLastRun(logPath) {
    if (!existsSync(logPath)) return null;
    try {
      const text = readFileSync(logPath, 'utf-8');
      // Find the last [ISO-timestamp] line (start markers)
      const startMatches = [...text.matchAll(/\[(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\]/g)];
      // Find the last exit= line with its preceding timestamp
      const exitMatches = [...text.matchAll(/\[(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\] exit=(\d+)/g)];
      if (!exitMatches.length) return null;
      const last = exitMatches[exitMatches.length - 1];
      const finishedAt = last[1];
      const exitCode = parseInt(last[2], 10);
      // Find the start marker that preceded this exit
      const finTs = new Date(finishedAt).getTime();
      const priorStarts = startMatches.filter(m => new Date(m[1]).getTime() < finTs);
      const startedAt = priorStarts.length ? priorStarts[priorStarts.length - 1][1] : finishedAt;
      return { startedAt, finishedAt, exitCode };
    } catch {
      return null;
    }
  }
  const ps = parseLastRun(PIPELINE_LOG);
  if (ps) {
    pipelineState.startedAt = ps.startedAt;
    pipelineState.finishedAt = ps.finishedAt;
    pipelineState.exitCode = ps.exitCode;
  }
  const ss = parseLastRun(SCAN_LOG);
  if (ss) {
    scanState.startedAt = ss.startedAt;
    scanState.finishedAt = ss.finishedAt;
    scanState.exitCode = ss.exitCode;
  }
})();

function startPipeline() {
  if (pipelineState.running) return { ok: false, error: 'already-running' };
  pipelineState.running = true;
  pipelineState.startedAt = new Date().toISOString();
  pipelineState.finishedAt = null;
  pipelineState.exitCode = null;
  pipelineState.lastError = null;
  broadcast('pipeline');

  try { mkdirSync(dirname(PIPELINE_LOG), { recursive: true }); } catch {}
  try { appendFileSync(PIPELINE_LOG, `\n[${pipelineState.startedAt}] /api/pipeline triggered (react)\n`); } catch {}

  let outBuf = '';
  const proc = spawn('node', ['./pipeline-run.mjs'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const onData = d => {
    const s = d.toString();
    outBuf += s;
    try { appendFileSync(PIPELINE_LOG, s); } catch {}
  };
  proc.stdout.on('data', onData);
  proc.stderr.on('data', onData);
  proc.on('error', err => {
    pipelineState.running = false;
    pipelineState.finishedAt = new Date().toISOString();
    pipelineState.exitCode = -1;
    pipelineState.lastError = err.message;
    try { appendFileSync(PIPELINE_LOG, `\n[error] ${err.message}\n`); } catch {}
    broadcast('pipeline');
  });
  proc.on('exit', code => {
    pipelineState.running = false;
    pipelineState.finishedAt = new Date().toISOString();
    pipelineState.exitCode = code;
    if (code !== 0) pipelineState.lastError = outBuf.slice(-400).trim();
    try { appendFileSync(PIPELINE_LOG, `\n[${pipelineState.finishedAt}] exit=${code}\n`); } catch {}
    broadcast('pipeline');
  });
  return { ok: true, startedAt: pipelineState.startedAt };
}

function startScan() {
  if (scanState.running) return { ok: false, error: 'already-running' };
  scanState.running = true;
  scanState.startedAt = new Date().toISOString();
  scanState.finishedAt = null;
  scanState.exitCode = null;
  scanState.lastError = null;
  broadcast('scan');

  try { mkdirSync(dirname(SCAN_LOG), { recursive: true }); } catch {}
  try { appendFileSync(SCAN_LOG, `\n[${scanState.startedAt}] /api/scan triggered (react)\n`); } catch {}

  let outBuf = '';
  const proc = spawn('node', ['./scan-run.mjs'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const onData = d => {
    const s = d.toString();
    outBuf += s;
    try { appendFileSync(SCAN_LOG, s); } catch {}
  };
  proc.stdout.on('data', onData);
  proc.stderr.on('data', onData);
  proc.on('error', err => {
    scanState.running = false;
    scanState.finishedAt = new Date().toISOString();
    scanState.exitCode = -1;
    scanState.lastError = err.message;
    try { appendFileSync(SCAN_LOG, `\n[error] ${err.message}\n`); } catch {}
    broadcast('scan');
  });
  proc.on('exit', code => {
    scanState.running = false;
    scanState.finishedAt = new Date().toISOString();
    scanState.exitCode = code;
    if (code !== 0) scanState.lastError = outBuf.slice(-400).trim();
    try { appendFileSync(SCAN_LOG, `\n[${scanState.finishedAt}] exit=${code}\n`); } catch {}
    broadcast('scan');
  });
  return { ok: true, startedAt: scanState.startedAt };
}

// ── Static helpers ───────────────────────────────────────────────

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.jsx':  'application/javascript; charset=utf-8', // served as text; Babel transpiles in-browser
  '.json': 'application/json; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
};

function serveStatic(res, filePath) {
  if (!existsSync(filePath)) {
    res.writeHead(404);
    res.end('not found');
    return;
  }
  const ext = extname(filePath).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': type,
    'Cache-Control': 'no-cache',
  });
  res.end(readFileSync(filePath));
}

// Whitelist of mock-dir filenames servable as static assets.
// Anything outside this list 404s — keeps path traversal locked down.
const STATIC_FILES = new Set([
  'data.js',
  'tweaks-panel.jsx',
  'ui-shell.jsx',
  'scan-queue.jsx',
  'pipeline-view.jsx',
  'calendar-view.jsx',
  'progress-view.jsx',
  'drawer.jsx',
  'kanban-view.jsx',
]);

// ── Server ───────────────────────────────────────────────────────

const tlsBase = CERT && KEY && existsSync(CERT) && existsSync(KEY)
  ? { cert: readFileSync(CERT), key: readFileSync(KEY) }
  : null;

// If a second cert is provided, use SNI to pick the right cert per hostname.
// --cert2/--key2 is served for PUBLIC_HOST; --cert/--key is the default (localhost).
const tlsOpts = tlsBase && CERT2 && KEY2 && existsSync(CERT2) && existsSync(KEY2)
  ? (() => {
      const ctx1 = createSecureContext(tlsBase);
      const ctx2 = createSecureContext({ cert: readFileSync(CERT2), key: readFileSync(KEY2) });
      return {
        ...tlsBase,
        SNICallback: (servername, cb) => {
          cb(null, PUBLIC_HOST && servername === PUBLIC_HOST ? ctx2 : ctx1);
        },
      };
    })()
  : tlsBase;

const PROTO = tlsOpts ? 'https' : 'http';
const HTTP_REDIRECT_PORT = PORT + 1;

const server = (tlsOpts ? createHttpsServer(tlsOpts) : createHttpServer())
  .on('request', (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // ── Root: serve the React HTML ────────────────────────────────
  if (url.pathname === '/' || url.pathname === '/index.html') {
    if (!existsSync(HTML_FILE)) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(
`React HTML not found at:
  ${HTML_FILE}

Pass --mock-dir <path> or place the file there.`);
      return;
    }
    serveStatic(res, HTML_FILE);
    return;
  }

  // ── Static React assets (jsx, data.js fallback) ──────────────
  const pathTail = url.pathname.replace(/^\//, '');
  if (STATIC_FILES.has(pathTail)) {
    serveStatic(res, join(MOCK_DIR, pathTail));
    return;
  }

  // ── /api/state ───────────────────────────────────────────────
  if (url.pathname === '/api/state') {
    try {
      const apps = parseApplications().map(a => {
        const sc = a.stage ? classifyInterviewStage(a.stage) : null;
        const readiness = summarizeReadiness(a);
        return {
          ...a,
          priority: classifyPriority(a),
          readiness,
          tldr: a.tldr || a.notes || '',
          stageLabel: sc ? sc.emoji + ' ' + sc.label : (a.stage || null),
          stageKey: a.stageKey || (sc ? sc.label.toLowerCase() : (a.stage || '').toLowerCase()),
        };
      });
      const metrics = computeMetrics(apps);
      const inbox = parsePendingInbox();
      const inboxItems = inbox.map(parsePendingItem);
      const actions = buildActionQueue(apps);
      const prep = listInterviewPrep();
      const googleCalendar = fetchGoogleCalendarEvents(apps);
      const calendarEvents = googleCalendar.events.length ? googleCalendar.events : buildTrackerCalendarEvents(apps);
      const calendarSource = googleCalendar.events.length ? googleCalendar.source : 'tracker-fallback';
      const kanban = normalizeKanban(loadKanbanRaw(), apps);
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      });
      res.end(JSON.stringify({ apps, metrics, inbox, inboxItems, actions, prep, calendarEvents, calendarSource, calendarError: googleCalendar.error, kanban }));
    } catch (err) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // ── /api/stream (SSE) ────────────────────────────────────────
  if (url.pathname === '/api/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    });
    res.write(`event: hello\ndata: ${Date.now()}\n\n`);
    subscribers.add(res);
    const heartbeat = setInterval(() => {
      try { res.write(`: heartbeat\n\n`); } catch {}
    }, 15000);
    req.on('close', () => {
      clearInterval(heartbeat);
      subscribers.delete(res);
    });
    return;
  }

  // ── /api/pipeline-status ─────────────────────────────────────
  if (url.pathname === '/api/pipeline-status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(pipelineState));
    return;
  }

  // ── /api/pipeline (POST) — kicks off /career-ops pipeline ────
  if (url.pathname === '/api/pipeline' && req.method === 'POST') {
    const result = startPipeline();
    if (!result.ok) {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: result.error, startedAt: pipelineState.startedAt }));
      return;
    }
    res.writeHead(202, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
    return;
  }

  if (url.pathname === '/api/scan' && req.method === 'POST') {
    const result = startScan();
    if (!result.ok) {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: result.error, startedAt: scanState.startedAt }));
      return;
    }
    res.writeHead(202, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
    return;
  }

  if (url.pathname === '/api/kanban/upsert' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const data = payload && typeof payload.patch === 'object'
          ? { ...(payload.patch || {}), ...(payload.id ? { id: payload.id } : {}) }
          : payload;
        const result = upsertKanbanRecord(data);
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(result));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  if (url.pathname === '/api/kanban/update' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { id, current_stage } = JSON.parse(body || '{}');
        if (!id || typeof id !== 'string' || !current_stage || typeof current_stage !== 'string') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'invalid input' }));
          return;
        }
        const raw = readKanbanState();
        const existing = Array.isArray(raw.records) ? raw.records.find(r => String(r.id) === String(id)) : null;
        upsertKanbanRecord({ ...(existing || {}), id, current_stage });
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // ── /api/update (POST) — edit status/notes for app ────────────
  if (url.pathname === '/api/update' && req.method === 'POST') {
    const VALID_STATUSES = ['Evaluated','Applied','Responded','Interview','Offer','Rejected','Discarded'];
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { num, status, notes } = JSON.parse(body);
        if (!Number.isFinite(num) || !VALID_STATUSES.includes(status) || typeof notes !== 'string') {
          res.writeHead(400); res.end('invalid input'); return;
        }
        if (!existsSync(APPS_PATH)) { res.writeHead(404); res.end('file not found'); return; }
        const lines = readFileSync(APPS_PATH, 'utf-8').split('\n');
        let updated = false;
        for (let i = 0; i < lines.length; i++) {
          if (!lines[i].startsWith('|')) continue;
          const prefix = lines[i].startsWith('|| ') ? '|' : '';
          const line = prefix ? lines[i].slice(1) : lines[i];
          const parts = line.split('|');
          if (parseInt((parts[1] || '').trim()) !== num) continue;
          parts[6] = ` ${status} `;
          parts[9] = ` ${notes.replace(/\|/g, '/')} `;
          lines[i] = prefix + parts.join('|');
          updated = true;
          break;
        }
        if (!updated) { res.writeHead(404); res.end('row not found'); return; }
        writeFileSync(APPS_PATH, lines.join('\n'), 'utf-8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(500); res.end(e.message);
      }
    });
    return;
  }

  // ── /api/pdf (GET) — serve CV PDF by company name ────────────────
  if (url.pathname === '/api/pdf') {
    const company = url.searchParams.get('company') || '';
    if (!company) { res.writeHead(400); res.end('missing company'); return; }
    const outputDir = join(ROOT, 'output');
    if (!existsSync(outputDir)) { res.writeHead(404); res.end('output dir not found'); return; }
    const dirs = readdirSync(outputDir);
    const findDir = (name) => dirs.find(d => d.toLowerCase().startsWith(name.toLowerCase() + ' -'));
    const short = company.replace(/\s*\(.*?\)\s*/g, '').trim();
    const match = findDir(company) || findDir(short) || dirs.find(d => {
      const dl = d.toLowerCase();
      return short.toLowerCase().split(/\s+/).every((w, i) => i === 0 ? dl.startsWith(w) : dl.includes(w));
    });
    if (!match) { res.writeHead(404); res.end('pdf not found'); return; }
    const pdfPath = findResumePdf(outputDir, match);
    if (!pdfPath) { res.writeHead(404); res.end('pdf file not found'); return; }
    const stat = statSync(pdfPath);
    res.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Content-Length': stat.size,
      'Content-Disposition': `inline; filename="${pdfPath.split('/').pop()}"`,
    });
    createReadStream(pdfPath).pipe(res);
    return;
  }

  // ── /api/queue/remove (POST) ──────────────────────────────────
  if (url.pathname === '/api/queue/remove' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { url: targetUrl } = JSON.parse(body);
        if (!targetUrl || typeof targetUrl !== 'string') {
          res.writeHead(400); res.end('invalid url'); return;
        }
        if (!existsSync(PIPELINE_PATH)) { res.writeHead(404); res.end('pipeline not found'); return; }
        const lines = readFileSync(PIPELINE_PATH, 'utf-8').split('\n');
        const filtered = lines.filter(line => {
          if (!line.startsWith('- [ ]')) return true;
          return !line.includes(targetUrl);
        });
        if (filtered.length === lines.length) { res.writeHead(404); res.end('url not found'); return; }
        writeFileSync(PIPELINE_PATH, filtered.join('\n'), 'utf-8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(500); res.end(e.message);
      }
    });
    return;
  }

  // ── /api/report ───────────────────────────────────────────────
  if (url.pathname === '/api/report') {
    const file = url.searchParams.get('file') || '';
    if (file.includes('..') || file.includes('/')) {
      res.writeHead(400); res.end('invalid file'); return;
    }
    const content = loadReport(file);
    if (content == null) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(content);
    return;
  }

  // ── /api/prep ─────────────────────────────────────────────────
  if (url.pathname === '/api/prep') {
    const file = url.searchParams.get('file') || '';
    if (file.includes('..') || file.startsWith('/')) {
      res.writeHead(400); res.end('invalid file'); return;
    }
    if (/\.pdf$/i.test(file)) {
      const abs = join(PREP_DIR, file);
      if (!existsSync(abs)) { res.writeHead(404); res.end('not found'); return; }
      const st = statSync(abs);
      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Length': st.size,
        'Content-Disposition': `inline; filename="${file.split('/').pop()}"`,
      });
      createReadStream(abs).pipe(res);
      return;
    }
    const content = loadPrep(file);
    if (content == null) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(content);
    return;
  }

  res.writeHead(404);
  res.end('not found');
  });

server.listen(PORT, HOST, () => {
  const lanIp = Object.values(networkInterfaces()).flat()
    .find(i => i.family === 'IPv4' && !i.internal)?.address;
  console.log(`career-ops dashboard (react) → ${PROTO}://localhost:${PORT}`);
  if (tlsOpts && PUBLIC_HOST) {
    console.log(`  public host                → https://${PUBLIC_HOST}:${PORT}`);
  }
  if (tlsOpts) {
    console.log(`  http redirect              → http://localhost:${HTTP_REDIRECT_PORT} → https://localhost:${PORT}`);
  }
  if (lanIp) console.log(`  on your network            → ${PROTO}://${lanIp}:${PORT}`);
  console.log(`  watching: ${APPS_PATH}`);
  console.log(`            ${PIPELINE_PATH}`);
  console.log(`            ${REPORTS_DIR}`);
  console.log(`  serving HTML from: ${MOCK_DIR}`);
  startWatchers();
});

// HTTP → HTTPS redirect companion (only when TLS is active)
if (tlsOpts) {
  createHttpServer((req, res) => {
    const host = (req.headers.host || `${PUBLIC_HOST || 'localhost'}:${PORT}`)
      .replace(/:\d+$/, `:${PORT}`);
    res.writeHead(301, { Location: `https://${host}${req.url || '/'}` });
    res.end();
  }).listen(HTTP_REDIRECT_PORT, HOST);
}
