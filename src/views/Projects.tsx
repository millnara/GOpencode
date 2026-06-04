import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Project } from "../lib/types";
import { b64uEnc, leaf, timeAgo, hashColor } from "../lib/util";
import { isConfigured } from "../lib/settings";
import { t } from "../lib/i18n";

export default function Projects() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!isConfigured()) { location.hash = "#/settings"; return; }
    api.projects().then(setProjects).catch(e => setErr(String(e.message || e)));
  }, []);

  const filtered = (projects || []).filter(p => {
    const n = leaf(p.worktree).toLowerCase();
    return !q || n.includes(q.toLowerCase());
  });

  return (
    <div className="screen">
      <div className="topbar">
        <div className="title">{t("projects.title")}<div className="sub">{projects ? projects.length + " projects" : ""}</div></div>
      </div>
      <div className="content">
        {err && <div className="errbox" style={{ margin: "12px 16px" }}>{err}</div>}
        <div className="search-bar">
          <input className="search-input" placeholder={t("projects.search")} value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <div className="list">
          <button className="row" onClick={() => (location.hash = "#/browse")}>
            <div className="row-icon" style={{ background: "var(--surface2)", color: "var(--muted)", fontSize: 20 }}>📁</div>
            <div className="row-body">
              <div className="row-title">Browse folders…</div>
              <div className="row-sub">Open opencode in any folder</div>
            </div>
            <div className="row-chev">›</div>
          </button>
          {!projects && !err && <div className="spinner" />}
          {projects && filtered.length === 0 && <div className="empty-state"><div className="empty-icon">📂</div>{t("projects.empty")}</div>}
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
    </div>
  );
}
