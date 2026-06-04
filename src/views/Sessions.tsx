import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Session } from "../lib/types";
import { b64uEnc, leaf, timeAgo } from "../lib/util";
import { t } from "../lib/i18n";

export default function Sessions({ dir }: { dir: string }) {
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const name = leaf(dir);

  const load = () => api.sessions(dir)
    .then((ss) => setSessions(ss.filter((s) => !s.parentID).sort((a, b) => (b.time?.updated || 0) - (a.time?.updated || 0))))
    .catch((e) => setErr(String(e.message || e)));
  useEffect(() => { load(); }, [dir]);

  const create = async () => {
    try { const s = await api.createSession(dir); location.hash = "#/p/" + b64uEnc(dir) + "/s/" + s.id; }
    catch (e: any) { setErr(String(e.message || e)); }
  };

  const deleteSession = async (id: string) => {
    try { await api.deleteSession(dir, id); load(); } catch (e: any) { setErr(String(e.message || e)); }
  };

  const renameSession = async (id: string, title: string) => {
    const newTitle = prompt("Rename session:", title);
    if (!newTitle || newTitle === title) return;
    try { await api.updateSession(dir, id, { title: newTitle }); load(); } catch (e: any) { setErr(String(e.message || e)); }
  };

  const filtered = (sessions || []).filter((s) =>
    (s.title || "Untitled").toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="screen" style={{ position: "relative" }}>
      <div className="topbar">
        <button className="iconbtn" onClick={() => history.length > 1 ? history.back() : (location.hash = "#/")}>‹</button>
        <div className="title">{name}<div className="sub">{sessions ? sessions.length + " sessions" : ""}</div></div>
      </div>
      <div className="content">
        <div className="list">
          {sessions && sessions.length > 3 && (
            <input className="search" placeholder="Search sessions…" value={q} onChange={(e) => setQ(e.target.value)} />
          )}
          {err && <div className="errbox">{err}</div>}
          {!sessions && !err && <div className="loading"><div className="spinner" /></div>}
          {sessions && filtered.length === 0 && <div className="empty">{q ? "No matches." : t("sessions.empty")}</div>}
          {filtered.map((s) => (
            <div key={s.id} className="card-row">
              <button className="card" style={{ flex: 1 }} onClick={() => (location.hash = "#/p/" + b64uEnc(dir) + "/s/" + s.id)}>
                <div className="avatar">💬</div>
                <div className="meta">
                  <div className="name">{s.title || "Untitled session"}</div>
                  <div className="desc">{timeAgo(s.time?.updated || s.time?.created)}</div>
                </div>
                <div className="chev">›</div>
              </button>
              <button className="iconbtn" style={{ color: "var(--muted)", padding: "0 6px", fontSize: 16 }}
                onClick={(e) => { e.stopPropagation(); renameSession(s.id, s.title || ""); }}>✎</button>
              <button className="iconbtn" style={{ color: "var(--danger)", padding: "0 6px", fontSize: 14 }}
                onClick={(e) => { e.stopPropagation(); if (confirm("Delete this session?")) deleteSession(s.id); }}>✕</button>
            </div>
          ))}
        </div>
      </div>
      <button className="fab" onClick={create}>＋ {t("sessions.new")}</button>
    </div>
  );
}
