/* global React */
// Detailed Kanban pipeline view — reads window.KANBAN, populated by the
// live adapter from /api/state.kanban (originating in data/kanban-pipeline.json).
const { useMemo: useMemoK } = React;

function cleanKanbanField(value) {
  const text = value == null ? '' : String(value).trim();
  return text || null;
}

function promptKanbanPayload(record = {}) {
  const kanban = window.KANBAN || { stages: [] };
  const stageHint = (kanban.stages || []).length ? `\n\nStages: ${(kanban.stages || []).join(' | ')}` : '';
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

async function saveKanbanPayload(payload) {
  const res = await fetch('/api/kanban/upsert', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text().catch(() => 'save failed'));
  await window.__live?.refresh?.();
}

function KanbanMetric({ t, value, label, role }) {
  const color = role ? t[role] : t.muted;
  return (
    <span style={{
      display: "inline-flex", alignItems: "baseline", gap: 6,
      padding: "4px 10px", borderRadius: 999,
      background: `${color}14`, border: `1px solid ${color}55`,
      fontFamily: "var(--mono)", fontSize: 11,
      color: t.muted, fontFeatureSettings: '"tnum"',
    }}>
      <b style={{ color, fontWeight: 700 }}>{value}</b>
      <span>{label}</span>
    </span>
  );
}

function KanbanBadge({ t, label, role }) {
  const color = t[role] || t.muted;
  return (
    <span style={{
      fontFamily: "var(--mono)", fontSize: 9.5, fontWeight: 700,
      letterSpacing: 0.4, textTransform: "uppercase",
      padding: "2px 6px", borderRadius: 999, whiteSpace: "nowrap",
      color, background: `${color}1f`, border: `1px solid ${color}55`,
    }}>{label}</span>
  );
}

function KanbanCard({ t, record, onOpen, onEdit }) {
  const urgent = record.is_within_48h;
  const overdue = record.is_followup_overdue;
  const dim = record.is_historical;
  const pri = (record.priority || "").toLowerCase();

  const badges = [];
  if (urgent) badges.push({ key: "u", label: "⏰ <48h", role: "red" });
  if (overdue) badges.push({ key: "o", label: "⚠ overdue", role: "yellow" });
  if (pri === "high") badges.push({ key: "p", label: "★ high", role: "mauve" });
  else if (pri === "medium") badges.push({ key: "p", label: "medium", role: "blue" });
  else if (pri === "historical") badges.push({ key: "p", label: "historical", role: "muted" });

  const borderColor = urgent ? `${t.red}88` : overdue ? `${t.yellow}88` : t.surface;
  const cardBg = overdue && !urgent ? `${t.yellow}08` : undefined;
  const cardClick = () => {
    if (!onOpen) return;
    const apps = window.APPS || [];
    const num = record.primary_tracker_num;
    const match = num != null ? apps.find(a => (a.n ?? a.num) === num) : null;
    if (match) onOpen(match);
  };

  const stages = (window.KANBAN || {}).stages || [];
  const handleStageChange = async (e) => {
    e.stopPropagation();
    try {
      const res = await fetch('/api/kanban/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: record.id, current_stage: e.target.value }),
      });
      if (!res.ok) throw new Error(await res.text().catch(() => 'save failed'));
      await window.__live?.refresh?.();
    } catch (err) {
      window.alert(err.message || String(err));
    }
  };

  const meta = [];
  if (record.interview_date_time) meta.push({ k: "interview", v: record.interview_date_time, urgent });
  if (record.follow_up_due_date) meta.push({ k: "follow-up", v: record.follow_up_due_date, overdue });
  if (record.display_people?.length) meta.push({ k: "people", v: record.display_people.join(", ") });
  if (record.prep_status) meta.push({ k: "prep", v: record.prep_status });

  return (
    <div onClick={cardClick} style={{
      background: cardBg || t.mantle, border: `1px solid ${borderColor}`,
      borderRadius: 8, padding: "10px 11px",
      display: "flex", flexDirection: "column", gap: 6,
      cursor: onOpen ? "pointer" : "default",
      opacity: dim ? 0.6 : 1,
      boxShadow: urgent ? `0 0 0 1px ${t.red}30` : overdue ? `0 0 0 1px ${t.yellow}20` : "none",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ color: t.text, fontWeight: 700, fontSize: 13.5, lineHeight: 1.2, minWidth: 0 }}>
          {record.company}
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {badges.map(b => <KanbanBadge key={b.key} t={t} label={b.label} role={b.role} />)}
        </div>
      </div>
      <div style={{ color: t.muted, fontSize: 11.5, lineHeight: 1.3 }}>{record.role}</div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {record.url && (
          <button
            onClick={(e) => { e.stopPropagation(); window.open(record.url, '_blank', 'noopener'); }}
            style={{
              border: `1px solid ${t.surface2}`, background: "transparent", color: t.subtext,
              borderRadius: 999, padding: "2px 8px", fontFamily: "var(--mono)", fontSize: 10.5,
              cursor: "pointer",
            }}
          >
            open link
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (!onEdit) return;
            onEdit(record);
          }}
          style={{
            border: `1px solid ${t.surface2}`, background: `${t.surface}22`, color: t.text,
            borderRadius: 999, padding: "2px 8px", fontFamily: "var(--mono)", fontSize: 10.5,
            cursor: "pointer",
          }}
        >
          edit
        </button>
      </div>

      {record.next_action && (
        <div style={{
          background: `${t.blue}1a`, border: `1px solid ${t.blue}44`,
          color: t.text, fontSize: 12, lineHeight: 1.35,
          padding: "7px 9px", borderRadius: 6, fontWeight: 500,
        }}>{record.next_action}</div>
      )}

      {meta.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 11 }}>
          {meta.map((m, i) => (
            <div key={i} style={{ display: "flex", gap: 6, fontFamily: "var(--mono)", color: t.muted }}>
              <span style={{
                color: t.muted, textTransform: "uppercase", fontSize: 9.5,
                letterSpacing: 0.5, width: 60, flexShrink: 0, paddingTop: 1,
              }}>{m.k}</span>
              <span style={{
                color: m.urgent ? t.red : m.overdue ? t.yellow : t.text,
                fontWeight: (m.urgent || m.overdue) ? 600 : 400,
                fontSize: 11, flex: 1, minWidth: 0, wordBreak: "break-word",
              }}>{m.v}</span>
            </div>
          ))}
        </div>
      )}

      {record.prep_focus?.length > 0 && (
        <ul style={{ margin: "4px 0 0", paddingLeft: 16, color: t.text, fontSize: 11.5, display: "flex", flexDirection: "column", gap: 2 }}>
          {record.prep_focus.slice(0, 3).map((b, i) => (
            <li key={i} style={{ lineHeight: 1.3 }}>{b}</li>
          ))}
        </ul>
      )}

      {record.risk_flags?.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 2 }}>
          {record.risk_flags.map((rf, i) => (
            <div key={i} style={{
              color: t.yellow, background: `${t.yellow}14`, border: `1px solid ${t.yellow}44`,
              borderRadius: 4, padding: "3px 6px", fontSize: 10.5, lineHeight: 1.3,
            }}>⚠ {rf}</div>
          ))}
        </div>
      )}

      {stages.length > 0 && (
        <select
          value={record.current_stage || ""}
          onChange={handleStageChange}
          onClick={e => e.stopPropagation()}
          style={{
            width: "100%", marginTop: 4, padding: "4px 6px",
            fontSize: 11, fontFamily: "var(--mono)",
            background: t.crust, color: t.muted,
            border: `1px solid ${t.surface}`, borderRadius: 5,
            cursor: "pointer",
          }}
        >
          {stages.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      )}
    </div>
  );
}

