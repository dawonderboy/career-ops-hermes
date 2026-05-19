#!/usr/bin/env node
/**
 * web-dashboard.mjs — Browser dashboard for career-ops with real-time updates.
 *
 * Usage:
 *   node web-dashboard.mjs [--port 3737] [--path .] [--host 0.0.0.0]
 *
 * Then open http://localhost:3737 (or your LAN IP on any device)
 *
 * Auto-updates when:
 *   - data/applications.md changes
 *   - reports/ directory contents change
 *   - data/pipeline.md changes
 */

import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, watch, readdirSync, statSync, appendFileSync, mkdirSync, createReadStream } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';
import { deflateSync } from 'node:zlib';
import { spawn, spawnSync } from 'node:child_process';
import yaml from 'js-yaml';
import { classifyPriority, buildActionQueue, parseInterviewMeta, classifyInterviewStage, parsePendingItem, parsePostingDateFromReport, summarizeReadiness, normalizeKanban, defaultKanbanState as sharedDefaultKanbanState, readKanbanState as sharedReadKanbanState, writeKanbanState as sharedWriteKanbanState, upsertKanbanRecord as sharedUpsertKanbanRecord, pipelineHasExactQueuedUrl as sharedPipelineHasExactQueuedUrl } from './web-dashboard-lib.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── PWA icon generator (no external deps) ────────────────────────
function makePng(size) {
  const CRC_TABLE = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    CRC_TABLE[i] = c;
  }
  const crc32 = buf => {
    let c = 0xFFFFFFFF;
    for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  };
  const u32 = n => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
  const chunk = (type, data) => {
    const t = Buffer.from(type), d = Buffer.from(data);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, d])));
    const len = Buffer.alloc(4); len.writeUInt32BE(d.length);
    return Buffer.concat([len, t, d, crc]);
  };
  // RGBA pixels: #0b0f14 bg with a #60a5fa / #c084fc gradient circle
  const raw = [];
  const cx = size / 2, cy = size / 2, r = size * 0.38;
  for (let y = 0; y < size; y++) {
    raw.push(0); // filter: None
    for (let x = 0; x < size; x++) {
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      if (dist <= r) {
        const t = Math.max(0, Math.min(1, (x - cx + r) / (2 * r)));
        raw.push(Math.round(0x60 + t * (0xc0 - 0x60))); // R
        raw.push(Math.round(0xa5 + t * (0x84 - 0xa5))); // G
        raw.push(Math.round(0xfa + t * (0xfc - 0xfa))); // B
        raw.push(255);
      } else {
        raw.push(0x0b, 0x0f, 0x14, 255);
      }
    }
  }
  const ihdr = chunk('IHDR', [...u32(size), ...u32(size), 8, 6, 0, 0, 0]);
  const idat = chunk('IDAT', deflateSync(Buffer.from(raw)));
  const iend = chunk('IEND', []);
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), ihdr, idat, iend]);
}
const ICON_180 = makePng(180);
const ICON_192 = makePng(192);
const args = process.argv.slice(2);
const portIdx = args.indexOf('--port');
const pathIdx = args.indexOf('--path');
const hostIdx = args.indexOf('--host');
const PORT = portIdx !== -1 ? Number(args[portIdx + 1]) : 3737;
const ROOT = pathIdx !== -1 ? resolve(args[pathIdx + 1]) : __dirname;
const HOST = hostIdx !== -1 ? args[hostIdx + 1] : '0.0.0.0';

const APPS_PATH = join(ROOT, 'data', 'applications.md');
const PIPELINE_PATH = join(ROOT, 'data', 'pipeline.md');
const KANBAN_PATH = join(ROOT, 'data', 'kanban-pipeline.json');
const REPORTS_DIR = join(ROOT, 'reports');
const PREP_DIR = join(ROOT, 'interview-prep');
const PROFILE_PATH = join(ROOT, 'config', 'profile.yml');
const MOCK_DIR = join(__dirname, 'mock');
const REACT_HTML = join(MOCK_DIR, 'Career Ops Dashboard.html');
const REACT_ASSETS = new Set([
  'data.js', 'tweaks-panel.jsx', 'ui-shell.jsx', 'scan-queue.jsx',
  'pipeline-view.jsx', 'kanban-view.jsx', 'calendar-view.jsx',
  'progress-view.jsx', 'drawer.jsx',
]);
const REACT_MIME = {
  js:  'application/javascript; charset=utf-8',
  jsx: 'application/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
};
const GOOGLE_API_SCRIPT = join(process.env.HOME || '', '.hermes', 'skills', 'productivity', 'google-workspace', 'scripts', 'google_api.py');
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

function googleEventToCalendarItem(event) {
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

function fetchGoogleCalendarEvents() {
  const cfg = getGoogleCalendarConfig();
  if (!cfg.enabled) return { events: [], source: 'disabled', error: null };
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
  const events = raw.map(googleEventToCalendarItem)
    .filter(e => e.date);
  events.sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.time || '').localeCompare(b.time || ''));
  return { events, source: 'google-calendar', error: null };
}

function buildTrackerCalendarEvents(apps) {
  const today = new Date().toISOString().slice(0, 10);
  return apps
    .filter(a => a.interviewDate)
    .map(a => ({
      n: a.num,
      co: a.company,
      date: a.interviewDate,
      time: a.interviewTime || '',
      stage: a.stageKey && a.stageKey !== 'other'
        ? a.stageKey
        : normalizeCalendarStage(a.stageLabel || a.stage || a.kind || 'Interview', a.stageLabel || a.stage || '', ''),
      kind: a.stageLabel || a.stage || 'Interview',
      who: a.interviewer || null,
      meetingLink: withGoogleAuthUser(a.meetingLink || null),
      past: a.interviewDate < today,
      title: a.company,
      source: 'tracker',
    }));
}

// Cache report metadata (keyed by report filename, invalidated via mtime)
const reportMetaCache = new Map();

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

    // Extract enrichment fields from the role summary table (always within first ~4096 chars).
    // Handles both plain keys (| Remote |) and bold keys (| **Remote** |).
    const cleanCell = s => s.replace(/\*\*/g, '').replace(/\s*\|.*$/, '').trim();
    const remoteMatch = header.match(/\|\s*\*{0,2}Remote(?:\/[^|]*)?\*{0,2}\s*\|\s*([^|\n]+)/i);
    const compMatch = header.match(/\|\s*\*{0,2}Comp\*{0,2}\s*\|\s*([^|\n]+)/i);
    const rawComp = compMatch ? cleanCell(compMatch[1]) : null;
    // Filter out scoring rows where the cell value is just a score (e.g. "4.5/5")
    const comp = rawComp && /^\d+\.?\d*\/5$/.test(rawComp) ? null : rawComp;
    const remote = remoteMatch ? cleanCell(remoteMatch[1]) : null;
    // Archetype: line-start bold header (handles **Arquetipo:** and **Archetype**:) OR table row
    // The (?!\|) lookahead prevents matching table cells like | **Archetype** | value |
    const archetypeMatch = header.match(/^(?!\|)\*\*(?:Archetype|Arquetipo)(?:\s+detectado)?:?\*\*:?\s*(.+)/im)
      || header.match(/\|\s*\*{0,2}(?:Archetype|Arquetipo)(?:\s+detectado)?\*{0,2}\s*\|\s*([^|\n]+)/i);
    const archetype = archetypeMatch ? cleanCell(archetypeMatch[1]) : null;
    // TL;DR: table format, bold colon format, or plain line
    const tldrMatch = header.match(/\|\s*TL;DR\s*\|\s*([^|\n]+)/i)
      || header.match(/\*\*TL;DR:\*\*\s*(.+)/i)
      || header.match(/^TL;DR:\s*(.+)/im);
    const rawTldr = tldrMatch ? cleanCell(tldrMatch[1]) : null;
    const tldr = rawTldr && rawTldr.length > 140 ? rawTldr.slice(0, 137) + '...' : rawTldr;

    const meta = {
      url: urlMatch ? urlMatch[1].replace(/[.,;)]+$/, '') : null,
      postingCreatedAt: postingCreated?.sortKey || null,
      postingCreatedDisplay: postingCreated?.display || null,
      comp,
      remote,
      archetype,
      tldr,
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
    // URL priority: notes column > report file header
    const url = notesUrlMatch ? notesUrlMatch[0] : reportMeta.url;
    const { interviewType, interviewDate, interviewTime, interviewer, meetingLink, stage, stageKey } = parseInterviewMeta(cells[8]);
    apps.push({
      num,
      date: cells[1],
      company: cells[2],
      role: cells[3],
      scoreRaw: cells[4],
      score: scoreMatch ? Number(scoreMatch[1]) : null,
      status: cells[5].replace(/\*\*/g, ''),
      pdf: cells[6].includes('✅'),
      report,
      notes: cells[8],
      url,
      postingCreatedAt: reportMeta.postingCreatedAt || (url ? scanHistoryDates.get(url) || null : null),
      postingCreatedDisplay: reportMeta.postingCreatedDisplay || (url ? scanHistoryDates.get(url) || null : null),
      comp: reportMeta.comp,
      remote: reportMeta.remote,
      archetype: reportMeta.archetype,
      tldr: reportMeta.tldr,
      interviewType,
      interviewDate,
      interviewTime,
      interviewer,
      meetingLink: withGoogleAuthUser(meetingLink),
      stage,
      stageKey,
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

// ── Reports parser ─────────────────────────────────────────────────

function loadReport(reportFile) {
  if (!reportFile) return null;
  const full = join(REPORTS_DIR, reportFile);
  if (!existsSync(full)) return null;
  return readFileSync(full, 'utf-8');
}

// ── Interview prep parser ─────────────────────────────────────────

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
        if (stat.isDirectory()) {
          walk(full, rel);
        } else if (stat.isFile() && /\.(md|pdf)$/i.test(entry)) {
          const folder = relPrefix || null;
          const type = entry.toLowerCase().endsWith('.pdf') ? 'pdf' : 'md';
          items.push({ file: rel, folder, name: entry, mtime: stat.mtimeMs, type });
        }
      } catch { /* skip */ }
    }
  };
  walk(PREP_DIR);
  items.sort((a, b) => b.mtime - a.mtime);
  return items;
}

function loadPrep(prepFile) {
  if (!prepFile) return null;
  if (prepFile.includes('..')) return null;
  const full = join(PREP_DIR, prepFile);
  const prefix = PREP_DIR.endsWith('/') ? PREP_DIR : PREP_DIR + '/';
  if (!full.startsWith(prefix)) return null;
  if (!existsSync(full)) return null;
  return readFileSync(full, 'utf-8');
}

// ── Pipeline parser (pending inbox) ────────────────────────────────

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

// ── SSE subscribers ────────────────────────────────────────────────

const subscribers = new Set();
function broadcast(event) {
  const payload = `event: ${event}\ndata: ${Date.now()}\n\n`;
  for (const res of subscribers) {
    try { res.write(payload); } catch { /* client gone */ }
  }
}

// Debounced file watcher
let debounceTimer = null;
function emitUpdate() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => broadcast('update'), 250);
}

function startWatchers() {
  try {
    if (existsSync(APPS_PATH)) watch(APPS_PATH, emitUpdate);
    if (existsSync(PIPELINE_PATH)) watch(PIPELINE_PATH, emitUpdate);
    if (existsSync(KANBAN_PATH)) watch(KANBAN_PATH, emitUpdate);
    if (existsSync(REPORTS_DIR)) watch(REPORTS_DIR, emitUpdate);
    if (existsSync(PREP_DIR)) watch(PREP_DIR, emitUpdate);
  } catch (err) {
    console.error('Watcher setup failed:', err.message);
  }
}

// ── Pipeline trigger state ─────────────────────────────────────────
const PIPELINE_LOG = join(ROOT, 'logs', 'pipeline-trigger.log');
const pipelineState = {
  running: false,
  startedAt: null,
  finishedAt: null,
  exitCode: null,
  lastError: null,
};

const SCAN_LOG = join(ROOT, 'logs', 'scan-trigger.log');
const scanState = {
  running: false,
  startedAt: null,
  finishedAt: null,
  exitCode: null,
  lastError: null,
};

