import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Project } from "../lib/types";
import { b64uEnc, leaf, timeAgo } from "../lib/util";
import { isConfigured } from "../lib/settings";
import { t } from "../lib/i18n";

export default function Projects() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!isConfigured()) { location.hash = "#/settings"; return; }
    api.projects()
      .then((ps) => setProjects(ps.filter((p) => p.id !== "global" && p.worktree && p.worktree !== "/").sort((a, b) => (b.time?.updated || 0) - (a.time?.updated || 0))))
      .catch((e) => setErr(String(e.message || e)));
  }, []);

  const filtered = (projects || []).filter((p) => leaf(p.worktree).toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="screen">
      <div className="topbar"><div className="title">{t("app.title")}<div className="sub">{projects ? projects.length + " projects" : ""}</div></div></div>
      <div className="content">
        <div className="list">
          <input className="search" placeholder={t("projects.search")} value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="card" onClick={() => (location.hash = "#/browse")} style={{ marginBottom: 10 }}>
            <div className="avatar" style={{ background: "linear-gradient(135deg,#3a3a40,#26262b)" }}>📁</div>
            <div className="meta">
              <div className="name">Browse folders…</div>
              <div className="desc">Open opencode in any folder</div>
            </div>
            <div className="chev">›</div>
          </button>
          {err && <div className="errbox">{err}</div>}
          {!projects && !err && <div className="loading"><div className="spinner" /></div>}
          {projects && filtered.length === 0 && <div className="empty">{t("projects.empty")}</div>}
          {filtered.map((p) => {
            const name = leaf(p.worktree);
            return (
              <button key={p.id} className="card" onClick={() => (location.hash = "#/p/" + b64uEnc(p.worktree))}>
                <div className="avatar">{name.slice(0, 2)}</div>
                <div className="meta">
                  <div className="name">{name}</div>
                  <div className="desc">{(p.vcs || "folder") + " · " + timeAgo(p.time?.updated)}</div>
                </div>
                <div className="chev">›</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
