import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Project } from "../lib/types";
import { b64uEnc, leaf, timeAgo, hashColor } from "../lib/util";
import { isConfigured } from "../lib/settings";
import { isConnected, onStateChange } from "../lib/transport";
import { t } from "../lib/i18n";
import Icon from "../components/Icon";
import Logo from "../components/Logo";
import { log, friendlyError } from "../lib/log";
import PullToRefresh from "../components/PullToRefresh";

export default function Projects() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [connected, setConnected] = useState(isConnected());
  const needsSetup = !isConfigured() && !connected;

  useEffect(() => onStateChange(() => setConnected(isConnected())), []);

  const load = () => {
    if (needsSetup) { setProjects([]); return Promise.resolve(); }
    setProjects(null);
    setErr(null);
    return api.projects().then(setProjects).catch(e => { log.error("ui", "load projects failed", e?.message || e); setErr(friendlyError(e)); });
  };

  useEffect(() => { load(); }, [needsSetup]);

  const filtered = (projects || []).filter(p => {
    const n = leaf(p.worktree).toLowerCase();
    return !q || n.includes(q.toLowerCase());
  });

  return (
    <div className="screen">
      <div className="topbar">
        <div className="title">{t("projects.title")}<div className="sub">{projects ? projects.length + " projects" : ""}</div></div>
      </div>
      <PullToRefresh onRefresh={load}>
        <div className="content">
          {err && <div className="errbox" style={{ margin: "12px 16px" }}>{err}</div>}
          {needsSetup && (
            <div style={{ margin: "14px 16px 0", padding: "14px 16px", borderRadius: "var(--r-md)", background: "var(--accent-bg)", border: "1px solid var(--accent-line)", display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
                <span style={{ color: "var(--accent)", display: "flex", marginTop: 1 }}><Icon name="qr" size={18} strokeWidth={1.8} /></span>
                <div style={{ fontSize: 13.5, lineHeight: 1.5, color: "var(--accent-2)" }}>
                  Pair with your desktop gateway to see opencode projects here.
                </div>
              </div>
              <button className="btn" style={{ marginTop: 6, background: "var(--accent)" }} onClick={() => (location.hash = "#/settings")}>
                Open Settings
              </button>
            </div>
          )}
          {!needsSetup && (
            <div className="search-bar">
              <input className="search-input" placeholder={t("projects.search")} value={q} onChange={e => setQ(e.target.value)} />
            </div>
          )}
          <div className="list">
            {!needsSetup && (
              <button className="row" onClick={() => (location.hash = "#/browse")}>
                <div className="row-icon" style={{ background: "var(--surface-2)", color: "var(--muted)" }}><Icon name="browse" size={22} strokeWidth={1.6} /></div>
                <div className="row-body">
                  <div className="row-title">Browse folders…</div>
                  <div className="row-sub">Open opencode in any folder</div>
                </div>
                <div className="row-chev">›</div>
              </button>
            )}
            {!projects && !err && !needsSetup && <div className="spinner" />}
            {projects && filtered.length === 0 && !needsSetup && (
              <div className="empty-state">
                <div className="empty-icon" style={{ marginBottom: 8 }}><Logo size={56} showText={false} /></div>
                <div className="et">No projects yet</div>
                <div className="ed">{t("projects.empty")}</div>
              </div>
            )}
            {filtered.map((p, i) => {
              const name = leaf(p.worktree);
              const [c1, c2] = hashColor(p.worktree);
              return (
                <div key={p.id}>
                  {i > 0 && <div className="divider" />}
                  <button className="row" onClick={() => (location.hash = "#/p/" + b64uEnc(p.worktree))}>
                    <div className="row-icon" style={{ background: `linear-gradient(135deg,${c1},${c2})` }}>{name.slice(0, 2).toUpperCase()}</div>
                    <div className="row-body">
                      <div className="row-title">{name}</div>
                      <div className="row-sub">{(p.vcs || "folder") + " · " + timeAgo(p.time?.updated)}</div>
                    </div>
                    <div className="row-chev">›</div>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </PullToRefresh>
    </div>
  );
}
