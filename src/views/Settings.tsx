import { useEffect, useState } from "react";
import { getConn, saveConn, type Conn } from "../lib/settings";
import { ensureNotifyPermission } from "../lib/notify";
import { t } from "../lib/i18n";
import { isConnected } from "../lib/transport";
import Logo from "../components/Logo";
import Icon from "../components/Icon";

function normalizeUrl(u: string): string {
  let s = u.trim();
  if (!s) return s;
  if (s === "/api") return s;
  if (!/^https?:\/\//i.test(s)) s = "http://" + s;
  return s.replace(/\/+$/, "");
}

function Switch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      className={"switch" + (on ? " on" : "")}
      onClick={() => onChange(!on)}
      aria-pressed={on}
    />
  );
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
  const connected = isConnected();

  return (
    <div className="screen">
      <div className="topbar"><div className="title">{t("settings.title")}</div></div>
      <div className="content scroll">
        {firstRun && (
          <div className="settings-banner">
            <span className="settings-banner-ic"><Icon name="qr" size={18} strokeWidth={1.7} /></span>
            <div className="settings-banner-tx">
              Scan the QR from your desktop gateway, or enter server details below.
            </div>
          </div>
        )}

        <div className="settings-section">
          <button
            className={"btn" + (connected ? " ok" : "")}
            onClick={() => (location.hash = "#/pairing")}
          >
            {connected ? (
              <><Icon name="check" size={18} strokeWidth={2.4} /> Paired via gateway</>
            ) : (
              <><Icon name="qr" size={18} strokeWidth={1.8} /> Scan QR to pair</>
            )}
          </button>
        </div>

        <div className="settings-section" style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: "4px 16px", marginTop: 8 }}>
          <div className="label" style={{ margin: "14px 0 10px" }}>Connection</div>
          <div className="label" style={{ margin: "0 0 6px", fontSize: 11, fontWeight: 500, color: "var(--fade)", textTransform: "none", letterSpacing: 0 }}>Server URL</div>
          <input type="text" placeholder="http://your-pc:4096" value={c.baseUrl} onChange={e => set("baseUrl", e.target.value)} autoCapitalize="off" />
          <div className="label" style={{ margin: "0 0 6px", fontSize: 11, fontWeight: 500, color: "var(--fade)", textTransform: "none", letterSpacing: 0 }}>Username</div>
          <input type="text" value={c.username} onChange={e => set("username", e.target.value)} autoCapitalize="off" />
          <div className="label" style={{ margin: "0 0 6px", fontSize: 11, fontWeight: 500, color: "var(--fade)", textTransform: "none", letterSpacing: 0 }}>Password</div>
          <input type="password" value={c.password} onChange={e => set("password", e.target.value)} />

          <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "10px 0 4px", fontSize: 13 }}>
            <span className="dot" style={{ width: 8, height: 8, background: testing === "ok" ? "var(--ok)" : testing === "err" ? "var(--danger)" : testing === "testing" ? "var(--warn)" : "var(--fade)" }} />
            {testing === "testing" && <span style={{ color: "var(--muted)" }}>Testing…</span>}
            {testing === "ok" && <span style={{ color: "var(--ok)" }}>{testMsg}</span>}
            {testing === "err" && <span style={{ color: "var(--danger)" }}>{testMsg}</span>}
            {testing === "idle" && <span style={{ color: "var(--fade)" }}>Not tested</span>}
          </div>

          <div style={{ display: "flex", gap: 10, padding: "8px 0 14px" }}>
            <button className={"btn secondary" + (testing === "testing" ? " testing" : "")} style={{ flex: 1 }} onClick={testConn} disabled={testing === "testing"}>
              {testing === "testing" ? "Testing…" : "Test"}
            </button>
            <button className="btn" style={{ flex: 1 }} onClick={save}>
              {saved ? <><Icon name="check" size={17} strokeWidth={2.4} /> Saved</> : t("settings.save")}
            </button>
          </div>
        </div>

        <div className="settings-section" style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: "0 16px", marginTop: 8 }}>
          <div className="settings-toggle">
            <div>
              <div style={{ fontSize: 14.5, fontWeight: 520 }}>Sound on completion</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>Chime when a turn finishes</div>
            </div>
            <Switch on={c.soundOnDone} onChange={v => set("soundOnDone", v)} />
          </div>
          <div className="settings-toggle">
            <div>
              <div style={{ fontSize: 14.5, fontWeight: 520 }}>Notify on completion</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>Push notification when done</div>
            </div>
            <Switch on={c.notifyOnDone} onChange={v => set("notifyOnDone", v)} />
          </div>
        </div>

        <div className="settings-section" style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: "14px 16px 4px", marginTop: 8 }}>
          <div style={{ fontSize: 14.5, fontWeight: 520, marginBottom: 4 }}>Auto-reconnect</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12, lineHeight: 1.45 }}>
            How aggressively to retry if the connection drops (e.g. your ISP changed the public IP). Higher modes use more battery and mobile data when the desktop is unreachable.
          </div>
          {([
            ["off", "Off", "Manual reconnect only. Lowest battery use."],
            ["normal", "Normal (recommended)", "1 min, 5 min, 15 min, 15 min. Balanced for static IP users."],
            ["aggressive", "Aggressive", "30s, 1 min, 2 min, 2 min. Fastest recovery, more battery and data."],
          ] as const).map(([key, label, desc]) => (
            <label
              key={key}
              style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 0", cursor: "pointer" }}
            >
              <input
                type="radio"
                name="reconnectMode"
                value={key}
                checked={c.reconnectMode === key}
                onChange={() => set("reconnectMode", key)}
                style={{ marginTop: 3, accentColor: "var(--accent)" }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 520, color: "var(--text)" }}>{label}</div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 1, lineHeight: 1.4 }}>{desc}</div>
              </div>
            </label>
          ))}
        </div>

        <div className="settings-section" style={{ paddingBottom: 4 }}>
          <div className="hint">Password is stored locally. The gateway (recommended) proxies traffic from your phone to opencode.</div>
        </div>

        <div className="settings-footer">
          <Logo size={22} showText={true} textColor="var(--fade)" />
          <div className="settings-footer-v">v0.3.0</div>
        </div>
      </div>
    </div>
  );
}
