import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  classifyPriority,
  buildActionQueue,
  parsePendingItem,
  parsePostingDateFromReport,
  summarizeReadiness,
  parseInterviewMeta,
  classifyInterviewStage,
  buildCalGrid,
  normalizeKanban,
  normalizeKanbanStage,
  normalizeKanbanStatus,
  readKanbanState,
  writeKanbanState,
  upsertKanbanRecord,
  pipelineHasExactQueuedUrl,
} from '../web-dashboard-lib.mjs';

test('classifyPriority marks strong evaluated PDF-ready role as apply_now', () => {
  const app = {
    company: 'Replit',
    role: 'IT Administrator - Endpoint Platforms',
    score: 4.1,
    status: 'Evaluated',
    pdf: true,
    notes: 'Strong endpoint-platform fit',
    date: '2026-04-24',
  };

  assert.equal(classifyPriority(app).label, 'Apply Now');
});

test('classifyPriority marks low-score evaluated role as skip', () => {
  const app = {
    company: 'Abridge',
    role: 'Staff IT Automation Engineer',
    score: 3.2,
    status: 'Evaluated',
    pdf: false,
    notes: 'Major gaps and not recommended',
    date: '2026-04-24',
  };

  assert.equal(classifyPriority(app).label, 'Skip');
});

test('buildActionQueue prioritizes interviews, follow-ups, and apply-now roles', () => {
  const apps = [
    {
      company: 'Treeline',
      role: 'IT Automation Engineer',
      score: 4.0,
      status: 'Interview',
      pdf: true,
      date: '2026-04-21',
      interviewDate: '2026-04-27',
      interviewTime: '12:00PM PST',
      notes: 'Interview scheduled',
    },
    {
      company: 'Ashby',
      role: 'Staff IT Engineer',
      score: 4.2,
      status: 'Applied',
      pdf: true,
      date: '2026-04-16',
      notes: 'Applied and waiting',
    },
    {
      company: 'Replit',
      role: 'IT Administrator - Endpoint Platforms',
      score: 4.1,
      status: 'Evaluated',
      pdf: true,
      date: '2026-04-24',
      notes: 'Strong fit and PDF ready',
    },
  ];

  const actions = buildActionQueue(apps, '2026-04-24');

  assert.deepEqual(
    actions.slice(0, 3).map(a => [a.kind, a.company]),
    [
      ['interview_prep', 'Treeline'],
      ['follow_up', 'Ashby'],
      ['apply_now', 'Replit'],
    ],
  );
});

test('parsePendingItem extracts url, company, role, and local source hint', () => {
  const item = parsePendingItem('local:jds/cursor-technical-support-engineer-amer.md | Cursor / Anysphere | Technical Support Engineer - AMER (API-confirmed active; public Ashby page rendered empty)');

  assert.equal(item.company, 'Cursor / Anysphere');
  assert.equal(item.source, 'local JD');
  assert.match(item.actionLabel, /Evaluate/i);
});

test('parsePostingDateFromReport extracts an exact created date from report text', () => {
  const report = [
    '# Evaluation: Instacart — AV Engineer (Contractor)',
    '',
    '- Posted: November 22, 2025 (4+ months old)',
    '| Posting age | November 22, 2025 (4+ months old) | Concerning |',
  ].join('\n');

  assert.deepEqual(parsePostingDateFromReport(report), {
    display: '2025-11-22',
    sortKey: '2025-11-22',
  });
});

test('parsePostingDateFromReport extracts ISO created dates from posting-age tables', () => {
  const report = [
    '# Evaluation: LiveKit — IT Support Engineer',
    '',
    '| Posting age | 2026-03-25, ~30 days old | Positive |',
  ].join('\n');

  assert.deepEqual(parsePostingDateFromReport(report), {
    display: '2026-03-25',
    sortKey: '2026-03-25',
  });
});

test('summarizeReadiness derives report/pdf/apply-pack status from an app', () => {
  const summary = summarizeReadiness({
    report: '161-replit-it-administrator-endpoint-platforms-2026-04-24.md',
    pdf: true,
    status: 'Evaluated',
    score: 4.1,
  });

  assert.deepEqual(summary, {
    report: true,
    pdf: true,
    coverLetter: false,
    applyPack: 'ready',
  });
});

