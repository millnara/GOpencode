import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Session } from "../lib/types";
import { b64uEnc, leaf, timeAgo } from "../lib/util";
import { t } from "../lib/i18n";
import { log, friendlyError } from "../lib/log";
import PullToRefresh from "../components/PullToRefresh";

export default function Sessions({ dir }: { dir: string }) {
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const name = leaf(dir);

  const load = () => api.sessions(dir)
    .then(ss => setSessions(ss.filter(s => !s.parentID).sort((a, b) => (b.time?.updated || 0) - (a.time?.updated || 0))))
    .catch(e => { log.error("ui", "load sessions failed", e?.message || e); setErr(friendlyError(e)); });
  useEffect(() => { load(); }, [dir]);

  const create = async () => {
    try { const s = await api.createSession(dir); location.hash = "#/p/" + b64uEnc(dir) + "/s/" + s.id; }
    catch (e: any) { setErr(String(e.message || e)); }
  };
  const deleteSession = async (id: string) => {
    try { await api.deleteSession(dir, id); load(); } catch (e: any) { setErr(String(e.message || e)); }
  };
  const renameSession = async (id: string, title: string) => {
    const t = prompt("Rename session:", title);
    if (!t || t === title) return;
    try { await api.updateSession(dir, id, { title: t }); load(); } catch (e: any) { setErr(String(e.message || e)); }
  };

  const filtered = (sessions || []).filter(s =>
    (s.title || "Untitled").toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="screen">
      <div className="topbar">
        <button className="iconbtn" onClick={() => history.length > 1 ? history.back() : (location.hash = "#/")}>‹</button>
        <div className="title">{name}<div className="sub">{sessions ? sessions.length + " sessions" : ""}</div></div>
      </div>
      <PullToRefresh onRefresh={load}>
        <div className="content">
          {err && <div className="errbox" style={{ margin: "12px 16px" }}>{err}</div>}
          {(sessions && sessions.length > 3) && (
            <div className="search-bar">
              <input className="search-input" placeholder="Search sessions…" value={q} onChange={e => setQ(e.target.value)} />
            </div>
          )}
          <div className="list">
            {!sessions && !err && <div className="spinner" />}
            {sessions && filtered.length === 0 && <div className="empty-state"><div className="empty-icon">💬</div>{q ? "No matches" : t("sessions.empty")}</div>}
            {filtered.map((s, i) => (
              <div key={s.id}>
                {i > 0 && <div className="divider" />}
                <div style={{ display: "flex", alignItems: "center" }}>
                  <button className="row" style={{ flex: 1 }} onClick={() => (location.hash = "#/p/" + b64uEnc(dir) + "/s/" + s.id)}>
                    <div className="row-icon" style={{ background: "var(--accent)", fontSize: 16 }}>💬</div>
                    <div className="row-body">
                      <div className="row-title">{s.title || "Untitled session"}</div>
                      <div className="row-sub">{timeAgo(s.time?.updated || s.time?.created)}</div>
                    </div>
                    <div className="row-chev">›</div>
                  </button>
                  <button className="iconbtn" style={{ color: "var(--muted)" }} onClick={e => { e.stopPropagation(); renameSession(s.id, s.title || ""); }}>✎</button>
                  <button className="iconbtn" style={{ color: "var(--danger)", fontSize: 14 }} onClick={e => { e.stopPropagation(); if (confirm("Delete?")) deleteSession(s.id); }}>✕</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </PullToRefresh>
      <button className="fab" onClick={create}>＋ {t("sessions.new")}</button>
    </div>
  );
}
