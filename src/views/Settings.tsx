import { useEffect, useState } from "react";
import { getConn, saveConn, type Conn } from "../lib/settings";
import { ensureNotifyPermission } from "../lib/notify";
import { t, locales } from "../lib/i18n";

export default function Settings() {
  const [c, setC] = useState<Conn>(getConn());
  const [saved, setSaved] = useState(false);
  useEffect(() => { setC(getConn()); }, []);
  const set = (k: keyof Conn, v: any) => setC((p) => ({ ...p, [k]: v }));

  const save = async () => {
    await saveConn(c);
    if (c.notifyOnDone) await ensureNotifyPermission();
    setSaved(true); setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div className="screen">
      <div className="topbar"><div className="title">{t("settings.title")}</div></div>
      <div className="content">
        <div className="list">
          <label className="field">
            <span>{t("settings.server")}</span>
            <input className="search" placeholder="http://gg-45-ferngrove:4096" value={c.baseUrl} onChange={(e) => set("baseUrl", e.target.value)} autoCapitalize="off" autoCorrect="off" />
          </label>
          <label className="field">
            <span>Username</span>
            <input className="search" value={c.username} onChange={(e) => set("username", e.target.value)} autoCapitalize="off" />
          </label>
          <label className="field">
            <span>{t("settings.password")}</span>
            <input className="search" type="password" value={c.password} onChange={(e) => set("password", e.target.value)} />
          </label>
          <label className="toggle"><span>Sound on completion</span><input type="checkbox" checked={c.soundOnDone} onChange={(e) => set("soundOnDone", e.target.checked)} /></label>
          <label className="toggle"><span>Notify on completion</span><input type="checkbox" checked={c.notifyOnDone} onChange={(e) => set("notifyOnDone", e.target.checked)} /></label>
          <label className="field">
            <span>Language</span>
            <select className="search" value={c.locale} onChange={(e) => set("locale", e.target.value)}>
              {locales.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </label>
          <button className="primary" onClick={save}>{saved ? "✓ Saved" : t("settings.save")}</button>
          <div className="hint">The app talks directly to your opencode server over Tailscale. Username is usually <b>opencode</b>; password is your <code>OPENCODE_SERVER_PASSWORD</code>. For web dev, leave the URL as <code>/api</code>.</div>
        </div>
      </div>
    </div>
  );
}
