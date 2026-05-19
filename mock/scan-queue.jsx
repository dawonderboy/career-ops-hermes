/* global React */
const { useState: useStateQ, useMemo: useMemoQ, useEffect: useEffectQ } = React;

const STATE_META = {
  queued:   { label: "Queued",   key: "subtext",  dot: "muted" },
  scanning: { label: "Scanning", key: "sky",      dot: "sky", pulse: true },
  scored:   { label: "Scored",   key: "green",    dot: "green" },
  failed:   { label: "Failed",   key: "red",      dot: "red" },
};

const STATE_ORDER = ["scanning", "scored", "failed", "queued"];

// ── Normalize raw SCAN_QUEUE data into a clean array.
// Guards against null, undefined, [], {}, and items with no URL.
function normalizeScanQueue(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(item => item && typeof item === "object" && typeof item.url === "string" && item.url.trim())
    .map(item => ({
      id:      item.id || item.url,
      added:   item.added || null,
      source:  item.source || srcDomain(item.url) || "unknown",
      company: (item.company && item.company !== "Unknown") ? item.company : null,
      state:   STATE_META[item.state] ? item.state : "queued",
      score:   typeof item.score === "number" ? item.score : null,
      error:   typeof item.error === "string" ? item.error : null,
      url:     item.url.trim(),
    }));
}

// ── Derive unified display state from a normalized queue array.
// Returns: { activeScan, queuedScans, isScanning, queueCount, displayState }
//   displayState: "idle" | "active" | "queued" | "mixed"
function deriveScanQueueState(queue) {
  if (!queue.length) {
    return { activeScan: null, queuedScans: [], isScanning: false, queueCount: 0, displayState: "idle" };
  }
  const activeScan = queue.find(i => i.state === "scanning") || null;
  const isScanning = !!activeScan;
  const queuedScans = queue.filter(i => i.state !== "scanning");
  const queueCount = queue.length;
  const displayState = isScanning && queuedScans.length === 0 ? "active"
    : !isScanning && queuedScans.length > 0 ? "queued"
    : isScanning ? "mixed"
    : "idle";
  return { activeScan, queuedScans, isScanning, queueCount, displayState };
}

function srcDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, "").split(".")[0]; }
  catch { return ""; }
}

function fmtAdded(ts) {
  if (!ts) return "";
  const today = new Date().toISOString().slice(0, 10);
  const [d, time] = ts.split(" ");
  if (d === today) return time || "";
  return ts.slice(5);
}

function StateDot({ state, t }) {
  const meta = STATE_META[state] || STATE_META.queued;
  const c = t[meta.dot] || t.muted;
  return (
    <span style={{
      width: 7, height: 7, borderRadius: "50%",
      background: c,
      boxShadow: meta.pulse ? `0 0 0 0 ${c}66` : "none",
      animation: meta.pulse ? "pulse 1.4s ease-out infinite" : "none",
      flexShrink: 0,
    }} />
  );
}

