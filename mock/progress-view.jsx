/* global React */
const { useState: useStateG } = React;

function Bar({ label, count, max, color, t, total, showPct = true }) {
  const w = max > 0 ? (count / max) * 100 : 0;
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "110px 1fr 70px 60px", alignItems: "center", gap: 12, padding: "6px 0" }}>
      <div style={{ color: t.text, fontFamily: "var(--mono)", fontSize: 12 }}>{label}</div>
      <div style={{ background: `${t.surface}66`, borderRadius: 3, height: 18, overflow: "hidden", position: "relative" }}>
        <div style={{
          width: `${w}%`, height: "100%", background: `linear-gradient(90deg, ${color}cc, ${color})`,
          borderRadius: 3, transition: "width 400ms ease",
        }} />
      </div>
      <div style={{ color: t.subtext, fontFamily: "var(--mono)", fontSize: 12, textAlign: "right", fontFeatureSettings: '"tnum"' }}>
        {count}
      </div>
      {showPct && (
        <div style={{ color: t.muted, fontFamily: "var(--mono)", fontSize: 11, textAlign: "right", fontFeatureSettings: '"tnum"' }}>
          {pct.toFixed(1)}%
        </div>
      )}
    </div>
  );
}

function Card({ t, title, sub, children, accent }) {
  return (
    <div style={{
      background: t.mantle, border: `1px solid ${t.surface}`, borderRadius: 10, padding: 18,
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div style={{ color: accent || t.text, fontFamily: "var(--mono)", fontSize: 12, letterSpacing: 0.6, textTransform: "uppercase", fontWeight: 600 }}>
          {title}
        </div>
        {sub && <div style={{ color: t.muted, fontFamily: "var(--mono)", fontSize: 11 }}>{sub}</div>}
      </div>
      {children}
    </div>
  );
}

function FunnelCard({ t }) {
  const stages = window.FUNNEL;
  if (!stages || stages.length === 0) {
    return <Card t={t} title="Pipeline funnel" sub="top → bottom" accent={t.sky}><div style={{ color: t.muted, fontFamily: "var(--mono)", fontSize: 12, padding: "8px 0" }}>no data</div></Card>;
  }
  const max = stages[0].count;
  const colors = [t.lavender, t.blue, t.sky, t.green, t.peach, t.yellow];
  return (
    <Card t={t} title="Pipeline funnel" sub="top → bottom" accent={t.sky}>
      <div>
        {stages.map((s, i) => (
          <Bar key={s.label} label={s.label} count={s.count} max={max} color={colors[i]} t={t} total={max} />
        ))}
      </div>
    </Card>
  );
}

function ScoreCard({ t }) {
  const buckets = window.SCORE_BUCKETS;
  if (!buckets || buckets.length === 0) {
    return <Card t={t} title="Score distribution" sub="0 rated" accent={t.green}><div style={{ color: t.muted, fontFamily: "var(--mono)", fontSize: 12, padding: "8px 0" }}>no data</div></Card>;
  }
  const total = buckets.reduce((s, b) => s + b.count, 0);
  const max = Math.max(...buckets.map(b => b.count));
  const colors = [t.green, t.sky, t.yellow, t.peach, t.red];
  return (
    <Card t={t} title="Score distribution" sub={`${total} rated`} accent={t.green}>
      <div>
        {buckets.map((b, i) => (
          <Bar key={b.label} label={b.label} count={b.count} max={max} color={colors[i]} t={t} total={total} />
        ))}
      </div>
    </Card>
  );
}

function ArchetypeCard({ t }) {
  const arch = window.ARCHETYPES;
  if (!arch || arch.length === 0) {
    return <Card t={t} title="Roles by archetype" sub="0 apps" accent={t.mauve}><div style={{ color: t.muted, fontFamily: "var(--mono)", fontSize: 12, padding: "8px 0" }}>no data</div></Card>;
  }
  const max = Math.max(...arch.map(a => a.count));
  const total = arch.reduce((s, a) => s + a.count, 0);
  return (
    <Card t={t} title="Roles by archetype" sub={`${total} apps · ${arch.length} categories`} accent={t.mauve}>
      <div>
        {arch.map((a, i) => (
          <Bar key={a.label} label={a.label} count={a.count} max={max}
               color={i % 2 ? t.mauve : t.lavender} t={t} total={total} showPct={false} />
        ))}
      </div>
    </Card>
  );
}

function WeeklyCard({ t }) {
  const weeks = window.WEEKLY;
  if (!weeks || weeks.length === 0) {
    return <Card t={t} title="Weekly activity" sub="last 6 weeks" accent={t.peach}><div style={{ color: t.muted, fontFamily: "var(--mono)", fontSize: 12, padding: "8px 0" }}>no data</div></Card>;
  }
  const max = Math.max(...weeks.map(w => w.count));
  return (
    <Card t={t} title="Weekly activity" sub="last 6 weeks" accent={t.peach}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", height: 140, gap: 8, paddingTop: 8 }}>
        {weeks.map((w, i) => {
          const h = (w.count / max) * 100;
          return (
            <div key={w.week} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <div style={{ color: t.subtext, fontFamily: "var(--mono)", fontSize: 11, fontFeatureSettings: '"tnum"' }}>{w.count}</div>
              <div style={{
                width: "100%", height: `${h}%`, minHeight: 4,
                background: `linear-gradient(180deg, ${t.peach}, ${t.peach}66)`,
                borderRadius: "4px 4px 1px 1px",
              }} />
              <div style={{ color: t.muted, fontFamily: "var(--mono)", fontSize: 10.5 }}>{w.week}</div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function RatesCard({ t }) {
  const apps = Array.isArray(window.APPS) ? window.APPS : [];
  const totalApplied = apps.filter(a => ["Applied", "Responded", "Interview", "Offer", "Rejected"].includes(a.status)).length;
  const gotResponse = apps.filter(a => ["Responded", "Interview", "Offer", "Rejected"].includes(a.status)).length;
  const gotInterview = apps.filter(a => ["Interview", "Offer"].includes(a.status)).length;
  const gotOffer = apps.filter(a => a.status === "Offer").length;
  const rates = [
    { label: "Response",  value: totalApplied > 0 ? gotResponse  / totalApplied * 100 : 0, color: t.sky,   num: gotResponse,  denom: totalApplied },
    { label: "Interview", value: totalApplied > 0 ? gotInterview / totalApplied * 100 : 0, color: t.green, num: gotInterview, denom: totalApplied },
    { label: "Offer",     value: totalApplied > 0 ? gotOffer     / totalApplied * 100 : 0, color: t.peach, num: gotOffer,     denom: totalApplied },
  ];
  return (
    <Card t={t} title="Conversion rates" sub="from applied" accent={t.blue}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
        {rates.map(r => (
          <div key={r.label} style={{
            background: t.base, border: `1px solid ${t.surface}`, borderRadius: 8, padding: 12,
            display: "flex", flexDirection: "column", gap: 6,
          }}>
            <div style={{ color: t.muted, fontFamily: "var(--mono)", fontSize: 11, letterSpacing: 0.4, textTransform: "uppercase" }}>
              {r.label}
            </div>
            <div style={{ color: r.color, fontFamily: "var(--mono)", fontSize: 24, fontWeight: 600, fontFeatureSettings: '"tnum"' }}>
              {r.value.toFixed(1)}%
            </div>
            <div style={{ color: t.muted, fontFamily: "var(--mono)", fontSize: 11, fontFeatureSettings: '"tnum"' }}>
              {r.num} / {r.denom}
            </div>
            {/* mini progress */}
            <div style={{ background: `${t.surface}66`, height: 4, borderRadius: 2, overflow: "hidden" }}>
              <div style={{ width: `${Math.min(r.value, 100)}%`, height: "100%", background: r.color }} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function UpcomingCard({ t, onOpen }) {
  const items = window.__live?.calendarEvents || window.__live?.interviewEvents || window.UPCOMING || [];
  const n = new Date();
  const todayLocal = `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`;
  const futureItems = items.filter(u => !u.date || u.date >= todayLocal);
  return (
    <Card t={t} title="Upcoming · 7 days" sub={`${futureItems.length} scheduled`} accent={t.green}>
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {futureItems.map((u, i) => {
          const a = window.APPS.find(x => x.n === u.n);
          return (
            <div key={i} onClick={() => a && onOpen(a)} style={{
              display: "grid", gridTemplateColumns: "70px 60px 1fr auto",
              alignItems: "center", gap: 10,
              padding: "10px 0",
              borderBottom: i < futureItems.length - 1 ? `1px solid ${t.surface}` : "none",
              cursor: a ? "pointer" : "default",
            }}>
              <div style={{ color: t.subtext, fontFamily: "var(--mono)", fontSize: 12 }}>{u.when || u.date}</div>
              <div style={{ color: t.green, fontFamily: "var(--mono)", fontSize: 12, fontFeatureSettings: '"tnum"' }}>{u.time}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: t.text, fontSize: 13, fontWeight: 600 }}>{u.title || u.co}</div>
                <div style={{ color: t.muted, fontSize: 11.5, fontFamily: "var(--mono)" }}>{u.kind} · {u.who}</div>
              </div>
              {u.n ? <div style={{ color: t.muted, fontFamily: "var(--mono)", fontSize: 11 }}>#{u.n}</div> : <div />}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function ProgressView({ t, onOpen, density }) {
  return (
    <div style={{ padding: "8px 22px 22px", display: "grid",
      gridTemplateColumns: "1.1fr 1fr 1fr",
      gridTemplateRows: "auto auto auto",
      gap: 14 }}>
      <FunnelCard t={t} />
      <ScoreCard t={t} />
      <ArchetypeCard t={t} />
      <div style={{ gridColumn: "span 1" }}><WeeklyCard t={t} /></div>
      <div style={{ gridColumn: "span 2" }}><RatesCard t={t} /></div>
      <div style={{ gridColumn: "span 3" }}>
        {window.CalendarView
          ? <window.CalendarView t={t} onOpen={onOpen} density={density} />
          : <UpcomingCard t={t} onOpen={onOpen} />}
      </div>
    </div>
  );
}

window.ProgressView = ProgressView;
