/* global React, ReactDOM */
const { useState, useMemo, useEffect, useRef } = React;

function useIsMobile(bp = 640) {
  const [m, setM] = React.useState(() => window.innerWidth < bp);
  React.useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${bp - 1}px)`);
    const h = e => setM(e.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);
  return m;
}
window.useIsMobile = useIsMobile;

// --- Theme palettes ----------------------------------------------------------
const THEMES = {
  mocha: {
    base: "#1e1e2e", mantle: "#181825", crust: "#11111b",
    surface: "#313244", surface2: "#45475a",
    text: "#cdd6f4", subtext: "#a6adc8", muted: "#6c7086",
    blue: "#89b4fa", mauve: "#cba6f7", green: "#a6e3a1",
    yellow: "#f9e2af", sky: "#89dceb", peach: "#fab387",
    red: "#f38ba8", pink: "#f5c2e7", lavender: "#b4befe",
  },
  latte: {
    base: "#eff1f5", mantle: "#e6e9ef", crust: "#dce0e8",
    surface: "#ccd0da", surface2: "#bcc0cc",
    text: "#4c4f69", subtext: "#5c5f77", muted: "#8c8fa1",
    blue: "#1e66f5", mauve: "#8839ef", green: "#40a02b",
    yellow: "#df8e1d", sky: "#04a5e5", peach: "#fe640b",
    red: "#d20f39", pink: "#ea76cb", lavender: "#7287fd",
  },
};

// Status → palette role
const STATUS_ROLE = {
  Applied: "blue",
  Interview: "green",
  Responded: "sky",
  Evaluated: "lavender",
  Rejected: "red",
  Discarded: "muted",
  Offer: "peach",
};

// Tiny SVG sparkline
function Sparkline({ data, w = 120, h = 28, color = "#89b4fa" }) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const stepX = w / (data.length - 1);
  const pts = data.map((v, i) => {
    const x = i * stepX;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const last = data[data.length - 1];
  const lastX = (data.length - 1) * stepX;
  const lastY = h - ((last - min) / range) * (h - 4) - 2;
  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      <polyline fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" points={pts} />
      <circle cx={lastX} cy={lastY} r="2.5" fill={color} />
    </svg>
  );
}

// Score chip
function ScoreChip({ value, t }) {
  if (value == null) return <span style={{ color: t.muted, fontFeatureSettings: '"tnum"' }}>—</span>;
  const role =
    value >= 4.5 ? t.green :
    value >= 4.0 ? t.sky :
    value >= 3.5 ? t.yellow :
    value >= 3.0 ? t.peach : t.red;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      fontFeatureSettings: '"tnum"',
      color: role,
      fontWeight: 600,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: 1,
        background: role, display: "inline-block",
      }} />
      {value.toFixed(1)}
    </span>
  );
}

// Status pill
function StatusPill({ status, t }) {
  const role = t[STATUS_ROLE[status] || "muted"];
  return (
    <span style={{
      fontSize: 11,
      fontFamily: "var(--mono)",
      letterSpacing: 0.4,
      textTransform: "uppercase",
      color: role,
      border: `1px solid ${role}55`,
      background: `${role}14`,
      padding: "2px 8px",
      borderRadius: 999,
      whiteSpace: "nowrap",
    }}>{status}</span>
  );
}

// Filter tab
function Tab({ label, count, active, onClick, t }) {
  return (
    <button onClick={onClick} style={{
      background: active ? t.surface : "transparent",
      border: `1px solid ${active ? t.surface2 : "transparent"}`,
      color: active ? t.text : t.subtext,
      padding: "6px 12px",
      borderRadius: 6,
      fontFamily: "var(--mono)",
      fontSize: 12,
      letterSpacing: 0.3,
      cursor: "pointer",
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
    }}>
      <span>{label}</span>
      <span style={{
        color: active ? t.lavender : t.muted,
        fontFeatureSettings: '"tnum"',
        fontSize: 11,
      }}>{count}</span>
    </button>
  );
}

// Header
function TopBar({ t, view, setView, search, setSearch, refreshKey, setRefreshKey }) {
  const normalizeView = (v) => (v === "pipeline" ? "kanban" : v);
  return (
    <div style={{
      display: "flex", alignItems: "center",
      padding: "14px 22px",
      borderBottom: `1px solid ${t.surface}`,
      background: t.mantle,
      gap: 18,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          width: 22, height: 22, borderRadius: 5,
          background: `linear-gradient(135deg, ${t.mauve}, ${t.blue})`,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: t.crust, fontFamily: "var(--mono)", fontWeight: 700, fontSize: 12,
        }}>◆</div>
        <div style={{ fontFamily: "var(--mono)", fontSize: 13, color: t.text, letterSpacing: 0.5 }}>
          career-ops
        </div>
        <div style={{ color: t.muted, fontFamily: "var(--mono)", fontSize: 12 }}>/</div>
        <div style={{ color: t.subtext, fontFamily: "var(--mono)", fontSize: 12 }}>
          {view === "pipeline" ? "pipeline" : view === "kanban" ? "kanban" : "progress"}
        </div>
      </div>

      <div style={{
        display: "inline-flex", background: t.base, border: `1px solid ${t.surface}`,
        borderRadius: 7, padding: 3, marginLeft: 8,
      }}>
        {["pipeline", "kanban", "progress"].map(v => (
          <button key={v} onClick={() => setView(normalizeView(v))} style={{
            padding: "5px 14px",
            background: view === v ? t.surface : "transparent",
            border: "none",
            color: view === v ? t.text : t.subtext,
            fontFamily: "var(--mono)", fontSize: 12, letterSpacing: 0.4,
            cursor: "pointer", borderRadius: 5, textTransform: "lowercase",
          }}>{v}</button>
        ))}
      </div>

      <div style={{ flex: 1 }} />

      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        background: t.base, border: `1px solid ${t.surface}`,
        borderRadius: 7, padding: "6px 10px", minWidth: 280,
      }}>
        <span style={{ color: t.muted, fontFamily: "var(--mono)", fontSize: 12 }}>⌕</span>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search company, role, archetype…"
          style={{
            flex: 1, background: "transparent", border: "none", outline: "none",
            color: t.text, fontFamily: "var(--sans)", fontSize: 13,
          }}
        />
        <span style={{
          color: t.muted, fontFamily: "var(--mono)", fontSize: 11,
          border: `1px solid ${t.surface2}`, borderRadius: 4, padding: "1px 5px",
        }}>/</span>
      </div>

      <button onClick={() => setRefreshKey(refreshKey + 1)} style={{
        background: t.base, border: `1px solid ${t.surface}`,
        color: t.subtext, fontFamily: "var(--mono)", fontSize: 12,
        padding: "6px 12px", borderRadius: 7, cursor: "pointer",
        display: "inline-flex", alignItems: "center", gap: 6,
      }}>
        <span style={{ color: t.green }}>●</span> live · synced 2m ago
      </button>
    </div>
  );
}

// Stats strip
function Stats({ t, apps }) {
  const isMobile = useIsMobile();
  const total = apps.length;
  const counts = apps.reduce((acc, a) => {
    acc[a.status] = (acc[a.status] || 0) + 1;
    return acc;
  }, {});
  const top = apps.filter(a => a.score != null && a.score >= 4.0).length;

  const scoredApps = apps.filter(a => a.score != null);
  const avg = scoredApps.length > 0
    ? (scoredApps.reduce((s, a) => s + a.score, 0) / scoredApps.length).toFixed(2)
    : "—";

  const APPLIED_STATUSES = ["Applied", "Responded", "Interview", "Offer", "Rejected"];
  const RESPONSE_STATUSES = ["Responded", "Interview", "Offer", "Rejected"];
  const INTERVIEW_STATUSES = ["Interview", "Offer"];
  const totalApplied = apps.filter(a => APPLIED_STATUSES.includes(a.status)).length;
  const gotResponse = apps.filter(a => RESPONSE_STATUSES.includes(a.status)).length;
  const gotInterview = apps.filter(a => INTERVIEW_STATUSES.includes(a.status)).length;
  const responseRate = totalApplied > 0 ? (gotResponse / totalApplied * 100).toFixed(1) : "0.0";
  const interviewRate = totalApplied > 0 ? (gotInterview / totalApplied * 100).toFixed(1) : "0.0";

  const active = (counts.Applied || 0) + (counts.Interview || 0) + (counts.Responded || 0);

  const items = [
    { label: "total tracked", value: total, sub: "", color: t.text, spark: null },
    { label: "active pipeline", value: active, sub: `${counts.Interview || 0} interviews scheduled`, color: t.blue, spark: null },
    { label: "avg score (rated)", value: avg, sub: `${top} ≥ 4.0/5`, color: t.green, spark: null },
    { label: "response rate", value: `${responseRate}%`, sub: `${gotResponse} / ${totalApplied} applied`, color: t.sky, spark: null },
    { label: "interview rate", value: `${interviewRate}%`, sub: `${gotInterview} / ${totalApplied} applied`, color: t.peach, spark: null },
  ];

  return (
    <div style={{
      display: isMobile ? "flex" : "grid",
      gridTemplateColumns: isMobile ? undefined : "repeat(5, 1fr)",
      overflowX: isMobile ? "auto" : undefined,
      scrollbarWidth: "none",
      gap: isMobile ? 10 : 14,
      padding: isMobile ? "10px 14px 4px" : "16px 22px 8px",
    }}>
      {items.map((it, i) => (
        <div key={i} style={{
          background: t.mantle,
          border: `1px solid ${t.surface}`,
          borderRadius: 9,
          padding: "14px 16px",
          ...(isMobile ? { minWidth: 150, flexShrink: 0 } : {}),
        }}>
          <div style={{ color: t.subtext, fontFamily: "var(--mono)", fontSize: 11, letterSpacing: 0.4, textTransform: "uppercase" }}>
            {it.label}
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginTop: 6 }}>
            <div style={{ color: it.color, fontFamily: "var(--mono)", fontSize: 26, fontWeight: 600, letterSpacing: -0.5, fontFeatureSettings: '"tnum"' }}>
              {it.value}
            </div>
            <Sparkline data={it.spark} w={70} h={24} color={it.color} />
          </div>
          <div style={{ color: t.muted, fontSize: 12, marginTop: 4 }}>{it.sub}</div>
        </div>
      ))}
    </div>
  );
}

window.Sparkline = Sparkline;
window.ScoreChip = ScoreChip;
window.StatusPill = StatusPill;
window.Tab = Tab;
window.TopBar = TopBar;
window.Stats = Stats;
window.THEMES = THEMES;
