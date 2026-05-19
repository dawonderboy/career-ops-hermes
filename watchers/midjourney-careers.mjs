#!/usr/bin/env node
// watchers/midjourney-careers.mjs
//
// Polls midjourney.com/careers, diffs against the last snapshot, and pushes
// an ntfy notification only when NEW roles appear. Highlights IT-matching
// roles with higher priority and a bell emoji.
//
// Usage (run from career-ops project root):
//   node watchers/midjourney-careers.mjs
//
// State: data/midjourney-seen.json (auto-created)
// Log:   logs/midjourney-watch.log
// Ntfy:  topic from $NTFY_TOPIC or default "career-ops-demo-topic"

import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const STATE_FILE = resolve(ROOT, 'data/midjourney-seen.json');
const LOG_FILE   = resolve(ROOT, 'logs/midjourney-watch.log');
const URL = 'https://www.midjourney.com/careers';
const NTFY_TOPIC = process.env.NTFY_TOPIC || 'career-ops-demo-topic';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';
const IT_REGEX = /\b(it\b|it support|it operations|it ops|helpdesk|workplace|sysadmin|systems admin|internal tools|people ops|office ops)\b/i;

const SECTION_MARKERS = [
  { name: 'Research',       re: /🧪\s*Research/ },
  { name: 'Frontend',       re: /💻\s*Frontend/ },
  { name: 'Infrastructure', re: /⚡\s*Infrastructure/ },
  { name: 'Hardware',       re: /🔬\s*Hardware/ },
  { name: 'Other',          re: /🛠️?\s*(Operations|IT|Workplace|Internal)/i },
];
const END_MARKER = /\b(FAQ|Contact Us)\b/;

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try {
    mkdirSync(dirname(LOG_FILE), { recursive: true });
    appendFileSync(LOG_FILE, line);
  } catch {}
  process.stdout.write(line);
}

async function fetchPageText() {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      viewport: { width: 1440, height: 900 },
    });
    const page = await ctx.newPage();
    await page.goto(URL, { waitUntil: 'load', timeout: 45000 });
    await page.waitForTimeout(3000);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(2000);
    return await page.evaluate(() => document.body.innerText);
  } finally {
    await browser.close();
  }
}

function parseRoles(text) {
  const lines = text.split('\n');
  // Locate each section marker
  const marks = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    for (const m of SECTION_MARKERS) {
      if (m.re.test(line)) { marks.push({ name: m.name, startIdx: i }); break; }
    }
    if (END_MARKER.test(line) && marks.length > 0 && !marks[marks.length - 1].endIdx) {
      marks[marks.length - 1].endIdx = i;
    }
  }
  // Fill end indices
  for (let i = 0; i < marks.length; i++) {
    if (!marks[i].endIdx) {
      marks[i].endIdx = i + 1 < marks.length ? marks[i + 1].startIdx : lines.length;
    }
  }

  const roles = [];
  for (const mark of marks) {
    const body = lines.slice(mark.startIdx + 1, mark.endIdx);
    for (let i = 0; i < body.length; i++) {
      const line = body[i].trim();
      if (!line) continue;
      // Role title heuristic: short non-period line immediately followed by
      // a description paragraph (long line after blanks).
      if (line.length > 0 && line.length < 80 && !line.endsWith('.')) {
        let j = i + 1;
        while (j < body.length && !body[j].trim()) j++;
        if (j < body.length && body[j].trim().length > 60) {
          roles.push({ section: mark.name, title: line });
        }
      }
    }
  }
  return roles;
}

function loadSeen() {
  if (!existsSync(STATE_FILE)) return [];
  try { return JSON.parse(readFileSync(STATE_FILE, 'utf-8')); } catch { return []; }
}

function saveSeen(roles) {
  mkdirSync(dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(roles, null, 2));
}

async function notify({ title, body, priority = 'default', tags = 'art' }) {
  try {
    const res = await fetch(`https://ntfy.sh/${NTFY_TOPIC}`, {
      method: 'POST',
      headers: { 'Title': title, 'Priority': priority, 'Tags': tags },
      body,
    });
    if (!res.ok) log(`WARN ntfy status ${res.status}`);
  } catch (e) {
    log(`WARN ntfy failed: ${e.message}`);
  }

  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    log('WARN Telegram skipped: missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID');
    return;
  }
  try {
    const form = new URLSearchParams();
    form.set('chat_id', TELEGRAM_CHAT_ID);
    form.set('text', `${title}\n\n${body}`);
    form.set('disable_web_page_preview', 'true');
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      body: form,
    });
    if (!res.ok) log(`WARN Telegram status ${res.status}`);
  } catch (e) {
    log(`WARN Telegram failed: ${e.message}`);
  }
}

async function main() {
  let roles;
  try {
    const text = await fetchPageText();
    roles = parseRoles(text);
  } catch (e) {
    log(`ERROR fetch/parse: ${e.message}`);
    process.exit(1);
  }

  log(`parsed ${roles.length} roles: ${roles.map(r => `${r.section}/${r.title}`).join(' · ')}`);

  const seen = loadSeen();
  const seenKey = (r) => `${r.section}::${r.title}`;
  const seenSet = new Set(seen.map(seenKey));
  const newRoles = roles.filter(r => !seenSet.has(seenKey(r)));

  if (newRoles.length === 0) {
    log('no new roles');
  } else {
    const itMatches = newRoles.filter(r => IT_REGEX.test(r.title));
    const priority = itMatches.length > 0 ? 'high' : 'default';
    const tags = itMatches.length > 0 ? 'bell,art' : 'art';
    const header = itMatches.length > 0
      ? `Midjourney: IT-match ${newRoles.length} new role(s)`
      : `Midjourney: ${newRoles.length} new role(s)`;
    const body = newRoles.map(r => `- [${r.section}] ${r.title}`).join('\n')
      + `\n\n${URL}`;
    log(`PUSH: ${header}`);
    await notify({ title: header, body, priority, tags });
  }

  saveSeen(roles);
}

main();
