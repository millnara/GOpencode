import { useEffect, useState } from "react";
import { getConn, saveConn, type Conn } from "../lib/settings";
import { ensureNotifyPermission } from "../lib/notify";
import { t, locales } from "../lib/i18n";
import { isConnected } from "../lib/transport";

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
    if (!norm || norm === "/api") { setTesting("err"); setTestMsg("Set a server URL"); return; }
    setTesting("testing"); setTestMsg("");
    try {
      const headers: Record<string, string> = {};
      if (c.password) headers.Authorization = "Basic " + btoa(`${c.username}:${c.password}`);
      const r = await fetch(norm + "/path", { headers, signal: AbortSignal.timeout(6000) });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const data = await r.json();
      setTesting("ok"); setTestMsg("Connected — " + data.home);
    } catch (e: any) {
      setTesting("err"); setTestMsg(e.message || "Connection failed");
    }
  };

  const firstRun = !getConn().baseUrl || (!c.baseUrl.startsWith("/api") && !c.password);

  return (
    <div className="screen">
      <div className="topbar"><div className="title">{t("settings.title")}</div></div>
      <div className="content">
        {firstRun && <div className="errbox" style={{ margin: "16px", borderColor: "var(--accent)", color: "var(--accent2)", background: "var(--accent-bg)" }}>Welcome! Pair with your desktop gateway or enter server details below.</div>}

        <div className="settings-section">
          <button className="btn" style={{ background: isConnected() ? "var(--ok)" : "var(--accent)" }}
            onClick={() => (location.hash = "#/pairing")}>
            {isConnected() ? "✓ Paired via gateway" : "⚡ Pair with gateway"}
          </button>
        </div>

        <div className="settings-section">
          <div className="label">Server URL</div>
          <input type="text" placeholder="http://your-pc:4096" value={c.baseUrl} onChange={e => set("baseUrl", e.target.value)} autoCapitalize="off" />
          <div className="label">Username</div>
          <input type="text" value={c.username} onChange={e => set("username", e.target.value)} autoCapitalize="off" />
          <div className="label">Password</div>
          <input type="password" value={c.password} onChange={e => set("password", e.target.value)} />
          <button className={"btn secondary" + (testing === "testing" ? " testing" : "")}
            onClick={testConn} disabled={testing === "testing"}>
            {testing === "testing" ? "Testing…" : testing === "ok" ? "✓ Connected" : testing === "err" ? "✗ Retry" : "Test connection"}
          </button>
          {testMsg && <div style={{ fontSize: 12, padding: "4px 0", color: testing === "ok" ? "var(--ok)" : "var(--danger)" }}>{testMsg}</div>}
        </div>

        <div className="settings-section">
          <div className="settings-toggle">
            <span>Sound on completion</span>
            <input type="checkbox" checked={c.soundOnDone} onChange={e => set("soundOnDone", e.target.checked)} />
          </div>
          <div className="settings-toggle">
            <span>Notify on completion</span>
            <input type="checkbox" checked={c.notifyOnDone} onChange={e => set("notifyOnDone", e.target.checked)} />
          </div>
        </div>

        <div className="settings-section">
          <div className="label">Language</div>
          <select value={c.locale} onChange={e => set("locale", e.target.value)}>
            {locales.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>

        <div className="settings-section">
          <button className="btn" onClick={save}>{saved ? "✓ Saved" : t("settings.save")}</button>
          <div className="hint">Use the gateway (recommended) or enter server details directly. Password stored locally.</div>
        </div>
      </div>
    </div>
  );
}