test('parseInterviewMeta extracts HM stages correctly', () => {
  const cases = [
    {
      notes: 'Hiring Manager Interview: 2026-05-05 2:00pm PDT. Video with Roy Mayoral.',
      expect: { stage: 'Hiring Manager Interview', date: '2026-05-05', time: '2:00pm PDT' },
    },
    {
      notes: 'HM Interview: Wed 2026-05-07 12:30pm PDT w/ Jerome.',
      expect: { stage: 'HM Interview', date: '2026-05-07', time: '12:30pm PDT' },
    },
    {
      notes: 'HM interview: 2026-05-05 10:00am PDT.',
      expect: { stage: 'HM interview', date: '2026-05-05', time: '10:00am PDT' },
    },
    {
      notes: 'Hiring Manager: 2026-05-05 3:00pm',
      expect: { stage: 'Hiring Manager', date: '2026-05-05', time: '3:00pm' },
    },
  ];

  for (const { notes, expect: exp } of cases) {
    const result = parseInterviewMeta(notes);
    assert.equal(result.stage, exp.stage, `Stage mismatch for: "${notes}"`);
    assert.equal(result.interviewDate, exp.date, `Date mismatch for: "${notes}"`);
    assert.equal(result.interviewTime, exp.time, `Time mismatch for: "${notes}"`);
  }
});

test('parseInterviewMeta avoids matching generic "Interview" before stage keywords', () => {
  // This was the regression bug: "Hiring Manager Interview" was matching "Interview" at the end
  const notes = 'Hiring Manager Interview: 2026-05-05 2:00pm PDT.';
  const result = parseInterviewMeta(notes);
  assert.equal(
    result.stage,
    'Hiring Manager Interview',
    'Should match "Hiring Manager Interview", not generic "Interview"'
  );
});

test('parseInterviewMeta handles duplicate/messy notes correctly', () => {
  // Real case: #179 GEICO had multiple duplicate Interview: entries
  const notes = `Interview: 2026-05-07 10:00am PDT. Interview: 2026-05-07 10:00am PDT. HM Interview: Wed 2026-05-07 12:30pm PDT w/ Jerome.`;
  const result = parseInterviewMeta(notes);
  // Should prefer the HM Interview (newest/most specific)
  assert.equal(result.stage, 'HM Interview', 'Should extract most recent/specific stage');
  assert.equal(result.stageKey, 'hm', 'Should derive canonical HM stage key');
  assert.equal(result.interviewer, 'Jerome', 'Should extract interviewer from w/ syntax');
});

test('parseInterviewMeta extracts contextual interviewer names and canonical stage keys from real notes', () => {
  const psiQuantum = parseInterviewMeta('Hiring Manager Interview: Wed 2026-05-06 12:30pm PDT w/ Tatiana Adams (HM) + A-Boss (Director, may join). 45 min behavioral/situational. Prep call completed Mon 2026-05-05 11:30am PDT w/ Belle Banta (Insight Global).');
  assert.equal(psiQuantum.stage, 'Hiring Manager Interview');
  assert.equal(psiQuantum.stageKey, 'hm');
  assert.equal(psiQuantum.interviewer, 'Tatiana Adams (HM) + A-Boss (Director, may join)');

  const pacificFusion = parseInterviewMeta('Interview: 2026-05-05 2:00pm PDT. Hiring Manager Interview: 2026-05-05 2:00pm PDT. Video interview with Roy Mayoral (org) + Brian Spyksma. Meet: meet.google.com/iwy-yxzi-ukq.');
  assert.equal(pacificFusion.stage, 'Hiring Manager Interview');
  assert.equal(pacificFusion.stageKey, 'hm');
  assert.equal(pacificFusion.interviewer, 'Roy Mayoral (org) + Brian Spyksma');

  const launchDarkly = parseInterviewMeta('Interview: 2026-05-12 12:30pm PDT. Recruiter screen ✓ completed 2026-05-07 w/ Jason (Recruiter). Strong positive feedback.');
  assert.equal(launchDarkly.stage, 'Interview');
  assert.equal(launchDarkly.stageKey, 'other');
  assert.equal(launchDarkly.interviewer, null);

const demoInterview = parseInterviewMeta('Interview: 2026-05-19 10:40am PDT. Duplicate of #14 (Example Corp IT Support Specialist — active interview).');
  assert.equal(demoInterview.stage, 'Interview');
  assert.equal(demoInterview.date, '2026-05-19');
  assert.equal(demoInterview.interviewer, null);
});

