import { useEffect, useState } from "react";
import { api, streamEvents } from "../lib/api";
import type { Session, OcEvent } from "../lib/types";
import { b64uEnc, leaf, timeAgo } from "../lib/util";
import { t } from "../lib/i18n";
import { log, friendlyError } from "../lib/log";
import PullToRefresh from "../components/PullToRefresh";
import { prompt as modalPrompt, confirm as modalConfirm } from "../components/Modal";
import Icon from "../components/Icon";

function extractPreview(parts: any[]): string {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    if (p.type === "text" && p.text) {
      const line = p.text.split("\n").find((l: string) => l.trim()) || p.text;
      return line.trim().slice(0, 100);
    }
  }
  return "";
}

export default function Sessions({ dir }: { dir: string }) {
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const name = leaf(dir);

  const load = () => api.sessions(dir)
    .then(ss => {
      const filtered = ss.filter(s => !s.parentID).sort((a, b) => (b.time?.updated || 0) - (a.time?.updated || 0));
      setSessions(filtered);
      // fetch last message preview for each session in parallel
      filtered.slice(0, 20).forEach(s => {
        api.messages(dir, s.id).then(msgs => {
          if (!msgs.length) return;
          const last = msgs[msgs.length - 1];
          const text = extractPreview(last.parts || []);
          if (text) setPreviews(prev => ({ ...prev, [s.id]: text }));
        }).catch(() => {});
      });
    })
    .catch(e => { log.error("ui", "load sessions failed", e?.message || e); setErr(friendlyError(e)); });
  useEffect(() => { load(); }, [dir]);

  useEffect(() => {
    const stop = streamEvents(dir, (ev: OcEvent) => {
      const p = ev.properties;
      if (ev.type === "session.status") {
        const isBusy = p.status?.type === "busy";
        setBusy(prev => {
          if (prev[p.sessionID] === isBusy) return prev;
          return { ...prev, [p.sessionID]: isBusy };
        });
      }
      if (ev.type === "session.updated" && p?.info?.id) {
        // refresh preview if a session got a new title
        load();
      }
    });
    return () => { stop(); };
  }, [dir]);

  const create = async () => {
    try { const s = await api.createSession(dir); location.hash = "#/p/" + b64uEnc(dir) + "/s/" + s.id; }
    catch (e: any) { setErr(String(e.message || e)); }
  };
  const deleteSession = async (id: string) => {
    try { await api.deleteSession(dir, id); load(); } catch (e: any) { setErr(String(e.message || e)); }
  };
  const renameSession = async (id: string, title: string) => {
    const t = await modalPrompt({ title: "Rename session", defaultValue: title, placeholder: "Session name" });
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
            {sessions && filtered.length === 0 && <div className="empty-state"><div className="empty-icon"><Icon name="doc" size={32} strokeWidth={1.5} /></div>{q ? "No matches" : t("sessions.empty")}</div>}
            {filtered.map((s, i) => (
              <div key={s.id}>
                {i > 0 && <div className="divider" />}
                <div style={{ display: "flex", alignItems: "flex-start" }}>
                  <button className="row" style={{ flex: 1 }} onClick={() => (location.hash = "#/p/" + b64uEnc(dir) + "/s/" + s.id)}>
                    <div className="row-icon" style={{ background: "var(--accent)" }}><Icon name="doc" size={18} strokeWidth={1.8} /></div>
                    <div className="row-body">
                      <div className="row-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span>{s.title || "Untitled session"}</span>
                        {busy[s.id] && <span className="active-dot" />}
                      </div>
                      {previews[s.id] && <div className="row-preview">{previews[s.id]}</div>}
                      <div className="row-sub">{timeAgo(s.time?.updated || s.time?.created)}</div>
                    </div>
                    <div className="row-chev">›</div>
                  </button>
                  <button className="iconbtn" style={{ color: "var(--muted)" }} onClick={e => { e.stopPropagation(); renameSession(s.id, s.title || ""); }}>✎</button>
                  <button className="iconbtn" style={{ color: "var(--danger)", fontSize: 14 }} onClick={async e => { e.stopPropagation(); if (await modalConfirm({ title: "Delete session?", message: "This cannot be undone.", danger: true, confirmLabel: "Delete" })) deleteSession(s.id); }}>✕</button>
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
