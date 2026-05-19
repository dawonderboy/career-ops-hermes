import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

export function daysBetween(a, b) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

function normalizePostingDate(value) {
  if (!value) return null;
  const isoMatch = String(value).match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (isoMatch) return isoMatch[1];

  const parsed = Date.parse(String(value));
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10);
}

export function parsePostingDateFromReport(reportText) {
  const text = String(reportText || '');
  if (!text) return null;

  const patterns = [
    /\|\s*Posting (?:age|date)\s*\|\s*([^|]+?)\s*\|/i,
    /(?:^|\n)\s*[-*]\s*\*{0,2}Posted(?:\s+date)?:\*{0,2}\s*([^\n(]+?)(?:\s*\(|\s*$)/i,
    /\*{1,2}Posted(?:\s+date)?:\*{0,2}\s*([^\n(]+?)(?:\s*\(|\s*$)/i,
    /posted\s+(?:on\s+)?((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})/i,
    /\bposted\s+([\d]{4}-[\d]{2}-[\d]{2})\b/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const normalized = normalizePostingDate(match[1].trim());
    if (!normalized) continue;
    return { display: normalized, sortKey: normalized };
  }

  return null;
}

export function parseInterviewMeta(notes) {
  const text = String(notes || '');
  if (!text) {
    return {
      interviewType: null,
      interviewDate: null,
      interviewTime: null,
      interviewer: null,
      meetingLink: null,
      stage: null,
      stageKey: null,
    };
  }

  const stagePattern = '(Hiring Manager Interview|Hiring Manager|HM Interview|HM interview|HM|Recruiter screen|Phone Screen|Fit Call|Technical Screen|Technical Interview|Intro Chat|Zoom|Interview)';
  // Match stage keyword, optionally followed by parenthetical details, then a date
  // Handles: "HM Interview: 2026-05-07", "Interview (Hiring Manager): 2026-05-07", etc.
  const stageRegex = new RegExp(`${stagePattern}\\s*(?:\\(([^)]*)\\))?\\s*:?\\s*(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\\s+)?(\\d{4}-\\d{2}-\\d{2})(?:\\s+(\\d{1,2}(?::\\d{2})?\\s*(?:am|pm|AM|PM)?)\\s*([A-Z]{2,4})?)?`, 'ig');
  const stageRank = {
    'Hiring Manager Interview': 55,
    'Hiring Manager': 55,
    'HM Interview': 55,
    'HM interview': 55,
    'HM': 55,
    'Fit Call': 50,
    'Phone Screen': 45,
    'Recruiter screen': 40,
    'Technical Screen': 45,
    'Technical Interview': 45,
    'Intro Chat': 40,
    Zoom: 35,
    Interview: 30,  // Generic fallback — lowest priority
  };

  const stageKeyForStage = (stage) => {
    const normalized = String(stage || '').toLowerCase().trim();
    if (!normalized) return null;
    if (['hiring manager interview', 'hiring manager', 'hm interview', 'hm'].includes(normalized)) return 'hm';
    if (['technical screen', 'technical interview', 'zoom'].includes(normalized)) return 'tech';
    if (['recruiter screen', 'phone screen', 'intro chat'].includes(normalized)) return 'recruiter';
    if (normalized === 'fit call') return 'fit';
    return normalized === 'interview' ? 'other' : 'other';
  };

  const cleanInterviewer = (value) => {
    const raw = String(value || '').replace(/^[:\s-]+/, '').trim();
    if (!raw) return null;
    const [head] = raw.split(/\s+(?:Meet|Meeting|Phone|Prep(?:\s+call)?|Interview\s+prep|Recruiter\s+screen|Coordinator|Organizer|Confirmed|Key\s+feedback|Advanced\s+to|Strong\s+positive\s+feedback|Applied|Responded)\b/i);
    const cleaned = String(head || '').replace(/^[,:;\s]+|[,:;\s]+$/g, '').trim();
    if (!cleaned || cleaned === '—' || cleaned === '-') return null;
    return cleaned;
  };

  const matches = Array.from(text.matchAll(stageRegex)).map(match => {
    let stage = match[1];
    let type = match[2] || null;
    // If the captured type is actually a known stage (e.g., "Hiring Manager" from "Interview (Hiring Manager)"),
    // promote it to be the primary stage (case-insensitive to handle "Recruiter Screen" vs "Recruiter screen")
    if (type && Object.keys(stageRank).some(k => k.toLowerCase() === type.toLowerCase())) {
      stage = type;
      type = null;
    }
    return {
      stage,
      stageKey: stageKeyForStage(stage),
      type,
      date: match[3],
      rawTime: match[4] || null,
      rawTz: match[5] || null,
      index: match.index ?? -1,
    };
  });
  matches.sort((a, b) => {
    const dateCmp = String(b.date).localeCompare(String(a.date));
    if (dateCmp) return dateCmp;
    const typedCmp = Number(Boolean(b.type)) - Number(Boolean(a.type));
    if (typedCmp) return typedCmp;
    return (stageRank[b.stage] || 0) - (stageRank[a.stage] || 0);
  });
  const best = matches[0] || null;

  const interviewType = best ? (best.type || null) : null;
  const interviewDate = best ? best.date : null;
  const rawTime = best ? best.rawTime : null;
  const rawTz = best ? best.rawTz : null;
  const interviewTime = rawTime ? `${rawTime}${rawTz ? ` ${rawTz}` : ''}`.trim() : null;

  const explicitInterviewerMatch = text.match(/\bInterviewers?:\s*([^.;\n]+)/i);
  let interviewer = cleanInterviewer(explicitInterviewerMatch ? explicitInterviewerMatch[1] : null);
  if (!interviewer && best && best.index >= 0 && best.stageKey && best.stageKey !== 'other') {
    const windowText = text.slice(best.index, best.index + 240);
    const contextualMatch = windowText.match(/\b(?:w\/|with)\s+([^.;\n]+)/i);
    interviewer = cleanInterviewer(contextualMatch ? contextualMatch[1] : null);
  }

  const meetingLinkMatch = text.match(/\b((?:https?:\/\/)?meet\.google\.com\/[a-z-]+)\b/i)
    || text.match(/\b(https?:\/\/\S+zoom\.us\/\S+)\b/i)
    || text.match(/\b(https?:\/\/\S+)\b/i);
  let meetingLink = meetingLinkMatch ? meetingLinkMatch[1].replace(/[).,;]+$/, '') : null;
  if (meetingLink && !/^https?:\/\//i.test(meetingLink)) meetingLink = `https://${meetingLink}`;

  return {
    interviewType,
    interviewDate,
    interviewTime,
    interviewer,
    meetingLink,
    stage: best ? best.stage : null,
    stageKey: best ? best.stageKey : null,
  };
}

export function classifyInterviewStage(stageText) {
  if (!stageText) return null;
  
  const stage = String(stageText).toLowerCase().trim();
  const stageMap = {
    'recruiter screen': { emoji: '📞', label: 'Recruiter Screen', order: 1 },
    'intro chat': { emoji: '💬', label: 'Intro Chat', order: 1 },
    'phone screen': { emoji: '📱', label: 'Phone Screen', order: 1 },
    'technical screen': { emoji: '🎥', label: 'Technical Screen', order: 2 },
    'technical interview': { emoji: '💻', label: 'Technical Interview', order: 2 },
    'hiring manager interview': { emoji: '👔', label: 'Hiring Manager', order: 3 },
    'hiring manager': { emoji: '👔', label: 'Hiring Manager', order: 3 },
    'hm interview': { emoji: '👔', label: 'Hiring Manager', order: 3 },
    'hm': { emoji: '👔', label: 'Hiring Manager', order: 3 },
    'fit call': { emoji: '🤝', label: 'Fit Call', order: 4 },
    'interview': { emoji: '📝', label: 'Interview', order: 2 },
    'zoom': { emoji: '🎥', label: 'Video Interview', order: 2 },
  };
  
  const match = stageMap[stage];
  return match ? { emoji: match.emoji, label: match.label, order: match.order } : null;
}

export function classifyPriority(app) {
  const status = (app.status || '').toLowerCase();
  const score = app.score ?? 0;
  const notes = (app.notes || '').toLowerCase();

  if (status === 'offer') return { level: 5, key: 'offer', label: 'Offer', reason: 'Offer in progress' };
  if (status === 'interview') return { level: 5, key: 'interview', label: 'Interview', reason: 'Interview prep takes priority' };
  if (status === 'applied' || status === 'responded') return { level: 3, key: 'active', label: 'Active', reason: 'Application already in progress' };
  if (status === 'rejected' || status === 'discarded' || status === 'skip') return { level: 0, key: 'skip', label: 'Skip', reason: 'Not actionable' };

  if (score >= 4.0 && app.pdf) return { level: 4, key: 'apply_now', label: 'Apply Now', reason: 'High score and PDF ready' };
  if (score >= 4.0) return { level: 4, key: 'strong', label: 'Strong', reason: 'High score role worth applying' };
  if (score >= 3.5) return { level: 2, key: 'backup', label: 'Backup', reason: 'Adjacent or backup role' };
  if (/stretch|pivot|optional/.test(notes)) return { level: 1, key: 'stretch', label: 'Stretch', reason: 'Possible stretch or pivot role' };
  return { level: 0, key: 'skip', label: 'Skip', reason: 'Low fit' };
}

export function summarizeReadiness(app) {
  const report = Boolean(app.report);
  const pdf = Boolean(app.pdf);
  let applyPack = 'needs_work';
  if ((app.status || '').toLowerCase() === 'applied') applyPack = 'submitted';
  else if (report && pdf && (app.score ?? 0) >= 4.0) applyPack = 'ready';
  else if (report || pdf) applyPack = 'partial';
  return {
    report,
    pdf,
    coverLetter: false,
    applyPack,
  };
}

export function buildActionQueue(apps, today = new Date().toISOString().slice(0, 10)) {
  const actions = [];
  for (const app of apps) {
    const status = (app.status || '').toLowerCase();
    const priority = classifyPriority(app);
    if (status === 'interview' && app.interviewDate && app.interviewDate >= today) {
      actions.push({
        kind: 'interview_prep',
        rank: 100,
        company: app.company,
        role: app.role,
        url: app.url || null,
        label: 'Prep for interview',
        due: app.interviewDate,
        detail: app.interviewTime ? `${app.interviewDate} · ${app.interviewTime}` : app.interviewDate,
      });
      continue;
    }
    if (status === 'applied' && app.date && daysBetween(app.date, today) >= 7) {
      actions.push({
        kind: 'follow_up',
        rank: 90,
        company: app.company,
        role: app.role,
        url: app.url || null,
        label: 'Follow up today',
        due: today,
        detail: `${daysBetween(app.date, today)} days since applied`,
      });
      continue;
    }
    if (status === 'evaluated' && priority.key === 'apply_now') {
      actions.push({
        kind: 'apply_now',
        rank: 80,
        company: app.company,
        role: app.role,
        url: app.url || null,
        label: 'Apply now',
        due: today,
        detail: priority.reason,
      });
      continue;
    }
    if (status === 'evaluated' && priority.key === 'strong') {
      actions.push({
        kind: 'decide',
        rank: 70,
        company: app.company,
        role: app.role,
        url: app.url || null,
        label: 'Decide: apply or skip',
        due: today,
        detail: priority.reason,
      });
    }
  }
  return actions.sort((a, b) => b.rank - a.rank || String(a.company).localeCompare(String(b.company)));
}

export function buildCalGrid(today, earlyDate = null) {
  const parts = today.split('-').map(Number);
  const t0 = new Date(parts[0], parts[1] - 1, parts[2]);
  const dow = (t0.getDay() + 6) % 7;
  const thisMonday = new Date(t0);
  thisMonday.setDate(t0.getDate() - dow);

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

  const endDate = new Date(thisMonday);
  endDate.setDate(thisMonday.getDate() + 13);

  const ymd = d => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  const out = [];
  const cur = new Date(startMonday);
  while (cur <= endDate) { out.push(ymd(new Date(cur))); cur.setDate(cur.getDate() + 1); }
  return out;
}

// ── Kanban pipeline (data/kanban-pipeline.json) ──────────────────────
// Detailed stage-aware layer that sits on top of applications.md.
// Returns a normalized payload safe to attach to /api/state.

export const KANBAN_DEFAULT_STAGES = [
  'Target / Research',
  'Applied / Awaiting Response',
  'Recruiter Outreach',
  'Recruiter Screen Scheduled',
  'Recruiter Screen Completed',
  'Hiring Manager Screen Scheduled',
  'Hiring Manager Screen Completed',
  'Technical / Functional Screen Scheduled',
  'Technical / Functional Screen Completed',
  'Panel / Virtual Onsite Scheduled',
  'Panel / Virtual Onsite In Progress',
  'Panel / Virtual Onsite Completed',
  'In-Person Onsite Scheduled',
  'In-Person Onsite Completed',
  'Final Leadership / Executive Round',
  'References / Background Check',
  'Offer / Negotiation',
  'Accepted',
  'Rejected',
  'Withdrawn / Paused',
];

const KANBAN_STAGE_ALIASES = new Map([
  ['target', 'Target / Research'],
  ['research', 'Target / Research'],
  ['applied', 'Applied / Awaiting Response'],
  ['awaiting response', 'Applied / Awaiting Response'],
  ['recruiter outreach', 'Recruiter Outreach'],
  ['recruiter screen', 'Recruiter Screen Scheduled'],
  ['phone screen', 'Recruiter Screen Scheduled'],
  ['hiring manager screen', 'Hiring Manager Screen Scheduled'],
  ['hiring manager interview', 'Hiring Manager Screen Scheduled'],
  ['hiring manager', 'Hiring Manager Screen Scheduled'],
  ['hm interview', 'Hiring Manager Screen Scheduled'],
  ['hm', 'Hiring Manager Screen Scheduled'],
  ['technical screen', 'Technical / Functional Screen Scheduled'],
  ['technical interview', 'Technical / Functional Screen Scheduled'],
  ['technical', 'Technical / Functional Screen Scheduled'],
  ['functional', 'Technical / Functional Screen Scheduled'],
  ['panel', 'Panel / Virtual Onsite Scheduled'],
  ['loop', 'Panel / Virtual Onsite Scheduled'],
  ['virtual onsite', 'Panel / Virtual Onsite Scheduled'],
  ['onsite', 'In-Person Onsite Scheduled'],
  ['final', 'Final Leadership / Executive Round'],
  ['executive', 'Final Leadership / Executive Round'],
  ['leadership', 'Final Leadership / Executive Round'],
  ['offer', 'Offer / Negotiation'],
  ['negotiation', 'Offer / Negotiation'],
  ['accepted', 'Accepted'],
  ['rejected', 'Rejected'],
  ['archived', 'Rejected'],
  ['withdrawn', 'Withdrawn / Paused'],
  ['paused', 'Withdrawn / Paused'],
]);

const KANBAN_STATUS_ALIASES = new Map([
  ['active', 'active'],
  ['open', 'active'],
  ['in progress', 'active'],
  ['paused-historical', 'paused-historical'],
  ['paused historical', 'paused-historical'],
  ['withdrawn / paused', 'paused-historical'],
  ['withdrawn', 'paused-historical'],
  ['paused', 'paused-historical'],
  ['closed', 'closed'],
  ['rejected', 'closed'],
  ['archived', 'closed'],
  ['accepted', 'closed'],
]);

const HISTORICAL_STAGES = new Set(['Rejected', 'Withdrawn / Paused', 'Accepted']);

function trimText(value) {
  const text = value == null ? '' : String(value).trim();
  return text || null;
}

function normalizeKey(value) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function sanitizeKanbanStages(stages) {
  const source = Array.isArray(stages) && stages.length ? stages : KANBAN_DEFAULT_STAGES;
  const out = [];
  const seen = new Set();
  for (const stage of source) {
    const text = trimText(stage);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  for (const stage of KANBAN_DEFAULT_STAGES) {
    if (seen.has(stage)) continue;
    seen.add(stage);
    out.push(stage);
  }
  return out;
}

export function normalizeKanbanStatus(value) {
  const key = normalizeKey(value);
  if (!key) return 'active';
  return KANBAN_STATUS_ALIASES.get(key) || 'active';
}

export function normalizeKanbanStage(value, stages = KANBAN_DEFAULT_STAGES, status = null) {
  const stageList = sanitizeKanbanStages(stages);
  const raw = trimText(value);
  if (!raw) {
    const normalizedStatus = normalizeKanbanStatus(status);
    if (normalizedStatus === 'closed') return 'Rejected';
    if (normalizedStatus === 'paused-historical') return 'Withdrawn / Paused';
    return stageList[0] || KANBAN_DEFAULT_STAGES[0];
  }

  if (stageList.includes(raw)) return raw;

  const alias = KANBAN_STAGE_ALIASES.get(normalizeKey(raw));
  if (alias && stageList.includes(alias)) return alias;

  const normalizedStatus = normalizeKanbanStatus(status);
  if (normalizedStatus === 'closed') return 'Rejected';
  if (normalizedStatus === 'paused-historical') return 'Withdrawn / Paused';

  return raw;
}

function readJsonFileWithBackup(filePath) {
  if (!existsSync(filePath)) return null;
  const tryParse = candidate => {
    try { return JSON.parse(readFileSync(candidate, 'utf-8')); }
    catch { return null; }
  };
  const primary = tryParse(filePath);
  if (primary && typeof primary === 'object') return primary;
  const backup = tryParse(`${filePath}.bak`);
  if (backup && typeof backup === 'object') return backup;
  return null;
}

export function loadKanbanRaw(filePath) {
  return readJsonFileWithBackup(filePath);
}

export function defaultKanbanState() {
  const now = new Date().toISOString();
  return {
    schema_version: 1,
    created_at: now,
    updated_at: now,
    stages: sanitizeKanbanStages(),
    records: [],
  };
}

export function readKanbanState(filePath) {
  const raw = loadKanbanRaw(filePath);
  return raw && typeof raw === 'object' ? raw : defaultKanbanState();
}

export function writeKanbanState(filePath, raw) {
  const next = {
    ...defaultKanbanState(),
    ...(raw && typeof raw === 'object' ? raw : {}),
    updated_at: new Date().toISOString(),
  };
  next.stages = sanitizeKanbanStages(next.stages);
  if (!Array.isArray(next.records)) next.records = [];

  const dir = dirname(filePath);
  const base = basename(filePath);
  const tmpPath = join(dir, `.${base}.${process.pid}.${Date.now()}.tmp`);
  mkdirSync(dir, { recursive: true });
  if (existsSync(filePath)) {
    try { copyFileSync(filePath, `${filePath}.bak`); } catch {}
  }
  try {
    writeFileSync(tmpPath, `${JSON.stringify(next, null, 2)}\n`, 'utf-8');
    renameSync(tmpPath, filePath);
  } catch (err) {
    try { if (existsSync(tmpPath)) unlinkSync(tmpPath); } catch {}
    throw err;
  }
  return next;
}

function normalizeKanbanPatch(input = {}) {
  const patch = { ...input };
  if (patch.title && !patch.role) patch.role = patch.title;
  if (patch.application_url && !patch.url) patch.url = patch.application_url;
  if (patch.applicationLink && !patch.url) patch.url = patch.applicationLink;
  if (patch.link && !patch.url) patch.url = patch.link;
  if (patch.deadline && !patch.follow_up_due_date) patch.follow_up_due_date = patch.deadline;
  if (patch.due_date && !patch.follow_up_due_date) patch.follow_up_due_date = patch.due_date;
  if (patch.stage && !patch.current_stage) patch.current_stage = patch.stage;
  if (patch.stage_status && !patch.status) patch.status = patch.stage_status;
  if (patch.stageState && !patch.status) patch.status = patch.stageState;
  return patch;
}

function inferKanbanStatusFromStage(stage, fallbackStatus = null) {
  if (stage === 'Withdrawn / Paused') return 'paused-historical';
  if (HISTORICAL_STAGES.has(stage)) return 'closed';
  return 'active';
}

function slugifyKanbanId(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function resolveKanbanId(patch, company, role, records) {
  const baseId = patch.id ? String(patch.id) : slugifyKanbanId(`${company}-${role}`) || `kanban-${Date.now()}`;
  if (patch.id) return baseId;
  let id = baseId;
  let suffix = 2;
  while (records.some(r => String(r.id) === id)) id = `${baseId}-${suffix++}`;
  return id;
}

function mergeKanbanRecord(existing, patch, { id, company, role, stages, now }) {
  const currentStage = normalizeKanbanStage(
    patch.current_stage ?? existing?.current_stage ?? patch.status ?? existing?.status,
    stages,
    patch.status ?? existing?.status,
  );
  const status = patch.status !== undefined
    ? normalizeKanbanStatus(patch.status)
    : patch.current_stage !== undefined
      ? inferKanbanStatusFromStage(currentStage, existing?.status)
      : normalizeKanbanStatus(existing?.status);
  const merged = {
    ...(existing || {}),
    ...patch,
    id,
    company,
    role,
    current_stage: currentStage,
    status,
    notes: patch.notes !== undefined ? patch.notes : (existing?.notes ?? null),
    url: patch.url !== undefined ? patch.url : (existing?.url ?? existing?.application_url ?? existing?.link ?? null),
    next_action: patch.next_action !== undefined ? patch.next_action : (existing?.next_action ?? null),
    follow_up_due_date: patch.follow_up_due_date !== undefined ? patch.follow_up_due_date : (existing?.follow_up_due_date ?? null),
    interview_date_time: patch.interview_date_time !== undefined ? patch.interview_date_time : (existing?.interview_date_time ?? null),
    updated_at: now,
  };
  if (!merged.created_at) merged.created_at = existing?.created_at || now;
  if (patch.board_scope !== undefined) merged.board_scope = patch.board_scope;
  if (!Array.isArray(merged.board_scope) || !merged.board_scope.length) merged.board_scope = ['regular', 'react'];
  if (patch.people_involved !== undefined) merged.people_involved = patch.people_involved;
  if (patch.prep_focus !== undefined) merged.prep_focus = patch.prep_focus;
  if (patch.risk_flags !== undefined) merged.risk_flags = patch.risk_flags;
  if (patch.tracker_refs !== undefined) merged.tracker_refs = patch.tracker_refs;
  if (patch.priority !== undefined) merged.priority = patch.priority;
  if (patch.recommended_new_stage !== undefined) merged.recommended_new_stage = patch.recommended_new_stage;
  if (patch.interview_subtype !== undefined) merged.interview_subtype = patch.interview_subtype;
  if (patch.win_condition_next_interview !== undefined) merged.win_condition_next_interview = patch.win_condition_next_interview;
  if (patch.regular_board_status !== undefined) merged.regular_board_status = patch.regular_board_status;
  if (patch.last_confirmed_by !== undefined) merged.last_confirmed_by = patch.last_confirmed_by;
  return merged;
}

export function validateKanbanPayload(input = {}, existing = null, stages = KANBAN_DEFAULT_STAGES) {
  const patch = normalizeKanbanPatch(input);
  const company = trimText(patch.company ?? existing?.company);
  const role = trimText(patch.role ?? existing?.role ?? patch.title ?? existing?.title);
  if (!company) throw new Error('company is required');
  if (!role) throw new Error('role/title is required');
  const current_stage = normalizeKanbanStage(
    patch.current_stage ?? existing?.current_stage ?? patch.status ?? existing?.status,
    stages,
    patch.status ?? existing?.status,
  );
  const status = normalizeKanbanStatus(patch.status ?? existing?.status);
  return { patch, company, role, current_stage, status };
}

export function upsertKanbanRecord({ path, input = {}, apps = [] }) {
  const raw = readKanbanState(path);
  const stages = sanitizeKanbanStages(raw.stages);
  const patch = normalizeKanbanPatch(input);
  const records = Array.isArray(raw.records) ? raw.records.map(r => ({ ...r })) : [];
  const existingIndex = patch.id ? records.findIndex(r => String(r.id) === String(patch.id)) : -1;
  const existing = existingIndex >= 0 ? records[existingIndex] : null;
  const { company, role } = validateKanbanPayload(patch, existing, stages);
  const now = new Date().toISOString();
  const id = resolveKanbanId(patch, company, role, records);
  const merged = mergeKanbanRecord(existing, patch, { id, company, role, stages, now });

  if (existingIndex === -1) records.push(merged);
  else records[existingIndex] = merged;

  const saved = writeKanbanState(path, {
    ...raw,
    records,
    updated_at: now,
    created_at: raw.created_at || now,
  });
  return { ok: true, record: merged, kanban: normalizeKanban(saved, apps) };
}

function parseInterviewDateTime(value) {
  if (!value) return null;
  const str = String(value).trim();
  if (!str) return null;
  // "2026-05-13 14:00 PDT" — Date.parse handles common forms; fall back to ISO date.
  const parsed = Date.parse(str);
  if (!Number.isNaN(parsed)) return new Date(parsed);
  const isoMatch = str.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) {
    const d = Date.parse(`${isoMatch[1]}T00:00:00`);
    return Number.isNaN(d) ? null : new Date(d);
  }
  return null;
}

export function normalizeKanban(raw, apps = [], now = new Date()) {
  if (!raw || typeof raw !== 'object') {
    return { stages: KANBAN_DEFAULT_STAGES.slice(), records: [], metrics: emptyKanbanMetrics() };
  }
  const stages = sanitizeKanbanStages(raw.stages);
  const stageIndex = new Map(stages.map((s, i) => [s, i]));

  const trackerByNum = new Map();
  for (const a of apps) {
    const n = a.num ?? a.n;
    if (Number.isFinite(n)) trackerByNum.set(n, a);
  }

  const records = Array.isArray(raw.records) ? raw.records.map(r => normalizeRecord(r, stageIndex, trackerByNum, now)) : [];

  const metrics = computeKanbanMetrics(records);
  return { stages, records, metrics };
}

function emptyKanbanMetrics() {
  return {
    active_count: 0,
    high_priority_count: 0,
    urgent_48h_count: 0,
    overdue_followups_count: 0,
    historical_count: 0,
  };
}

function normalizeRecord(r, stageIndex, trackerByNum, now) {
  const rawStage = trimText(r.current_stage || r.stage);
  const rawStatus = trimText(r.status);
  const status = normalizeKanbanStatus(rawStatus);
  const stage = normalizeKanbanStage(rawStage ?? rawStatus, [...stageIndex.keys()], rawStatus);
  const idx = stageIndex.has(stage) ? stageIndex.get(stage) : -1;
  const isHistorical = HISTORICAL_STAGES.has(stage) || status === 'closed' || status === 'paused-historical';
  const isActive = !isHistorical;

  const interviewAt = parseInterviewDateTime(r.interview_date_time);
  const followUpAt = parseInterviewDateTime(r.follow_up_due_date);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const isWithin48h = (() => {
    if (!isActive) return false;
    const target = interviewAt || followUpAt;
    if (!target) return false;
    const diffMs = target.getTime() - now.getTime();
    return diffMs >= 0 && diffMs <= 48 * 3600 * 1000;
  })();

  const isFollowupOverdue = (() => {
    if (!isActive) return false;
    if (!followUpAt) return false;
    const due = new Date(followUpAt);
    due.setHours(0, 0, 0, 0);
    return due.getTime() < today.getTime();
  })();

  const trackerRefs = Array.isArray(r.tracker_refs) ? r.tracker_refs : [];
  const primaryTrackerNum = trackerRefs.length && Number.isFinite(trackerRefs[0].num) ? trackerRefs[0].num : null;
  const tracker = primaryTrackerNum != null ? trackerByNum.get(primaryTrackerNum) || null : null;

  const displayPeople = Array.isArray(r.people_involved) ? r.people_involved.filter(Boolean).slice(0, 3) : [];
  const prepFocus = Array.isArray(r.prep_focus) ? r.prep_focus.filter(Boolean).slice(0, 3) : [];
  const riskFlags = Array.isArray(r.risk_flags) ? r.risk_flags.filter(Boolean) : [];

  return {
    id: trimText(r.id) || String(r.company || 'unknown').toLowerCase().replace(/\s+/g, '-') + '-' + String(r.role || 'unknown').toLowerCase().replace(/\s+/g, '-'),
    company: r.company || '—',
    role: r.role || '—',
    priority: r.priority || null,
    status,
    raw_status: rawStatus,
    current_stage: stage,
    raw_current_stage: rawStage,
    recommended_new_stage: r.recommended_new_stage || null,
    interview_subtype: r.interview_subtype || null,
    interview_date_time: r.interview_date_time || null,
    url: r.url || r.application_url || r.link || null,
    people_involved: Array.isArray(r.people_involved) ? r.people_involved : [],
    display_people: displayPeople,
    next_action: r.next_action || null,
    follow_up_due_date: r.follow_up_due_date || null,
    prep_status: r.prep_status || null,
    prep_focus: prepFocus,
    win_condition_next_interview: r.win_condition_next_interview || null,
    risk_flags: riskFlags,
    regular_board_status: r.regular_board_status || null,
    tracker_refs: trackerRefs,
    board_scope: Array.isArray(r.board_scope) ? r.board_scope : ['regular', 'react'],
    notes: r.notes || null,
    last_confirmed_by: r.last_confirmed_by || null,
    stage_index: idx,
    is_active: isActive,
    is_historical: isHistorical,
    is_within_48h: isWithin48h,
    is_followup_overdue: isFollowupOverdue,
    primary_tracker_num: primaryTrackerNum,
    tracker_url: tracker?.url || null,
    tracker_report: tracker?.report || null,
    tracker_score: tracker?.score ?? null,
    safe_meeting_visibility: false,
  };
}

function computeKanbanMetrics(records) {
  const m = emptyKanbanMetrics();
  for (const r of records) {
    if (r.is_active) m.active_count++;
    if (r.is_historical) m.historical_count++;
    if (r.is_active && String(r.priority || '').toLowerCase() === 'high') m.high_priority_count++;
    if (r.is_within_48h) m.urgent_48h_count++;
    if (r.is_followup_overdue) m.overdue_followups_count++;
  }
  return m;
}

export function pipelineHasExactQueuedUrl(content, targetUrl) {
  const url = trimText(targetUrl);
  if (!url) return false;
  return String(content || '')
    .split(/\r?\n/)
    .some(line => line.trim() === `- [ ] ${url}` || line.trim() === `- [x] ${url}`);
}

export function parsePendingItem(line) {
  const parts = String(line).split('|').map(s => s.trim());
  const rawUrl = parts[0] || '';
  const company = parts[1] || 'Unknown';
  const role = parts.slice(2).join(' | ') || 'Unknown role';
  const source = rawUrl.startsWith('local:') ? 'local JD' : rawUrl.includes('ashbyhq.com') ? 'Ashby' : rawUrl.includes('greenhouse.io') ? 'Greenhouse' : rawUrl.includes('lever.co') ? 'Lever' : 'URL';
  return {
    raw: line,
    url: rawUrl,
    company,
    role,
    source,
    actionLabel: /manual verify|blocked|403/i.test(line) ? 'Manual verify' : 'Evaluate',
  };
}
