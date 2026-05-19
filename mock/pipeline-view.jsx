/* global React */
const { useState: useStateP, useMemo: useMemoP } = React;

const STATUSES = ["all", "Interview", "Applied", "Responded", "Evaluated", "Rejected", "Discarded", "SKIP"];

function PipelineView({ t, density, search, onOpen }) {
  const [filter, setFilter] = useStateP("all");
  const [sort, setSort] = useStateP("date");

  const apps = window.APPS;
  const counts = useMemoP(() => {
    const c = { all: apps.length };
    for (const s of STATUSES.slice(1)) c[s] = apps.filter(a => a.status === s).length;
    return c;
  }, [apps]);

  const filtered = useMemoP(() => {
    let r = apps.slice();
    if (filter !== "all") r = r.filter(a => a.status === filter);
    if (search) {
      const q = search.toLowerCase();
      r = r.filter(a =>
        a.company.toLowerCase().includes(q) ||
        a.role.toLowerCase().includes(q) ||
        (a.archetype || "").toLowerCase().includes(q)
      );
    }
    if (sort === "score") r.sort((a, b) => (b.score || 0) - (a.score || 0));
    else if (sort === "date") r.sort((a, b) => b.date.localeCompare(a.date));
    else if (sort === "company") r.sort((a, b) => a.company.localeCompare(b.company));
    return r;
  }, [apps, filter, search, sort]);

  const rowH = density === "compact" ? 38 : density === "cozy" ? 52 : 62;
  const rowPad = density === "compact" ? "0 18px" : "0 18px";

  return (
    <div style={{ padding: "8px 22px 22px", display: "flex", gap: 14, alignItems: "flex-start" }}>
      {window.ScanQueue && <window.ScanQueue t={t} onPromote={() => {}} />}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
      {/* filter row */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        {STATUSES.map(s => (
          <Tab key={s} label={s.toLowerCase()} count={counts[s] || 0}
               active={filter === s} onClick={() => setFilter(s)} t={t} />
        ))}
        <div style={{ flex: 1 }} />
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          color: t.muted, fontFamily: "var(--mono)", fontSize: 11,
        }}>
          <span>sort</span>
          <select value={sort} onChange={e => setSort(e.target.value)} style={{
            background: t.mantle, color: t.text, border: `1px solid ${t.surface}`,
            borderRadius: 5, padding: "4px 8px", fontFamily: "var(--mono)", fontSize: 11,
          }}>
            <option value="date">date</option>
            <option value="score">score</option>
            <option value="company">company</option>
          </select>
        </div>
      </div>

      {/* table */}
      <div style={{
        background: t.mantle,
        border: `1px solid ${t.surface}`,
        borderRadius: 10,
        overflow: "hidden",
      }}>
        {/* header */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "60px 110px 1.4fr 2fr 90px 130px 1.4fr 130px 30px",
          alignItems: "center", gap: 12,
          padding: "10px 18px",
          background: t.crust,
          borderBottom: `1px solid ${t.surface}`,
          color: t.muted, fontFamily: "var(--mono)", fontSize: 10.5,
          letterSpacing: 0.6, textTransform: "uppercase",
        }}>
          <div>#</div>
          <div>date</div>
          <div>company</div>
          <div>role</div>
          <div>score</div>
          <div>status</div>
          <div>tldr</div>
          <div>comp</div>
          <div></div>
        </div>

        {/* rows */}
        <div style={{ maxHeight: density === "compact" ? 480 : 520, overflowY: "auto" }}>
          {filtered.map((a, i) => (
            <div key={a.n} onClick={() => onOpen(a)} style={{
              display: "grid",
              gridTemplateColumns: "60px 110px 1.4fr 2fr 90px 130px 1.4fr 130px 30px",
              alignItems: "center", gap: 12,
              height: rowH,
              padding: rowPad,
              borderBottom: `1px solid ${t.surface}`,
              background: i % 2 === 0 ? "transparent" : `${t.surface}33`,
              cursor: "pointer",
              transition: "background 120ms",
            }} onMouseEnter={e => e.currentTarget.style.background = `${t.lavender}10`}
               onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? "transparent" : `${t.surface}33`}>
              <div style={{ color: t.muted, fontFamily: "var(--mono)", fontSize: 12, fontFeatureSettings: '"tnum"' }}>
                #{a.n}
              </div>
              <div style={{ color: t.subtext, fontFamily: "var(--mono)", fontSize: 12, fontFeatureSettings: '"tnum"' }}>
                {a.date.slice(5)}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: t.text, fontWeight: 600, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {a.company}
                </div>
                {density !== "compact" && (
                  <div style={{ color: t.muted, fontSize: 11, fontFamily: "var(--mono)" }}>
                    {a.archetype}
                  </div>
                )}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: t.subtext, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {a.role}
                </div>
                {density === "comfortable" && (
                  <div style={{ color: t.muted, fontSize: 11, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {a.remote}
                  </div>
                )}
              </div>
              <div><ScoreChip value={a.score} t={t} /></div>
              <div><StatusPill status={a.status} t={t} /></div>
              <div style={{ color: t.subtext, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 6 }}>
                {a.tldr}
              </div>
              <div style={{ color: t.subtext, fontFamily: "var(--mono)", fontSize: 11.5, fontFeatureSettings: '"tnum"' }}>
                {a.comp}
              </div>
              <div style={{ color: t.muted, fontFamily: "var(--mono)", fontSize: 14 }}>›</div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: 40, color: t.muted, fontFamily: "var(--mono)", fontSize: 13, textAlign: "center" }}>
              no matches
            </div>
          )}
        </div>

        {/* footer */}
        <div style={{
          padding: "8px 18px",
          background: t.crust,
          borderTop: `1px solid ${t.surface}`,
          display: "flex", justifyContent: "space-between",
          color: t.muted, fontFamily: "var(--mono)", fontSize: 11,
        }}>
          <div>showing {filtered.length} of {apps.length} · filter: {filter} · sort: {sort}</div>
          <div style={{ display: "flex", gap: 14 }}>
            <span><kbd style={kbd(t)}>j</kbd>/<kbd style={kbd(t)}>k</kbd> nav</span>
            <span><kbd style={kbd(t)}>↵</kbd> open</span>
            <span><kbd style={kbd(t)}>s</kbd> status</span>
            <span><kbd style={kbd(t)}>r</kbd> refresh</span>
            <span><kbd style={kbd(t)}>q</kbd> quit</span>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}

function kbd(t) {
  return {
    background: t.base, border: `1px solid ${t.surface2}`,
    borderRadius: 3, padding: "1px 5px", color: t.subtext, fontSize: 10.5,
    fontFamily: "var(--mono)",
  };
}

window.PipelineView = PipelineView;
