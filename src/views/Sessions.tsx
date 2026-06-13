import { useEffect, useState, useRef } from "react";
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
  const [sheet, setSheet] = useState<Session | null>(null);
  const name = leaf(dir);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = () => api.sessions(dir)
    .then(ss => {
      const filtered = ss.filter(s => !s.parentID).sort((a, b) => (b.time?.updated || 0) - (a.time?.updated || 0));
      setSessions(filtered);
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
      if (ev.type === "session.updated" && p?.info?.id) load();
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
  const renameSession = async (s: Session) => {
    setSheet(null);
    const t = await modalPrompt({ title: "Rename session", defaultValue: s.title || "", placeholder: "Session name" });
    if (!t || t === s.title) return;
    try { await api.updateSession(dir, s.id, { title: t }); load(); } catch (e: any) { setErr(String(e.message || e)); }
  };

  const open = (s: Session) => location.hash = "#/p/" + b64uEnc(dir) + "/s/" + s.id;

  const onPointerDown = (s: Session) => {
    timerRef.current = setTimeout(() => { timerRef.current = null; setSheet(s); }, 500);
  };
  const onPointerUp = () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } };

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
                <button className="row" style={{ width: "100%" }}
                  onClick={() => open(s)}
                  onPointerDown={() => onPointerDown(s)}
                  onPointerUp={onPointerUp}
                  onPointerLeave={onPointerUp}
                >
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
              </div>
            ))}
          </div>
        </div>
      </PullToRefresh>
      <button className="fab" onClick={create}>＋ {t("sessions.new")}</button>

      {sheet && (
        <div className="sheet-bg" role="dialog" aria-modal="true" aria-label="Session actions" onClick={e => { if (e.target === e.currentTarget) setSheet(null); }}>
          <div className="sheet">
            <div className="handle" />
            <h3>{sheet.title || "Untitled session"}</h3>
            <div className="opt" onClick={() => renameSession(sheet)}>
              <span className="opt-icon"><Icon name="share" size={18} strokeWidth={1.8} /></span>
              <span className="opt-label">Rename</span>
            </div>
            <div className="opt danger" onClick={async () => {
              const id = sheet.id;
              setSheet(null);
              if (await modalConfirm({ title: "Delete session?", message: "This will permanently delete this session and all its messages.", danger: true, confirmLabel: "Delete" })) deleteSession(id);
            }}>
              <span className="opt-icon"><Icon name="delete" size={18} strokeWidth={1.8} /></span>
              <span className="opt-label">Delete session</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