function startPipeline() {
  if (pipelineState.running) return { ok: false, error: 'already-running' };
  pipelineState.running = true;
  pipelineState.startedAt = new Date().toISOString();
  pipelineState.finishedAt = null;
  pipelineState.exitCode = null;
  pipelineState.lastError = null;
  broadcast('pipeline');

  try { mkdirSync(dirname(PIPELINE_LOG), { recursive: true }); } catch {}
  try { appendFileSync(PIPELINE_LOG, `\n[${pipelineState.startedAt}] /api/pipeline triggered\n`); } catch {}

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
  try { appendFileSync(SCAN_LOG, `\n[${scanState.startedAt}] /api/scan triggered\n`); } catch {}

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

// ── Markdown renderer (defined here so .toString() embeds it cleanly) ──
function renderMarkdown(md) {
  var html = '';
  var lines = md.split('\n');
  var inList = false, listType = null;
  var inCodeBlock = false, codeLines = [];
  var inTable = false, tableRows = [];
  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function safeUrl(u) { return /^https?:\/\//.test(u) ? esc(u) : '#'; }
  function inline(s) {
    s = esc(s);
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\*([^*\s][^*]*)\*/g, '<em>$1</em>');
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function(_, t, u) {
      return '<a href="' + safeUrl(u) + '" target="_blank" rel="noopener">' + t + '</a>';
    });
    return s;
  }
  function flushList() {
    if (inList) { html += listType === 'ul' ? '</ul>' : '</ol>'; inList = false; listType = null; }
  }
  function flushTable() {
    if (!inTable || !tableRows.length) { inTable = false; tableRows = []; return; }
    function cells(row) { return row.split('|').slice(1, -1).map(function(c) { return c.trim(); }); }
    function isSep(row) { return /^\|[\s\-:|]+\|/.test(row); }
    html += '<div class="md-table"><table>';
    var inBody = false;
    for (var r = 0; r < tableRows.length; r++) {
      if (r === 0) {
        html += '<thead><tr>' + cells(tableRows[r]).map(function(c) { return '<th>' + inline(c) + '</th>'; }).join('') + '</tr></thead>';
      } else if (isSep(tableRows[r])) {
        html += '<tbody>'; inBody = true;
      } else {
        if (!inBody) { html += '<tbody>'; inBody = true; }
        html += '<tr>' + cells(tableRows[r]).map(function(c) { return '<td>' + inline(c) + '</td>'; }).join('') + '</tr>';
      }
    }
    if (inBody) html += '</tbody>';
    html += '</table></div>';
    inTable = false; tableRows = [];
  }
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (line.startsWith('```')) {
      if (!inCodeBlock) { flushList(); flushTable(); codeLines = []; inCodeBlock = true; }
      else { html += '<pre><code>' + esc(codeLines.join('\n')) + '</code></pre>'; inCodeBlock = false; }
      continue;
    }
    if (inCodeBlock) { codeLines.push(line); continue; }
    if (line.startsWith('|')) { flushList(); inTable = true; tableRows.push(line); continue; }
    else if (inTable) { flushTable(); }
    if (/^-{3,}$/.test(line.trim())) { flushList(); html += '<hr>'; continue; }
    var m;
    if ((m = line.match(/^#### (.+)/))) { flushList(); html += '<h4>' + inline(m[1]) + '</h4>'; continue; }
    if ((m = line.match(/^### (.+)/)))  { flushList(); html += '<h3>' + inline(m[1]) + '</h3>'; continue; }
    if ((m = line.match(/^## (.+)/)))   { flushList(); html += '<h2>' + inline(m[1]) + '</h2>'; continue; }
    if ((m = line.match(/^# (.+)/)))    { flushList(); html += '<h1>' + inline(m[1]) + '</h1>'; continue; }
    if ((m = line.match(/^[-*] (.+)/))) {
      if (!inList || listType !== 'ul') { flushList(); html += '<ul>'; inList = true; listType = 'ul'; }
      html += '<li>' + inline(m[1]) + '</li>'; continue;
    }
    if ((m = line.match(/^\d+\. (.+)/))) {
      if (!inList || listType !== 'ol') { flushList(); html += '<ol>'; inList = true; listType = 'ol'; }
      html += '<li>' + inline(m[1]) + '</li>'; continue;
    }
    flushList();
    if (line.trim() === '') { html += '<div class="md-gap"></div>'; continue; }
    html += '<p>' + inline(line) + '</p>';
  }
  flushList(); flushTable();
  return html;
}

// ── HTML template ──────────────────────────────────────────────────

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#0b0f14">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black">
<meta name="apple-mobile-web-app-title" content="career-ops">
<link rel="manifest" href="/manifest.json">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<title>career-ops · dashboard</title>
<style>
  :root {
    --bg: #0b0f14;
    --bg-elev: #10161e;
    --panel: #151c26;
    --panel-hi: #1b2431;
    --border: #242f3d;
    --border-hi: #334155;
    --text: #e2e8f0;
    --muted: #8b98a9;
    --muted-dim: #5a6675;
    --accent: #60a5fa;
    --accent-glow: rgba(96, 165, 250, 0.15);
    --success: #4ade80;
    --warning: #fbbf24;
    --danger: #f87171;
    --purple: #c084fc;
    /* density (overridden by [data-density]) */
    --row-py: 9px;
    --row-px: 12px;
    --card-py: 14px;
    --card-px: 16px;
  }
  :root[data-density="compact"]   { --row-py: 6px;  --row-px: 10px; --card-py: 10px; --card-px: 12px; }
  :root[data-density="cozy"]      { --row-py: 9px;  --row-px: 12px; --card-py: 14px; --card-px: 16px; }
  :root[data-density="roomy"]     { --row-py: 13px; --row-px: 16px; --card-py: 18px; --card-px: 20px; }
  /* latte (light) theme — minimal override of bg + text vars */
  :root[data-theme="latte"] {
    --bg: #eff1f5;
    --bg-elev: #e6e9ef;
    --panel: #ffffff;
    --panel-hi: #f4f6f9;
    --border: #dce0e8;
    --border-hi: #ccd0da;
    --text: #4c4f69;
    --muted: #6c6f85;
    --muted-dim: #9ca0b0;
    --accent: #1e66f5;
    --accent-glow: rgba(30, 102, 245, 0.10);
    --success: #40a02b;
    --warning: #df8e1d;
    --danger:  #d20f39;
    --purple:  #8839ef;
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    margin: 0;
    font-family: "Inter", ui-sans-serif, -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif;
    background:
      radial-gradient(1200px 500px at 80% -200px, rgba(96, 165, 250, 0.06), transparent 60%),
      radial-gradient(900px 400px at -100px -100px, rgba(192, 132, 252, 0.04), transparent 60%),
      var(--bg);
    color: var(--text);
    font-size: 13px;
    line-height: 1.45;
    -webkit-font-smoothing: antialiased;
    font-feature-settings: "cv02", "cv03", "cv04", "cv11";
  }
  header {
    position: sticky; top: 0; z-index: 10;
    background: rgba(16, 22, 30, 0.85);
    backdrop-filter: saturate(160%) blur(10px);
    -webkit-backdrop-filter: saturate(160%) blur(10px);
    border-bottom: 1px solid var(--border);
    padding: 10px 20px;
    display: flex; align-items: center; gap: 18px;
  }
  .brand { display: flex; align-items: center; gap: 10px; }
  .brand-dot {
    width: 10px; height: 10px; border-radius: 50%;
    background: linear-gradient(135deg, var(--accent), var(--purple));
    box-shadow: 0 0 10px var(--accent-glow);
  }
  h1 {
    margin: 0; font-size: 13px; font-weight: 700;
    letter-spacing: 1.4px; text-transform: uppercase;
    color: var(--text);
  }
  h1 .sep { color: var(--muted-dim); margin: 0 6px; font-weight: 400; }
  h1 .sub { color: var(--muted); font-weight: 500; letter-spacing: 0.5px; }
  .metrics {
    display: flex; gap: 6px; font-size: 11px; color: var(--muted);
    margin-left: 4px; flex-wrap: wrap;
  }
  .metrics .chip {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 4px 10px; border-radius: 999px;
    background: rgba(255,255,255,0.03);
    border: 1px solid var(--border);
    font-variant-numeric: tabular-nums;
  }
  .metrics .chip b { color: var(--text); font-weight: 600; }
  .metrics .chip .k { color: var(--muted-dim); text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px; }
  .search-wrap {
    position: relative; display: flex; align-items: center;
    margin-left: auto;
  }
  .search-input {
    background: rgba(255,255,255,0.04);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text);
    font-family: inherit;
    font-size: 12px;
    padding: 5px 26px 5px 10px;
    width: 200px;
    outline: none;
    transition: border-color 0.15s ease, width 0.2s ease, background 0.15s ease;
  }
  .search-input:focus {
    border-color: rgba(96, 165, 250, 0.5);
    background: rgba(96, 165, 250, 0.05);
    width: 260px;
  }
  .search-input::placeholder { color: var(--muted-dim); }
  .search-clear {
    position: absolute; right: 7px; top: 50%; transform: translateY(-50%);
    cursor: pointer; background: none; border: none;
    color: var(--muted-dim); font-size: 16px; line-height: 1;
    padding: 0; display: none; transition: color 0.12s ease;
  }
  .search-clear:hover { color: var(--text); }
  .search-clear.visible { display: block; }
  .live {
    display: flex; align-items: center; gap: 6px;
    font-size: 11px; color: var(--muted); font-weight: 500;
  }
  .live-dot {
    display: inline-block; width: 7px; height: 7px;
    border-radius: 50%; background: var(--success);
    box-shadow: 0 0 8px rgba(74, 222, 128, 0.5);
    animation: pulse 2s ease-in-out infinite;
  }
  .live-dot.stale { background: var(--muted-dim); box-shadow: none; animation: none; }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  .pipeline-btn {
    display: inline-flex; align-items: center; gap: 6px;
    background: linear-gradient(135deg, var(--accent), var(--purple));
    color: #001019; border: none; border-radius: 7px;
    padding: 6px 12px; font: 600 12px/1 inherit;
    cursor: pointer; font-family: inherit;
    transition: opacity 0.15s, filter 0.15s;
    min-height: 32px; white-space: nowrap;
  }
  .pipeline-btn:hover { filter: brightness(1.1); }
  .pipeline-btn:active { transform: translateY(1px); }
  .pipeline-btn[disabled] { opacity: 0.55; cursor: not-allowed; }
  .pipeline-btn.running {
    background: var(--warning); color: #1a1300;
    animation: pulse 1.4s ease-in-out infinite;
  }
  .pipeline-btn.error { background: var(--danger); color: #fff; }
  .pipeline-btn-icon { font-size: 10px; }
  .tabs {
    position: sticky; top: 44px; z-index: 9;
    display: flex; gap: 4px; padding: 8px 20px;
    background: rgba(11, 15, 20, 0.9);
    backdrop-filter: saturate(160%) blur(10px);
    -webkit-backdrop-filter: saturate(160%) blur(10px);
    border-bottom: 1px solid var(--border);
    overflow-x: auto;
    scrollbar-width: none;
  }
  .tabs::-webkit-scrollbar { display: none; }
  .tab {
    padding: 6px 12px; cursor: pointer;
    background: transparent; border: 1px solid transparent;
    border-radius: 6px;
    color: var(--muted); font-size: 11px; font-weight: 600;
    letter-spacing: 0.3px;
    white-space: nowrap;
    transition: all 0.15s ease;
    display: inline-flex; align-items: center; gap: 6px;
  }
  .tab:hover {
    color: var(--text);
    background: rgba(255,255,255,0.03);
  }
  .tab.active {
    background: var(--accent-glow);
    color: var(--accent);
    border-color: rgba(96, 165, 250, 0.25);
  }
  .tab .count {
    padding: 1px 7px; border-radius: 999px;
    background: rgba(255,255,255,0.05); font-size: 10px;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .tab.active .count { background: rgba(96, 165, 250, 0.18); color: var(--accent); }
  main { padding: 14px 20px 40px; max-width: 1600px; margin: 0 auto; }
  .table-card {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 8px;
  }
  table {
    width: 100%; border-collapse: separate; border-spacing: 0; font-size: 12px;
  }
  th {
    text-align: left; padding: var(--row-py) var(--row-px);
    background: var(--panel-hi); color: var(--muted);
    font-weight: 600; letter-spacing: 0.4px;
    text-transform: uppercase; font-size: 10px;
    border-bottom: 1px solid var(--border);
    position: sticky; top: 86px;
    cursor: pointer;
    user-select: none;
    transition: color 0.15s ease;
    z-index: 5;
  }
  thead th:first-child { border-top-left-radius: 8px; }
  thead th:last-child  { border-top-right-radius: 8px; }
  tbody tr:last-child td:first-child { border-bottom-left-radius: 8px; }
  tbody tr:last-child td:last-child  { border-bottom-right-radius: 8px; }
  th:hover { color: var(--accent); }
  td {
    padding: var(--row-py) var(--row-px); border-bottom: 1px solid var(--border);
    vertical-align: top;
  }
  tr:last-child td { border-bottom: none; }
  tbody tr { transition: background 0.12s ease; }
  tbody tr:hover td { background: rgba(96, 165, 250, 0.04); }
  .score {
    display: inline-block; min-width: 36px; text-align: center;
    padding: 2px 8px; border-radius: 4px; font-weight: 600;
    font-variant-numeric: tabular-nums; font-size: 11px;
  }
  .score.high { background: rgba(74, 222, 128, 0.15); color: var(--success); }
  .score.mid  { background: rgba(251, 191, 36, 0.12); color: var(--warning); }
  .score.low  { background: rgba(248, 113, 113, 0.12); color: var(--danger); }
  .status {
    display: inline-block; padding: 2px 9px; border-radius: 999px;
    font-size: 10px; font-weight: 600; letter-spacing: 0.3px;
  }
  .status.Applied    { background: rgba(96, 165, 250, 0.15); color: var(--accent); }
  .status.Evaluated  { background: rgba(251, 191, 36, 0.12); color: var(--warning); }
  .status.Interview  { background: rgba(74, 222, 128, 0.15); color: var(--success); }
  .status.Offer      { background: rgba(74, 222, 128, 0.25); color: var(--success); font-weight: 700; }
  .status.Rejected   { background: rgba(248, 113, 113, 0.12); color: var(--danger); }
  .status.Responded  { background: rgba(192, 132, 252, 0.15); color: var(--purple); }
  .status.Discorded,
  .status.Discarded  { background: rgba(139, 152, 169, 0.12); color: var(--muted); }
  .company { font-weight: 600; color: var(--text); }
  .role { color: var(--muted); font-size: 11px; display: block; margin-top: 1px; }
  .notes { color: var(--muted); font-size: 11px; max-width: 420px; }
  .pdf-yes { color: var(--success); }
  .pdf-no  { color: var(--danger); opacity: 0.5; }
  .report-link {
    color: var(--accent); text-decoration: none;
    font-size: 11px; font-family: ui-monospace, "SF Mono", monospace;
    font-weight: 600;
  }
  .report-link:hover { text-decoration: underline; }
  .url-link {
    color: var(--muted); text-decoration: none;
    font-family: ui-monospace, "SF Mono", monospace; font-size: 10px;
  }
  .url-link:hover { color: var(--accent); }
  .iv-actions { display: flex; flex-direction: column; gap: 3px; align-items: flex-end; }
  .iv-action-btn {
    display: inline-flex; align-items: center; gap: 3px;
    padding: 2px 8px; border-radius: 3px; border: 1px solid transparent;
    font-size: 10px; font-weight: 600; font-family: ui-monospace, "SF Mono", monospace;
    text-decoration: none; white-space: nowrap; cursor: pointer;
    transition: opacity 0.12s;
  }
  .iv-action-btn:hover { opacity: 0.75; }
  .iv-action-btn.btn-join    { background: rgba(74,222,128,0.15);  color: var(--success); border-color: rgba(74,222,128,0.3); }
  .iv-action-btn.btn-posting { background: rgba(139,152,169,0.12); color: var(--fg);      border-color: rgba(139,152,169,0.25); }
  .iv-action-btn.btn-report  { background: rgba(96,165,250,0.12);  color: var(--accent);  border-color: rgba(96,165,250,0.25); }
  .empty {
    padding: 48px 20px; text-align: center; color: var(--muted);
    background: var(--panel); border: 1px dashed var(--border);
    border-radius: 8px;
  }
  .section-rail {
    display: grid; gap: 10px; margin-bottom: 14px;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  }
  .panel-card {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 8px 12px 10px;
    font-size: 12px;
    position: relative;
  }
  .panel-card::before {
    content: ''; position: absolute; top: 0; left: 0; right: 0;
    height: 2px; border-radius: 8px 8px 0 0;
    background: var(--warning);
  }
  .panel-card.upcoming::before { background: var(--success); }
  .panel-card.action-queue::before { background: var(--accent); }
  .panel-card.prep::before { background: var(--purple); }
  .panel-title {
    font-weight: 600; margin-bottom: 6px;
    display: flex; align-items: center; gap: 8px;
    font-size: 10px; letter-spacing: 0.4px;
    text-transform: uppercase;
  }
  .panel-card.inbox .panel-title { color: var(--warning); }
  .panel-card.upcoming .panel-title { color: var(--success); }
  .panel-card.action-queue .panel-title { color: var(--accent); }
  .panel-card.prep .panel-title { color: var(--purple); }
  .panel-title .count-badge {
    margin-left: auto; padding: 1px 8px; border-radius: 999px;
    background: rgba(255,255,255,0.05); color: var(--muted);
    font-size: 10px; font-weight: 600;
  }
  .pager {
    display: inline-flex; align-items: center; gap: 4px;
    margin-left: 8px;
  }
  .pager-btn {
    background: rgba(255,255,255,0.04);
    border: 1px solid var(--border);
    color: var(--muted); cursor: pointer;
    width: 22px; height: 22px; border-radius: 6px;
    font-size: 14px; line-height: 1; padding: 0;
    display: inline-flex; align-items: center; justify-content: center;
    transition: all 0.12s ease;
  }
  .pager-btn:hover:not([disabled]) { color: var(--accent); border-color: var(--accent); background: var(--accent-glow); }
  .pager-btn[disabled] { opacity: 0.3; cursor: not-allowed; }
  .pager-info {
    font-size: 10px; color: var(--muted);
    font-variant-numeric: tabular-nums;
    min-width: 30px; text-align: center;
  }
  .sub-tabs {
    display: flex; gap: 3px; margin-bottom: 6px;
    flex-wrap: wrap;
  }
  .sub-tab {
    cursor: pointer; font-size: 10px; font-weight: 600;
    letter-spacing: 0.3px;
    padding: 2px 8px; border-radius: 999px;
    border: 1px solid var(--border);
    color: var(--muted);
    background: rgba(255,255,255,0.02);
    display: inline-flex; align-items: center; gap: 5px;
    transition: all 0.12s ease;
  }
  .sub-tab:hover { color: var(--text); border-color: var(--border-hi); }
  .sub-tab.active {
    color: var(--accent);
    border-color: rgba(96, 165, 250, 0.35);
    background: var(--accent-glow);
  }
  .sub-tab-count {
    background: rgba(255,255,255,0.06); padding: 0 6px;
    border-radius: 999px; font-size: 9px; color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .sub-tab.active .sub-tab-count { background: rgba(96, 165, 250, 0.18); color: var(--accent); }
  .action-list { display: grid; gap: 3px; }
  .action-row {
    display: grid; grid-template-columns: auto 1fr auto auto; gap: 10px; align-items: center;
    padding: 5px 8px; border-radius: 4px;
    background: transparent;
    border-bottom: 1px solid rgba(255,255,255,0.03);
    transition: background 0.12s ease;
    min-height: 26px;
  }
  .action-row:last-child { border-bottom: none; }
  .action-row:hover { background: rgba(96, 165, 250, 0.05); }
  .action-row .action-main {
    display: flex; align-items: baseline; gap: 6px; min-width: 0;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .action-row .action-main .company,
  .action-row .action-main .role,
  .action-row .action-main .action-detail {
    display: inline; overflow: hidden; text-overflow: ellipsis;
  }
  .action-row .action-main .company { font-size: 12px; }
  .action-row .action-main .role { color: var(--muted); font-size: 11px; margin-top: 0; }
  .action-row .action-main .role::before { content: "·"; margin: 0 4px; color: var(--muted-dim); }
  .action-row .action-main .action-detail { color: var(--muted-dim); font-size: 10px; margin-top: 0; }
  .action-row .action-main .action-detail::before { content: "—"; margin: 0 5px; color: var(--muted-dim); }
  .action-row:hover { background: rgba(96, 165, 250, 0.05); border-color: var(--border-hi); }
  .action-kind {
    color: var(--accent); font-size: 9px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.6px;
    padding: 2px 8px; border-radius: 999px;
    background: var(--accent-glow);
    white-space: nowrap;
  }
  .action-main { min-width: 0; }
  .action-main .company { display: block; font-size: 12px; }
  .action-main .role { display: block; }
  .action-detail { color: var(--muted-dim); font-size: 10px; margin-top: 1px; }
  .action-due { color: var(--warning); font-size: 10px; white-space: nowrap; font-variant-numeric: tabular-nums; font-weight: 600; }
  .priority {
    display: inline-block; padding: 2px 8px; border-radius: 999px;
    font-size: 10px; font-weight: 700; letter-spacing: 0.3px;
  }
  .priority.apply_now, .priority.strong { background: rgba(74, 222, 128, 0.15); color: var(--success); }
  .priority.backup { background: rgba(251, 191, 36, 0.12); color: var(--warning); }
  .priority.stretch { background: rgba(96, 165, 250, 0.15); color: var(--accent); }
  .priority.skip, .priority.active, .priority.offer, .priority.interview {
    background: rgba(139, 152, 169, 0.1); color: var(--muted);
  }
  .priority.offer { background: rgba(74, 222, 128, 0.25); color: var(--success); }
  .priority.interview { background: rgba(74, 222, 128, 0.15); color: var(--success); }
  .priority.active { background: rgba(96, 165, 250, 0.12); color: var(--accent); }
  .readiness { display: flex; gap: 3px; flex-wrap: wrap; }
  .ready-chip {
    display: inline-block; padding: 1px 7px; border-radius: 4px; font-size: 10px; font-weight: 600;
    background: rgba(255,255,255,0.03); color: var(--muted-dim);
  }
  .ready-chip.yes { color: var(--success); background: rgba(74, 222, 128, 0.12); }
  .ready-chip.partial { color: var(--warning); background: rgba(251, 191, 36, 0.12); }
  .ready-chip.no { color: var(--muted-dim); }
  .inbox-grid { display: grid; gap: 6px; }
  .inbox-row {
    display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 2fr) auto; gap: 10px; align-items: center;
    padding: 8px 10px; border: 1px solid var(--border); border-radius: 6px;
    background: rgba(255,255,255,0.02);
    transition: all 0.15s ease;
  }
  .inbox-row:hover { background: rgba(251, 191, 36, 0.04); border-color: var(--border-hi); }
  .inbox-source { color: var(--muted-dim); font-size: 10px; text-transform: uppercase; letter-spacing: 0.3px; }
  .inbox-action {
    color: var(--warning); font-size: 10px; font-weight: 700;
    padding: 2px 8px; border-radius: 999px;
    background: rgba(251, 191, 36, 0.12); white-space: nowrap;
  }
  .muted { color: var(--muted); }
  .upcoming-list { display: grid; gap: 3px; }
  .upcoming-row {
    display: grid; grid-template-columns: auto 1fr auto; gap: 10px; align-items: center;
    padding: 5px 8px; border-radius: 4px;
    background: transparent;
    border-bottom: 1px solid rgba(255,255,255,0.03);
    transition: background 0.12s ease;
    min-height: 26px;
  }
  .upcoming-row:last-child { border-bottom: none; }
  .upcoming-row:hover { background: rgba(74, 222, 128, 0.05); }
  .upcoming-row .action-main {
    display: flex; align-items: baseline; gap: 6px; min-width: 0;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .upcoming-row .action-main .company { font-size: 12px; }
  .upcoming-row .action-main .role {
    color: var(--muted); font-size: 11px; margin-top: 0;
    overflow: hidden; text-overflow: ellipsis;
  }
  .upcoming-row .action-main .role::before { content: "·"; margin: 0 4px; color: var(--muted-dim); }
  .iv-when-badge {
    background: rgba(74, 222, 128, 0.15); color: var(--success);
    padding: 2px 8px; border-radius: 4px;
    font-size: 10px; font-weight: 700; font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .prep-group { margin-top: 10px; }
  .prep-group:first-child { margin-top: 0; }
  .prep-group-title {
    display: flex; align-items: center; gap: 8px;
    font-size: 11px; font-weight: 600; color: var(--text);
    padding: 4px 8px; margin-bottom: 2px;
    border-bottom: 1px solid var(--border);
  }
  .prep-group-title .count-badge {
    margin-left: auto; padding: 1px 8px; border-radius: 999px;
    background: rgba(255,255,255,0.05); color: var(--muted);
    font-size: 10px; font-weight: 600;
  }
  .prep-list { display: grid; gap: 2px; }
  .prep-row {
    display: flex; align-items: center; gap: 10px;
    padding: 4px 10px; border-radius: 6px;
    cursor: pointer; transition: background 0.12s ease;
    min-height: 24px;
  }
  .prep-row:hover { background: rgba(192, 132, 252, 0.06); }
  .prep-row a { color: var(--text); text-decoration: none; flex: 1; }
  .prep-row:hover a { color: var(--purple); }
  .prep-date { color: var(--muted-dim); font-size: 10px; font-variant-numeric: tabular-nums; }
  .iv-chip {
    display: inline-block; margin-top: 4px; font-size: 10px;
    padding: 1px 6px; border-radius: 4px;
    background: rgba(74, 222, 128, 0.15); color: var(--success);
    font-weight: 600; font-variant-numeric: tabular-nums;
  }
  .iv-stage-chip {
    display: inline-block; margin-top: 3px; font-size: 10px;
    padding: 1px 6px; border-radius: 4px;
    background: rgba(192, 132, 252, 0.15); color: var(--purple);
    font-weight: 600; letter-spacing: 0.2px;
  }
  .interview-stage-badge {
    display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 500;
    background: rgba(168, 85, 247, 0.12); color: rgb(196, 181, 253);
  }

  /* Report modal */
  .modal-overlay {
    display: none; position: fixed; inset: 0;
    background: rgba(0, 0, 0, 0.75); z-index: 100;
    align-items: center; justify-content: center; padding: 20px;
    backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);
    animation: fadeIn 0.15s ease;
  }
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  .modal-overlay.open { display: flex; }
  .modal {
    background: var(--panel); border: 1px solid var(--border);
    border-radius: 10px; max-width: 900px; width: 100%;
    max-height: 85vh; display: flex; flex-direction: column;
    box-shadow: 0 20px 60px rgba(0,0,0,0.5);
    animation: slideUp 0.2s ease;
  }
  @keyframes slideUp {
    from { transform: translateY(20px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }
  .modal-header {
    padding: 14px 18px; border-bottom: 1px solid var(--border);
    display: flex; justify-content: space-between; align-items: center;
  }
  .modal-title { font-weight: 600; color: var(--accent); font-size: 13px; }
  .modal-close {
    cursor: pointer; background: none; border: none;
    color: var(--muted); font-size: 22px; line-height: 1;
    padding: 0 6px; border-radius: 4px;
    transition: all 0.12s ease;
  }
  .modal-close:hover { color: var(--text); background: rgba(255,255,255,0.05); }
  .modal-body {
    padding: 20px 24px; overflow-y: auto;
    font-family: "Inter", ui-sans-serif, -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 13px; line-height: 1.7; color: var(--text);
  }
  .modal-body h1 { font-size: 16px; font-weight: 700; color: var(--text); margin: 0 0 16px; }
  .modal-body h2 {
    font-size: 11px; font-weight: 700; color: var(--accent);
    text-transform: uppercase; letter-spacing: 0.7px;
    margin: 22px 0 8px; padding: 8px 12px;
    background: rgba(96,165,250,0.07); border-left: 3px solid var(--accent);
    border-radius: 0 4px 4px 0;
  }
  .modal-body h3 { font-size: 12px; font-weight: 600; color: var(--muted); margin: 14px 0 4px; }
  .modal-body h4 { font-size: 11px; font-weight: 600; color: var(--muted-dim); margin: 10px 0 2px; text-transform: uppercase; letter-spacing: 0.4px; }
  .modal-body p { margin: 4px 0; }
  .modal-body strong { color: var(--warning); font-weight: 700; }
  .modal-body em { color: var(--muted); font-style: italic; }
  .modal-body a { color: var(--accent); text-decoration: none; }
  .modal-body a:hover { text-decoration: underline; }
  .modal-body hr { border: none; border-top: 1px solid var(--border); margin: 18px 0; }
  .modal-body ul, .modal-body ol { margin: 5px 0; padding-left: 22px; }
  .modal-body li { margin: 3px 0; }
  .modal-body code {
    font-family: ui-monospace, "SF Mono", monospace; font-size: 11px;
    background: rgba(255,255,255,0.07); padding: 2px 6px; border-radius: 4px;
    color: var(--success);
  }
  .modal-body pre {
    background: var(--panel-hi); border: 1px solid var(--border);
    border-radius: 6px; padding: 12px 14px; overflow-x: auto; margin: 10px 0;
  }
  .modal-body pre code { background: none; padding: 0; }
  .md-table { overflow-x: auto; -webkit-overflow-scrolling: touch; margin: 10px 0; border-radius: 6px; border: 1px solid var(--border); }
  .modal-body table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
  .modal-body th {
    background: var(--panel-hi); color: var(--muted);
    font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px;
    padding: 7px 10px; text-align: left; border-bottom: 1px solid var(--border);
    position: static; cursor: default; user-select: text;
  }
  .modal-body td { padding: 7px 10px; border-bottom: 1px solid rgba(255,255,255,0.04); vertical-align: top; }
  .modal-body tr:last-child td { border-bottom: none; }
  .md-gap { height: 5px; }

  /* Metrics view */
  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 12px;
  }
  .metrics-grid .card {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 14px 16px;
    transition: border-color 0.15s ease;
  }
  .metrics-grid .card:hover { border-color: var(--border-hi); }
  .metrics-grid .card.wide { grid-column: span 2; }
  .metrics-grid .card.full { grid-column: 1 / -1; }
  .winrate-sub { font-size: 10px; color: var(--muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
  .card-title {
    font-size: 10px; text-transform: uppercase;
    letter-spacing: 0.5px; color: var(--muted);
    margin-bottom: 12px; font-weight: 600;
  }
  .kpi { text-align: center; padding: 16px 14px; }
  .kpi-value {
    font-size: 34px; font-weight: 700;
    background: linear-gradient(135deg, var(--accent), var(--purple));
    -webkit-background-clip: text; background-clip: text;
    -webkit-text-fill-color: transparent;
    line-height: 1; font-variant-numeric: tabular-nums;
    letter-spacing: -1px;
  }
  .kpi-label {
    font-size: 10px; color: var(--muted);
    text-transform: uppercase; letter-spacing: 0.5px;
    margin-top: 8px; font-weight: 600;
  }
  .kpi-sub { font-size: 10px; color: var(--muted-dim); margin-top: 4px; }
  .kpi-value.warn {
    background: linear-gradient(135deg, var(--warning), var(--accent));
    -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
  }
  .kpi-value.danger {
    background: linear-gradient(135deg, var(--danger), var(--warning));
    -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
  }

  .funnel-row, .dist-row {
    display: grid;
    grid-template-columns: 80px 1fr 90px;
    align-items: center; gap: 10px;
    margin-bottom: 7px; font-size: 11px;
  }
  .funnel-row:last-child, .dist-row:last-child { margin-bottom: 0; }
  .funnel-label, .dist-label { color: var(--muted); font-weight: 600; }
  .funnel-bar-wrap, .dist-bar-wrap {
    background: rgba(255,255,255,0.04);
    border-radius: 999px; height: 14px; overflow: hidden;
  }
  .funnel-bar {
    background: linear-gradient(90deg, var(--accent), var(--purple));
    height: 100%; transition: width 0.4s ease;
    border-radius: 999px;
  }
  .dist-bar { height: 100%; transition: width 0.4s ease; border-radius: 999px; }
  .dist-bar.low { background: var(--danger); }
  .dist-bar.mid { background: var(--warning); }
  .dist-bar.high { background: var(--success); }
  .funnel-value, .dist-value {
    text-align: right; font-variant-numeric: tabular-nums;
    color: var(--text); font-size: 11px;
  }
  .funnel-value b { font-weight: 700; }
  .funnel-pct { color: var(--muted-dim); margin-left: 4px; font-size: 10px; }

  .timeline {
    display: flex; align-items: flex-end; gap: 4px;
    height: 80px; padding-top: 6px;
  }
  .tl-col {
    flex: 1; display: flex; flex-direction: column;
    align-items: center; height: 100%; min-width: 0;
  }
  .tl-bar-wrap {
    flex: 1; width: 100%;
    display: flex; align-items: flex-end; justify-content: center;
  }
  .tl-bar {
    width: 70%;
    background: linear-gradient(180deg, var(--accent), rgba(96, 165, 250, 0.2));
    border-radius: 3px 3px 0 0; min-height: 1px;
    transition: height 0.4s ease;
  }
  .tl-col:hover .tl-bar { background: linear-gradient(180deg, var(--purple), rgba(192, 132, 252, 0.2)); }
  .tl-count {
    font-size: 10px; color: var(--text);
    font-variant-numeric: tabular-nums;
    margin-top: 4px; height: 12px; font-weight: 600;
  }
  .tl-date {
    font-size: 8px; color: var(--muted-dim);
    font-variant-numeric: tabular-nums;
  }

  .list-row {
    display: flex; justify-content: space-between; align-items: center;
    padding: 7px 0; border-bottom: 1px solid var(--border);
    gap: 10px; font-size: 11px;
  }
  .list-row:last-child { border-bottom: none; padding-bottom: 0; }
  .list-row:first-child { padding-top: 0; }
  .list-main { min-width: 0; overflow: hidden; }
  .list-main .company { display: block; color: var(--text); font-weight: 600; }
  .list-main .role { display: block; color: var(--muted); font-size: 10px; }
  .list-meta {
    display: flex; align-items: center; gap: 6px;
    color: var(--muted); font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .empty-sm {
    color: var(--muted-dim); font-size: 11px;
    text-align: center; padding: 20px 0;
  }

  /* ── Stats strip (KPI rail above section rail) ───────────────── */
  .stats-strip {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 10px;
    margin-bottom: 14px;
  }
  .stat-card {
    position: relative;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 10px 14px;
    overflow: hidden;
  }
  .stat-card::after {
    content: \'\';
    position: absolute;
    left: 14px; right: 14px; bottom: 8px;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--accent), transparent);
    opacity: 0.35;
  }
  .stat-k {
    font-size: 10px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-weight: 600;
    margin-bottom: 6px;
  }
  .stat-v {
    font-size: 22px;
    font-weight: 700;
    color: var(--text);
    font-variant-numeric: tabular-nums;
    line-height: 1;
    letter-spacing: -0.5px;
  }
  .stat-card.accent .stat-v {
    background: linear-gradient(135deg, var(--accent), var(--purple));
    -webkit-background-clip: text; background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  @media (max-width: 900px) {
    .stats-strip { grid-template-columns: repeat(3, 1fr); }
  }
  @media (max-width: 640px) {
    .stats-strip { grid-template-columns: repeat(2, 1fr); gap: 8px; }
    .stat-v { font-size: 18px; }
  }

  /* ── Side drawer (row detail) ─────────────────────────────────── */
  .drawer-backdrop {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.45);
    backdrop-filter: blur(2px); -webkit-backdrop-filter: blur(2px);
    opacity: 0; pointer-events: none;
    transition: opacity 0.18s ease;
    z-index: 49;
  }
  .drawer-backdrop.open { opacity: 1; pointer-events: auto; }
  .drawer {
    position: fixed; top: 0; right: 0; height: 100vh;
    width: 480px; max-width: 92vw;
    background: var(--panel);
    border-left: 1px solid var(--border);
    transform: translateX(100%);
    transition: transform 0.22s ease;
    z-index: 50;
    display: flex; flex-direction: column;
    box-shadow: -20px 0 60px rgba(0,0,0,0.4);
  }
  .drawer.open { transform: translateX(0); }
  .drawer-header {
    padding: 16px 20px;
    border-bottom: 1px solid var(--border);
    display: flex; justify-content: space-between; align-items: flex-start;
    gap: 12px;
  }
  .drawer-title { font-size: 14px; font-weight: 700; color: var(--text); margin: 0; }
  .drawer-sub { font-size: 12px; color: var(--muted); margin-top: 2px; }
  .drawer-body { padding: 16px 20px; overflow-y: auto; flex: 1; }
  .drawer-row { display: grid; grid-template-columns: 90px 1fr; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--border); font-size: 12px; }
  .drawer-row:last-child { border-bottom: none; }
  .drawer-row .k { color: var(--muted); text-transform: uppercase; font-size: 10px; letter-spacing: 0.4px; font-weight: 600; padding-top: 1px; }
  .drawer-row .v { color: var(--text); word-break: break-word; }
  .drawer-prep { padding: 12px 20px; border-top: 1px solid var(--border); }
  .drawer-prep-title { font-size: 10px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }
  .drawer-prep-list .prep-row { font-size: 12px; color: var(--text); padding: 5px 0; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 6px; }
  .drawer-prep-list .prep-row:last-child { border-bottom: none; }
  .drawer-prep-list .prep-row:hover { color: var(--accent); }
  .iv-action-btn.btn-pdf { background: rgba(251,191,36,0.12); color: var(--warning); border-color: rgba(251,191,36,0.25); }
  .drawer-actions { display: flex; gap: 8px; flex-wrap: wrap; padding: 12px 20px; border-top: 1px solid var(--border); }
  .drawer-kbd {
    font-family: ui-monospace, "SF Mono", monospace;
    font-size: 10px; padding: 2px 6px; border-radius: 4px;
    background: rgba(255,255,255,0.06); color: var(--muted);
  }

  /* ── Theme/density selector in header ─────────────────────────── */
  .header-select {
    background: rgba(255,255,255,0.04);
    border: 1px solid var(--border);
    color: var(--muted);
    border-radius: 6px;
    font: 600 11px/1 inherit;
    padding: 6px 22px 6px 8px;
    cursor: pointer;
    -webkit-appearance: none; appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'10\' viewBox=\'0 0 14 14\'%3E%3Cpath d=\'M2 4.5l5 5 5-5\' stroke=\'%238b98a9\' stroke-width=\'1.8\' fill=\'none\' stroke-linecap=\'round\' stroke-linejoin=\'round\'/%3E%3C/svg%3E");
    background-repeat: no-repeat; background-position: right 7px center;
  }
  .header-select:hover { color: var(--text); border-color: var(--border-hi); }

  /* ── Editable status ──────────────────────────────────────────── */
  .editable-status { cursor: pointer; transition: box-shadow 0.12s ease, opacity 0.12s ease; }
  .editable-status:hover { opacity: 0.8; box-shadow: 0 0 0 2px rgba(96,165,250,0.35); }

  /* ── Edit modal ────────────────────────────────────────────────── */
  .edit-label {
    display: block; font-size: 11px; color: var(--muted);
    text-transform: uppercase; letter-spacing: 0.5px;
    font-weight: 600; margin-bottom: 6px;
  }
  .edit-select, .edit-textarea {
    width: 100%; background: var(--panel-hi);
    border: 1px solid var(--border); border-radius: 6px;
    color: var(--text); font-family: inherit; font-size: 13px;
    padding: 9px 12px; outline: none;
    transition: border-color 0.15s ease;
    -webkit-appearance: none; appearance: none;
  }
  .edit-select:focus, .edit-textarea:focus { border-color: rgba(96,165,250,0.5); background: rgba(96,165,250,0.04); }
  .edit-textarea { resize: vertical; line-height: 1.55; min-height: 80px; }
  .edit-btn-primary {
    flex: 1; background: var(--accent); color: #0b0f14;
    border: none; border-radius: 6px; padding: 11px 20px;
    font-family: inherit; font-size: 13px; font-weight: 700;
    cursor: pointer; transition: opacity 0.12s ease;
  }
  .edit-btn-primary:hover:not(:disabled) { opacity: 0.85; }
  .edit-btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
  .edit-btn-cancel {
    background: rgba(255,255,255,0.04); color: var(--muted);
    border: 1px solid var(--border); border-radius: 6px;
    padding: 11px 16px; font-family: inherit; font-size: 13px;
    cursor: pointer; transition: all 0.12s ease;
  }
  .edit-btn-cancel:hover { color: var(--text); border-color: var(--border-hi); }

  /* ── Pull-to-refresh indicator ────────────────────────────────── */
  #pullIndicator {
    position: fixed; top: 0; left: 50%;
    transform: translateX(-50%) translateY(-60px);
    background: var(--panel-hi); border: 1px solid var(--border-hi);
    border-radius: 999px; padding: 8px 18px;
    font-size: 12px; color: var(--muted);
    opacity: 0; z-index: 50; pointer-events: none;
    white-space: nowrap;
    box-shadow: 0 4px 16px rgba(0,0,0,0.4);
  }

  /* ── Mobile card list (hidden on desktop) ─────────────────────── */
  .mobile-list { display: none; gap: 8px; }
  .mobile-card {
    background: var(--panel); border: 1px solid var(--border); border-radius: 8px;
    padding: 12px 14px; display: flex; flex-direction: column; gap: 8px;
    transition: border-color 0.12s ease, background 0.12s ease;
  }
  .mobile-card:active { border-color: var(--border-hi); background: var(--panel-hi); }
  .mobile-card-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
  .mobile-card-badges { display: flex; gap: 5px; align-items: center; flex-wrap: wrap; }
  .mobile-card-footer {
    display: flex; justify-content: space-between; align-items: center; gap: 8px;
    font-size: 11px; color: var(--muted-dim); padding-top: 2px;
    border-top: 1px solid var(--border);
  }

  @media (max-width: 700px) {
    .metrics-grid .card.wide { grid-column: span 1; }
    main { padding: 12px; }
    header { padding: 10px 12px; gap: 10px; }
    .tabs { padding: 8px 12px; }
  }

  @media (max-width: 640px) {
    /* Header: brand + live on one row, metrics hidden, search full-width below */
    header { flex-wrap: wrap; padding: 10px 14px; gap: 6px; position: relative; }
    .metrics { display: none; }
    .search-wrap { order: 10; width: 100%; margin-left: 0; margin-top: 2px; }
    .search-input { width: 100% !important; font-size: 15px; padding: 9px 34px 9px 12px; }
    .live { margin-left: auto; }
    .pipeline-btn { padding: 6px 10px; }
    .pipeline-btn-label { display: none; }

    /* Tabs: sticky at top (header scrolls away) */
    .tabs { top: 0; padding: 6px 12px; }
    .tab { padding: 8px 14px; font-size: 12px; }

    /* Main */
    main { padding: 10px 12px 60px; }

    /* Table: hide; mobile card list shows instead */
    .table-card { display: none; }
    .mobile-list { display: grid; }

    /* Sticky th: disable (header height varies on mobile) */
    th { position: static; }

    /* Modal: bottom sheet */
    .modal-overlay { padding: 0; align-items: flex-end; }
    .modal { border-radius: 16px 16px 0 0; max-width: 100%; max-height: 92vh; }
    .modal-body { font-size: 15px; padding: 16px 14px; }
    .modal-body h2 { font-size: 12px; }
    .modal-header { padding: 14px 16px; }

    /* Section rail: single column */
    .section-rail { grid-template-columns: 1fr; }

    /* Metrics grid: 2-up KPIs, full-width wides */
    .metrics-grid { grid-template-columns: repeat(2, 1fr); }
    .metrics-grid .card.wide { grid-column: span 2; }

    /* Panel cards */
    .panel-card { padding: 10px 12px 12px; }

    /* Inbox rows: drop the source column on very small screens */
    .inbox-row { grid-template-columns: 1fr auto; }

    /* Action queue: 2-row card layout */
    .action-list { gap: 8px; }
    .action-row {
      grid-template-columns: 1fr auto;
      grid-template-rows: auto auto;
      gap: 6px 10px;
      padding: 10px 12px;
      min-height: auto;
      border-radius: 6px;
      border: 1px solid var(--border);
      border-bottom: 1px solid var(--border);
      background: rgba(255,255,255,0.02);
    }
    .action-row > .action-kind  { grid-column: 1; grid-row: 1; align-self: center; }
    .action-row > .action-due   { grid-column: 2; grid-row: 1; align-self: center; }
    .action-row > .action-main  { grid-column: 1; grid-row: 2; white-space: normal; overflow: visible; flex-direction: column; align-items: flex-start; gap: 1px; }
    .action-row > *:last-child  { grid-column: 2; grid-row: 2; align-self: end; min-height: 36px; display: flex; align-items: flex-end; justify-content: flex-end; }
    .action-row .action-main .company { display: block; font-size: 13px; }
    .action-row .action-main .role    { display: block; font-size: 12px; margin-top: 0; }
    .action-row .action-main .role::before    { display: none; }
    .action-row .action-main .action-detail   { display: block; margin-top: 2px; font-size: 11px; }
    .action-row .action-main .action-detail::before { display: none; }

    /* Larger tap targets (44px minimum per Apple HIG) */
    .mobile-card-footer a {
      min-height: 44px; display: inline-flex; align-items: center; padding: 0 6px;
    }
    .modal-close { width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; }
    .pager-btn { width: 36px; height: 36px; font-size: 18px; }

    /* Tab dropdown */
    .tabs { display: none; }
    .tab-select-wrap {
      display: block; position: sticky; top: 0; z-index: 9;
      padding: 8px 14px;
      background: rgba(11, 15, 20, 0.92);
      backdrop-filter: saturate(160%) blur(10px);
      -webkit-backdrop-filter: saturate(160%) blur(10px);
      border-bottom: 1px solid var(--border);
    }
    .tab-select {
      width: 100%; background: var(--panel-hi);
      border: 1px solid var(--border); border-radius: 8px;
      color: var(--text); font-family: inherit; font-size: 15px; font-weight: 600;
      padding: 11px 36px 11px 14px; outline: none;
      -webkit-appearance: none; appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 14 14'%3E%3Cpath d='M2 4.5l5 5 5-5' stroke='%238b98a9' stroke-width='1.8' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
      background-repeat: no-repeat; background-position: right 12px center;
      cursor: pointer;
    }
    .tab-select:focus { border-color: rgba(96,165,250,0.5); }

    /* Upcoming interviews — 2-row card layout */
    .upcoming-list { gap: 8px; }
    .upcoming-row {
      grid-template-columns: 1fr auto;
      grid-template-rows: auto auto;
      gap: 6px 10px;
      padding: 10px 12px;
      min-height: auto;
      border-radius: 6px;
      border: 1px solid rgba(74, 222, 128, 0.2);
      background: rgba(74, 222, 128, 0.03);
    }
    .upcoming-row > div:first-child { grid-column: 1; grid-row: 1; align-self: center; flex-direction: row !important; flex-wrap: wrap; gap: 4px; }
    .upcoming-row > *:last-child    { grid-column: 2; grid-row: 1; align-self: center; min-height: 36px; display: flex; align-items: center; justify-content: flex-end; }
    .upcoming-row > .action-main   { grid-column: 1 / -1; grid-row: 2; white-space: normal; overflow: visible; flex-direction: column; align-items: flex-start; gap: 1px; }
    .upcoming-row .iv-actions { flex-direction: column; align-items: flex-end; justify-content: center; gap: 4px; }
    .upcoming-row .action-main .company { display: block; font-size: 13px; }
    .upcoming-row .action-main .role    { display: block; font-size: 12px; margin-top: 0; overflow: visible; text-overflow: unset; }
    .upcoming-row .action-main .role::before { display: none; }
  }
  /* ── Calendar (Progress tab) ──────────────────────────────────── */
  .cal {
    background: var(--panel); border: 1px solid var(--border);
    border-radius: 10px; padding: 18px;
    display: flex; flex-direction: column; gap: 12px; position: relative;
  }
  .cal-head {
    display: flex; align-items: center; justify-content: space-between;
    gap: 12px; flex-wrap: wrap;
  }
  .cal-title {
    color: var(--success); font-family: ui-monospace, monospace;
    font-size: 12px; letter-spacing: 0.6px; text-transform: uppercase;
    font-weight: 600;
  }
  .cal-sub {
    color: var(--muted); font-family: ui-monospace, monospace;
    font-size: 11px; margin-left: 10px;
  }
  .cal-controls { display: flex; gap: 8px; align-items: center; }
  .cal-stage { display: flex; gap: 6px; margin-right: 6px; }
  .cal-stage-btn {
    display: flex; align-items: center; gap: 4px;
    background: transparent; border: 1px solid var(--border);
    border-radius: 4px; padding: 3px 7px;
    color: var(--muted);
    font-family: ui-monospace, monospace; font-size: 10.5px; cursor: pointer;
  }
  .cal-stage-btn[data-active="true"] { color: var(--text); }
  .cal-stage-btn[data-stage="recruiter"][data-active="true"] { color: #89b4fa; border-color: #89b4fa; background: rgba(137,180,250,0.13); }
  .cal-stage-btn[data-stage="tech"][data-active="true"]      { color: #a6e3a1; border-color: #a6e3a1; background: rgba(166,227,161,0.13); }
  .cal-stage-btn[data-stage="hm"][data-active="true"]        { color: #cba6f7; border-color: #cba6f7; background: rgba(203,166,247,0.13); }
  .cal-stage-btn[data-stage="fit"][data-active="true"]       { color: #fab387; border-color: #fab387; background: rgba(250,179,135,0.13); }
  .cal-stage-dot { width: 6px; height: 6px; border-radius: 50%; }
  .cal-stage-dot--recruiter { background: #89b4fa; }
  .cal-stage-dot--tech      { background: #a6e3a1; }
  .cal-stage-dot--hm        { background: #cba6f7; }
  .cal-stage-dot--fit       { background: #fab387; }
  .cal-company-select {
    background: var(--bg); color: var(--text); border: 1px solid var(--border);
    border-radius: 4px; padding: 3px 7px;
    font-family: ui-monospace, monospace; font-size: 11px;
  }
  .cal-dows { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
  .cal-dow {
    color: var(--muted); font-family: ui-monospace, monospace;
    font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.6px;
    padding: 0 4px;
  }
  .cal-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; }
  .cal-cell {
    background: var(--bg); border: 1px solid var(--border);
    border-radius: 6px; padding: 9px;
    display: flex; flex-direction: column; gap: 4px;
    min-height: 104px; min-width: 0; overflow: hidden;
  }
  .cal-cell--today { background: rgba(166,227,161,0.06); border-color: var(--success); }
  .cal-cell--past { opacity: 0.55; }
  .cal-cell-head { display: flex; align-items: baseline; justify-content: space-between; min-width: 0; }
  .cal-cell-date {
    color: var(--text); font-family: ui-monospace, monospace;
    font-size: 11px; font-weight: 600; font-variant-numeric: tabular-nums;
  }
  .cal-cell--today .cal-cell-date { color: var(--success); }
  .cal-today-tag {
    color: var(--success); font-family: ui-monospace, monospace;
    font-size: 9px; letter-spacing: 0.6px; text-transform: uppercase; font-weight: 700;
  }
  .cal-events { display: flex; flex-direction: column; gap: 2px; min-width: 0; width: 100%; overflow: hidden; }
  .cal-event {
    display: flex; flex-direction: column; gap: 0;
    border-radius: 3px; padding: 1px 4px;
    cursor: pointer; border-left-width: 2px; border-left-style: solid;
    width: 100%; max-width: 100%; min-width: 0; box-sizing: border-box; overflow: hidden;
  }
  .cal-event--past { text-decoration: line-through; }
  .cal-event--recruiter { background: rgba(137,180,250,0.10); border-left-color: #89b4fa; }
  .cal-event--tech      { background: rgba(166,227,161,0.10); border-left-color: #a6e3a1; }
  .cal-event--hm        { background: rgba(203,166,247,0.10); border-left-color: #cba6f7; }
  .cal-event--fit       { background: rgba(250,179,135,0.10); border-left-color: #fab387; }
  .cal-event-row1 { display: grid; grid-template-columns: auto 1fr; align-items: baseline; gap: 4px; min-width: 0; width: 100%; max-width: 100%; }
  .cal-event-time {
    font-family: ui-monospace, monospace; font-size: 10px;
    font-variant-numeric: tabular-nums; flex-shrink: 0;
  }
  .cal-event--recruiter .cal-event-time { color: #89b4fa; }
  .cal-event--tech .cal-event-time      { color: #a6e3a1; }
  .cal-event--hm .cal-event-time        { color: #cba6f7; }
  .cal-event--fit .cal-event-time       { color: #fab387; }
  .cal-event-co {
    color: var(--text); font-size: 11px; font-weight: 600;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; display: block;
  }
  .cal-event-who {
    color: var(--muted); font-family: ui-monospace, monospace; font-size: 9.5px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .calendar-popover-backdrop { position: fixed; inset: 0; z-index: 50; }
  .calendar-popover {
    position: fixed; width: 300px; z-index: 51;
    background: var(--panel); border: 1px solid var(--border); border-radius: 8px;
    box-shadow: 0 12px 32px rgba(0,0,0,0.4); padding: 14px;
    display: flex; flex-direction: column; gap: 10px;
  }
  .cal-pop-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
  .cal-pop-co { color: var(--text); font-size: 14px; font-weight: 700; }
  .cal-pop-stage {
    font-family: ui-monospace, monospace; font-size: 9.5px; font-weight: 700;
    padding: 2px 7px; border-radius: 999px; letter-spacing: 0.4px; text-transform: uppercase;
  }
  .cal-pop-stage--recruiter { color: #89b4fa; background: rgba(137,180,250,0.13); }
  .cal-pop-stage--tech      { color: #a6e3a1; background: rgba(166,227,161,0.13); }
  .cal-pop-stage--hm        { color: #cba6f7; background: rgba(203,166,247,0.13); }
  .cal-pop-stage--fit       { color: #fab387; background: rgba(250,179,135,0.13); }
  .cal-pop-meta { display: flex; flex-direction: column; gap: 4px; font-family: ui-monospace, monospace; font-size: 11px; }
  .cal-pop-actions { display: flex; gap: 6px; flex-wrap: wrap; }
  .cal-pop-btn {
    background: var(--bg); color: var(--text);
    border: 1px solid var(--border); border-radius: 4px;
    padding: 5px 10px; font-family: ui-monospace, monospace; font-size: 11px; cursor: pointer;
    text-decoration: none;
  }
  .cal-pop-btn--accent {
    background: rgba(166,227,161,0.13); color: var(--success);
    border-color: rgba(166,227,161,0.4);
  }
    /* === KANBAN BOARD === */
  .kb-wrap { display: flex; flex-direction: column; gap: 14px; padding: 0 20px 22px; }
  .kb-metrics { display: flex; gap: 8px; flex-wrap: wrap; }
  .kb-metric {
    display: inline-flex; align-items: baseline; gap: 6px;
    padding: 4px 10px; border-radius: 999px;
    background: rgba(255,255,255,0.04); border: 1px solid var(--border);
    font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums;
  }
  .kb-metric b { color: var(--text); font-weight: 700; }
  .kb-metric--hi { border-color: rgba(192,132,252,0.4); color: var(--purple); }
  .kb-metric--hi b { color: var(--purple); }
  .kb-metric--urgent { border-color: rgba(248,113,113,0.4); color: var(--danger); }
  .kb-metric--urgent b { color: var(--danger); }
  .kb-metric--overdue { border-color: rgba(251,191,36,0.4); color: var(--warning); }
  .kb-metric--overdue b { color: var(--warning); }
  .kb-metric--hist { color: var(--muted-dim); }
  .kb-board {
    display: flex; gap: 12px; overflow-x: auto;
    padding-bottom: 8px; scrollbar-width: thin;
  }
  .kb-col {
    flex: 0 0 300px; min-width: 300px; max-width: 320px;
    background: var(--panel); border: 1px solid var(--border); border-radius: 10px;
    display: flex; flex-direction: column;
    max-height: calc(100vh - 240px);
  }
  .kb-col-head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 9px 12px; border-bottom: 1px solid var(--border);
    background: var(--bg-elev); border-radius: 10px 10px 0 0;
  }
  .kb-col-title {
    color: var(--text); font-family: ui-monospace, monospace;
    font-size: 10.5px; font-weight: 700; letter-spacing: 0.4px; text-transform: uppercase;
  }
  .kb-col-count {
    color: var(--muted); font-family: ui-monospace, monospace; font-size: 11px;
    background: rgba(255,255,255,0.04); border-radius: 999px; padding: 1px 8px;
    font-variant-numeric: tabular-nums;
  }
  .kb-col-body { padding: 8px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
  .kb-card {
    background: var(--panel-hi); border: 1px solid var(--border);
    border-radius: 8px; padding: 10px 11px;
    display: flex; flex-direction: column; gap: 6px;
    transition: border-color 0.15s, transform 0.1s;
  }
  .kb-card:hover { border-color: var(--border-hi); }
  .kb-card--urgent { border-color: rgba(248,113,113,0.55); box-shadow: 0 0 0 1px rgba(248,113,113,0.18); }
  .kb-card--dim { opacity: 0.6; }
  .kb-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
  .kb-card-co { color: var(--text); font-weight: 700; font-size: 13.5px; line-height: 1.2; }
  .kb-card-badges { display: flex; gap: 4px; flex-wrap: wrap; justify-content: flex-end; }
  .kb-card-role { color: var(--muted); font-size: 11.5px; line-height: 1.3; }
  .kb-next {
    background: rgba(96,165,250,0.10); border: 1px solid rgba(96,165,250,0.30);
    color: var(--text); font-size: 12px; line-height: 1.35;
    padding: 7px 9px; border-radius: 6px; font-weight: 500;
    margin-top: 2px;
  }
  .kb-meta { display: flex; flex-direction: column; gap: 2px; font-size: 11px; }
  .kb-meta-row { display: flex; gap: 6px; color: var(--muted); font-family: ui-monospace, monospace; }
  .kb-meta-k { color: var(--muted-dim); text-transform: uppercase; font-size: 9.5px; letter-spacing: 0.5px; width: 60px; flex-shrink: 0; padding-top: 1px; }
  .kb-meta-v { color: var(--text); font-size: 11px; flex: 1; min-width: 0; word-break: break-word; }
  .kb-meta-v.kb-urgent { color: var(--danger); font-weight: 600; }
  .kb-meta-v.kb-overdue { color: var(--warning); font-weight: 600; }
  .kb-bullets { margin: 4px 0 0; padding-left: 16px; color: var(--text); font-size: 11.5px; display: flex; flex-direction: column; gap: 2px; }
  .kb-bullets li { line-height: 1.3; }
  .kb-risks { display: flex; flex-direction: column; gap: 3px; margin-top: 2px; }
  .kb-risk { color: var(--warning); background: rgba(251,191,36,0.08); border: 1px solid rgba(251,191,36,0.25); border-radius: 4px; padding: 3px 6px; font-size: 10.5px; line-height: 1.3; }
  .kb-links { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 2px; }
  .kb-link { color: var(--accent); font-family: ui-monospace, monospace; font-size: 10.5px; text-decoration: none; }
  .kb-link:hover { text-decoration: underline; }
  .kb-stage-select { width: 100%; margin-top: 6px; padding: 4px 6px; font-size: 11px; font-family: ui-monospace, monospace; background: var(--card-bg); color: var(--muted); border: 1px solid var(--border); border-radius: 5px; cursor: pointer; }
  .kb-stage-select:hover { border-color: var(--border-hi); color: var(--text); }
  .kb-badge {
    font-size: 9.5px; font-weight: 700; letter-spacing: 0.4px; text-transform: uppercase;
    padding: 2px 6px; border-radius: 999px; white-space: nowrap;
  }
  .kb-badge--urgent { color: var(--danger); background: rgba(248,113,113,0.12); border: 1px solid rgba(248,113,113,0.35); }
  .kb-badge--overdue { color: var(--warning); background: rgba(251,191,36,0.12); border: 1px solid rgba(251,191,36,0.35); }
  .kb-badge--hi { color: var(--purple); background: rgba(192,132,252,0.12); border: 1px solid rgba(192,132,252,0.35); }
  .kb-badge--med { color: var(--accent); background: rgba(96,165,250,0.10); border: 1px solid rgba(96,165,250,0.30); }
  .kb-badge--hist { color: var(--muted-dim); background: rgba(255,255,255,0.03); border: 1px solid var(--border); }
  .kb-historical {
    border: 1px dashed var(--border); border-radius: 10px;
    padding: 12px; display: flex; flex-direction: column; gap: 8px;
    background: rgba(255,255,255,0.015);
  }
  .kb-historical-head {
    color: var(--muted); font-family: ui-monospace, monospace;
    font-size: 10.5px; font-weight: 700; letter-spacing: 0.4px; text-transform: uppercase;
    display: flex; align-items: center; gap: 8px;
  }
  .kb-historical-grid {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 8px;
  }
  @media (max-width: 720px) {
    .kb-col { flex: 0 0 86vw; min-width: 86vw; max-width: 86vw; }
  }

    /* === SCAN QUEUE RAIL === */
  .pipeline-layout { display: flex; gap: 14px; align-items: flex-start; }
  .pipeline-layout > .pipeline-main { flex: 1; min-width: 0; }
  .scan-queue {
    width: 360px; flex-shrink: 0;
    background: var(--panel); border: 1px solid var(--border);
    border-radius: 10px; display: flex; flex-direction: column;
    align-self: flex-start; max-height: calc(100vh - 220px); overflow: hidden;
  }
  .scan-queue__header {
    padding: 12px 14px; border-bottom: 1px solid var(--border);
    display: flex; flex-direction: column; gap: 10px;
  }
  .scan-queue__title-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .scan-queue__title {
    color: var(--purple, #c084fc); font-family: ui-monospace, monospace;
    font-size: 11px; letter-spacing: 0.6px; text-transform: uppercase;
    font-weight: 600; white-space: nowrap;
  }
  .scan-queue__count { color: var(--muted); font-family: ui-monospace, monospace; font-size: 11px; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .scan-queue__run-btn {
    background: color-mix(in srgb, var(--purple, #c084fc) 10%, transparent);
    color: var(--purple, #c084fc);
    border: 1px solid color-mix(in srgb, var(--purple, #c084fc) 40%, transparent);
    border-radius: 5px; padding: 6px 10px;
    font-family: ui-monospace, monospace; font-size: 11px; font-weight: 600; cursor: pointer;
    display: flex; align-items: center; justify-content: center; gap: 6px;
  }
  .scan-queue__run-btn:hover { filter: brightness(1.15); }
  .scan-queue__chips { display: flex; gap: 4px; flex-wrap: nowrap; overflow-x: auto; }
  .scan-queue__chip {
    display: flex; align-items: center; gap: 4px;
    background: transparent; border: 1px solid var(--border); border-radius: 4px;
    padding: 2px 7px; color: var(--muted);
    font-family: ui-monospace, monospace; font-size: 10px; cursor: pointer;
    white-space: nowrap; flex-shrink: 0;
  }
  .scan-queue__chip[data-active="true"] { color: var(--accent); border-color: var(--accent); background: color-mix(in srgb, var(--accent) 13%, transparent); }
  .scan-queue__chip-count { color: var(--muted-dim, var(--muted)); font-variant-numeric: tabular-nums; }
  .scan-queue__list { overflow-y: auto; flex: 1; padding: 4px 0; }
  .scan-queue__group-label {
    display: flex; align-items: center; gap: 6px;
    padding: 6px 14px 4px;
    font-family: ui-monospace, monospace; font-size: 9.5px; letter-spacing: 0.6px; text-transform: uppercase; font-weight: 700;
  }
  .scan-queue__group-label--scanning { color: var(--accent); }
  .scan-queue__group-label--scored   { color: var(--success); }
  .scan-queue__group-label--failed   { color: var(--danger); }
  .scan-queue__group-label--queued   { color: var(--muted); }
  .scan-queue__group-count { color: var(--muted); font-weight: 400; }
  .scan-queue__item {
    padding: 8px 14px;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
    display: flex; flex-direction: column; gap: 4px; position: relative;
  }
  .scan-queue__item[data-state="scored"] { background: color-mix(in srgb, var(--success) 4%, transparent); }
  .scan-queue__item-row1 { display: flex; align-items: center; gap: 6px; }
  .scan-queue__company { color: var(--text); font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0; }
  .scan-queue__company--unresolved { color: var(--muted); font-style: italic; font-weight: 400; }
  .scan-queue__score {
    color: var(--success); background: color-mix(in srgb, var(--success) 13%, transparent);
    font-family: ui-monospace, monospace; font-size: 11px; font-weight: 700;
    font-variant-numeric: tabular-nums; padding: 1px 6px; border-radius: 3px; flex-shrink: 0;
  }
  .scan-queue__menu-btn { background: transparent; border: none; color: var(--muted); cursor: pointer; padding: 0 2px; font-size: 14px; line-height: 1; flex-shrink: 0; }
  .scan-queue__meta { display: flex; align-items: center; gap: 6px; color: var(--muted); font-family: ui-monospace, monospace; font-size: 10.5px; }
  .scan-queue__source { font-weight: 600; }
  .scan-queue__source--scanning { color: var(--accent); }
  .scan-queue__source--scored   { color: var(--success); }
  .scan-queue__source--failed   { color: var(--danger); }
  .scan-queue__source--queued   { color: var(--muted); }
  .scan-queue__time { font-variant-numeric: tabular-nums; }
  .scan-queue__url, .scan-queue__error { font-family: ui-monospace, monospace; font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .scan-queue__url { color: var(--muted); opacity: 0.75; }
  .scan-queue__error { color: var(--danger); }
  .scan-queue__dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
  .scan-queue__dot--scanning { background: var(--accent); animation: sq-pulse 1.4s ease-out infinite; }
  .scan-queue__dot--scored   { background: var(--success); }
  .scan-queue__dot--failed   { background: var(--danger); }
  .scan-queue__dot--queued   { background: var(--muted); }
  @keyframes sq-pulse {
    0%   { box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 40%, transparent); }
    70%  { box-shadow: 0 0 0 6px transparent; }
    100% { box-shadow: 0 0 0 0 transparent; }
  }
  .scan-queue__menu {
    position: absolute; top: 30px; right: 10px; z-index: 61;
    background: var(--bg-elev, var(--panel)); border: 1px solid var(--border-hi, var(--border));
    border-radius: 6px; box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    padding: 4px; display: flex; flex-direction: column; min-width: 180px;
  }
  .scan-queue__menu-backdrop { position: fixed; inset: 0; z-index: 60; }
  .scan-queue__menu-item {
    display: flex; align-items: center; gap: 8px;
    background: transparent; border: none;
    padding: 6px 10px; border-radius: 4px;
    font-family: ui-monospace, monospace; font-size: 11px; cursor: pointer; text-align: left;
    color: var(--text);
  }
  .scan-queue__menu-item:hover { background: color-mix(in srgb, var(--border) 60%, transparent); }
  .scan-queue__menu-item--accent-success { color: var(--success); }
  .scan-queue__menu-item--accent-danger  { color: var(--danger); }
  .scan-queue__menu-icon { width: 12px; text-align: center; color: var(--muted); }
  .scan-queue__add { display: flex; gap: 6px; margin-top: 2px; }
  .scan-queue__add-input {
    flex: 1; min-width: 0;
    background: color-mix(in srgb, var(--panel) 60%, var(--bg, #0b0f14));
    border: 1px solid var(--border); border-radius: 5px;
    color: var(--text); font-family: ui-monospace, monospace; font-size: 11px;
    padding: 5px 8px; outline: none;
  }
  .scan-queue__add-input::placeholder { color: var(--muted); }
  .scan-queue__add-input:focus { border-color: var(--accent); }
  .scan-queue__add-btn {
    background: color-mix(in srgb, var(--accent) 10%, transparent);
    color: var(--accent); border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
    border-radius: 5px; padding: 5px 10px;
    font-family: ui-monospace, monospace; font-size: 11px; font-weight: 600; cursor: pointer;
    white-space: nowrap; flex-shrink: 0;
  }
  .scan-queue__add-btn:hover { filter: brightness(1.15); }
  .scan-queue__add-btn:disabled { opacity: 0.5; cursor: not-allowed; filter: none; }
  </style>
</head>
<body>
<div id="pullIndicator" aria-hidden="true">↓ Pull to refresh</div>
<header>
  <div class="brand">
    <div class="brand-dot"></div>
    <h1>career-ops<span class="sep">·</span><span class="sub">dashboard</span></h1>
  </div>
  <div class="metrics" id="metrics"></div>
  <div class="search-wrap">
    <input class="search-input" id="searchInput" type="text" placeholder="Search… (/)" autocomplete="off" spellcheck="false">
    <button class="search-clear" id="searchClear" onclick="clearSearch()">×</button>
  </div>
  <select class="header-select" id="themeSelect" title="Theme">
    <option value="mocha">Mocha</option>
    <option value="latte">Latte</option>
  </select>
  <select class="header-select" id="densitySelect" title="Density">
    <option value="compact">Compact</option>
    <option value="cozy" selected>Cozy</option>
    <option value="roomy">Roomy</option>
  </select>
  <button class="pipeline-btn" id="pipelineBtn" onclick="runPipeline()" title="Run /career-ops pipeline">
    <span class="pipeline-btn-icon">▶</span>
    <span class="pipeline-btn-label">Pipeline</span>
  </button>
  <div class="live">
    <span class="live-dot" id="liveDot"></span>
    <span id="liveLabel">connecting…</span>
  </div>
</header>
<nav class="tabs" id="tabs"></nav>
<div class="tab-select-wrap" style="display:none" id="tabSelectWrap">
  <select class="tab-select" id="tabSelect"></select>
</div>
<main>
  <div class="stats-strip" id="statsStrip"></div>
  <div class="section-rail" id="sectionRail"></div>
  <div id="tableWrap"></div>
</main>

<div class="drawer-backdrop" id="drawerBackdrop" onclick="closeDrawer()"></div>
<aside class="drawer" id="drawer" aria-hidden="true">
  <div class="drawer-header">
    <div>
      <h2 class="drawer-title" id="drawerTitle">—</h2>
      <div class="drawer-sub" id="drawerSub">—</div>
    </div>
    <button class="modal-close" onclick="closeDrawer()" aria-label="Close">×</button>
  </div>
  <div class="drawer-body" id="drawerBody"></div>
  <div class="drawer-prep" id="drawerPrep"></div>
  <div class="drawer-actions" id="drawerActions"></div>
</aside>

<div class="modal-overlay" id="modal" onclick="if(event.target===this) closeModal()">
  <div class="modal">
    <div class="modal-header">
      <div class="modal-title" id="modalTitle">Report</div>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body" id="modalBody"></div>
  </div>
</div>

<div class="modal-overlay" id="editModal" onclick="if(event.target===this) closeEditModal()">
  <div class="modal" style="max-width:460px">
    <div class="modal-header">
      <div>
        <div class="modal-title" id="editModalTitle"></div>
        <div id="editModalSub" style="font-size:11px;color:var(--muted);margin-top:2px"></div>
      </div>
      <button class="modal-close" onclick="closeEditModal()">×</button>
    </div>
    <div style="padding:20px 24px;display:flex;flex-direction:column;gap:16px">
      <div>
        <label class="edit-label">Status</label>
        <select id="editStatus" class="edit-select">
          <option>Evaluated</option>
          <option>Applied</option>
          <option>Responded</option>
          <option>Interview</option>
          <option>Offer</option>
          <option>Rejected</option>
          <option>Discarded</option>
        </select>
      </div>
      <div>
        <label class="edit-label">Notes</label>
        <textarea id="editNotes" class="edit-textarea" rows="4" placeholder="Add notes…"></textarea>
      </div>
      <div style="display:flex;gap:8px">
        <button id="editSaveBtn" class="edit-btn-primary" onclick="saveEdit()">Save</button>
        <button class="edit-btn-cancel" onclick="closeEditModal()">Cancel</button>
      </div>
    </div>
  </div>
</div>

<script>
  ${renderMarkdown.toString()}

  const TABS = [
    { id: 'kanban',    label: 'Kanban' },
    { id: 'active',    label: 'Active' },
    { id: 'metrics',   label: 'Metrics' },
    { id: 'top',       label: 'Top ≥4' },
    { id: 'applied',   label: 'Applied' },
    { id: 'interview', label: 'Interview' },
    { id: 'evaluated', label: 'Evaluated' },
    { id: 'responded', label: 'Responded' },
    { id: 'rejected',  label: 'Rejected' },
    { id: 'prep',      label: 'Interview Prep' },
    { id: 'all',       label: 'All' },
    { id: 'archived',  label: 'Archived' },
  ];

  let state = { apps: [], metrics: {}, inbox: [], inboxItems: [], prep: [], actions: [] };
  let activeTab = 'active';
  let sortCol = 'num', sortDir = 'desc';
  let actionPage = 0;
  let actionKind = 'all';
  let interviewSubTab = 'all';
  let searchQuery = '';
  const ACTION_PAGE_SIZE = 8;
  const ACTION_KIND_META = {
    interview_prep: { label: 'Interview Prep' },
    follow_up:      { label: 'Follow-up' },
    apply_now:      { label: 'Apply Now' },
    decide:         { label: 'Decide' },
  };

  function scoreClass(s) {
    if (s == null) return '';
    if (s >= 4.0) return 'high';
    if (s >= 3.0) return 'mid';
    return 'low';
  }

  function filterApps() {
    const norm = s => (s || '').toLowerCase();
    const q = searchQuery.toLowerCase();
    return state.apps.filter(a => {
      const s = norm(a.status);
      let tabPass;
      if (activeTab === 'all') tabPass = true;
      else if (activeTab === 'active') tabPass = s !== 'discarded' && s !== 'discorded';
      else if (activeTab === 'archived') tabPass = s === 'discarded' || s === 'discorded';
      else if (activeTab === 'top') tabPass = (a.score ?? 0) >= 4.0;
      else tabPass = s === activeTab;
      if (!tabPass) return false;
      if (activeTab === 'interview' && interviewSubTab !== 'all') {
        if (interviewSubTab === '__unspecified__') { if (a.stage) return false; }
        else if ((a.stageKey || '') !== interviewSubTab) return false;
      }
      if (!q) return true;
      return norm(a.company).includes(q) || norm(a.role).includes(q) ||
             norm(a.notes).includes(q) || norm(a.status).includes(q);
    });
  }

  function sortApps(apps) {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...apps].sort((a, b) => {
      let av = a[sortCol], bv = b[sortCol];
      if (av == null) av = '';
      if (bv == null) bv = '';
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }

  function renderMetrics() {
    const m = state.metrics;
    const chip = (k, v) => \`<span class="chip"><span class="k">\${k}</span><b>\${v}</b></span>\`;
    const statusPills = ['Applied', 'Interview', 'Offer', 'Evaluated', 'Rejected']
      .filter(s => m.byStatus?.[s])
      .map(s => chip(s, m.byStatus[s]))
      .join('');
    document.getElementById('metrics').innerHTML =
      chip('Total', m.total || 0) +
      chip('Avg', m.avgScore) +
      chip('PDF', (m.pdfPct || 0) + '%') +
      statusPills;
  }

  function renderTabs() {
    const countFor = id => {
      if (id === 'metrics') return null;
      if (id === 'all') return state.apps.length;
      if (id === 'active') return state.apps.filter(a => { const s = (a.status || '').toLowerCase(); return s !== 'discarded' && s !== 'discorded'; }).length;
      if (id === 'archived') return state.apps.filter(a => { const s = (a.status || '').toLowerCase(); return s === 'discarded' || s === 'discorded'; }).length;
      if (id === 'top') return state.apps.filter(a => (a.score ?? 0) >= 4.0).length;
      if (id === 'prep') return (state.prep || []).length;
      if (id === 'kanban') return (state.kanban?.records || []).filter(r => r.is_active).length;
      return state.apps.filter(a => (a.status || '').toLowerCase() === id).length;
    };
    document.getElementById('tabs').innerHTML = TABS.map(t => {
      const c = countFor(t.id);
      const countHtml = c != null ? \`<span class="count">\${c}</span>\` : '';
      return \`<div class="tab \${activeTab === t.id ? 'active' : ''}" onclick="setTab('\${t.id}')">\${t.label}\${countHtml}</div>\`;
    }).join('');
    const sel = document.getElementById('tabSelect');
    sel.innerHTML = TABS.map(t => {
      const c = countFor(t.id);
      const label = c != null ? \`\${t.label} (\${c})\` : t.label;
      return \`<option value="\${t.id}" \${activeTab === t.id ? 'selected' : ''}>\${label}</option>\`;
    }).join('');
  }

  function renderSectionRail() {
    const el = document.getElementById('sectionRail');
    if (searchQuery || activeTab === 'metrics' || activeTab === 'prep' || activeTab === 'kanban') { el.innerHTML = ''; return; }
    const today = new Date().toISOString().slice(0, 10);
    const calendarEvents = getCalendarEvents();
    const upcoming = calendarEvents
      .filter(a => a.date && a.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''));
    const actions = state.actions || [];
    const inboxItems = state.inboxItems || [];

    const cards = [];

    if (upcoming.length) {
      cards.push(\`<div class="panel-card upcoming">
        <div class="panel-title">Upcoming Interviews<span class="count-badge">\${upcoming.length}</span></div>
        <div class="upcoming-list">\${upcoming.map(a => {
          const when = a.time
            ? \`\${a.date} · \${escapeHtml(a.time)}\`
            : a.date;
          const stageChip = a.kind
            ? \`<div class="iv-stage-chip">\${escapeHtml(a.kind)}</div>\`
            : '';
          const interviewerChip = a.who
            ? \`<div class="action-detail">👤 \${escapeHtml(a.who)}</div>\`
            : '';
          const actionBtns = [];
          if (a.report)      actionBtns.push(\`<a class="iv-action-btn btn-report" href="#" onclick="openReport('\${a.report}','\${escapeHtml(a.company)} — \${escapeHtml(a.role)}');return false;">Report</a>\`);
          if (a.url)         actionBtns.push(\`<a class="iv-action-btn btn-posting" href="\${escapeHtml(a.url)}" target="_blank" rel="noopener">↗ Job Posting</a>\`);
          if (a.meetingLink) {
            const meetingLabel = /google\\.com\\/calendar\\//.test(a.meetingLink) ? '↗ Open in Calendar' : '↗ Join';
            actionBtns.push(\`<a class="iv-action-btn btn-join" href="\${escapeHtml(a.meetingLink)}" target="_blank" rel="noopener">\${meetingLabel}</a>\`);
          }
          return \`<div class="upcoming-row">
            <div style="display:flex;flex-direction:column;gap:2px">
              <div class="iv-when-badge">\${when}</div>
              \${stageChip}
              \${interviewerChip}
            </div>
            <div class="action-main">
              <span class="company">\${escapeHtml(a.title || a.company)}</span>
              <span class="role">\${escapeHtml(a.role || a.kind || '')}</span>
            </div>
            <div class="iv-actions">\${actionBtns.join('')}</div>
          </div>\`;
        }).join('')}</div>
      </div>\`);
    }

    if (inboxItems.length) {
      cards.push(\`<div class="pipeline-layout">
        \${renderScanQueue()}
        <div class="pipeline-main">
          <div class="panel-card inbox">
            <div class="panel-title">Pipeline<span class="count-badge">\${inboxItems.length}</span></div>
            <div class="inbox-grid">\${inboxItems.map(i => \`<div class="inbox-row">
              <div>
                <div class="company">\${escapeHtml(i.company)}</div>
                <div class="inbox-source">\${escapeHtml(i.source)}</div>
              </div>
              <div>
                <div class="role">\${escapeHtml(i.role)}</div>
              </div>
              <div class="inbox-action"><a class="url-link" href="\${escapeHtml(i.url)}" target="_blank" rel="noopener">↗</a></div>
            </div>\`).join('')}</div>
          </div>
        </div>
      </div>\`);
    }

    el.innerHTML = cards.join('');
    if (inboxItems.length) attachScanQueueHandlers(document.getElementById('scanQueueRoot'));
  }

  function renderPrepView() {
    const q = searchQuery.toLowerCase();
    const prep = (state.prep || []).filter(p =>
      !q || (p.name || '').toLowerCase().includes(q) || (p.folder || '').toLowerCase().includes(q)
    );
    const el = document.getElementById('tableWrap');
    if (!prep.length) { el.innerHTML = '<div class="empty">No interview prep files yet.</div>'; return; }
    const fmtDate = ms => new Date(ms).toISOString().slice(0, 10);
    const cleanName = n => n.replace(/\\.(md|pdf)$/i, '').replace(/^[A-Z][A-Za-z]+(?:\\s+[A-Z][A-Za-z]+){1,2}\\s*-\\s*/, '').replace(/\\s*-\\s*\\d{4}-\\d{2}-\\d{2}$/, '');

    // Group by folder
    const groups = new Map();
    for (const p of prep) {
      const key = p.folder || '(top level)';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(p);
    }
    const groupEntries = [...groups.entries()].sort((a, b) => {
      const am = Math.max(...a[1].map(x => x.mtime));
      const bm = Math.max(...b[1].map(x => x.mtime));
      return bm - am;
    });

    const groupsHtml = groupEntries.map(([folder, items]) => \`
      <div class="prep-group">
        <div class="prep-group-title">\${escapeHtml(folder)}<span class="count-badge">\${items.length}</span></div>
        <div class="prep-list">\${items.map(p => {
          const title = cleanName(p.name);
          const fullTitle = p.folder ? \`\${p.folder} — \${title}\` : title;
          const pdfBadge = p.type === 'pdf' ? \`<span style="font-size:9px;font-weight:700;letter-spacing:0.4px;padding:1px 6px;border-radius:4px;background:rgba(251,191,36,0.12);color:var(--warning);margin-right:6px;flex-shrink:0">PDF</span>\` : '';
          return \`<div class="prep-row" onclick="openPrep('\${escapeHtml(p.file)}','\${escapeHtml(fullTitle)}')">
            <a style="display:flex;align-items:center">\${pdfBadge}\${escapeHtml(title)}</a>
            <span class="prep-date">\${fmtDate(p.mtime)}</span>
          </div>\`;
        }).join('')}</div>
      </div>\`).join('');

    el.innerHTML = \`<div class="panel-card prep">
      <div class="panel-title">Interview Prep<span class="count-badge">\${prep.length}</span></div>
      \${groupsHtml}
    </div>\`;
  }

  function renderKanbanView() {
    const el = document.getElementById('tableWrap');
    const kanban = state.kanban || { stages: [], records: [], metrics: {} };
    if (!kanban.records.length) {
      el.innerHTML = '<div class="empty" style="display:flex;flex-direction:column;gap:12px;align-items:center"><div>Kanban pipeline is empty.</div><button class="kb-add-btn" onclick="addKanbanRecord()">+ Add Job</button></div>';
      return;
    }
    const q = searchQuery.toLowerCase();
    const recordMatches = r => {
      if (!q) return true;
      return [r.company, r.role, r.current_stage, r.next_action, r.notes, r.priority]
        .some(v => (v || '').toString().toLowerCase().includes(q));
    };
    const records = kanban.records.filter(recordMatches);
    const active = records.filter(r => r.is_active);
    const historical = records.filter(r => r.is_historical);

    const stageMap = new Map();
    for (const stage of kanban.stages) stageMap.set(stage, []);
    for (const r of active) {
      if (!stageMap.has(r.current_stage)) stageMap.set(r.current_stage, []);
      stageMap.get(r.current_stage).push(r);
    }
    const activeStages = [...stageMap.entries()].filter(([, list]) => list.length);

    const m = kanban.metrics || {};
    const metricsBar = \`<div class="kb-metrics" style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <span class="kb-metric"><b>\${m.active_count || 0}</b> active</span>
        <span class="kb-metric kb-metric--hi"><b>\${m.high_priority_count || 0}</b> high priority</span>
        <span class="kb-metric kb-metric--urgent"><b>\${m.urgent_48h_count || 0}</b> within 48h</span>
        <span class="kb-metric kb-metric--overdue"><b>\${m.overdue_followups_count || 0}</b> overdue follow-up</span>
        <span class="kb-metric kb-metric--hist"><b>\${m.historical_count || 0}</b> historical</span>
      </div>
      <button class="kb-add-btn" onclick="addKanbanRecord()">+ Add Job</button>
    \`;

    const renderCard = (r) => {
      const badges = [];
      if (r.is_within_48h) badges.push('<span class="kb-badge kb-badge--urgent">⏰ &lt;48h</span>');
      if (r.is_followup_overdue) badges.push('<span class="kb-badge kb-badge--overdue">⚠ overdue follow-up</span>');
      const pri = (r.priority || '').toLowerCase();
      if (pri === 'high') badges.push('<span class="kb-badge kb-badge--hi">★ high</span>');
      else if (pri === 'medium') badges.push('<span class="kb-badge kb-badge--med">medium</span>');
      else if (pri === 'historical') badges.push('<span class="kb-badge kb-badge--hist">historical</span>');

      const followUp = r.follow_up_due_date
        ? \`<div class="kb-meta-row"><span class="kb-meta-k">follow-up</span><span class="kb-meta-v\${r.is_followup_overdue ? ' kb-overdue' : ''}">\${escapeHtml(r.follow_up_due_date)}</span></div>\`
        : '';
      const interview = r.interview_date_time
        ? \`<div class="kb-meta-row"><span class="kb-meta-k">interview</span><span class="kb-meta-v\${r.is_within_48h ? ' kb-urgent' : ''}">\${escapeHtml(r.interview_date_time)}</span></div>\`
        : '';
      const people = (r.display_people || []).length
        ? \`<div class="kb-meta-row"><span class="kb-meta-k">people</span><span class="kb-meta-v">\${(r.display_people || []).map(escapeHtml).join(', ')}</span></div>\`
        : '';
      const prepStatus = r.prep_status
        ? \`<div class="kb-meta-row"><span class="kb-meta-k">prep</span><span class="kb-meta-v">\${escapeHtml(r.prep_status)}</span></div>\`
        : '';
      const prepFocus = (r.prep_focus || []).length
        ? \`<ul class="kb-bullets">\${(r.prep_focus || []).slice(0, 3).map(b => \`<li>\${escapeHtml(b)}</li>\`).join('')}</ul>\`
        : '';
      const risks = (r.risk_flags || []).length
        ? \`<div class="kb-risks">\${(r.risk_flags || []).map(rf => \`<span class="kb-risk">⚠ \${escapeHtml(rf)}</span>\`).join('')}</div>\`
        : '';
      const links = [];
      if (r.url) links.push(\`<button class="kb-link-btn" onclick="window.open('\${escapeHtml(r.url)}','_blank','noopener');return false;">open link</button>\`);
      if (r.tracker_report) links.push(\`<a class="kb-link" href="#" onclick="openReport('\${escapeHtml(r.tracker_report.replace(/^reports\\//, ''))}','\${escapeHtml(r.company)} — \${escapeHtml(r.role)}');return false;">report</a>\`);
      if (r.tracker_url) links.push(\`<a class="kb-link" href="\${escapeHtml(r.tracker_url)}" target="_blank" rel="noopener">↗ JD</a>\`);
      if (r.primary_tracker_num != null) links.push(\`<a class="kb-link" href="#" onclick="openDrawer(\${r.primary_tracker_num});return false;">#\${r.primary_tracker_num}</a>\`);
      links.push(\`<button class="kb-link-btn" onclick="editKanbanRecord('\${escapeHtml(r.id)}');return false;">edit</button>\`);

      const dimmed = r.is_historical ? ' kb-card--dim' : '';
      return \`<div class="kb-card\${dimmed}\${r.is_within_48h ? ' kb-card--urgent' : ''}">
        <div class="kb-card-head">
          <div class="kb-card-co">\${escapeHtml(r.company)}</div>
          <div class="kb-card-badges">\${badges.join('')}</div>
        </div>
        <div class="kb-card-role">\${escapeHtml(r.role)}</div>
        \${r.next_action ? \`<div class="kb-next">\${escapeHtml(r.next_action)}</div>\` : ''}
        <div class="kb-meta">
          \${interview}
          \${followUp}
          \${people}
          \${prepStatus}
        </div>
        \${prepFocus}
        \${risks}
        \${links.length ? \`<div class="kb-links">\${links.join('')}</div>\` : ''}
        <select class="kb-stage-select" onchange="updateKanbanStage('\${escapeHtml(r.id)}', this.value)">
          \${kanban.stages.map(s => \`<option value="\${escapeHtml(s)}"\${s === r.current_stage ? ' selected' : ''}>\${escapeHtml(s)}</option>\`).join('')}
        </select>
      </div>\`;
    };

    const columns = activeStages.map(([stage, list]) => \`
      <div class="kb-col">
        <div class="kb-col-head">
          <span class="kb-col-title">\${escapeHtml(stage)}</span>
          <span class="kb-col-count">\${list.length}</span>
        </div>
        <div class="kb-col-body">\${list.map(renderCard).join('')}</div>
      </div>
    \`).join('');

    const historicalHtml = historical.length ? \`
      <div class="kb-historical">
        <div class="kb-historical-head">Historical / Paused<span class="count-badge">\${historical.length}</span></div>
        <div class="kb-historical-grid">\${historical.map(renderCard).join('')}</div>
      </div>
    \` : '';

    el.innerHTML = \`
      <div class="kb-wrap">
        \${metricsBar}
        \${activeStages.length ? \`<div class="kb-board">\${columns}</div>\` : '<div class="empty">No active records match this filter.</div>'}
        \${historicalHtml}
      </div>\`;
  }

  function renderMetricsView() {
    const apps = state.apps;
    const statusOf = a => a.status || '';
    const pct = (n, d) => d ? Math.round(100 * n / d) : 0;

    // Funnel (cumulative reach)
    const excluded = new Set(['SKIP', 'Discarded']);
    const considered = apps.filter(a => !excluded.has(statusOf(a)));
    const totalConsidered = considered.length;
    const reachedApplied = considered.filter(a => statusOf(a) !== 'Evaluated').length;
    const reachedResponded = considered.filter(a => ['Responded', 'Interview', 'Offer', 'Rejected'].includes(statusOf(a))).length;
    const reachedInterview = considered.filter(a => ['Interview', 'Offer'].includes(statusOf(a))).length;
    const reachedOffer = considered.filter(a => statusOf(a) === 'Offer').length;

    const funnelStages = [
      { label: 'Evaluated', count: totalConsidered, pct: 100 },
      { label: 'Applied',   count: reachedApplied,   pct: pct(reachedApplied, totalConsidered) },
      { label: 'Responded', count: reachedResponded, pct: pct(reachedResponded, totalConsidered) },
      { label: 'Interview', count: reachedInterview, pct: pct(reachedInterview, totalConsidered) },
      { label: 'Offer',     count: reachedOffer,     pct: pct(reachedOffer, totalConsidered) },
    ];
    const maxFunnel = totalConsidered || 1;
    const funnelHtml = funnelStages.map(s => \`
      <div class="funnel-row">
        <div class="funnel-label">\${s.label}</div>
        <div class="funnel-bar-wrap"><div class="funnel-bar" style="width:\${(s.count / maxFunnel * 100).toFixed(1)}%"></div></div>
        <div class="funnel-value"><b>\${s.count}</b><span class="funnel-pct">\${s.pct}%</span></div>
      </div>
    \`).join('');

    // Conversion rates (base = reachedApplied)
    const responseRate = pct(reachedResponded, reachedApplied);
    const interviewRate = pct(reachedInterview, reachedApplied);
    const offerRate = pct(reachedOffer, reachedApplied);

    // New metrics
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
    const highScoreBacklog = apps.filter(a => statusOf(a) === 'Evaluated' && (a.score ?? 0) >= 4.0).length;
    const applyRate = pct(reachedApplied, totalConsidered);
    const appliedDateOf = a => { const m = (a.notes || '').match(/\bApplied (\d{4}-\d{2}-\d{2})\b/i); return m ? m[1] : a.date; };
    const appliedApps = apps.filter(a => statusOf(a) === 'Applied');
    const ghosted = appliedApps.filter(a => { const d = appliedDateOf(a); return d && daysBetween(d, today) >= 14; });
    const ghostingRate = pct(ghosted.length, appliedApps.length);
    const waitDays = appliedApps.map(a => { const d = appliedDateOf(a); return d ? daysBetween(d, today) : null; }).filter(d => d !== null && d >= 0);
    const avgWait = waitDays.length ? Math.round(waitDays.reduce((s, d) => s + d, 0) / waitDays.length) : null;

    // Score distribution (0-1, 1-2, 2-3, 3-4, 4-5)
    const buckets = [0, 0, 0, 0, 0];
    for (const a of apps) {
      if (a.score == null) continue;
      const i = Math.min(4, Math.max(0, Math.floor(a.score)));
      buckets[i]++;
    }
    const maxBucket = Math.max(...buckets, 1);
    const bucketLabels = ['0–1', '1–2', '2–3', '3–4', '4–5'];
    const bucketClass = i => i >= 4 ? 'high' : i >= 3 ? 'mid' : 'low';
    const distHtml = buckets.map((c, i) => \`
      <div class="dist-row">
        <div class="dist-label">\${bucketLabels[i]}</div>
        <div class="dist-bar-wrap"><div class="dist-bar \${bucketClass(i)}" style="width:\${(c / maxBucket * 100).toFixed(1)}%"></div></div>
        <div class="dist-value">\${c}</div>
      </div>
    \`).join('');

    // Timeline: apps per day since Apr 15
    const tlStart = '2026-04-15';
    const days = [];
    for (let ms = Date.parse(tlStart); ms <= Date.parse(today); ms += 86400000) {
      days.push({ date: new Date(ms).toISOString().slice(0, 10), count: 0 });
    }
    const dayMap = {};
    for (const d of days) dayMap[d.date] = d;
    const appliedStatuses = new Set(['Applied','Responded','Interview','Offer','Rejected']);
    for (const a of apps) {
      if (!appliedStatuses.has(statusOf(a))) continue;
      const d = appliedDateOf(a);
      if (d && dayMap[d]) dayMap[d].count++;
    }
    const maxDay = Math.max(...days.map(d => d.count), 1);
    const timelineHtml = days.map(d => \`
      <div class="tl-col" title="\${d.date}: \${d.count}">
        <div class="tl-bar-wrap"><div class="tl-bar" style="height:\${(d.count / maxDay * 100).toFixed(1)}%"></div></div>
        <div class="tl-count">\${d.count || ''}</div>
        <div class="tl-date">\${d.date.slice(5)}</div>
      </div>
    \`).join('');

    // Stale follow-ups (Applied, ≥7 days, no response)
    const stale = apps
      .filter(a => a.status === 'Applied' && a.date && daysBetween(a.date, today) >= 7)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 10);
    const staleHtml = stale.length ? stale.map(a => \`
      <div class="list-row">
        <div class="list-main">
          <span class="company">\${escapeHtml(a.company)}</span>
          <span class="role">\${escapeHtml(a.role)}</span>
        </div>
        <div class="list-meta">\${daysBetween(a.date, today)}d ago</div>
      </div>
    \`).join('') : '<div class="empty-sm">No stale follow-ups.</div>';

    // Top by score
    const top = [...apps]
      .filter(a => a.score != null && !excluded.has(statusOf(a)))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
    const topHtml = top.length ? top.map(a => \`
      <div class="list-row">
        <div class="list-main">
          <span class="company">\${escapeHtml(a.company)}</span>
          <span class="role">\${escapeHtml(a.role)}</span>
        </div>
        <div class="list-meta">
          <span class="score \${scoreClass(a.score)}">\${a.score.toFixed(1)}</span>
          <span class="status \${escapeHtml(a.status)}">\${escapeHtml(a.status)}</span>
        </div>
      </div>
    \`).join('') : '<div class="empty-sm">No scored apps.</div>';

    // Best unapplied (high-score, Evaluated)
    const bestUnapplied = apps
      .filter(a => statusOf(a) === 'Evaluated' && (a.score ?? 0) >= 4.0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
    const bestUnappliedHtml = bestUnapplied.length ? bestUnapplied.map(a => \`
      <div class="list-row">
        <div class="list-main">
          <span class="company">\${escapeHtml(a.company)}</span>
          <span class="role">\${escapeHtml(a.role)}</span>
        </div>
        <div class="list-meta">
          <span class="score \${scoreClass(a.score)}">\${a.score.toFixed(1)}</span>
        </div>
      </div>
    \`).join('') : '<div class="empty-sm">No high-score unapplied apps.</div>';

    // Win rate by score bucket
    const winBuckets = buckets.map((_, i) => {
      const inBucket = apps.filter(a => {
        if (a.score == null || excluded.has(statusOf(a))) return false;
        return Math.min(4, Math.max(0, Math.floor(a.score))) === i;
      });
      const responded = inBucket.filter(a => ['Responded','Interview','Offer','Rejected'].includes(statusOf(a))).length;
      const interviewed = inBucket.filter(a => ['Interview','Offer'].includes(statusOf(a))).length;
      return {
        label: bucketLabels[i], cls: bucketClass(i),
        total: inBucket.length, responded, interviewed,
        rPct: inBucket.length ? Math.round(responded / inBucket.length * 100) : null,
        iPct: inBucket.length ? Math.round(interviewed / inBucket.length * 100) : null,
      };
    });
    const maxRPct = Math.max(...winBuckets.map(b => b.rPct ?? 0), 1);
    const maxIPct = Math.max(...winBuckets.map(b => b.iPct ?? 0), 1);
    const makeWinRow = (b, key, maxPct, countKey) => {
      if (!b.total) return \`<div class="dist-row"><div class="dist-label">\${b.label}</div><div class="dist-bar-wrap"></div><div class="dist-value" style="color:var(--muted-dim)">—</div></div>\`;
      const p = b[key] ?? 0;
      return \`<div class="dist-row"><div class="dist-label">\${b.label}</div><div class="dist-bar-wrap"><div class="dist-bar \${b.cls}" style="width:\${(p/maxPct*100).toFixed(1)}%"></div></div><div class="dist-value">\${b[countKey]}/\${b.total} <span style="color:var(--muted-dim);font-size:10px">\${p}%</span></div></div>\`;
    };
    const winRateResponseHtml = winBuckets.map(b => makeWinRow(b, 'rPct', maxRPct, 'responded')).join('');
    const winRateInterviewHtml = winBuckets.map(b => makeWinRow(b, 'iPct', maxIPct, 'interviewed')).join('');

    document.getElementById('tableWrap').innerHTML = \`
      <div class="metrics-grid">
        <div class="card kpi">
          <div class="kpi-value">\${responseRate}%</div>
          <div class="kpi-label">Response rate</div>
          <div class="kpi-sub">\${reachedResponded} of \${reachedApplied} applied</div>
        </div>
        <div class="card kpi">
          <div class="kpi-value">\${interviewRate}%</div>
          <div class="kpi-label">Interview rate</div>
          <div class="kpi-sub">\${reachedInterview} of \${reachedApplied} applied</div>
        </div>
        <div class="card kpi">
          <div class="kpi-value">\${offerRate}%</div>
          <div class="kpi-label">Offer rate</div>
          <div class="kpi-sub">\${reachedOffer} of \${reachedApplied} applied</div>
        </div>
        <div class="card kpi">
          <div class="kpi-value \${highScoreBacklog > 0 ? 'warn' : ''}">\${highScoreBacklog}</div>
          <div class="kpi-label">High-score backlog</div>
          <div class="kpi-sub">score ≥4.0, not yet applied</div>
        </div>
        <div class="card kpi">
          <div class="kpi-value">\${applyRate}%</div>
          <div class="kpi-label">Apply rate</div>
          <div class="kpi-sub">\${reachedApplied} of \${totalConsidered} evaluated</div>
        </div>
        <div class="card kpi">
          <div class="kpi-value \${ghostingRate >= 50 ? 'danger' : ghostingRate >= 25 ? 'warn' : ''}">\${appliedApps.length ? ghostingRate + '%' : '—'}</div>
          <div class="kpi-label">Ghosting rate</div>
          <div class="kpi-sub">\${ghosted.length} of \${appliedApps.length} applied, ≥14d no reply</div>
        </div>
        <div class="card kpi">
          <div class="kpi-value">\${avgWait != null ? avgWait + 'd' : '—'}</div>
          <div class="kpi-label">Avg wait time</div>
          <div class="kpi-sub">days since applied, in-flight apps</div>
        </div>
        <div class="card wide">
          <div class="card-title">Funnel</div>
          <div class="funnel">\${funnelHtml}</div>
        </div>
        <div class="card">
          <div class="card-title">Score distribution</div>
          <div class="dist">\${distHtml}</div>
        </div>
        <div class="card wide" style="padding:0;border:none;background:transparent;display:flex;flex-direction:column;gap:12px">
          <div class="card">
            <div class="card-title">Applications per day (since Apr 15)</div>
            <div class="timeline">\${timelineHtml}</div>
          </div>
          <div class="card">
            <div class="card-title">Win rate by score</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px">
              <div>
                <div class="winrate-sub">Response rate (Responded+)</div>
                <div class="dist">\${winRateResponseHtml}</div>
              </div>
              <div>
                <div class="winrate-sub">Interview rate (Interview+)</div>
                <div class="dist">\${winRateInterviewHtml}</div>
              </div>
            </div>
          </div>
        </div>
        <div class="card">
          <div class="card-title">Top by score</div>
          <div class="list">\${topHtml}</div>
        </div>
        <div class="card">
          <div class="card-title">Stale follow-ups (≥7d)</div>
          <div class="list">\${staleHtml}</div>
        </div>
        <div class="card">
          <div class="card-title">Best unapplied ≥4.0</div>
          <div class="list">\${bestUnappliedHtml}</div>
        </div>
      </div>
    \`;
    document.getElementById('tableWrap').innerHTML += renderCalendar();
    queueMicrotask(() => attachCalendarHandlers(document.getElementById('calendarRoot')));
  }

  function renderStatsStrip() {
    const m = state.metrics || {};
    const apps = state.apps || [];
    const byStatus = m.byStatus || {};
    const active = (byStatus.Applied || 0) + (byStatus.Responded || 0) + (byStatus.Interview || 0);
    const respCount = (byStatus.Responded || 0) + (byStatus.Interview || 0) + (byStatus.Offer || 0);
    const ivCount = (byStatus.Interview || 0) + (byStatus.Offer || 0);
    const respRate = apps.length ? Math.round(100 * respCount / apps.length) : 0;
    const ivRate = apps.length ? Math.round(100 * ivCount / apps.length) : 0;
    const stats = [
      { k: 'Tracked', v: m.total ?? apps.length },
      { k: 'Active',  v: active, accent: true },
      { k: 'Avg score', v: m.avgScore ?? '\u2014', accent: true },
      { k: 'Response rate', v: respRate + '%' },
      { k: 'Interview rate', v: ivRate + '%' },
    ];
    document.getElementById('statsStrip').innerHTML = stats.map(s =>
      \`<div class="stat-card\${s.accent ? ' accent' : ''}"><div class="stat-k">\${s.k}</div><div class="stat-v">\${s.v}</div></div>\`
    ).join('');
  }

  // \u2500\u2500 Drawer \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  function openDrawer(num) {
    const a = state.apps.find(x => x.num === num);
    if (!a) return;
    document.getElementById('drawerTitle').textContent = a.company;
    document.getElementById('drawerSub').textContent = a.role;
    const rows = [
      ['#', '#' + a.num],
      ['Date', a.date || '\u2014'],
      ['Score', a.score != null ? a.score.toFixed(2) + ' / 5' : '\u2014'],
      ['Status', a.status || '\u2014'],
      ['Stage', a.stageLabel || '\u2014'],
      ['Interview', a.interviewDate ? a.interviewDate + (a.interviewTime ? ' \u00b7 ' + a.interviewTime : '') : '\u2014'],
      ['Interviewer', a.interviewer || '\u2014'],
      ['Notes', a.notes || '\u2014'],
    ];
    document.getElementById('drawerBody').innerHTML = rows.map(([k, v]) =>
      \`<div class="drawer-row"><div class="k">\${escapeHtml(k)}</div><div class="v">\${escapeHtml(v)}</div></div>\`
    ).join('');
    const actions = [];
    if (a.report) actions.push(\`<a class="iv-action-btn btn-report" href="#" onclick="openReport('\${a.report}','\${escapeHtml(a.company)} \u2014 \${escapeHtml(a.role)}');return false;">Report</a>\`);
    if (a.url) actions.push(\`<a class="iv-action-btn btn-posting" href="\${escapeHtml(a.url)}" target="_blank" rel="noopener">\u2197 Posting</a>\`);
    if (a.meetingLink) actions.push(\`<a class="iv-action-btn btn-join" href="\${escapeHtml(a.meetingLink)}" target="_blank" rel="noopener">\u2197 Join</a>\`);
    if (a.pdf) actions.push(\`<a class="iv-action-btn btn-pdf" href="/api/pdf?company=\${encodeURIComponent(a.company)}" target="_blank" rel="noopener">\ud83d\udcc4 PDF</a>\`);
    actions.push(\`<button class="iv-action-btn btn-posting" onclick="openEdit(\${a.num});closeDrawer()">Edit <span class="drawer-kbd">e</span></button>\`);
    document.getElementById('drawerActions').innerHTML = actions.join('');

    // Prep files section
    const prep = (state.prep || []).filter(p => (p.folder || '').toLowerCase().startsWith(a.company.toLowerCase()));
    const drawerPrep = document.getElementById('drawerPrep');
    if (drawerPrep) {
      if (prep.length) {
        const cleanName = n => n.replace(/\.(md|pdf)$/i, '').replace(/^[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){1,2}\s*-\s*/, '').replace(/\s*-\s*\d{4}-\d{2}-\d{2}$/, '');
        drawerPrep.innerHTML = \`<div class="drawer-prep-title">Interview Prep</div><div class="drawer-prep-list">\${prep.map(p => {
          const icon = p.type === 'pdf' ? '\ud83d\udcc4' : '\ud83d\udcdd';
          return \`<div class="prep-row" style="padding:6px 0;cursor:pointer" onclick="openPrep('\${escapeHtml(p.file)}','\${escapeHtml(p.folder)} \u2014 \${escapeHtml(cleanName(p.name))}')">\${icon} \${escapeHtml(cleanName(p.name))}</div>\`;
        }).join('')}</div>\`;
      } else {
        drawerPrep.innerHTML = '';
      }
    }

    document.getElementById('drawer').classList.add('open');
    document.getElementById('drawerBackdrop').classList.add('open');
    document.getElementById('drawer').setAttribute('aria-hidden', 'false');
  }
  function closeDrawer() {
    document.getElementById('drawer').classList.remove('open');
    document.getElementById('drawerBackdrop').classList.remove('open');
    document.getElementById('drawer').setAttribute('aria-hidden', 'true');
  }

  // \u2500\u2500 Theme + density (persisted in localStorage) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  (function initThemeDensity() {
    const theme = localStorage.getItem('co-theme') || 'mocha';
    const density = localStorage.getItem('co-density') || 'cozy';
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-density', density);
    // Selects are wired up after DOM is ready (below).
  })();

  function renderTable() {
    if (activeTab === 'metrics') return renderMetricsView();
    if (activeTab === 'prep') return renderPrepView();
    if (activeTab === 'kanban') return renderKanbanView();

    let stageBarHtml = '';
    if (activeTab === 'interview') {
      const ivApps = state.apps.filter(a => (a.status || '').toLowerCase() === 'interview');
      const stageCounts = {};
      let unspecifiedCount = 0;
      for (const a of ivApps) {
        if (a.stageKey) stageCounts[a.stageKey] = (stageCounts[a.stageKey] || 0) + 1;
        else unspecifiedCount++;
      }
      const stageList = [{ id: 'all', label: 'All Stages', count: ivApps.length }];
      for (const [key, count] of Object.entries(stageCounts)) {
        const sample = ivApps.find(a => a.stageKey === key);
        stageList.push({ id: key, label: sample ? sample.stageLabel : key, count });
      }
      if (unspecifiedCount && Object.keys(stageCounts).length) stageList.push({ id: '__unspecified__', label: 'Stage Unknown', count: unspecifiedCount });
      if (stageList.length > 1) {
        stageBarHtml = \`<div class="sub-tabs" style="margin-bottom:10px">\${stageList.map(t => \`<div class="sub-tab \${interviewSubTab === t.id ? 'active' : ''}" onclick="setInterviewSubTab('\${escapeHtml(t.id)}')">\${escapeHtml(t.label)}<span class="sub-tab-count">\${t.count}</span></div>\`).join('')}</div>\`;
      }
    }

    const apps = sortApps(filterApps());
    if (!apps.length) {
      document.getElementById('tableWrap').innerHTML = stageBarHtml + '<div class="empty">No applications in this view.</div>';
      return;
    }
    const rows = apps.map(a => {
      const dateCell = a.interviewDate
        ? \`\${a.date}<div class="iv-chip">📅 \${a.interviewDate}\${a.interviewTime ? ' · ' + escapeHtml(a.interviewTime) : ''}</div>\${a.stageLabel ? \`<div class="iv-stage-chip">\${escapeHtml(a.stageLabel)}</div>\` : ''}\${a.interviewer ? \`<div class="action-detail">👤 \${escapeHtml(a.interviewer)}</div>\` : ''}\${a.meetingLink ? \`<div><a class="url-link" href="\${escapeHtml(a.meetingLink)}" target="_blank" rel="noopener">\${a.meetingLink.includes('google.com/calendar') ? '↗ open in calendar' : '↗ join'}</a></div>\` : ''}\`
        : a.date;
      const priority = a.priority || { key: 'skip', label: '—' };
      const readiness = a.readiness || { report: false, pdf: false, applyPack: 'needs_work' };
      const readinessHtml = [
        { label: 'Report', value: readiness.report ? 'yes' : 'no' },
        { label: 'PDF', value: readiness.pdf ? 'yes' : 'no' },
        { label: readiness.applyPack === 'submitted' ? 'Submitted' : readiness.applyPack === 'ready' ? 'Apply pack ready' : readiness.applyPack === 'partial' ? 'Partial' : 'Needs work', value: readiness.applyPack === 'ready' ? 'yes' : readiness.applyPack === 'submitted' || readiness.applyPack === 'partial' ? 'partial' : 'no' },
      ].map(r => \`<span class="ready-chip \${r.value}">\${r.label}</span>\`).join('');
      const stageBadge = a.stageLabel
        ? '<span class="interview-stage-badge">' + escapeHtml(a.stageLabel) + '</span>'
        : '';
      return \`
      <tr style="cursor:pointer" onclick="if(event.target.closest('a,button,select,.editable-status'))return; openDrawer(\${a.num})">
        <td>#\${a.num}</td>
        <td>\${dateCell}</td>
        <td>
          <div class="company">\${escapeHtml(a.company)}</div>
          <div class="role">\${escapeHtml(a.role)}</div>
        </td>
        <td><span class="score \${scoreClass(a.score)}">\${a.score != null ? a.score.toFixed(1) : '—'}</span></td>
        <td><span class="priority \${priority.key}">\${escapeHtml(priority.label)}</span></td>
        <td><span class="status \${escapeHtml(a.status)} editable-status" onclick="openEdit(\${a.num})" title="Click to edit">\${escapeHtml(a.status)}</span></td>
        \${activeTab === 'interview' ? \`<td>\${stageBadge}</td>\` : ''}
        <td><div class="readiness">\${readinessHtml}</div></td>
        <td>\${a.report ? \`<a class="report-link" href="#" onclick="openReport('\${a.report}','\${escapeHtml(a.company)} — \${escapeHtml(a.role)}');return false;">\${a.report.match(/^\\d+/)?.[0] || '#'}</a>\` : ''}</td>
        <td>\${a.url ? \`<a class="url-link" href="\${a.url}" target="_blank" rel="noopener">↗ open</a>\` : ''}</td>
        <td class="notes">\${escapeHtml(a.notes)}</td>
      </tr>
    \`;}).join('');
    const mobileCards = apps.map(a => {
      const priority = a.priority || { key: 'skip', label: '—' };
      const dateStr = a.interviewDate
        ? \`\${a.date} · 📅 \${a.interviewDate}\${a.interviewTime ? ' ' + escapeHtml(a.interviewTime) : ''}\`
        : (a.date || '');
      return \`<div class="mobile-card">
        <div class="mobile-card-top">
          <div style="min-width:0;flex:1">
            <div class="company">\${escapeHtml(a.company)}</div>
            <div class="role">\${escapeHtml(a.role)}</div>
          </div>
          <span class="score \${scoreClass(a.score)}" style="flex-shrink:0">\${a.score != null ? a.score.toFixed(1) : '—'}</span>
        </div>
        <div class="mobile-card-badges">
          <span class="status \${escapeHtml(a.status)} editable-status" onclick="openEdit(\${a.num})" title="Tap to edit">\${escapeHtml(a.status)}</span>
          <span class="priority \${priority.key}">\${escapeHtml(priority.label)}</span>
        </div>
        \${a.notes ? \`<div class="notes" style="font-size:11px">\${escapeHtml(a.notes)}</div>\` : ''}
        <div class="mobile-card-footer">
          <span style="font-variant-numeric:tabular-nums">\${dateStr}</span>
          <div style="display:flex;gap:12px;align-items:center">
            \${a.report ? \`<a class="report-link" href="#" onclick="openReport('\${a.report}','\${escapeHtml(a.company)} — \${escapeHtml(a.role)}');return false;">report</a>\` : ''}
            \${a.url ? \`<a class="url-link" href="\${a.url}" target="_blank" rel="noopener">↗ JD</a>\` : ''}
          </div>
        </div>
      </div>\`;
    }).join('');
    document.getElementById('tableWrap').innerHTML = stageBarHtml + \`
      <div class="table-card">
        <table>
          <thead><tr>
            <th onclick="setSort('num')">#</th>
            <th onclick="setSort('date')">Date</th>
            <th onclick="setSort('company')">Company · Role</th>
            <th onclick="setSort('score')">Score</th>
            <th>Priority</th>
            <th onclick="setSort('status')">Status</th>
            \${activeTab === 'interview' ? '<th>Interview Stage</th>' : ''}
            <th>Readiness</th>
            <th>Report</th>
            <th>URL</th>
            <th>Notes</th>
          </tr></thead>
          <tbody>\${rows}</tbody>
        </table>
      </div>
      <div class="mobile-list">\${mobileCards}</div>\`;
  }

  function setTab(t) { activeTab = t; if (t !== 'interview') interviewSubTab = 'all'; renderTabs(); renderSectionRail(); renderTable(); }
  function setInterviewSubTab(t) { interviewSubTab = t; renderTable(); }
  function setActionPage(n) { actionPage = n; renderSectionRail(); }
  function setActionKind(k) { actionKind = k; actionPage = 0; renderSectionRail(); }
  function setSort(col) {
    if (sortCol === col) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    else { sortCol = col; sortDir = col === 'num' || col === 'date' || col === 'score' ? 'desc' : 'asc'; }
    renderTable();
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;" }[c]));
  }

  async function openReport(file, title) {
    document.getElementById('modalTitle').textContent = title;
    const body = document.getElementById('modalBody');
    body.innerHTML = '<p style="color:var(--muted)">Loading…</p>';
    document.getElementById('modal').classList.add('open');
    try {
      const res = await fetch(\`/api/report?file=\${encodeURIComponent(file)}\`);
      body.innerHTML = renderMarkdown(await res.text());
      body.scrollTop = 0;
    } catch (e) {
      body.textContent = 'Failed to load report: ' + e.message;
    }
  }
  async function openPrep(file, title) {
    if (/\.pdf$/i.test(file)) {
      window.open(\`/api/prep?file=\${encodeURIComponent(file)}\`, '_blank');
      return;
    }
    document.getElementById('modalTitle').textContent = title;
    const body = document.getElementById('modalBody');
    body.innerHTML = '<p style="color:var(--muted)">Loading…</p>';
    document.getElementById('modal').classList.add('open');
    try {
      const res = await fetch(\`/api/prep?file=\${encodeURIComponent(file)}\`);
      body.innerHTML = renderMarkdown(await res.text());
      body.scrollTop = 0;
    } catch (e) {
      body.textContent = 'Failed to load prep: ' + e.message;
    }
  }
  function closeModal() { document.getElementById('modal').classList.remove('open'); }

  let editNum = null;
  function openEdit(num) {
    const app = state.apps.find(a => a.num === num);
    if (!app) return;
    editNum = num;
    document.getElementById('editModalTitle').textContent = app.company;
    document.getElementById('editModalSub').textContent = app.role;
    document.getElementById('editStatus').value = app.status;
    document.getElementById('editNotes').value = app.notes || '';
    const btn = document.getElementById('editSaveBtn');
    btn.textContent = 'Save'; btn.disabled = false;
    document.getElementById('editModal').classList.add('open');
  }
  function closeEditModal() {
    document.getElementById('editModal').classList.remove('open');
    editNum = null;
  }
  async function saveEdit() {
    const status = document.getElementById('editStatus').value;
    const notes = document.getElementById('editNotes').value;
    const btn = document.getElementById('editSaveBtn');
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      const res = await fetch('/api/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ num: editNum, status, notes }),
      });
      if (!res.ok) throw new Error(await res.text());
      closeEditModal();
      await refresh();
    } catch (e) {
      btn.textContent = 'Error — retry'; btn.disabled = false;
    }
  }

  function cleanKanbanField(value) {
    const text = value == null ? '' : String(value).trim();
    return text || null;
  }

  function promptKanbanRecord(record = {}) {
    const kanban = state.kanban || { stages: [] };
    const stageHint = (kanban.stages || []).length ? String.fromCharCode(10, 10) + 'Stages: ' + (kanban.stages || []).join(' | ') : '';
    const ask = (label, def = '') => window.prompt(label + stageHint, def ?? '');

    const company = ask('Company', record.company || '');
    if (company == null) return null;
    const role = ask('Role / title', record.role || record.title || '');
    if (role == null) return null;
    const current_stage = ask('Current stage', record.current_stage || kanban.stages?.[0] || 'Target / Research');
    if (current_stage == null) return null;
    const status = ask('Status (active / paused-historical / closed)', record.status || 'active');
    if (status == null) return null;
    const notes = ask('Notes', record.notes || '');
    if (notes == null) return null;
    const url = ask('Application / interview link', record.url || '');
    if (url == null) return null;
    const next_action = ask('Next action', record.next_action || '');
    if (next_action == null) return null;
    const follow_up_due_date = ask('Follow-up deadline (YYYY-MM-DD)', record.follow_up_due_date || '');
    if (follow_up_due_date == null) return null;
    const interview_date_time = ask('Interview date/time (optional)', record.interview_date_time || '');
    if (interview_date_time == null) return null;

    return {
      ...(record.id ? { id: record.id } : {}),
      company: cleanKanbanField(company),
      role: cleanKanbanField(role),
      current_stage: cleanKanbanField(current_stage),
      status: cleanKanbanField(status) || 'active',
      notes: cleanKanbanField(notes),
      url: cleanKanbanField(url),
      next_action: cleanKanbanField(next_action),
      follow_up_due_date: cleanKanbanField(follow_up_due_date),
      interview_date_time: cleanKanbanField(interview_date_time),
    };
  }

  async function saveKanbanRecord(payload) {
    const res = await fetch('/api/kanban/upsert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await res.text());
    await refresh();
  }

  async function editKanbanRecord(recordOrId) {
    const record = typeof recordOrId === 'string'
      ? (state.kanban?.records || []).find(r => r.id === recordOrId)
      : recordOrId;
    const payload = promptKanbanRecord(record || {});
    if (!payload) return;
    try {
      await saveKanbanRecord(payload);
    } catch (e) {
      alert('Failed to save Kanban record: ' + e.message);
    }
  }

  function addKanbanRecord() {
    editKanbanRecord({});
  }

  function clearSearch() {
    searchQuery = '';
    document.getElementById('searchInput').value = '';
    document.getElementById('searchClear').classList.remove('visible');
    renderTable();
  }

  document.getElementById('tabSelect').addEventListener('change', e => setTab(e.target.value));

  // Theme + density
  const themeSel = document.getElementById('themeSelect');
  const densitySel = document.getElementById('densitySelect');
  themeSel.value = localStorage.getItem('co-theme') || 'mocha';
  densitySel.value = localStorage.getItem('co-density') || 'cozy';
  themeSel.addEventListener('change', e => {
    document.documentElement.setAttribute('data-theme', e.target.value);
    localStorage.setItem('co-theme', e.target.value);
  });
  densitySel.addEventListener('change', e => {
    document.documentElement.setAttribute('data-density', e.target.value);
    localStorage.setItem('co-density', e.target.value);
  });
  const mq = window.matchMedia('(max-width: 640px)');
  const syncTabSelectVisibility = () => { document.getElementById('tabSelectWrap').style.display = mq.matches ? 'block' : 'none'; };
  mq.addEventListener('change', syncTabSelectVisibility);
  syncTabSelectVisibility();

  document.getElementById('searchInput').addEventListener('input', e => {
    searchQuery = e.target.value;
    document.getElementById('searchClear').classList.toggle('visible', searchQuery.length > 0);
    renderSectionRail();
    renderTable();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (document.getElementById('editModal').classList.contains('open')) { closeEditModal(); return; }
      if (document.getElementById('modal').classList.contains('open')) { closeModal(); return; }
      if (document.getElementById('drawer').classList.contains('open')) { closeDrawer(); return; }
      if (document.querySelector('.calendar-popover')) { closeCalendarPopover(); return; }
      if (searchQuery) { clearSearch(); document.getElementById('searchInput').blur(); return; }
    }
    if (e.key === '/' && document.activeElement !== document.getElementById('searchInput')) {
      e.preventDefault();
      document.getElementById('searchInput').focus();
      document.getElementById('searchInput').select();
    }
  });

  async function updateKanbanStage(id, stage) {
    try {
      const res = await fetch('/api/kanban/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, current_stage: stage }),
      });
      if (!res.ok) throw new Error(await res.text().catch(() => 'failed to update kanban stage'));
      refresh();
    } catch (err) {
      alert('Failed to update Kanban stage: ' + (err?.message || String(err)));
    }
  }

  async function refresh() {
    try {
      const res = await fetch('/api/state');
      state = await res.json();
      renderStatsStrip(); renderMetrics(); renderTabs(); renderSectionRail(); renderTable();
    } catch (e) { console.error('refresh failed', e); }
  }

  function setupSSE() {
    const es = new EventSource('/api/stream');
    const dot = document.getElementById('liveDot');
    const label = document.getElementById('liveLabel');
    es.onopen = () => { dot.classList.remove('stale'); label.textContent = 'live'; };
    es.onerror = () => { dot.classList.add('stale'); label.textContent = 'reconnecting…'; };
    es.addEventListener('update', () => { label.textContent = 'updating…'; refresh().then(() => label.textContent = 'live'); });
    es.addEventListener('hello', () => { label.textContent = 'live'; });
    es.addEventListener('pipeline', () => syncPipelineStatus());
  }

  function fmtAgo(iso) {
    if (!iso) return '';
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 0 || !Number.isFinite(ms)) return '';
    const s = Math.floor(ms / 1000);
    if (s < 60) return s + 's ago';
    const m = Math.floor(s / 60);
    if (m < 60) return m + 'm ago';
    const h = Math.floor(m / 60);
    if (h < 24) return h + 'h ago';
    return Math.floor(h / 24) + 'd ago';
  }

  async function syncPipelineStatus() {
    const btn = document.getElementById('pipelineBtn');
    if (!btn) return;
    try {
      const res = await fetch('/api/pipeline-status');
      const s = await res.json();
      btn.classList.toggle('running', !!s.running);
      btn.classList.toggle('error', !s.running && s.exitCode != null && s.exitCode !== 0);
      const icon = btn.querySelector('.pipeline-btn-icon');
      const lab = btn.querySelector('.pipeline-btn-label');
      if (s.running) {
        icon.textContent = '⏳';
        lab.textContent = 'Running…';
        btn.title = 'Pipeline running (started ' + fmtAgo(s.startedAt) + ')';
      } else if (s.exitCode != null && s.exitCode !== 0) {
        icon.textContent = '✕';
        lab.textContent = 'Failed';
        btn.title = 'Last run failed (exit ' + s.exitCode + '): ' + (s.lastError || 'unknown');
      } else {
        icon.textContent = '▶';
        lab.textContent = 'Pipeline';
        btn.title = s.finishedAt ? 'Last run ' + fmtAgo(s.finishedAt) + ' (ok)' : 'Run /career-ops pipeline';
      }
    } catch {}
  }

  async function runPipeline() {
    const btn = document.getElementById('pipelineBtn');
    if (btn.classList.contains('running')) return;
    btn.disabled = true;
    try {
      const res = await fetch('/api/pipeline', { method: 'POST' });
      if (res.status === 409) {
        await syncPipelineStatus();
        return;
      }
      if (!res.ok) throw new Error(await res.text());
      await syncPipelineStatus();
    } catch (e) {
      alert('Pipeline failed to start: ' + e.message);
    } finally {
      btn.disabled = false;
    }
  }

  // ── Touch gestures: swipe tabs + pull-to-refresh ─────────────────
  (function() {
    let startX = 0, startY = 0, dir = null, pullActive = false;
    const SWIPE_MIN = 55, SWIPE_MAX_DRIFT = 100, PULL_THRESHOLD = 70;
    const indicator = document.getElementById('pullIndicator');

    document.addEventListener('touchstart', e => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      dir = null;
      pullActive = window.scrollY === 0 && !document.getElementById('modal').classList.contains('open');
    }, { passive: true });

    document.addEventListener('touchmove', e => {
      if (dir === 'h') return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (!dir && (Math.abs(dx) > 8 || Math.abs(dy) > 8))
        dir = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
      if (dir === 'v' && pullActive && dy > 0) {
        const progress = Math.min(dy / PULL_THRESHOLD, 1);
        indicator.textContent = dy >= PULL_THRESHOLD ? '↑ Release to refresh' : '↓ Pull to refresh';
        indicator.style.opacity = String(Math.min(progress * 1.5, 1));
        indicator.style.transform = \`translateX(-50%) translateY(\${Math.min(dy * 0.35 - 20, 24)}px)\`;
      }
    }, { passive: true });

    document.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;
      const reset = () => { indicator.style.opacity = '0'; indicator.style.transform = ''; };

      if (dir === 'v' && pullActive && dy >= PULL_THRESHOLD) {
        indicator.textContent = '↻ Refreshing…';
        indicator.style.opacity = '1';
        refresh().then(reset);
      } else {
        reset();
      }

      if (!document.getElementById('modal').classList.contains('open') &&
          dir === 'h' && Math.abs(dx) > SWIPE_MIN && Math.abs(dy) < SWIPE_MAX_DRIFT) {
        const idx = TABS.findIndex(t => t.id === activeTab);
        if (dx < 0 && idx < TABS.length - 1) setTab(TABS[idx + 1].id);
        else if (dx > 0 && idx > 0) setTab(TABS[idx - 1].id);
      }
      dir = null; pullActive = false;
    }, { passive: true });
  })();


  // ── Calendar ──────────────────────────────────────────────────
  const CAL_STAGE_LABEL = { recruiter: "Recruiter", tech: "Technical", hm: "Hiring Mgr", fit: "Fit", other: "Other" };
  let calFilter = { stage: "all", company: "all" };

  function calYmd(d) {
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }
  function calToday() {
    const n = new Date();
    return n.getFullYear() + '-' + String(n.getMonth()+1).padStart(2,'0') + '-' + String(n.getDate()).padStart(2,'0');
  }
  function buildCalGrid(today, earlyDate = null) {
    const parts = today.split('-').map(Number);
    const t0 = new Date(parts[0], parts[1] - 1, parts[2]); // midnight local — avoids UTC off-by-one
    const dow = (t0.getDay() + 6) % 7;
    const thisMonday = new Date(t0);
    thisMonday.setDate(t0.getDate() - dow);

    // Start: default to this Monday, but extend back to cover earlyDate (cap 4 weeks back)
    let startMonday = new Date(thisMonday);
    if (earlyDate) {
      const ep = earlyDate.split('-').map(Number);
      const ed = new Date(ep[0], ep[1] - 1, ep[2]);
      const edDow = (ed.getDay() + 6) % 7;
      const edMonday = new Date(ed);
      edMonday.setDate(ed.getDate() - edDow);
      const maxBack = new Date(thisMonday);
      maxBack.setDate(thisMonday.getDate() - 28);
      if (edMonday < startMonday && edMonday >= maxBack) startMonday = edMonday;
    }

    // End: thisMonday + 13 days (2 weeks from current week)
    const endDate = new Date(thisMonday);
    endDate.setDate(thisMonday.getDate() + 13);

    const out = [];
    const cur = new Date(startMonday);
    while (cur <= endDate) { out.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }
    return out;
  }

  function getCalendarEvents() {
    const today = calToday();
    const live = Array.isArray(state.calendarEvents) && state.calendarEvents.length
      ? state.calendarEvents
      : null;
    const events = live || buildTrackerCalendarEvents(state.apps || []);
    return events.map(e => ({
      ...e,
      past: e.date ? e.date < today : false,
    }));
  }

  function renderCalendar() {
    const today = calToday();
    const all = getCalendarEvents();
    const earliest = all.reduce((min, e) => (!e.date ? min : (!min || e.date < min ? e.date : min)), null);
    const grid = buildCalGrid(today, earliest);

    const companies = ["all", ...Array.from(new Set(all.map(e => e.co))).sort()];
    const filtered = all.filter(e => {
      if (calFilter.stage !== "all" && e.stage !== calFilter.stage) return false;
      if (calFilter.company !== "all" && e.co !== calFilter.company) return false;
      return true;
    });

    const byDay = {};
    for (const e of filtered) {
      (byDay[e.date] ||= []).push(e);
    }
    for (const k of Object.keys(byDay)) {
      byDay[k].sort((a, b) => (a.time || "").localeCompare(b.time || ""));
    }

    const dows = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

    const stageBtn = s => \`<button class="cal-stage-btn" data-stage="\${s}" data-active="\${calFilter.stage === s}" data-cal-stage="\${s}">
      <span class="cal-stage-dot cal-stage-dot--\${s}"></span>\${CAL_STAGE_LABEL[s]}
    </button>\`;

    const eventChip = (e) => \`<div class="cal-event cal-event--\${e.stage}\${e.past ? ' cal-event--past' : ''}" data-cal-event="\${e.n}-\${e.date}-\${e.time}">
      <div class="cal-event-row1">
        <span class="cal-event-time">\${escapeHtml(e.time)}</span>
        <span class="cal-event-co">\${escapeHtml(e.co)}</span>
      </div>
      \${e.who ? \`<div class="cal-event-who">\${escapeHtml(e.who)}</div>\` : ''}
    </div>\`;

    const cell = (d) => {
      const k = calYmd(d);
      const isToday = k === today;
      const isPast = k < today;
      const events = byDay[k] || [];
      const cls = ['cal-cell', isToday && 'cal-cell--today', isPast && !isToday && 'cal-cell--past'].filter(Boolean).join(' ');
      return \`<div class="\${cls}">
        <div class="cal-cell-head">
          <div class="cal-cell-date">\${d.getMonth() + 1}/\${d.getDate()}</div>
          \${isToday ? '<div class="cal-today-tag">Today</div>' : ''}
        </div>
        <div class="cal-events">\${events.map(eventChip).join("")}</div>
      </div>\`;
    };

    const gridStart = calYmd(grid[0]);
    const gridEnd   = calYmd(grid[grid.length - 1]);
    const upcomingCount = filtered.filter(e => !e.past && e.date >= gridStart && e.date <= gridEnd).length;
    const pastCount     = filtered.filter(e =>  e.past && e.date >= gridStart && e.date <= gridEnd).length;

    return \`<div class="cal" id="calendarRoot">
      <div class="cal-head">
        <div>
          <span class="cal-title">Calendar · \${gridStart.slice(5).replace('-','/').replace(/^0/,'')} – \${gridEnd.slice(5).replace('-','/').replace(/^0/,'')}</span>
          <span class="cal-sub">\${upcomingCount} upcoming · \${pastCount} past</span>
        </div>
        <div class="cal-controls">
          <div class="cal-stage">\${["recruiter", "tech", "hm", "fit"].map(stageBtn).join("")}</div>
          <select class="cal-company-select" id="calCompanySelect">
            \${companies.map(c => \`<option value="\${escapeAttr(c)}"\${calFilter.company === c ? ' selected' : ''}>\${c === "all" ? "All companies" : escapeHtml(c)}</option>\`).join("")}
          </select>
        </div>
      </div>
      <div class="cal-dows">\${dows.map(n => \`<div class="cal-dow">\${n}</div>\`).join("")}</div>
      <div class="cal-grid">\${grid.map(cell).join("")}</div>
    </div>\`;
  }

  function attachCalendarHandlers(root) {
    if (!root) return;
    const all = getCalendarEvents();
    root.querySelectorAll('[data-cal-stage]').forEach(btn => {
      btn.addEventListener('click', () => {
        const s = btn.dataset.calStage;
        calFilter.stage = calFilter.stage === s ? "all" : s;
        rerenderCalendar();
      });
    });
    const sel = root.querySelector('#calCompanySelect');
    if (sel) sel.addEventListener('change', e => {
      calFilter.company = e.target.value; rerenderCalendar();
    });
    root.querySelectorAll('[data-cal-event]').forEach(chip => {
      chip.addEventListener('click', e => {
        const key = chip.dataset.calEvent;
        const ev = all.find(x => \`\${x.n}-\${x.date}-\${x.time}\` === key);
        if (!ev) return;
        const r = chip.getBoundingClientRect();
        showCalendarPopover(ev, r.right + 8, r.top);
      });
    });
  }

  function rerenderCalendar() {
    const host = document.getElementById('calendarRoot');
    if (!host) return;
    host.outerHTML = renderCalendar();
    attachCalendarHandlers(document.getElementById('calendarRoot'));
  }

  function showCalendarPopover(ev, x, y) {
    closeCalendarPopover();
    const a = (state.apps || []).find(z => z.num === ev.n);
    const maxX = window.innerWidth - 320;
    const left = Math.min(x, maxX);
    const wrap = document.createElement('div');
    wrap.innerHTML = \`
      <div class="calendar-popover-backdrop" onclick="closeCalendarPopover()"></div>
      <div class="calendar-popover" style="left:\${left}px;top:\${y}px">
        <div class="cal-pop-head">
          <div class="cal-pop-co">\${escapeHtml(ev.co)}</div>
          <div class="cal-pop-stage cal-pop-stage--\${ev.stage}">\${escapeHtml(CAL_STAGE_LABEL[ev.stage] || "Other")}</div>
        </div>
        <div class="cal-pop-meta">
          <div style="color:var(--muted)">\${escapeHtml(ev.kind)}</div>
          <div style="color:var(--success);font-variant-numeric:tabular-nums">\${escapeHtml(ev.date)} · \${escapeHtml(ev.time)}</div>
          \${ev.who ? \`<div style="color:var(--muted)">👤 \${escapeHtml(ev.who)}</div>\` : ''}
          \${a ? \`<div style="color:var(--muted)">\${escapeHtml(a.role || '')}</div>\` : ''}
        </div>
        <div class="cal-pop-actions">
          <button class="cal-pop-btn" data-cal-pop-open="\${ev.n}">Open detail</button>
          \${ev.meetingLink ? \`<a class="cal-pop-btn cal-pop-btn--accent" href="\${escapeAttr(ev.meetingLink)}" target="_blank" rel="noopener">\${ev.meetingLink.includes('google.com/calendar') ? '↗ Open in Calendar' : '↗ Join meeting'}</a>\` : ''}
          <button class="cal-pop-btn" onclick="closeCalendarPopover()">Prep notes</button>
        </div>
      </div>\`;
    document.body.appendChild(wrap);
    wrap.id = 'calendarPopoverWrap';
    const openBtn = wrap.querySelector('[data-cal-pop-open]');
    if (openBtn) openBtn.addEventListener('click', () => {
      closeCalendarPopover();
      openDrawer(ev.n);
    });
  }
  function closeCalendarPopover() {
    const w = document.getElementById('calendarPopoverWrap');
    if (w) w.remove();
  }

  function escapeAttr(s) { return String(s).replace(/"/g, "&quot;"); }

  // ── Scan queue ─────────────────────────────────────────────────
  const SQ_STATE_ORDER = ["scanning", "scored", "failed", "queued"];
  const SQ_STATE_LABEL = { scanning: "Scanning", scored: "Scored", failed: "Failed", queued: "Queued" };
  let scanQueueFilter = "all";
  let scanQueueOpenMenu = null;

  function buildScanQueueFromInbox() {
    const items = state.inboxItems || [];
    return items.map((e, i) => ({
      id: \`q-\${i}\`,
      added: new Date().toISOString().slice(0, 16).replace("T", " "),
      source: e.source || sqHostname(e.url) || "unknown",
      company: (e.company && e.company !== 'Unknown') ? e.company : null,
      state: "queued",
      score: null,
      error: null,
      url: e.url,
    }));
  }
  function sqHostname(url) {
    try { return new URL(url).hostname.replace(/^www\./, "").split(".")[0]; }
    catch { return ""; }
  }
  function sqFmtAdded(ts) {
    if (!ts) return "";
    const today = new Date().toISOString().slice(0, 10);
    const [d, time] = ts.split(" ");
    if (d === today) return time || "";
    return ts.slice(5);
  }

  function renderScanQueue() {
    const queue = buildScanQueueFromInbox();
    const grouped = { scanning: [], scored: [], failed: [], queued: [] };
    for (const item of queue) {
      const k = grouped[item.state] ? item.state : "queued";
      grouped[k].push(item);
    }
    const counts = {
      all: queue.length,
      scanning: grouped.scanning.length,
      scored: grouped.scored.length,
      failed: grouped.failed.length,
      queued: grouped.queued.length,
    };
    const visible = scanQueueFilter === "all" ? SQ_STATE_ORDER : [scanQueueFilter];

    const chip = (s) => {
      const active = scanQueueFilter === s;
      const label = s === "all" ? "all" : SQ_STATE_LABEL[s].toLowerCase();
      const dot = s === "all" ? "" : \`<span class="scan-queue__dot scan-queue__dot--\${s}"></span>\`;
      return \`<button class="scan-queue__chip" data-active="\${active}" data-sq-filter="\${s}">
        \${dot}<span>\${label}</span>
        <span class="scan-queue__chip-count">\${counts[s]}</span>
      </button>\`;
    };

    const itemHtml = (item) => {
      const menuOpen = scanQueueOpenMenu === item.id;
      const company = item.company
        ? escapeHtml(item.company)
        : \`<span class="scan-queue__company--unresolved">unresolved</span>\`;
      const score = (item.state === "scored" && item.score != null)
        ? \`<span class="scan-queue__score">\${Number(item.score).toFixed(1)}</span>\`
        : "";
      const lastLine = item.error
        ? \`<div class="scan-queue__error">⚠ \${escapeHtml(item.error)}</div>\`
        : \`<div class="scan-queue__url">\${escapeHtml(item.url.replace(/^https?:[/][/]/, ""))}</div>\`;
      const menu = menuOpen ? \`
        <div class="scan-queue__menu-backdrop" data-sq-menu-close></div>
        <div class="scan-queue__menu">
          \${item.state !== "scanning" ? \`<button class="scan-queue__menu-item" data-sq-action="run" data-sq-url="\${escapeAttr(item.url)}"><span class="scan-queue__menu-icon">▶</span>Run pipeline now</button>\` : ""}
          <button class="scan-queue__menu-item" data-sq-action="open" data-sq-url="\${escapeAttr(item.url)}"><span class="scan-queue__menu-icon">↗</span>Open URL</button>
          <button class="scan-queue__menu-item scan-queue__menu-item--accent-danger" data-sq-action="remove" data-sq-url="\${escapeAttr(item.url)}"><span class="scan-queue__menu-icon">✕</span>Remove from queue</button>
        </div>\` : "";
      return \`<div class="scan-queue__item" data-state="\${item.state}" data-sq-id="\${item.id}">
        <div class="scan-queue__item-row1">
          <span class="scan-queue__company">\${company}</span>
          \${score}
          <button class="scan-queue__menu-btn" data-sq-menu-toggle="\${item.id}">⋯</button>
        </div>
        <div class="scan-queue__meta">
          <span class="scan-queue__source scan-queue__source--\${item.state}">\${escapeHtml(item.source)}</span>
          <span>·</span>
          <span class="scan-queue__time">\${escapeHtml(sqFmtAdded(item.added))}</span>
        </div>
        \${lastLine}
        \${menu}
      </div>\`;
    };

    const groups = visible.map(s => {
      const items = grouped[s];
      if (!items.length) return "";
      return \`<div>
        <div class="scan-queue__group-label scan-queue__group-label--\${s}">
          <span class="scan-queue__dot scan-queue__dot--\${s}"></span>
          \${SQ_STATE_LABEL[s]}
          <span class="scan-queue__group-count">· \${items.length}</span>
        </div>
        \${items.map(itemHtml).join("")}
      </div>\`;
    }).join("");

    return \`<aside class="scan-queue" id="scanQueueRoot">
      <div class="scan-queue__header">
        <div class="scan-queue__title-row">
          <div class="scan-queue__title">Scan queue</div>
          <div class="scan-queue__count">\${queue.length} items</div>
        </div>
        <div class="scan-queue__add">
          <input type="url" id="sqAddInput" class="scan-queue__add-input" placeholder="Paste job URL to queue…" autocomplete="off" spellcheck="false">
          <button class="scan-queue__add-btn" id="sqAddBtn">+ Add</button>
        </div>
        <button class="scan-queue__run-btn" data-sq-action="run-all">▶ Run pipeline now</button>
        <div class="scan-queue__chips">
          \${["all", ...SQ_STATE_ORDER].map(chip).join("")}
        </div>
      </div>
      <div class="scan-queue__list">
        \${groups || \`<div style="padding:24px;text-align:center;color:var(--muted);font-family:ui-monospace,monospace;font-size:11px">queue empty</div>\`}
      </div>
    </aside>\`;
  }

  function rerenderScanQueue() {
    const host = document.getElementById('scanQueueRoot');
    if (!host) return;
    host.outerHTML = renderScanQueue();
    attachScanQueueHandlers(document.getElementById('scanQueueRoot'));
  }

  function attachScanQueueHandlers(root) {
    if (!root) return;
    root.querySelectorAll('[data-sq-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        scanQueueFilter = btn.dataset.sqFilter;
        scanQueueOpenMenu = null;
        rerenderScanQueue();
      });
    });
    root.querySelectorAll('[data-sq-menu-toggle]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.sqMenuToggle;
        scanQueueOpenMenu = scanQueueOpenMenu === id ? null : id;
        rerenderScanQueue();
      });
    });
    root.querySelectorAll('[data-sq-menu-close]').forEach(el => {
      el.addEventListener('click', () => {
        scanQueueOpenMenu = null;
        rerenderScanQueue();
      });
    });
    root.querySelectorAll('[data-sq-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const a = btn.dataset.sqAction;
        const url = btn.dataset.sqUrl;
        scanQueueOpenMenu = null;
        if (a === 'open')    { window.open(url, '_blank'); rerenderScanQueue(); return; }
        if (a === 'run-all') { fetch('/api/queue/run', { method: 'POST' }); rerenderScanQueue(); return; }
        if (a === 'run')     { fetch('/api/queue/run',     { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ url }) }); rerenderScanQueue(); return; }
        if (a === 'remove')  { fetch('/api/queue/remove',  { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ url }) }).then(() => refresh()); rerenderScanQueue(); return; }
      });
    });

    const addInput = root.querySelector('#sqAddInput');
    const addBtn   = root.querySelector('#sqAddBtn');
    async function doAdd() {
      const rawUrl = (addInput.value || '').trim();
      if (!rawUrl || !rawUrl.startsWith('http')) return;
      addBtn.disabled = true;
      addBtn.textContent = 'Adding…';
      try {
        const r = await fetch('/api/queue/add', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ url: rawUrl }) });
        if (r.ok) {
          addInput.value = '';
          await refresh();
          rerenderScanQueue();
          return;
        }
        const msg = await r.text();
        addBtn.textContent = msg === 'already in pipeline' ? 'Already queued' : 'Error — retry';
      } catch { addBtn.textContent = 'Error — retry'; }
      setTimeout(() => { addBtn.disabled = false; addBtn.textContent = '+ Add'; }, 2500);
    }
    if (addBtn) addBtn.addEventListener('click', doAdd);
    if (addInput) addInput.addEventListener('keydown', e => { if (e.key === 'Enter') doAdd(); });
  }

  refresh();
  setupSSE();
  syncPipelineStatus();
  setInterval(syncPipelineStatus, 15000);
</script>
</body>
</html>
`;

// ── Server ────────────────────────────────────────────────────────

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(HTML);
    return;
  }

  if (url.pathname === '/api/state') {
    try {
      const apps = parseApplications().map(a => {
        const sc = a.stage ? classifyInterviewStage(a.stage) : null;
        return {
          ...a,
          priority: classifyPriority(a),
          readiness: summarizeReadiness(a),
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
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      });
      const kanban = normalizeKanban(loadKanbanRaw(), apps);
      res.end(JSON.stringify({ apps, metrics, inbox, inboxItems, actions, prep, calendarEvents, calendarSource, calendarError: googleCalendar.error, kanban }));
    } catch (err) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

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

  if (url.pathname === '/api/prep') {
    const file = url.searchParams.get('file') || '';
    if (file.includes('..') || file.startsWith('/')) {
      res.writeHead(400); res.end('invalid file'); return;
    }
    if (/\.pdf$/i.test(file)) {
      const pdfPath = join(ROOT, 'interview-prep', file);
      if (!existsSync(pdfPath)) { res.writeHead(404); res.end('not found'); return; }
      const stat = statSync(pdfPath);
      res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Length': stat.size, 'Content-Disposition': `inline; filename="${file.split('/').pop()}"` });
      createReadStream(pdfPath).pipe(res);
      return;
    }
    const content = loadPrep(file);
    if (content == null) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(content);
    return;
  }

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
    if (!match) { res.writeHead(404); res.end('no pdf found for this company'); return; }
    const pdfPath = findResumePdf(outputDir, match);
    if (!pdfPath) { res.writeHead(404); res.end('pdf file not found'); return; }
    const stat = statSync(pdfPath);
    res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Length': stat.size, 'Content-Disposition': `inline; filename="${pdfPath.split('/').pop()}"` });
    createReadStream(pdfPath).pipe(res);
    return;
  }

  if (url.pathname === '/api/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    res.write(`event: hello\ndata: ${Date.now()}\n\n`);
    if (typeof res.flush === 'function') res.flush();
    subscribers.add(res);
    const heartbeat = setInterval(() => {
      try { res.write(`: heartbeat\n\n`); if (typeof res.flush === 'function') res.flush(); } catch {}
    }, 5000);
    req.on('close', () => {
      clearInterval(heartbeat);
      subscribers.delete(res);
    });
    return;
  }

  if (url.pathname === '/api/pipeline-status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(pipelineState));
    return;
  }

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

  if (url.pathname === '/api/queue/add' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { url: targetUrl } = JSON.parse(body);
        if (!targetUrl || typeof targetUrl !== 'string' || !targetUrl.startsWith('http')) {
          res.writeHead(400); res.end('invalid url'); return;
        }
        if (!existsSync(PIPELINE_PATH)) { res.writeHead(404); res.end('pipeline not found'); return; }
        const content = readFileSync(PIPELINE_PATH, 'utf-8');
        if (sharedPipelineHasExactQueuedUrl(content, targetUrl)) {
          res.writeHead(409); res.end('already in pipeline'); return;
        }
        const lines = content.split('\n');
        const pendIdx = lines.findIndex(l => l.trim() === '## Pendientes');
        const insertAt = pendIdx === -1 ? lines.length : pendIdx + 1;
        lines.splice(insertAt, 0, `- [ ] ${targetUrl}`);
        writeFileSync(PIPELINE_PATH, lines.join('\n'), 'utf-8');
        broadcast('update');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(500); res.end(e.message);
      }
    });
    return;
  }

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

  if (url.pathname === '/manifest.json') {
    res.writeHead(200, { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'public, max-age=3600' });
    res.end(JSON.stringify({
      name: 'career-ops',
      short_name: 'career-ops',
      description: 'AI job search dashboard',
      start_url: '/',
      display: 'standalone',
      background_color: '#0b0f14',
      theme_color: '#0b0f14',
      icons: [
        { src: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
        { src: '/icon-192.png',         sizes: '192x192', type: 'image/png' },
      ],
    }));
    return;
  }

  if (url.pathname === '/apple-touch-icon.png') {
    res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' });
    res.end(ICON_180);
    return;
  }

  if (url.pathname === '/icon-192.png') {
    res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' });
    res.end(ICON_192);
    return;
  }

  // ── /api/kanban/update (POST) — move a card to a different stage ─
  if (url.pathname === '/api/kanban/update' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { id, current_stage } = JSON.parse(body);
        if (!id || typeof id !== 'string' || !current_stage || typeof current_stage !== 'string') {
          res.writeHead(400); res.end('invalid input'); return;
        }
        const raw = readKanbanState();
        const existing = Array.isArray(raw.records) ? raw.records.find(r => String(r.id) === String(id)) : null;
        upsertKanbanRecord({ ...(existing || {}), id, current_stage });
        broadcast('update');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(500); res.end(e.message);
      }
    });
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

  // ── /react/ — React dashboard (same data, no separate server) ────
  if (url.pathname === '/react') {
    res.writeHead(301, { Location: '/react/' });
    res.end();
    return;
  }
  if (url.pathname === '/react/') {
    if (!existsSync(REACT_HTML)) { res.writeHead(404); res.end('React dashboard not found'); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(readFileSync(REACT_HTML));
    return;
  }
  if (url.pathname.startsWith('/react/')) {
    const asset = url.pathname.slice(7); // strip '/react/'
    if (REACT_ASSETS.has(asset)) {
      const filePath = join(MOCK_DIR, asset);
      if (!existsSync(filePath)) { res.writeHead(404); res.end('not found'); return; }
      const ext = asset.slice(asset.lastIndexOf('.') + 1);
      res.writeHead(200, { 'Content-Type': REACT_MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(readFileSync(filePath));
      return;
    }
  }

  res.writeHead(404);
  res.end('not found');
});

server.listen(PORT, HOST, () => {
  const lanIp = Object.values(networkInterfaces()).flat().find(i => i.family === 'IPv4' && !i.internal)?.address;
  console.log(`career-ops dashboard → http://localhost:${PORT}`);
  if (lanIp) console.log(`  on your network  → http://${lanIp}:${PORT}`);
  console.log(`  watching: ${APPS_PATH}, ${PIPELINE_PATH}, ${REPORTS_DIR}`);
  startWatchers();
});