function ScanQueue({ t, onPromote }) {
  // React state — read from window.SCAN_QUEUE on each live-update event.
  // This prevents stale window global reads from keeping a company visible
  // after the authoritative queue (pipeline.md via /api/state) clears it.
  const [rawQueue, setRawQueue] = useStateQ(() => normalizeScanQueue(window.SCAN_QUEUE));

  useEffectQ(() => {
    const onUpdate = () => {
      setRawQueue(normalizeScanQueue(window.SCAN_QUEUE));
    };
    window.addEventListener("career-ops:live-update", onUpdate);
    // Also pick up any change that happened between render and this effect
    onUpdate();
    return () => window.removeEventListener("career-ops:live-update", onUpdate);
  }, []);

  const [stateFilter, setStateFilter] = useStateQ("all");
  const [openMenu, setOpenMenu] = useStateQ(null);

  const { activeScan, isScanning, queueCount, displayState } = deriveScanQueueState(rawQueue);

  const grouped = useMemoQ(() => {
    const g = { scanning: [], scored: [], failed: [], queued: [] };
    for (const item of rawQueue) {
      const k = g[item.state] ? item.state : "queued";
      g[k].push(item);
    }
    return g;
  }, [rawQueue]);

  // ── Idle / collapsed state ────────────────────────────────────────
  // When the queue is empty, render a compact single-row action strip
  // instead of the full 360px panel. This keeps the Pipeline table
  // layout clean while still surfacing the "Run scan" affordance.
  if (displayState === "idle") {
    return (
      <div style={{
        width: 360, flexShrink: 0,
        background: t.mantle, border: `1px solid ${t.surface}`, borderRadius: 10,
        display: "flex", flexDirection: "column",
        alignSelf: "flex-start",
        overflow: "hidden",
      }}>
        <style>{`@keyframes pulse { 0% { box-shadow: 0 0 0 0 currentColor; } 70% { box-shadow: 0 0 0 6px transparent; } 100% { box-shadow: 0 0 0 0 transparent; } }`}</style>
        <div style={{
          padding: "10px 14px",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <div style={{ color: t.muted, fontFamily: "var(--mono)", fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase", fontWeight: 600, flex: 1, minWidth: 0 }}>
            Scan queue
          </div>
          <div style={{ color: t.muted, fontFamily: "var(--mono)", fontSize: 10, opacity: 0.7 }}>
            idle
          </div>
          <button onClick={() => window.__live?.runScan()} style={{
            background: `${t.green}1a`, color: t.green,
            border: `1px solid ${t.green}66`, borderRadius: 5,
            padding: "4px 10px", fontFamily: "var(--mono)", fontSize: 11, fontWeight: 600,
            cursor: "pointer", display: "flex", alignItems: "center", gap: 5, flexShrink: 0,
          }}>
            🔍 Run scan
          </button>
        </div>
      </div>
    );
  }

  // ── Expanded state — only rendered when queue has real items ──────

  const counts = {
    all:      rawQueue.length,
    scanning: grouped.scanning.length,
    scored:   grouped.scored.length,
    failed:   grouped.failed.length,
    queued:   grouped.queued.length,
  };

  const visibleStates = stateFilter === "all" ? STATE_ORDER : [stateFilter];

  return (
    <div style={{
      width: 360, flexShrink: 0,
      background: t.mantle, border: `1px solid ${t.surface}`, borderRadius: 10,
      display: "flex", flexDirection: "column",
      alignSelf: "flex-start",
      maxHeight: "calc(100vh - 220px)",
      overflow: "hidden",
    }}>
      {/* keyframes for pulse */}
      <style>{`@keyframes pulse { 0% { box-shadow: 0 0 0 0 currentColor; } 70% { box-shadow: 0 0 0 6px transparent; } 100% { box-shadow: 0 0 0 0 transparent; } }`}</style>

      {/* Header */}
      <div style={{
        padding: "12px 14px",
        borderBottom: `1px solid ${t.surface}`,
        display: "flex", flexDirection: "column", gap: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ color: t.lavender, fontFamily: "var(--mono)", fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase", fontWeight: 600, whiteSpace: "nowrap" }}>
            Scan queue
          </div>
          <div style={{ color: t.muted, fontFamily: "var(--mono)", fontSize: 11, fontFeatureSettings: '"tnum"', whiteSpace: "nowrap" }}>
            {queueCount} items
          </div>
        </div>
        <button onClick={() => window.__live?.runPipeline()} style={{
          background: `${t.lavender}1a`, color: t.lavender,
          border: `1px solid ${t.lavender}66`, borderRadius: 5,
          padding: "6px 10px", fontFamily: "var(--mono)", fontSize: 11, fontWeight: 600,
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
        }}>
          ▶ Run pipeline now
        </button>
        <button onClick={() => window.__live?.runScan()} style={{
          background: `${t.green}1a`, color: t.green,
          border: `1px solid ${t.green}66`, borderRadius: 5,
          padding: "6px 10px", fontFamily: "var(--mono)", fontSize: 11, fontWeight: 600,
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
        }}>
          🔍 Run scan now
        </button>
        {/* state filter chips — only rendered when there are items */}
        {queueCount > 0 && (
          <div style={{ display: "flex", gap: 4, flexWrap: "nowrap", overflowX: "auto" }}>
            {["all", ...STATE_ORDER].map(s => {
              const active = stateFilter === s;
              const meta = s === "all" ? null : STATE_META[s];
              const c = meta ? t[meta.dot] : t.subtext;
              return (
                <button key={s} onClick={() => setStateFilter(s)} style={{
                  display: "flex", alignItems: "center", gap: 4,
                  background: active ? `${c}22` : "transparent",
                  border: `1px solid ${active ? c : t.surface}`,
                  borderRadius: 4, padding: "2px 7px",
                  color: active ? c : t.subtext,
                  fontFamily: "var(--mono)", fontSize: 10, cursor: "pointer",
                  whiteSpace: "nowrap", flexShrink: 0,
                }}>
                  {meta && <StateDot state={s} t={t} />}
                  <span>{s === "all" ? "all" : meta.label.toLowerCase()}</span>
                  <span style={{ color: t.muted, fontFeatureSettings: '"tnum"' }}>{counts[s]}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* List or idle state */}
      <div style={{ overflowY: "auto", flex: 1, padding: "4px 0" }}>
      {/* Items — only rendered when items actually exist */}
        {displayState !== "idle" && visibleStates.map(s => {
          const items = grouped[s];
          if (!items.length) return null;
          const meta = STATE_META[s];
          return (
            <div key={s} style={{ marginBottom: 4 }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "6px 14px 4px",
                color: t[meta.dot], fontFamily: "var(--mono)",
                fontSize: 9.5, letterSpacing: 0.6, textTransform: "uppercase", fontWeight: 700,
              }}>
                <StateDot state={s} t={t} />
                {meta.label}
                <span style={{ color: t.muted, fontWeight: 400 }}>· {items.length}</span>
              </div>
              {items.map(item => <QueueItem key={item.id} item={item} t={t}
                                              menuOpen={openMenu === item.id}
                                              onMenuToggle={() => setOpenMenu(openMenu === item.id ? null : item.id)}
                                              onPromote={onPromote} />)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function QueueItem({ item, t, menuOpen, onMenuToggle, onPromote }) {
  const meta = STATE_META[item.state] || STATE_META.queued;
  const c = t[meta.dot] || t.muted;

  return (
    <div style={{
      padding: "8px 14px",
      borderBottom: `1px solid ${t.surface}66`,
      display: "flex", flexDirection: "column", gap: 4,
      position: "relative",
      background: item.state === "scored" ? `${t.green}08` : "transparent",
    }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {/* row 1: company (full width) + menu button */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: t.text, fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
            {item.company || <span style={{ color: t.muted, fontStyle: "italic", fontWeight: 400 }}>unresolved</span>}
          </span>
          {item.state === "scored" && item.score != null && (
            <span style={{
              color: t.green, fontFamily: "var(--mono)", fontSize: 11, fontWeight: 700,
              fontFeatureSettings: '"tnum"',
              background: `${t.green}1a`, padding: "1px 6px", borderRadius: 3, flexShrink: 0,
            }}>
              {item.score.toFixed(1)}
            </span>
          )}
          <button onClick={onMenuToggle} style={{
            background: "transparent", border: "none", color: t.muted,
            cursor: "pointer", padding: "0 2px", fontSize: 14, lineHeight: 1, flexShrink: 0,
          }}>⋯</button>
        </div>

        {/* row 2: source · time */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, color: t.muted, fontFamily: "var(--mono)", fontSize: 10.5 }}>
          <span style={{ color: c, fontWeight: 600 }}>{item.source}</span>
          <span>·</span>
          <span style={{ fontFeatureSettings: '"tnum"' }}>{fmtAdded(item.added)}</span>
        </div>

        {/* row 3: error (only for failed) OR url preview */}
        {item.error ? (
          <div style={{
            color: t.red, fontFamily: "var(--mono)", fontSize: 10,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            ⚠ {item.error}
          </div>
        ) : (
          <div style={{
            color: t.subtext, fontFamily: "var(--mono)", fontSize: 10,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            opacity: 0.7,
          }}>
            {item.url.replace(/^https?:\/\//, "")}
          </div>
        )}
      </div>

      {menuOpen && (
        <>
          <div onClick={onMenuToggle} style={{ position: "fixed", inset: 0, zIndex: 60 }} />
          <div style={{
            position: "absolute", top: 30, right: 10, zIndex: 61,
            background: t.crust, border: `1px solid ${t.surface2}`, borderRadius: 6,
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)", padding: 4,
            display: "flex", flexDirection: "column", minWidth: 180,
          }}>
            {item.state !== "scanning" && (
              <MenuItem t={t} icon="▶" label="Run pipeline now" onClick={() => { window.__live?.runPipeline(); onMenuToggle(); }} />
            )}
            <MenuItem t={t} icon="↗" label="Open URL" onClick={() => { window.open(item.url, "_blank"); onMenuToggle(); }} />
            {item.state === "scored" && (
              <MenuItem t={t} icon="✓" label="Promote to Evaluated" onClick={onMenuToggle} accent={t.green} />
            )}
            <MenuItem t={t} icon="✕" label="Remove from queue" onClick={() => { window.__live?.removeFromQueue(item.url); onMenuToggle(); }} accent={t.red} />
          </div>
        </>
      )}
    </div>
  );
}

function MenuItem({ t, icon, label, onClick, accent }) {
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 8,
      background: "transparent", border: "none", color: accent || t.text,
      padding: "6px 10px", borderRadius: 4,
      fontFamily: "var(--mono)", fontSize: 11, cursor: "pointer", textAlign: "left",
    }} onMouseEnter={e => e.currentTarget.style.background = `${t.surface}66`}
       onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
      <span style={{ width: 12, textAlign: "center", color: accent || t.muted }}>{icon}</span>
      {label}
    </button>
  );
}

window.ScanQueue = ScanQueue;