test('classifyInterviewStage maps all canonical stages', () => {
  const cases = [
    { stage: 'Hiring Manager Interview', expect: { emoji: '👔', label: 'Hiring Manager' } },
    { stage: 'Hiring Manager', expect: { emoji: '👔', label: 'Hiring Manager' } },
    { stage: 'HM Interview', expect: { emoji: '👔', label: 'Hiring Manager' } },
    { stage: 'HM interview', expect: { emoji: '👔', label: 'Hiring Manager' } },
    { stage: 'HM', expect: { emoji: '👔', label: 'Hiring Manager' } },
    { stage: 'Recruiter screen', expect: { emoji: '📞', label: 'Recruiter Screen' } },
    { stage: 'Phone Screen', expect: { emoji: '📱', label: 'Phone Screen' } },
    { stage: 'Fit Call', expect: { emoji: '🤝', label: 'Fit Call' } },
    { stage: 'Interview', expect: { emoji: '📝', label: 'Interview' } },
  ];

  for (const { stage, expect: exp } of cases) {
    const result = classifyInterviewStage(stage);
    assert.ok(result, `No classification for stage: "${stage}"`);
    assert.equal(result.emoji, exp.emoji, `Emoji mismatch for: "${stage}"`);
    assert.equal(result.label, exp.label, `Label mismatch for: "${stage}"`);
  }
});

test('classifyInterviewStage returns null for unknown stages', () => {
  const result = classifyInterviewStage('Unknown Interview Type');
  assert.equal(result, null, 'Should return null for unknown stage');
});

test('buildCalGrid includes all event dates within 4-week back cap', () => {
  const today = '2026-05-12';
  const events = [
    { date: '2026-05-01' }, // 11 days ago — should be in grid
    { date: '2026-05-06' }, // 6 days ago
    { date: '2026-05-12' }, // today
    { date: '2026-05-20' }, // upcoming
  ];
  const earliest = events.reduce((min, e) => (!min || e.date < min ? e.date : min), null);
  const grid = buildCalGrid(today, earliest);
  const gridStart = grid[0];
  const gridEnd   = grid[grid.length - 1];

  for (const e of events) {
    assert.ok(
      e.date >= gridStart && e.date <= gridEnd,
      `Event on ${e.date} is outside grid range ${gridStart}–${gridEnd}`,
    );
  }
});

test('buildCalGrid with no early events spans current-week Monday to +13 days', () => {
  const today = '2026-05-12'; // Tuesday
  const grid = buildCalGrid(today);
  assert.equal(grid[0], '2026-05-11', 'Grid should start on Monday of current week');
  assert.equal(grid[grid.length - 1], '2026-05-24', 'Grid should end 13 days after current Monday');
  assert.equal(grid.length, 14);
});

test('buildCalGrid does not extend beyond 4 weeks back', () => {
  const today = '2026-05-12';
  const tooEarly = '2026-03-01'; // > 4 weeks back
  const grid = buildCalGrid(today, tooEarly);
  const gridStart = grid[0];
  // Should not go back further than 4 weeks before this Monday (2026-05-11)
  assert.ok(gridStart >= '2026-04-13', `Grid start ${gridStart} exceeds 4-week cap`);
});

