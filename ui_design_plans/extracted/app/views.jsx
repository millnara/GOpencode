/* GOpencode — sidebar, settings, sheets */

function Icon({ name, size = 18 }) {
  const s = size, sw = 1.7;
  const p = { width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: sw, strokeLinecap: "round", strokeLinejoin: "round" };
  switch (name) {
    case "search": return <svg {...p}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>;
    case "folder": return <svg {...p}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>;
    case "settings": return <svg {...p}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></svg>;
    case "plus": return <svg {...p}><path d="M12 5v14M5 12h14" /></svg>;
    case "back": return <svg {...p}><path d="M15 18l-6-6 6-6" /></svg>;
    case "menu": return <svg {...p}><path d="M4 6h16M4 12h16M4 18h16" /></svg>;
    case "dots": return <svg {...p}><circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" /></svg>;
    case "stop": return <svg {...p} fill="currentColor" stroke="none"><rect x="7" y="7" width="10" height="10" rx="2" /></svg>;
    case "send": return <svg {...p}><path d="M12 19V5M5 12l7-7 7 7" /></svg>;
    case "plug": return <svg {...p}><path d="M9 7V3M15 7V3M8 7h8v4a4 4 0 0 1-8 0zM12 15v6" /></svg>;
    case "git": return <svg {...p}><circle cx="6" cy="6" r="2.5" /><circle cx="6" cy="18" r="2.5" /><circle cx="18" cy="9" r="2.5" /><path d="M6 8.5v7M18 11.5c0 4-6 .5-6 4" /></svg>;
    case "image": return <svg {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9.5" r="1.5" /><path d="M21 16l-5-5L5 20" /></svg>;
    case "check": return <svg {...p}><path d="M5 12l4.5 4.5L19 7" /></svg>;
    default: return null;
  }
}

/* ---------------- Sidebar ---------------- */
function Sidebar({ projects, selProj, selSess, view, onSelectProject, onSelectSession, onOpenSettings, onNewSession }) {
  const [q, setQ] = React.useState("");
  const conn = window.GO.conn;
  const filtered = projects.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="mark">oc</div>
        <div className="who">
          <div className="n">GOpencode</div>
          <div className="s"><span className={"conn-dot " + (conn.p2p ? "p2p" : "ws")} /> {conn.p2p ? "P2P · mac-studio" : "connected"}</div>
        </div>
        <button className="icon-btn" onClick={onOpenSettings} title="Settings"><Icon name="settings" /></button>
      </div>

      <div className="side-search">
        <label className="search">
          <Icon name="search" size={16} />
          <input placeholder="Search projects…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>

      <div className="side-scroll scroll">
        <div className="side-group-label"><span>Projects</span></div>
        {filtered.map((p) => {
          const expanded = selProj && selProj.id === p.id;
          return (
            <div key={p.id}>
              <button className={"nav-item" + (expanded && view === "chat" ? " active" : "")} onClick={() => onSelectProject(p)}>
                <span className="av" style={{ background: `linear-gradient(150deg, ${p.c1}, ${p.c2})` }}>{p.name.slice(0, 2).toUpperCase()}</span>
                <span className="nav-body">
                  <span className="nav-title">{p.name}</span>
                  <span className="nav-sub">{p.vcs === "git" ? "⎇ " + p.branch : "folder"} · {p.sessions.length} sessions</span>
                </span>
                <span className="nav-meta">{window.GO.timeAgo(p.updated)}</span>
              </button>
              {expanded && (
                <div className="subsessions">
                  {p.sessions.map((s) => (
                    <button key={s.id} className={"nav-item" + (selSess && selSess.id === s.id && view === "chat" ? " active" : "")} onClick={() => onSelectSession(p, s)}>
                      <span className="av sm session">◆</span>
                      <span className="nav-body">
                        <span className="nav-title">{s.title}</span>
                        <span className="nav-sub">{window.GO.timeAgo(s.updated)}</span>
                      </span>
                    </button>
                  ))}
                  <button className="back-row" onClick={() => onNewSession(p)}><Icon name="plus" size={15} /> New session</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="side-foot">
        <button className={"sf-btn" + (view === "chat" ? " active" : "")} onClick={() => selSess && onSelectSession(selProj, selSess)}><Icon name="folder" size={16} /> Projects</button>
        <button className={"sf-btn" + (view === "settings" ? " active" : "")} onClick={onOpenSettings}><Icon name="settings" size={16} /> Settings</button>
      </div>
    </aside>
  );
}

/* ---------------- Settings ---------------- */
function Settings({ onBack }) {
  const [tested, setTested] = React.useState("idle"); // idle | testing | ok
  const [toggles, setToggles] = React.useState({ sound: true, notify: true, haptics: true, awake: true, pin: false });
  const tg = (k) => setToggles((t) => ({ ...t, [k]: !t[k] }));
  const conn = window.GO.conn;
  const test = () => { setTested("testing"); setTimeout(() => setTested("ok"), 1100); };
  const Toggle = ({ k, label, desc }) => (
    <div className="toggle-row">
      <div><div className="tl">{label}</div><div className="td">{desc}</div></div>
      <button className={"switch" + (toggles[k] ? " on" : "")} onClick={() => tg(k)} />
    </div>
  );
  return (
    <div className="settings-wrap scroll">
      <div className="settings">
        <h2>Settings</h2>
        <div className="lede">Connect to your opencode server and tune the experience.</div>

        <div className="set-card">
          <div className="sc-title">Connection</div>
          <div className="field"><div className="fl">Server URL</div><input type="text" defaultValue={conn.url} /></div>
          <div className="field" style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}><div className="fl">Username</div><input type="text" defaultValue={conn.user} /></div>
            <div style={{ flex: 1 }}><div className="fl">Password</div><input type="password" defaultValue="opencode-secret" /></div>
          </div>
          <div className="conn-test">
            {tested === "ok" && <><span className="cd" style={{ background: "var(--ok)" }} /><span style={{ color: "var(--ok)" }}>Connected · opencode 0.4.2 · 14 projects</span></>}
            {tested === "testing" && <><span className="spinner" style={{ width: 14, height: 14 }} /><span style={{ color: "var(--muted)" }}>Testing…</span></>}
            {tested === "idle" && <span style={{ color: "var(--fade)" }}>Not tested yet</span>}
          </div>
          <div style={{ padding: "10px 0 14px", display: "flex", gap: 10 }}>
            <button className={"btn secondary"} style={{ flex: 1 }} onClick={test}>Test connection</button>
            <button className="btn ok" style={{ flex: 1 }}>Save</button>
          </div>
        </div>

        <div className="set-card">
          <div className="sc-title">Notifications</div>
          <Toggle k="sound" label="Sound on completion" desc="Chime when a turn finishes" />
          <Toggle k="notify" label="Push notifications" desc="Notify when the agent is done" />
          <Toggle k="haptics" label="Haptics" desc="Vibrate on send & permissions" />
        </div>

        <div className="set-card">
          <div className="sc-title">Behaviour</div>
          <Toggle k="awake" label="Keep screen awake" desc="Stay on while streaming" />
          <Toggle k="pin" label="PIN lock" desc="Require a PIN when reopening" />
          <div className="field"><div className="fl">Language</div>
            <select defaultValue="en"><option value="en">English</option><option value="it">Italiano</option><option value="zh">繁體中文</option></select>
          </div>
        </div>

        <button className="btn secondary" onClick={onBack}>Back to session</button>
      </div>
    </div>
  );
}

/* ---------------- Sheets ---------------- */
function SheetShell({ title, sub, onClose, children }) {
  return (
    <div className="sheet-bg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet scroll">
        <div className="handle" />
        <h3>{title}</h3>
        {sub && <div className="sub-h">{sub}</div>}
        {children}
      </div>
    </div>
  );
}

function ModelSheet({ current, onPick, onClose }) {
  return (
    <SheetShell title="Model" sub="Every model from /config/providers" onClose={onClose}>
      {window.GO.providers.map((prov) => (
        <div key={prov.id}>
          <div className="prov-group"><span className="pi" style={{ background: prov.color }}>{prov.name[0]}</span>{prov.name}</div>
          {prov.models.map((m) => {
            const sel = current.modelId === m.id;
            return (
              <div key={m.id} className={"opt" + (sel ? " sel" : "")} onClick={() => { onPick({ providerId: prov.id, modelId: m.id }); onClose(); }}>
                <span>{m.label}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span className="meta">{m.tag}</span>
                  {sel && <Icon name="check" size={16} />}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </SheetShell>
  );
}

function AgentSheet({ current, onPick, onClose }) {
  return (
    <SheetShell title="Agent" onClose={onClose}>
      {window.GO.agents.map((a) => (
        <div key={a.name} className={"opt" + (current === a.name ? " sel" : "")} onClick={() => { onPick(a.name); onClose(); }}>
          <span><div style={{ fontWeight: 600 }}>{a.name}</div><div className="meta" style={{ fontFamily: "var(--font)", marginTop: 2 }}>{a.desc}</div></span>
          {current === a.name && <Icon name="check" size={16} />}
        </div>
      ))}
    </SheetShell>
  );
}

function SessionSheet({ onClose, onAction }) {
  const items = [
    { k: "fork", label: "⑂  Fork this session" },
    { k: "compact", label: "⊞  Compact context" },
    { k: "share", label: "↗  Share (copy link)" },
    { k: "shell", label: "⌘  Run shell command" },
    { k: "rename", label: "✎  Rename session" },
  ];
  return (
    <SheetShell title="Session" onClose={onClose}>
      {items.map((it) => <div key={it.k} className="opt" onClick={() => { onAction(it.k); onClose(); }}><span>{it.label}</span></div>)}
      <div className="opt danger" onClick={() => { onAction("delete"); onClose(); }}><span>✕  Delete session</span></div>
    </SheetShell>
  );
}

Object.assign(window, { Icon, Sidebar, Settings, ModelSheet, AgentSheet, SessionSheet, SheetShell });