function KanbanView({ t, search, onOpen, onAdd, onEdit }) {
  const kanban = window.KANBAN || { stages: [], records: [], metrics: {} };

  const filtered = useMemoK(() => {
    if (!search) return kanban.records;
    const q = search.toLowerCase();
    return kanban.records.filter(r => [
      r.company, r.role, r.current_stage, r.next_action, r.notes, r.priority,
    ].some(v => (v || "").toString().toLowerCase().includes(q)));
  }, [kanban.records, search]);

  const active = filtered.filter(r => r.is_active);
  const historical = filtered.filter(r => r.is_historical);

  const byStage = useMemoK(() => {
    const map = new Map();
    for (const stage of kanban.stages) map.set(stage, []);
    for (const r of active) {
      if (!map.has(r.current_stage)) map.set(r.current_stage, []);
      map.get(r.current_stage).push(r);
    }
    return [...map.entries()].filter(([, list]) => list.length);
  }, [kanban.stages, active]);

  const m = kanban.metrics || {};
  const editHandler = onEdit || ((record) => {
    const payload = promptKanbanPayload(record);
    if (!payload) return;
    saveKanbanPayload(payload).catch(err => window.alert(err.message || String(err)));
  });
  const addHandler = onAdd || (() => {
    const payload = promptKanbanPayload();
    if (!payload) return;
    saveKanbanPayload(payload).catch(err => window.alert(err.message || String(err)));
  });

  if (!kanban.records.length) {
    return (
      <div style={{ padding: "32px 22px", color: t.muted, fontFamily: "var(--mono)", fontSize: 13, textAlign: "center", display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
        <div>Kanban pipeline is empty.</div>
        <button
          onClick={addHandler}
          style={{
            border: `1px solid ${t.surface2}`, background: t.base, color: t.text,
            borderRadius: 8, padding: "6px 10px", fontFamily: "var(--mono)", fontSize: 11,
            cursor: "pointer", flexShrink: 0,
          }}
        >
          + Add Job
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: "8px 22px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <KanbanMetric t={t} value={m.active_count || 0} label="active" role="text" />
          <KanbanMetric t={t} value={m.high_priority_count || 0} label="high priority" role="mauve" />
          <KanbanMetric t={t} value={m.urgent_48h_count || 0} label="within 48h" role="red" />
          <KanbanMetric t={t} value={m.overdue_followups_count || 0} label="overdue follow-up" role="yellow" />
          <KanbanMetric t={t} value={m.historical_count || 0} label="historical" role="muted" />
        </div>
        <button
          onClick={addHandler}
          style={{
            border: `1px solid ${t.surface2}`, background: t.base, color: t.text,
            borderRadius: 8, padding: "6px 10px", fontFamily: "var(--mono)", fontSize: 11,
            cursor: "pointer", flexShrink: 0,
          }}
        >
          + Add Job
        </button>
      </div>

      {byStage.length === 0 ? (
        <div style={{ padding: 32, color: t.muted, fontFamily: "var(--mono)", fontSize: 13, textAlign: "center" }}>
          No active records match this filter.
        </div>
      ) : (
        <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8 }}>
          {byStage.map(([stage, list]) => (
            <div key={stage} style={{
              flex: "0 0 300px", minWidth: 300, maxWidth: 320,
              background: t.mantle, border: `1px solid ${t.surface}`, borderRadius: 10,
              display: "flex", flexDirection: "column",
              maxHeight: "calc(100vh - 240px)",
            }}>
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "9px 12px", borderBottom: `1px solid ${t.surface}`,
                background: t.crust, borderRadius: "10px 10px 0 0",
              }}>
                <span style={{
                  color: t.text, fontFamily: "var(--mono)",
                  fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase",
                }}>{stage}</span>
                <span style={{
                  color: t.muted, fontFamily: "var(--mono)", fontSize: 11,
                  background: `${t.surface}66`, borderRadius: 999, padding: "1px 8px",
                  fontFeatureSettings: '"tnum"',
                }}>{list.length}</span>
              </div>
              <div style={{
                padding: 8, overflowY: "auto",
                display: "flex", flexDirection: "column", gap: 8,
              }}>
                {list.map(r => <KanbanCard key={r.id} t={t} record={r} onOpen={onOpen} onEdit={editHandler} />)}
              </div>
            </div>
          ))}
        </div>
      )}

      {historical.length > 0 && (
        <div style={{
          border: `1px dashed ${t.surface}`, borderRadius: 10,
          padding: 12, display: "flex", flexDirection: "column", gap: 8,
          background: `${t.surface}0a`,
        }}>
          <div style={{
            color: t.muted, fontFamily: "var(--mono)",
            fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            Historical / Paused
            <span style={{
              color: t.muted, background: `${t.surface}66`,
              borderRadius: 999, padding: "1px 8px",
              fontFamily: "var(--mono)", fontSize: 11, fontFeatureSettings: '"tnum"',
            }}>{historical.length}</span>
          </div>
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 8,
          }}>
            {historical.map(r => <KanbanCard key={r.id} t={t} record={r} onOpen={onOpen} onEdit={editHandler} />)}
          </div>
        </div>
      )}
    </div>
  );
}

window.KanbanView = KanbanView;
window.KanbanCard = KanbanCard;