test('kanban normalization and persistence preserve records and reject blank required fields', () => {
  const dir = mkdtempSync(join(tmpdir(), 'career-ops-kanban-'));
  const file = join(dir, 'kanban.json');

  try {
    const seed = {
      schema_version: 1,
      created_at: '2026-05-01T00:00:00.000Z',
      updated_at: '2026-05-01T00:00:00.000Z',
      stages: ['Applied / Awaiting Response', 'Recruiter Screen Scheduled'],
      records: [
        {
          id: 'seed-1',
          company: 'SeedCo',
          role: 'Seed Role',
          current_stage: 'phone screen',
          status: 'ARCHIVED',
          custom_field: 'keep-me',
        },
      ],
    };

    writeFileSync(file, JSON.stringify(seed, null, 2));

    assert.equal(normalizeKanbanStatus('archived'), 'closed');
    assert.equal(normalizeKanbanStage('phone screen', seed.stages, 'archived'), 'Recruiter Screen Scheduled');
    assert.equal(normalizeKanbanStage('hm interview', seed.stages, 'active'), 'Hiring Manager Screen Scheduled');

    const loaded = readKanbanState(file);
    assert.equal(loaded.records[0].current_stage, 'phone screen');
    assert.equal(loaded.records[0].status, 'ARCHIVED');
    assert.equal(loaded.records[0].custom_field, 'keep-me');

    const normalized = normalizeKanban(loaded, []);
    assert.equal(normalized.records[0].current_stage, 'Recruiter Screen Scheduled');
    assert.equal(normalized.records[0].status, 'closed');
    assert.equal(normalized.records[0].raw_status, 'ARCHIVED');
    assert.equal(normalized.records[0].id, 'seed-1');

    writeKanbanState(file, seed);
    assert.equal(existsSync(`${file}.bak`), true);

    const added = upsertKanbanRecord({
      path: file,
      input: {
        company: 'Acme',
        title: 'Support Engineer',
        current_stage: 'Recruiter Screen Scheduled',
        notes: 'hello',
        application_url: 'https://example.com/app',
        next_action: 'Follow up',
      },
      apps: [],
    });

    assert.equal(added.record.company, 'Acme');
    assert.equal(added.record.role, 'Support Engineer');
    assert.equal(added.record.current_stage, 'Recruiter Screen Scheduled');
    assert.equal(added.record.status, 'active');

    const completed = upsertKanbanRecord({
      path: file,
      input: {
        id: added.record.id,
        current_stage: 'Recruiter Screen Completed',
        custom_note: 'persist',
      },
      apps: [],
    });

    assert.equal(completed.record.current_stage, 'Recruiter Screen Completed');
    assert.equal(completed.record.status, 'active');
    assert.equal(completed.record.custom_note, 'persist');

    const hm = upsertKanbanRecord({
      path: file,
      input: {
        id: added.record.id,
        current_stage: 'Hiring Manager Screen Scheduled',
        notes: 'updated note',
      },
      apps: [],
    });

    assert.equal(hm.record.current_stage, 'Hiring Manager Screen Scheduled');
    assert.equal(hm.record.status, 'active');
    assert.equal(hm.record.custom_note, 'persist');

    const updated = upsertKanbanRecord({
      path: file,
      input: {
        id: added.record.id,
        current_stage: 'offer',
        notes: 'updated note',
        stage_status: 'archived',
        custom_note: 'persist',
      },
      apps: [],
    });

    assert.equal(updated.record.current_stage, 'Offer / Negotiation');
    assert.equal(updated.record.status, 'closed');
    assert.equal(updated.record.custom_note, 'persist');

    const rejected = upsertKanbanRecord({
      path: file,
      input: {
        id: added.record.id,
        current_stage: 'Rejected',
      },
      apps: [],
    });

    assert.equal(rejected.record.current_stage, 'Rejected');
    assert.equal(rejected.record.status, 'closed');

    const reopened = upsertKanbanRecord({
      path: file,
      input: {
        id: added.record.id,
        current_stage: 'Recruiter Screen Scheduled',
      },
      apps: [],
    });

    assert.equal(reopened.record.current_stage, 'Recruiter Screen Scheduled');
    assert.equal(reopened.record.status, 'active');

    const persisted = JSON.parse(readFileSync(file, 'utf8'));
    assert.equal(Array.isArray(persisted.records), true);
    assert.equal(persisted.records.some(r => r.id === added.record.id), true);
    assert.equal(JSON.parse(readFileSync(`${file}.bak`, 'utf8')).records[0].custom_field, 'keep-me');

    assert.throws(() => upsertKanbanRecord({ path: file, input: { title: 'Missing company' }, apps: [] }), /company is required/);
    assert.throws(() => upsertKanbanRecord({ path: file, input: { company: 'Blank Role Co' }, apps: [] }), /role\/title is required/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('pipelineHasExactQueuedUrl only matches exact queued URLs', () => {
  const content = [
    '## Pendientes',
    '- [ ] https://example.com/jobs/123',
    '- [x] https://example.com/jobs/finished',
    '- [ ] https://example.com/jobs/123?ref=foo',
  ].join('\n');

  assert.equal(pipelineHasExactQueuedUrl(content, 'https://example.com/jobs/123'), true);
  assert.equal(pipelineHasExactQueuedUrl(content, 'https://example.com/jobs/123?ref=foo'), true);
  assert.equal(pipelineHasExactQueuedUrl(content, 'https://example.com/jobs/12'), false);
  assert.equal(pipelineHasExactQueuedUrl(content, 'https://example.com/jobs/123#section'), false);
});

