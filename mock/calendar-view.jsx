/* global React */
const { useState: useStateCal, useMemo: useMemoCal } = React;

// Stage colors map to theme keys
function stageColor(stage, t) {
  const map = {
    recruiter: t.sky,
    tech: t.green,
    hm: t.lavender,
    fit: t.peach,
    other: t.subtext,
  };
  return map[stage] || t.subtext;
}

function stageLabel(stage) {
  return ({ recruiter: "Recruiter", tech: "Technical", hm: "Hiring Mgr", fit: "Fit", other: "Other" })[stage] || "Other";
}

function localYmd(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// 2-week (14 day) grid starting from the Monday of "today"
function buildGrid(today) {
  const [y, m, d] = today.split('-').map(Number);
  const t0 = new Date(y, m - 1, d); // midnight local — avoids UTC off-by-one
  // Start from this week's Monday
  const dow = (t0.getDay() + 6) % 7; // Mon=0..Sun=6
  t0.setDate(t0.getDate() - dow);
  const days = [];
  for (let i = 0; i < 14; i++) {
    const d2 = new Date(t0);
    d2.setDate(t0.getDate() + i);
    days.push(d2);
  }
  return days;
}

function ymd(d) {
  return localYmd(d);
}

function getInterviewEvents(today) {
  const liveEvents = window.__live?.calendarEvents || window.__live?.interviewEvents;
  if (Array.isArray(liveEvents)) {
    return liveEvents.map(e => ({
      ...e,
      past: e.date ? e.date < today : false,
    }));
  }
  const past = (window.PAST_INTERVIEWS || []).map(e => ({ ...e, past: true }));
  const upcoming = (window.UPCOMING || []).map(e => ({ ...e, past: false }));
  return [...past, ...upcoming];
}

function normalizeText(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function findAppForEvent(ev) {
  if (!ev) return null;
  const apps = Array.isArray(window.APPS) ? window.APPS : [];
  if (ev.n != null) {
    const byNum = apps.find(a => String(a.n) === String(ev.n));
    if (byNum) return byNum;
  }

  const title = normalizeText(ev.title || ev.co || ev.kind || "");
  const desc = normalizeText(ev.description || "");
  const haystack = `${title} ${desc}`;

  let best = null;
  let bestScore = 0;
  for (const a of apps) {
    const company = normalizeText(a.company || "");
    const role = normalizeText(a.role || "");
    const note = normalizeText(a.note || "");
    let score = 0;
    if (company && haystack.includes(company)) score += 3;
    if (role && haystack.includes(role)) score += 2;
    if (note && haystack.includes(note.slice(0, 24))) score += 1;
    if (company && title.includes(company)) score += 3;
    if (role && title.includes(role)) score += 2;
    if (score > bestScore) {
      best = a;
      bestScore = score;
    }
  }
  return bestScore > 0 ? best : null;
}

function getPrepFileForEvent(ev, app) {
  const prep = Array.isArray(window.PREP) ? window.PREP : [];
  const co = normalizeText(app?.company || ev?.co || ev?.title || "");
  if (!co) return null;
  const matches = prep.filter(p => normalizeText(p.folder || p.file || "").startsWith(co));
  if (!matches.length) return null;
  return matches.slice().sort((a, b) => (b.mtime || 0) - (a.mtime || 0))[0];
}

function openPrepFile(prepFile) {
  if (!prepFile) return false;
  window.open(`/api/prep?file=${encodeURIComponent(prepFile.file)}`, "_blank");
  return true;
}

function CalendarView({ t, onOpen, density }) {
  const today = localYmd(new Date());
  const grid = useMemoCal(() => buildGrid(today), [today]);
  const [filter, setFilter] = useStateCal({ stage: "all", company: "all" });
  const [popover, setPopover] = useStateCal(null); // { event, x, y }

  const liveKey = window.__live?.lastUpdate ? window.__live.lastUpdate.getTime() : 0;
  const allEvents = useMemoCal(() => getInterviewEvents(today), [liveKey, today]);

  const companies = useMemoCal(() => {
    const set = new Set(allEvents.map(e => e.co));
    return ["all", ...Array.from(set).sort()];
  }, [allEvents]);

  const filtered = allEvents.filter(e => {
    if (filter.stage !== "all" && e.stage !== filter.stage) return false;
    if (filter.company !== "all" && e.co !== filter.company) return false;
    return true;
  });

  const byDay = useMemoCal(() => {
    const m = {};
    for (const e of filtered) {
      if (!m[e.date]) m[e.date] = [];
      m[e.date].push(e);
    }
    for (const k of Object.keys(m)) {
      m[k].sort((a, b) => (a.time || "").localeCompare(b.time || ""));
    }
    return m;
  }, [filtered]);

  const cellPad = density === "compact" ? 6 : density === "comfortable" ? 12 : 9;
  const cellMin = density === "compact" ? 88 : density === "comfortable" ? 124 : 104;

  // Max events in any single day → drives row height so nothing clips
  const maxEventsPerDay = Math.max(1, ...grid.map(d => (byDay[ymd(d)] || []).length));
  const eventChipH = 26; // approx height of one chip + gap
  const rowH = Math.max(cellMin, 30 + maxEventsPerDay * eventChipH);

  const handleClick = (e, ev) => {
    const r = e.currentTarget.getBoundingClientRect();
    setPopover({ event: ev, x: r.right + 8, y: r.top });
  };

  const closePop = () => setPopover(null);

  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div style={{
      background: t.mantle, border: `1px solid ${t.surface}`, borderRadius: 10, padding: 18,
      display: "flex", flexDirection: "column", gap: 12, position: "relative",
    }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <div style={{ color: t.green, fontFamily: "var(--mono)", fontSize: 12, letterSpacing: 0.6, textTransform: "uppercase", fontWeight: 600 }}>
            Calendar · next 14 days
          </div>
          <div style={{ color: t.muted, fontFamily: "var(--mono)", fontSize: 11 }}>
            {filtered.filter(e => !e.past).length} upcoming · {filtered.filter(e => e.past).length} past
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {/* Stage legend */}
          <div style={{ display: "flex", gap: 6, marginRight: 6 }}>
            {["recruiter", "tech", "hm", "fit"].map(s => (
              <button key={s} onClick={() => setFilter(f => ({ ...f, stage: f.stage === s ? "all" : s }))}
                style={{
                  display: "flex", alignItems: "center", gap: 4,
                  background: filter.stage === s ? `${stageColor(s, t)}22` : "transparent",
                  border: `1px solid ${filter.stage === s ? stageColor(s, t) : t.surface}`,
                  borderRadius: 4, padding: "3px 7px",
                  color: filter.stage === s ? stageColor(s, t) : t.subtext,
                  fontFamily: "var(--mono)", fontSize: 10.5, cursor: "pointer",
                }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: stageColor(s, t) }} />
                {stageLabel(s)}
              </button>
            ))}
          </div>
          <select value={filter.company} onChange={e => setFilter(f => ({ ...f, company: e.target.value }))}
            style={{
              background: t.base, color: t.text, border: `1px solid ${t.surface}`,
              borderRadius: 4, padding: "3px 7px", fontFamily: "var(--mono)", fontSize: 11,
            }}>
            {companies.map(c => <option key={c} value={c}>{c === "all" ? "All companies" : c}</option>)}
          </select>
        </div>
      </div>

      {/* Day-of-week header */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 4 }}>
        {dayNames.map(n => (
          <div key={n} style={{ color: t.muted, fontFamily: "var(--mono)", fontSize: 10.5, textTransform: "uppercase", letterSpacing: 0.6, padding: "0 4px" }}>{n}</div>
        ))}
      </div>

      {/* 2x7 grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gridTemplateRows: `repeat(2, minmax(${rowH}px, auto))`, gap: 4 }}>
        {grid.map((d, i) => {
          const k = ymd(d);
          const isToday = k === today;
          const isPast = k < today;
          const events = byDay[k] || [];
          return (
            <div key={i} style={{
              background: isToday ? `${t.green}10` : t.base,
              border: `1px solid ${isToday ? t.green : t.surface}`,
              borderRadius: 6, padding: cellPad,
              display: "flex", flexDirection: "column", gap: 4,
              opacity: isPast && !isToday ? 0.55 : 1,
              minHeight: 0, minWidth: 0, overflow: "hidden",
            }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                <div style={{ color: isToday ? t.green : t.subtext, fontFamily: "var(--mono)", fontSize: 11, fontWeight: 600, fontFeatureSettings: '"tnum"' }}>
                  {d.getMonth() + 1}/{d.getDate()}
                </div>
                {isToday && <div style={{ color: t.green, fontFamily: "var(--mono)", fontSize: 9, letterSpacing: 0.6, textTransform: "uppercase", fontWeight: 700 }}>Today</div>}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, width: "100%", overflow: "hidden" }}>
                {events.map((ev, j) => {
                  const c = stageColor(ev.stage, t);
                  return (
                    <div key={j} onClick={e => handleClick(e, ev)} style={{
                      display: "flex", flexDirection: "column", gap: 0,
                      background: `${c}1a`, borderLeft: `2px solid ${c}`,
                      borderRadius: 3, padding: "1px 4px",
                      cursor: "pointer", width: "100%", maxWidth: "100%", minWidth: 0,
                      boxSizing: "border-box", overflow: "hidden",
                      textDecoration: ev.past ? "line-through" : "none",
                    }}>
                      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", alignItems: "baseline", gap: 4, minWidth: 0, width: "100%", maxWidth: "100%" }}>
                        <span style={{ color: c, fontFamily: "var(--mono)", fontSize: 9, lineHeight: 1.1, fontFeatureSettings: '"tnum"', flexShrink: 0 }}>{ev.time}</span>
                        <span style={{ color: t.text, fontSize: 10, lineHeight: 1.1, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, display: "block" }}>{ev.title || ev.co}</span>
                      </div>
                      {ev.who && (
                        <div style={{ color: t.muted, fontFamily: "var(--mono)", fontSize: 8.5, lineHeight: 1.1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, width: "100%" }}>
                          {ev.who}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {popover && <Popover t={t} ev={popover.event} x={popover.x} y={popover.y} onClose={closePop} onOpen={onOpen} />}
    </div>
  );
}

function Popover({ t, ev, x, y, onClose, onOpen }) {
  const a = findAppForEvent(ev);
  const c = stageColor(ev.stage, t);
  const prepFile = getPrepFileForEvent(ev, a);
  // Clamp to viewport
  const maxX = (typeof window !== "undefined" ? window.innerWidth : 1440) - 320;
  const left = Math.min(x, maxX);

  const openDetail = () => {
    if (a && onOpen) {
      onOpen(a);
      onClose();
      return;
    }
    if (ev.meetingLink) {
      window.open(ev.meetingLink, "_blank");
    }
    onClose();
  };

  const openMeeting = () => {
    if (ev.meetingLink) {
      window.open(ev.meetingLink, "_blank");
      onClose();
      return;
    }
    if (a?.meetingLink || a?.url) {
      window.open(a.meetingLink || a.url, "_blank");
    }
    onClose();
  };

  const openPrep = () => {
    if (prepFile) {
      openPrepFile(prepFile);
      onClose();
      return;
    }
    if (a && onOpen) {
      onOpen(a);
    }
    onClose();
  };

  return (
    <React.Fragment>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 50 }} />
      <div style={{
        position: "fixed", left, top: y, width: 300, zIndex: 51,
        background: t.mantle, border: `1px solid ${t.surface}`, borderRadius: 8,
        boxShadow: "0 12px 32px rgba(0,0,0,0.4)", padding: 14,
        display: "flex", flexDirection: "column", gap: 10,
      }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
          <div style={{ color: t.text, fontSize: 14, fontWeight: 700 }}>{ev.title || ev.co}</div>
          <div style={{
            color: c, fontFamily: "var(--mono)", fontSize: 9.5, fontWeight: 700,
            background: `${c}1a`, padding: "2px 7px", borderRadius: 999, letterSpacing: 0.4, textTransform: "uppercase",
          }}>{stageLabel(ev.stage)}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, fontFamily: "var(--mono)", fontSize: 11 }}>
          <div style={{ color: t.subtext }}>{ev.kind}</div>
          <div style={{ color: t.green, fontFeatureSettings: '"tnum"' }}>{ev.date} · {ev.time}</div>
          {ev.who && <div style={{ color: t.muted }}>👤 {ev.who}</div>}
          {a && <div style={{ color: t.muted }}>{a.role}</div>}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button onClick={openDetail} style={{
            background: t.base, color: t.text, border: `1px solid ${t.surface}`, borderRadius: 4,
            padding: "5px 10px", fontFamily: "var(--mono)", fontSize: 11, cursor: "pointer",
          }}>Open detail</button>
          <button onClick={openMeeting} style={{
            background: `${t.green}1a`, color: t.green, border: `1px solid ${t.green}66`, borderRadius: 4,
            padding: "5px 10px", fontFamily: "var(--mono)", fontSize: 11, cursor: "pointer",
          }}>{/google\.com\/calendar\//.test(ev.meetingLink || "") ? "↗ Open in Calendar" : "↗ Join meeting"}</button>
          <button onClick={openPrep} style={{
            background: t.base, color: t.subtext, border: `1px solid ${t.surface}`, borderRadius: 4,
            padding: "5px 10px", fontFamily: "var(--mono)", fontSize: 11, cursor: "pointer",
          }}>Prep notes</button>
        </div>
      </div>
    </React.Fragment>
  );
}

window.CalendarView = CalendarView;
