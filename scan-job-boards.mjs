#!/usr/bin/env node

/**
 * scan-job-boards.mjs — Job Board Aggregator Scanner
 * 
 * Pulls job postings from Indeed, Adzuna, JSearch, ZipRecruiter, Glassdoor
 * and applies Career-Ops filters (title + location).
 * 
 * Zero-token, pure HTTP API calls. Aggregates across 1000+ companies.
 * 
 * Usage:
 *   node scan-job-boards.mjs                    # scan all enabled boards
 *   node scan-job-boards.mjs --dry-run          # preview without writing
 *   node scan-job-boards.mjs --board adzuna     # scan one board
 *   node scan-job-boards.mjs --board indeed --limit 10
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import yaml from 'js-yaml';
const parseYaml = yaml.load;

// Load .env without requiring the dotenv package at runtime
if (existsSync('.env')) {
  readFileSync('.env', 'utf-8').split('\n').forEach(line => {
    const eq = line.indexOf('=');
    if (eq > 0 && !line.trimStart().startsWith('#')) {
      const k = line.slice(0, eq).trim();
      const v = line.slice(eq + 1).trim();
      if (k && !(k in process.env)) process.env[k] = v;
    }
  });
}

const PORTALS_PATH = 'portals.yml';
const PROFILE_PATH = 'config/profile.yml';
const SCAN_HISTORY_PATH = 'data/scan-history.tsv';
const PIPELINE_PATH = 'data/pipeline.md';
const APPLICATIONS_PATH = 'data/applications.md';

mkdirSync('data', { recursive: true });

const CONCURRENCY = 2;
const FETCH_TIMEOUT_MS = 15_000;
const MAX_FETCH_RETRIES = 4;
const BASE_RETRY_DELAY_MS = 2_000;
const RAPIDAPI_STAGGER_MS = 2_500;
const BOARD_COOLDOWN_STATE_PATH = 'data/job-board-cooldowns.json';

// ── Load configuration ──────────────────────────────────────────────────

function loadConfig() {
  if (!existsSync(PORTALS_PATH)) {
    throw new Error('portals.yml not found');
  }
  return parseYaml(readFileSync(PORTALS_PATH, 'utf-8'));
}

function loadProfile() {
  if (!existsSync(PROFILE_PATH)) return null;
  return parseYaml(readFileSync(PROFILE_PATH, 'utf-8'));
}

// ── Fetch with timeout ──────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function loadBoardCooldowns() {
  if (!existsSync(BOARD_COOLDOWN_STATE_PATH)) return {};
  try {
    return JSON.parse(readFileSync(BOARD_COOLDOWN_STATE_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

function saveBoardCooldowns(cooldowns) {
  writeFileSync(BOARD_COOLDOWN_STATE_PATH, JSON.stringify(cooldowns, null, 2) + '\n', 'utf-8');
}

function getCooldownRemainingMs(cooldowns, boardName) {
  const until = cooldowns?.[boardName]?.until;
  if (!until) return 0;
  return Math.max(0, until - Date.now());
}

function setBoardCooldown(cooldowns, boardName, minutes, reason) {
  cooldowns[boardName] = {
    until: Date.now() + (minutes * 60 * 1000),
    reason,
    updated_at: new Date().toISOString(),
  };
}

async function fetchJson(url, headers = {}, options = {}) {
  let lastErr = null;
  const timeoutMs = Number(options.timeoutMs || FETCH_TIMEOUT_MS);

  for (let attempt = 1; attempt <= MAX_FETCH_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const method = (options.method || 'GET').toUpperCase();
      const body = options.body ? JSON.stringify(options.body) : undefined;
      const res = await fetch(url, {
        method,
        signal: controller.signal,
        headers: {
          'User-Agent': 'Career-Ops/1.0',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...headers,
        },
        body,
      });

      if (!res.ok) {
        const retryAfterHeader = res.headers.get('retry-after');
        const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : NaN;
        const message = `HTTP ${res.status}`;

        if ((res.status === 429 || res.status >= 500) && attempt < MAX_FETCH_RETRIES) {
          const delay = Number.isFinite(retryAfterMs)
            ? retryAfterMs
            : BASE_RETRY_DELAY_MS * (2 ** (attempt - 1));
          await sleep(delay);
          continue;
        }

        throw new Error(message);
      }

      return await res.json();
    } catch (err) {
      lastErr = err;
      const isAbort = err?.name === 'AbortError' || /aborted/i.test(err?.message || '');
      if ((isAbort || /429|5\d\d/.test(err?.message || '')) && attempt < MAX_FETCH_RETRIES) {
        await sleep(BASE_RETRY_DELAY_MS * (2 ** (attempt - 1)));
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastErr || new Error('fetch failed');
}

// ── Title filter ────────────────────────────────────────────────────────

function buildTitleFilter(titleFilter) {
  const positive = (titleFilter?.positive || []).map(k => k.toLowerCase());
  const negative = (titleFilter?.negative || []).map(k => k.toLowerCase());

  return (title) => {
    const lower = title.toLowerCase();
    const hasPositive = positive.length === 0 || positive.some(k => lower.includes(k));
    const hasNegative = negative.some(k => lower.includes(k));
    return hasPositive && !hasNegative;
  };
}

// ── Location filter ─────────────────────────────────────────────────────

function buildLocationFilter(profile) {
  const acceptedKeywords = [
    'remote', 'bay area', 'california', 'ca',
    'san francisco', 'sf', 'palo alto', 'mountain view',
    'sunnyvale', 'cupertino', 'menlo park', 'oakland',
    'berkeley', 'san jose', 'fremont',
  ];

  return (location) => {
    if (!location || location.trim() === '') return true;
    const lower = location.toLowerCase();
    
    if (lower.includes('uk') || lower.includes('london') ||
        lower.includes('europe') || lower.includes('eu') ||
        lower.includes('asia') || lower.includes('india') ||
        lower.includes('canada') || lower.includes('sydney') ||
        lower.includes('australia') || lower.includes('mexico') ||
        lower.includes('brazil') || lower.includes('latam')) {
      return false;
    }
    
    return acceptedKeywords.some(keyword => lower.includes(keyword));
  };
}

// ── Job board parsers ───────────────────────────────────────────────────

function parseIndeed(json) {
  const results = json.results || [];
  return results.map(job => ({
    title: job.jobtitle || '',
    company: job.company || '',
    location: job.formattedLocation || '',
    salary: job.salary || '',
    url: job.url || '',
    source: 'indeed',
    posted_date: job.date || '',
  }));
}

function parseAdzuna(json) {
  const results = json.results || [];
  return results.map(job => ({
    title: job.title || '',
    company: job.company.display_name || '',
    location: job.location.display_name || '',
    salary: job.salary_min ? `$${job.salary_min}` : '',
    url: job.redirect_url || '',
    source: 'adzuna',
    posted_date: job.created || '',
  }));
}

function parseJSearch(json) {
  const results = json.data || [];
  return results.map(job => ({
    title: job.job_title || '',
    company: job.employer_name || '',
    location: job.job_city ? `${job.job_city}, ${job.job_state}` : job.job_country || '',
    salary: job.job_salary_currency_code ? `${job.job_salary_currency_code} ${job.job_min_salary || ''}` : '',
    url: job.job_apply_link || job.job_link || '',
    source: 'jsearch',
    posted_date: job.job_posted_at_datetime || '',
  }));
}

function normalizeLocation(location, isRemote = false) {
  if (!location) return isRemote ? 'Remote' : '';
  if (typeof location === 'string') return location;
  if (Array.isArray(location)) {
    return location.filter(Boolean).join(', ');
  }
  if (typeof location === 'object') {
    const parts = [location.city, location.state, location.country].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : (isRemote ? 'Remote' : '');
  }
  return isRemote ? 'Remote' : '';
}

function parseEverJobs(json) {
  const results = json.jobs || [];
  return results.map(job => ({
    title: job.title || '',
    company: job.companyName || '',
    location: normalizeLocation(job.location, job.isRemote),
    salary: job.compensation
      ? [job.compensation.minAmount, job.compensation.maxAmount, job.compensation.currency]
          .filter(Boolean)
          .join(' ')
      : '',
    url: job.jobUrl || job.url || '',
    source: 'ever_jobs',
    posted_date: job.datePosted || '',
  }));
}

function parseZipRecruiter(json) {
  const jobs = json.jobs || [];
  return jobs.map(job => ({
    title: job.name || '',
    company: job.hiring_company.name || '',
    location: job.location || '',
    salary: job.salary_min ? `$${job.salary_min}-$${job.salary_max}` : '',
    url: job.url || '',
    source: 'ziprecruiter',
    posted_date: job.posted_time || '',
  }));
}

function parseIndeedScraper(json) {
  const jobs = json.data?.jobs || [];
  return jobs.map(job => ({
    title: job.title || '',
    company: job.company || '',
    location: job.location || '',
    salary: job.salary || '',
    url: job.job_key ? `https://www.indeed.com/viewjob?jk=${job.job_key}` : '',
    source: 'indeed_scraper',
    posted_date: '',
  }));
}

function parseLinkedinJobSearch(json) {
  const jobs = Array.isArray(json) ? json : (json.jobs || json.data || []);
  return jobs.map(job => {
    const locs = job.locations_derived || [];
    const location = locs.length ? locs[0] : (job.location_type === 'REMOTE' ? 'Remote' : '');
    return {
      title: job.title || '',
      company: job.organization || '',
      location,
      salary: '',
      url: job.url || '',
      source: 'linkedin_job_search',
      posted_date: job.date_posted || '',
    };
  });
}

// ── Dedup logic ─────────────────────────────────────────────────────────

function loadSeenUrls() {
  const seen = new Set();
  if (existsSync(SCAN_HISTORY_PATH)) {
    const lines = readFileSync(SCAN_HISTORY_PATH, 'utf-8').split('\n');
    for (const line of lines.slice(1)) {
      const url = line.split('\t')[0];
      if (url) seen.add(url);
    }
  }
  if (existsSync(PIPELINE_PATH)) {
    const text = readFileSync(PIPELINE_PATH, 'utf-8');
    for (const match of text.matchAll(/- \[[ x]\] (https?:\/\/\S+)/g)) {
      seen.add(match[1]);
    }
  }
  if (existsSync(APPLICATIONS_PATH)) {
    const text = readFileSync(APPLICATIONS_PATH, 'utf-8');
    for (const match of text.matchAll(/https?:\/\/[^\s|)]+/g)) {
      seen.add(match[0]);
    }
  }
  return seen;
}

// ── Pipeline writer ─────────────────────────────────────────────────────

function appendToPipeline(offers) {
  if (offers.length === 0) return;
  
  let text = readFileSync(PIPELINE_PATH, 'utf-8');
  const marker = '## Job Boards';
  const idx = text.indexOf(marker);
  
  if (idx === -1) {
    // Add new section after Pendientes
    const pendIdx = text.indexOf('## Pendientes');
    const insertAt = pendIdx === -1 ? text.length : text.indexOf('\n## ', pendIdx);
    const block = `\n## Job Boards\n\nAutomatic scans from Indeed, Adzuna, ZipRecruiter, Glassdoor, JSearch.\n\n` + 
      offers.map(o => `- [ ] ${o.url} | ${o.company} | ${o.title} | ${o.location}`).join('\n') + '\n\n';
    text = text.slice(0, insertAt) + block + text.slice(insertAt);
  } else {
    const afterMarker = idx + marker.length;
    const nextSection = text.indexOf('\n## ', afterMarker);
    const insertAt = nextSection === -1 ? text.length : nextSection;
    const block = '\n' + offers.map(o => `- [ ] ${o.url} | ${o.company} | ${o.title} | ${o.location}`).join('\n') + '\n';
    text = text.slice(0, insertAt) + block + text.slice(insertAt);
  }
  
  writeFileSync(PIPELINE_PATH, text, 'utf-8');
}

function appendToScanHistory(offers, date) {
  if (!existsSync(SCAN_HISTORY_PATH)) {
    writeFileSync(SCAN_HISTORY_PATH, 'url\tfirst_seen\tportal\ttitle\tcompany\tstatus\n', 'utf-8');
  }
  const lines = offers.map(o =>
    `${o.url}\t${date}\tjob-board-${o.source}\t${o.title}\t${o.company}\tadded`
  ).join('\n') + '\n';
  appendFileSync(SCAN_HISTORY_PATH, lines, 'utf-8');
}

// ── Parallel fetch ──────────────────────────────────────────────────────

async function parallelFetch(tasks, limit) {
  const results = [];
  let i = 0;
  
  async function next() {
    while (i < tasks.length) {
      const task = tasks[i++];
      results.push(await task());
    }
  }
  
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => next());
  await Promise.all(workers);
  return results;
}

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const boardFlag = args.indexOf('--board');
  const filterBoard = boardFlag !== -1 ? args[boardFlag + 1]?.toLowerCase() : null;
  
  const config = loadConfig();
  const profile = loadProfile();
  const titleFilter = buildTitleFilter(config.title_filter);
  const locationFilter = buildLocationFilter(profile);
  
  const jobBoardConfig = config.job_board_integrations || {};
  const boards = Object.entries(jobBoardConfig)
    .filter(([key]) => key !== 'enabled')
    .filter(([key]) => !filterBoard || key.toLowerCase().includes(filterBoard))
    .filter(([key, cfg]) => cfg.enabled !== false);
  
  if (boards.length === 0) {
    console.log('No job boards enabled or matched filter.');
    return;
  }
  
  console.log(`Scanning ${boards.length} job boards (${filterBoard ? 'filtered' : 'all'})...`);
  if (dryRun) console.log('(dry run — no files will be written)\n');
  
  const seenUrls = loadSeenUrls();
  const date = new Date().toISOString().slice(0, 10);
  const boardCooldowns = loadBoardCooldowns();
  
  let totalFound = 0;
  let totalFiltered = 0;
  let totalLocationBlocked = 0;
  let totalDupes = 0;
  const newOffers = [];
  const errors = [];
  
  const parsers = { indeed: parseIndeed, adzuna: parseAdzuna, jsearch: parseJSearch, ziprecruiter: parseJSearch, glassdoor: parseJSearch, ever_jobs: parseEverJobs, indeed_scraper: parseIndeedScraper, linkedin_job_search: parseLinkedinJobSearch };
  
  const tasks = boards.map(([boardName, boardConfig], boardIndex) => async () => {
    try {
      const cooldownRemainingMs = getCooldownRemainingMs(boardCooldowns, boardName);
      if (cooldownRemainingMs > 0) {
        const minutes = Math.ceil(cooldownRemainingMs / 60000);
        errors.push({ board: boardName, error: `cooldown active (${minutes}m remaining) — skipped` });
        return;
      }

      const apiEndpoint = boardConfig.api_endpoint;
      if (!apiEndpoint) return; // websearch-only board, no API to call
      const extraHeaders = {};
      const params = new URLSearchParams(boardConfig.search_params || {});
      const requestMethod = (boardConfig.method || 'GET').toUpperCase();
      const requestBody = boardConfig.request_body || boardConfig.body || null;
      const endpointHost = new URL(apiEndpoint).hostname;
      const isRapidApi = endpointHost.endsWith('.p.rapidapi.com');
      if (boardConfig.api_id_env) {
        const id = process.env[boardConfig.api_id_env];
        if (id) params.set('app_id', id);
      }
      if (boardConfig.api_key_env) {
        const key = process.env[boardConfig.api_key_env];
        if (!key) {
          errors.push({ board: boardName, error: `missing env var ${boardConfig.api_key_env} — skipped` });
          return;
        }
        // RapidAPI boards (jsearch) use header auth; Adzuna uses query param
        if (isRapidApi) {
          extraHeaders['X-RapidAPI-Key'] = key;
          extraHeaders['X-RapidAPI-Host'] = endpointHost;
        } else {
          params.set('app_key', key);
        }
      }
      const url = requestMethod === 'GET' && params.toString()
        ? `${apiEndpoint}?${params.toString()}`
        : apiEndpoint;

      if (isRapidApi) {
        const boardDelay = Number(boardConfig.stagger_ms || 0);
        await sleep((boardIndex * RAPIDAPI_STAGGER_MS) + boardDelay);
      }

      const json = await fetchJson(url, extraHeaders, {
        method: requestMethod,
        body: requestBody,
        timeoutMs: boardConfig.timeout_ms,
      });
      const parser = parsers[boardName] || parseAdzuna;
      const jobs = parser(json);
      totalFound += jobs.length;
      
      for (const job of jobs) {
        if (!titleFilter(job.title)) {
          totalFiltered++;
          continue;
        }
        if (!locationFilter(job.location)) {
          totalLocationBlocked++;
          continue;
        }
        if (!job.url || seenUrls.has(job.url)) {
          totalDupes++;
          continue;
        }
        
        seenUrls.add(job.url);
        newOffers.push({ ...job, source: boardName });
      }
    } catch (err) {
      const message = err.message;
      if (/HTTP 429/.test(message)) {
        const cooldownMinutes = Number(boardConfig.cooldown_minutes || 60);
        setBoardCooldown(boardCooldowns, boardName, cooldownMinutes, message);
      }
      errors.push({ board: boardName, error: message });
    }
  });
  
  await parallelFetch(tasks, CONCURRENCY);
  
  if (!dryRun && newOffers.length > 0) {
    appendToPipeline(newOffers);
    appendToScanHistory(newOffers, date);
  }
  saveBoardCooldowns(boardCooldowns);
  
  console.log(`\n${'━'.repeat(50)}`);
  console.log(`Job Board Scan — ${date}`);
  console.log(`${'━'.repeat(50)}`);
  console.log(`Boards scanned:        ${boards.length}`);
  console.log(`Total jobs found:      ${totalFound}`);
  console.log(`Filtered by title:     ${totalFiltered} removed`);
  console.log(`Blocked by location:   ${totalLocationBlocked} removed`);
  console.log(`Duplicates:            ${totalDupes} skipped`);
  console.log(`New offers added:      ${newOffers.length}`);
  
  if (errors.length > 0) {
    console.log(`\nErrors (${errors.length}):`);
    for (const e of errors) {
      console.log(`  ✗ ${e.board}: ${e.error}`);
    }
  }
  
  if (newOffers.length > 0) {
    console.log('\nNew offers (top 5):');
    for (const o of newOffers.slice(0, 5)) {
      console.log(`  + ${o.company} | ${o.title} | ${o.location}`);
    }
    if (newOffers.length > 5) {
      console.log(`  ... and ${newOffers.length - 5} more`);
    }
    if (dryRun) {
      console.log('\n(dry run — run without --dry-run to save results)');
    } else {
      console.log(`\nResults saved to ${PIPELINE_PATH}`);
    }
  }
  
  console.log(`\n→ Run /career-ops pipeline to evaluate new offers.`);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
