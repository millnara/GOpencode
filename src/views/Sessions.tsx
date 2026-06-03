import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Session } from "../lib/types";
import { b64uEnc, leaf, timeAgo } from "../lib/util";
import { t } from "../lib/i18n";

export default function Sessions({ dir }: { dir: string }) {
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const name = leaf(dir);

  const load = () => api.sessions(dir)
    .then((ss) => setSessions(ss.filter((s) => !s.parentID).sort((a, b) => (b.time?.updated || 0) - (a.time?.updated || 0))))
    .catch((e) => setErr(String(e.message || e)));
  useEffect(() => { load(); }, [dir]);

  const create = async () => {
    try { const s = await api.createSession(dir); location.hash = "#/p/" + b64uEnc(dir) + "/s/" + s.id; }
    catch (e: any) { setErr(String(e.message || e)); }
  };

  return (
    <div className="screen" style={{ position: "relative" }}>
      <div className="topbar">
        <button className="iconbtn" onClick={() => history.length > 1 ? history.back() : (location.hash = "#/")}>‹</button>
        <div className="title">{name}<div className="sub">{sessions ? sessions.length + " sessions" : ""}</div></div>
      </div>
      <div className="content">
        <div className="list">
          {err && <div className="errbox">{err}</div>}
          {!sessions && !err && <div className="loading"><div className="spinner" /></div>}
          {sessions && sessions.length === 0 && <div className="empty">{t("sessions.empty")}</div>}
          {(sessions || []).map((s) => (
            <button key={s.id} className="card" onClick={() => (location.hash = "#/p/" + b64uEnc(dir) + "/s/" + s.id)}>
              <div className="avatar">💬</div>
              <div className="meta">
                <div className="name">{s.title || "Untitled session"}</div>
                <div className="desc">{timeAgo(s.time?.updated || s.time?.created)}</div>
              </div>
              <div className="chev">›</div>
            </button>
          ))}
        </div>
      </div>
      <button className="fab" onClick={create}>＋ {t("sessions.new")}</button>
    </div>
  );
}
