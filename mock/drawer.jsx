/* global React */
const { useEffect: useEffectD, useState: useStateD, useMemo: useMemoD } = React;

const STATUSES = ['Evaluated','Applied','Responded','Interview','Offer','Rejected','Discarded'];

function Drawer({ app, t, onClose }) {
  const [statusPicker, setStatusPicker] = useStateD(false);
  const [saving, setSaving] = useStateD(false);
  const [bodyView, setBodyView] = useStateD('main'); // 'main' | 'report' | 'prep-file'
  const [reportContent, setReportContent] = useStateD(null);
  const [reportLoading, setReportLoading] = useStateD(false);
  const [prepContent, setPrepContent] = useStateD(null);
  const [prepTitle, setPrepTitle] = useStateD('');
  const [prepLoading, setPrepLoading] = useStateD(false);

  const prepFiles = useMemoD(() => {
    if (!app) return [];
    const all = window.PREP || [];
    const co = app.company.toLowerCase();
    return all.filter(p => p.folder.toLowerCase().startsWith(co));
  }, [app]);

  useEffectD(() => {
    setStatusPicker(false);
    setSaving(false);
    setBodyView('main');
    setReportContent(null);
    setReportLoading(false);
    setPrepContent(null);
    setPrepTitle('');
    setPrepLoading(false);
  }, [app]);

  useEffectD(() => {
    if (!app) return;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (bodyView !== 'main') { setBodyView('main'); return; }
        if (statusPicker) { setStatusPicker(false); return; }
        onClose();
        return;
      }
      if (bodyView !== 'main' || statusPicker || e.metaKey || e.ctrlKey) return;
      if (e.key === 'Enter') { openReport(); return; }
      if (e.key === 'u') { openUrl(); return; }
      if (e.key === 's') { setStatusPicker(true); return; }
      if (e.key === 'p') { viewPdf(); return; }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [app, onClose, statusPicker, bodyView]);

  function openReport() {
    if (!app.report) return;
    setReportLoading(true);
    fetch(`/api/report?file=${encodeURIComponent(app.report)}`)
      .then(r => r.text())
      .then(text => { setReportContent(text); setBodyView('report'); setReportLoading(false); })
      .catch(() => setReportLoading(false));
  }

  function openPrepFile(prepFile) {
    if (prepFile.type === 'pdf') {
      window.open(`/api/prep?file=${encodeURIComponent(prepFile.file)}`, '_blank');
      return;
    }
    setPrepLoading(true);
    fetch(`/api/prep?file=${encodeURIComponent(prepFile.file)}`)
      .then(r => r.text())
      .then(text => { setPrepContent(text); setPrepTitle(prepFile.name); setBodyView('prep-file'); setPrepLoading(false); })
      .catch(() => setPrepLoading(false));
  }

  function openUrl() {
    if (app.url) window.open(app.url, '_blank');
  }

  function viewPdf() {
    if (!app.pdf) return;
    window.open(`/api/pdf?company=${encodeURIComponent(app.company)}`, '_blank');
  }

  async function applyStatus(newStatus) {
    setSaving(true);
    await window.__live?.updateApp(app.n, newStatus, app.note || '');
    setSaving(false);
    setStatusPicker(false);
    window.__live?.refresh();
  }

  const isMobile = window.useIsMobile();

  if (!app) return null;

  const Field = ({ k, v, mono = true }) => (
    <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: 12, padding: "6px 0" }}>
      <div style={{ color: t.muted, fontFamily: "var(--mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 }}>{k}</div>
      <div style={{ color: t.text, fontFamily: mono ? "var(--mono)" : "var(--sans)", fontSize: 13 }}>{v}</div>
    </div>
  );

  const actionButtons = [
    { k: "↵", label: "open report", color: t.blue,  onClick: openReport, disabled: !app.report },
    { k: "u", label: "open url",    color: t.sky,   onClick: openUrl,    disabled: !app.url },
    { k: "s", label: "set status",  color: t.green,  onClick: () => setStatusPicker(true), disabled: false },
    { k: "p", label: "view pdf",    color: t.mauve,  onClick: viewPdf,    disabled: !app.pdf },
  ];

  return (
    <>
      <div onClick={onClose} style={{
        position: "fixed", inset: 0, background: "#00000088",
        zIndex: 50, animation: "fade 160ms ease",
      }} />
      <div style={{
        position: "fixed",
        ...(isMobile ? {
          left: 0, right: 0, bottom: 0, top: "auto",
          height: "88vh",
          borderRadius: "16px 16px 0 0",
          borderTop: `1px solid ${t.surface2}`,
          boxShadow: "0 -12px 40px #00000055",
          animation: "slideUp 220ms cubic-bezier(.2,.8,.2,1)",
        } : {
          top: 0, right: 0, bottom: 0,
          width: 520,
          borderLeft: `1px solid ${t.surface2}`,
          boxShadow: "-12px 0 40px #00000055",
          animation: "slide 200ms cubic-bezier(.2,.8,.2,1)",
        }),
        background: t.mantle,
        zIndex: 51,
        display: "flex", flexDirection: "column",
      }}>
        {/* header */}
        <div style={{
          padding: "16px 22px", borderBottom: `1px solid ${t.surface}`,
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <div style={{ color: t.muted, fontFamily: "var(--mono)", fontSize: 12 }}>#{app.n}</div>
          <div style={{ color: t.subtext, fontFamily: "var(--mono)", fontSize: 12 }}>·</div>
          <div style={{ color: t.subtext, fontFamily: "var(--mono)", fontSize: 12, fontFeatureSettings: '"tnum"' }}>{app.date}</div>
          <div style={{ flex: 1 }} />
          <StatusPill status={app.status} t={t} />
          <button onClick={onClose} style={{
            background: "transparent", border: `1px solid ${t.surface2}`,
            color: t.subtext, padding: "4px 10px", borderRadius: 5,
            fontFamily: "var(--mono)", fontSize: 11, cursor: "pointer",
          }}>esc</button>
        </div>

        {/* title */}
        <div style={{ padding: "20px 22px 12px", borderBottom: `1px solid ${t.surface}` }}>
          <div style={{ color: t.text, fontSize: 22, fontWeight: 600, letterSpacing: -0.3 }}>
            {app.company}
          </div>
          <div style={{ color: t.subtext, fontSize: 14, marginTop: 4 }}>
            {app.role}
          </div>
          <div style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 14 }}>
            <ScoreChip value={app.score} t={t} />
            <div style={{ color: t.muted, fontFamily: "var(--mono)", fontSize: 12 }}>·</div>
            <div style={{ color: t.subtext, fontFamily: "var(--mono)", fontSize: 12 }}>{app.archetype}</div>
            <div style={{ color: t.muted, fontFamily: "var(--mono)", fontSize: 12 }}>·</div>
            <div style={{ color: t.subtext, fontFamily: "var(--mono)", fontSize: 12 }}>{app.remote}</div>
          </div>
        </div>

        {/* body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 22px" }}>
          <style>{`
            .md-body h1,.md-body h2,.md-body h3{color:${t.text};margin:1em 0 .4em;font-weight:600;line-height:1.3}
            .md-body h1{font-size:17px}.md-body h2{font-size:14px;color:${t.lavender}}.md-body h3{font-size:13px;color:${t.subtext}}
            .md-body p{color:${t.subtext};font-size:13px;line-height:1.65;margin:.5em 0}
            .md-body strong{color:${t.text};font-weight:600}
            .md-body em{color:${t.peach}}
            .md-body ul,.md-body ol{color:${t.subtext};font-size:13px;line-height:1.65;margin:.4em 0;padding-left:1.4em}
            .md-body li{margin:.2em 0}
            .md-body code{background:${t.surface};color:${t.sky};font-family:var(--mono);font-size:11.5px;padding:1px 5px;border-radius:3px}
            .md-body pre{background:${t.surface};border:1px solid ${t.surface2};border-radius:6px;padding:10px 12px;overflow-x:auto;margin:.8em 0}
            .md-body pre code{background:none;padding:0;font-size:11px}
            .md-body blockquote{border-left:3px solid ${t.blue};margin:.6em 0;padding:.2em .8em;color:${t.muted}}
            .md-body hr{border:none;border-top:1px solid ${t.surface};margin:1em 0}
            .md-body a{color:${t.blue};text-decoration:none}.md-body a:hover{text-decoration:underline}
            .md-body table{border-collapse:collapse;width:100%;font-size:12px;margin:.8em 0}
            .md-body th{background:${t.surface};color:${t.text};font-weight:600;padding:6px 10px;text-align:left;border:1px solid ${t.surface2}}
            .md-body td{color:${t.subtext};padding:5px 10px;border:1px solid ${t.surface2}}
          `}</style>

          {bodyView === 'report' ? (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <div style={{ color: t.blue, fontFamily: "var(--mono)", fontSize: 11, letterSpacing: 0.4, textTransform: "uppercase" }}>Evaluation Report</div>
                <button onClick={() => setBodyView('main')} style={{ background: "transparent", border: `1px solid ${t.surface2}`, color: t.subtext, padding: "2px 8px", borderRadius: 4, fontFamily: "var(--mono)", fontSize: 10, cursor: "pointer" }}>← back</button>
              </div>
              <div className="md-body" dangerouslySetInnerHTML={{ __html: window.marked ? window.marked.parse(reportContent || '') : (reportContent || '') }} />
            </div>

          ) : bodyView === 'prep-file' ? (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <div style={{ color: t.green, fontFamily: "var(--mono)", fontSize: 11, letterSpacing: 0.4, textTransform: "uppercase", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>{prepTitle}</div>
                <button onClick={() => setBodyView('main')} style={{ background: "transparent", border: `1px solid ${t.surface2}`, color: t.subtext, padding: "2px 8px", borderRadius: 4, fontFamily: "var(--mono)", fontSize: 10, cursor: "pointer", marginLeft: 8, flexShrink: 0 }}>← back</button>
              </div>
              <div className="md-body" dangerouslySetInnerHTML={{ __html: window.marked ? window.marked.parse(prepContent || '') : (prepContent || '') }} />
            </div>

          ) : (
            <>
              {/* tldr */}
              <div style={{ background: t.base, border: `1px solid ${t.surface}`, borderRadius: 8, padding: "12px 14px", marginBottom: 16 }}>
                <div style={{ color: t.lavender, fontFamily: "var(--mono)", fontSize: 11, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 6 }}>tldr</div>
                <div style={{ color: t.text, fontSize: 13.5, lineHeight: 1.55 }}>{app.tldr}</div>
              </div>

              {/* fields */}
              <div style={{ background: t.base, border: `1px solid ${t.surface}`, borderRadius: 8, padding: "8px 14px", marginBottom: 16 }}>
                <Field k="comp" v={app.comp} />
                <Field k="remote" v={app.remote} />
                <Field k="archetype" v={app.archetype} />
                <Field k="status" v={app.status} />
                <Field k="report" v={`reports/${app.n}-${app.company.toLowerCase().replace(/\s+/g,"-")}-${app.date}.md`} />
              </div>

              {/* interview prep files */}
              {prepFiles.length > 0 && (
                <div style={{ background: t.base, border: `1px solid ${t.surface}`, borderRadius: 8, padding: "8px 14px", marginBottom: 16 }}>
                  <div style={{ color: t.green, fontFamily: "var(--mono)", fontSize: 11, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 8 }}>
                    Interview Prep · {prepFiles.length}
                  </div>
                  {prepFiles.map((f, i) => (
                    <div key={i} onClick={() => openPrepFile(f)} style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "7px 0",
                      borderTop: i > 0 ? `1px solid ${t.surface}` : "none",
                      cursor: "pointer",
                    }}
                    onMouseEnter={e => e.currentTarget.style.opacity = "0.75"}
                    onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
                      <span style={{ fontSize: 13, flexShrink: 0 }}>{f.type === 'pdf' ? '📄' : '📝'}</span>
                      <span style={{ color: t.text, fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{f.name}</span>
                      <span style={{ color: t.muted, fontFamily: "var(--mono)", fontSize: 10, flexShrink: 0 }}>{f.type === 'pdf' ? '↗' : '›'}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* notes */}
              <div style={{ background: t.base, border: `1px solid ${t.surface}`, borderRadius: 8, padding: "12px 14px" }}>
                <div style={{ color: t.peach, fontFamily: "var(--mono)", fontSize: 11, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 6 }}>notes</div>
                <div style={{ color: t.subtext, fontSize: 13, lineHeight: 1.55 }}>{app.note}</div>
              </div>
            </>
          )}
        </div>

        {/* actions */}
        <div style={{
          padding: "12px 22px", borderTop: `1px solid ${t.surface}`,
          background: t.crust,
        }}>
          {statusPicker ? (
            <div>
              <div style={{ color: t.muted, fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 }}>
                Set status — current: {app.status}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {STATUSES.map(s => (
                  <button key={s} onClick={() => applyStatus(s)} disabled={saving} style={{
                    background: s === app.status ? `${t.green}22` : t.mantle,
                    border: `1px solid ${s === app.status ? t.green : t.surface2}`,
                    color: s === app.status ? t.green : t.subtext,
                    padding: "5px 10px", borderRadius: 5,
                    fontFamily: "var(--mono)", fontSize: 11, cursor: saving ? "wait" : "pointer",
                  }}>{s}</button>
                ))}
                <button onClick={() => setStatusPicker(false)} style={{
                  background: "transparent", border: `1px solid ${t.surface2}`,
                  color: t.muted, padding: "5px 10px", borderRadius: 5,
                  fontFamily: "var(--mono)", fontSize: 11, cursor: "pointer", marginLeft: "auto",
                }}>cancel</button>
              </div>
            </div>
          ) : (reportLoading || prepLoading) ? (
            <div style={{ color: t.muted, fontFamily: "var(--mono)", fontSize: 11, textAlign: "center", padding: "8px 0" }}>
              loading…
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              {actionButtons.map(b => (
                <button key={b.label} onClick={b.onClick} disabled={b.disabled} title={b.disabled ? `No ${b.label.split(" ")[1]} available` : ""} style={{
                  flex: 1, background: t.mantle, border: `1px solid ${t.surface2}`,
                  color: b.disabled ? t.muted : t.text,
                  padding: "8px 10px", borderRadius: 6,
                  fontFamily: "var(--mono)", fontSize: 11.5,
                  cursor: b.disabled ? "not-allowed" : "pointer",
                  opacity: b.disabled ? 0.45 : 1,
                  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
                }}>
                  <span style={{
                    color: b.disabled ? t.muted : b.color, fontWeight: 600,
                    border: `1px solid ${b.disabled ? t.muted : b.color}55`,
                    borderRadius: 3, padding: "0px 5px", fontSize: 10.5,
                  }}>{b.k}</span>
                  {b.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

window.Drawer = Drawer;
