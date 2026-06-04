import { useEffect, useState } from "react";
import { getConn, saveConn, type Conn } from "../lib/settings";
import { ensureNotifyPermission } from "../lib/notify";
import { t, locales } from "../lib/i18n";

function normalizeUrl(u: string): string {
  let s = u.trim();
  if (!s) return s;
  if (s === "/api") return s;
  if (!/^https?:\/\//i.test(s)) s = "http://" + s;
  return s.replace(/\/+$/, "");
}

export default function Settings() {
  const [c, setC] = useState<Conn>(getConn());
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState<"idle" | "testing" | "ok" | "err">("idle");
  const [testMsg, setTestMsg] = useState("");
  useEffect(() => { setC(getConn()); }, []);
  const set = (k: keyof Conn, v: any) => setC((p) => ({ ...p, [k]: v }));

  const save = async () => {
    const norm = { ...c, baseUrl: normalizeUrl(c.baseUrl) };
    setC(norm);
    await saveConn(norm);
    if (norm.notifyOnDone) await ensureNotifyPermission();
    setSaved(true); setTimeout(() => setSaved(false), 1500);
  };

  const testConn = async () => {
    const norm = normalizeUrl(c.baseUrl);
    if (!norm || norm === "/api") { setTesting("err"); setTestMsg("Set a real server URL to test"); return; }
    setTesting("testing"); setTestMsg("");
    try {
      const headers: Record<string, string> = {};
      if (c.password) headers.Authorization = "Basic " + btoa(`${c.username}:${c.password}`);
      const r = await fetch(norm + "/path", { headers, signal: AbortSignal.timeout(6000) });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const data = await r.json();
      setTesting("ok"); setTestMsg("Connected — home: " + (data.home || "ok"));
    } catch (e: any) {
      setTesting("err"); setTestMsg(e.message || "Connection failed");
    }
  };

  const firstRun = !getConn().baseUrl || (!c.baseUrl.startsWith("/api") && !c.password);

  return (
    <div className="screen">
      <div className="topbar"><div className="title">{t("settings.title")}</div></div>
      <div className="content">
        <div className="list">
          {firstRun && <div className="errbox" style={{ borderColor: "var(--accent)", color: "var(--accent2)", background: "rgba(204,120,92,.08)" }}>Welcome! Enter your opencode server details to get started.</div>}
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
          <button className="primary" style={{ marginBottom: 8 }} onClick={testConn} disabled={testing === "testing"}>
            {testing === "testing" ? "Testing…" : testing === "ok" ? "✓ Connected" : testing === "err" ? "✗ Retry" : "Test connection"}
          </button>
          {testMsg && <div className={"hint" + (testing === "err" ? "" : "")} style={{ color: testing === "ok" ? "var(--ok)" : "var(--danger)", marginTop: -4 }}>{testMsg}</div>}
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
