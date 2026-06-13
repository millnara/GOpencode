import { useEffect, useState } from "react";
import { getConn, saveConn, type Conn, type Pairing, loadPairing, savePairing, clearPairing, setPairingCache } from "../lib/settings";
import { ensureNotifyPermission } from "../lib/notify";
import { t } from "../lib/i18n";
import { connect, disconnect, reconnectNow, onStateChange, getState, getActiveUrl, isP2P, type TransportState } from "../lib/transport";
import { log, type LogEntry } from "../lib/log";
import Logo from "../components/Logo";
import Icon from "../components/Icon";
import NativeQrScanner from "../components/NativeQrScanner";

function normalizeUrl(u: string): string {
  let s = u.trim();
  if (!s) return s;
  if (s === "/api") return s;
  if (!/^https?:\/\//i.test(s)) s = "http://" + s;
  return s.replace(/\/+$/, "");
}

function normalizeWsUrl(u: string): string {
  let s = u.trim();
  if (!s) return s;
  if (/^https?:\/\//i.test(s)) s = s.replace(/^http/i, "ws");
  if (!/^wss?:\/\//i.test(s)) s = "ws://" + s;
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

function parseQrPayload(raw: string): { urls: string[]; room: string; pw: string } | null {
  try {
    const j = JSON.parse(raw);
    if (Array.isArray(j.endpoints) && j.room) {
      return { urls: j.endpoints, room: j.room, pw: j.pw || "" };
    }
    if (j.ws && j.room) {
      return { urls: [j.ws], room: j.room, pw: j.pw || "" };
    }
    if (j.url && j.room) {
      const ws = j.url.replace(/^http/, "ws");
      return { urls: [ws], room: j.room, pw: j.pw || "" };
    }
    return null;
  } catch {
    return null;
  }
}

const fieldLabel: React.CSSProperties = { margin: "0 0 6px", fontSize: 11, fontWeight: 500, color: "var(--fade)", textTransform: "none", letterSpacing: 0 };

export default function Settings() {
  const [c, setC] = useState<Conn>(getConn());
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState<"idle" | "testing" | "ok" | "err">("idle");
  const [testMsg, setTestMsg] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerErr, setScannerErr] = useState<string | null>(null);
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [tState, setTState] = useState<TransportState>(getState());
  const [showManual, setShowManual] = useState(false);
  const [showDirect, setShowDirect] = useState(false);
  const [gwUrl, setGwUrl] = useState("");
  const [gwRoom, setGwRoom] = useState("");
  const [gwPw, setGwPw] = useState("");
  const [gwBusy, setGwBusy] = useState(false);
  const [gwMsg, setGwMsg] = useState("");
  const [showLogs, setShowLogs] = useState(false);
  const [logEntries, setLogEntries] = useState<LogEntry[]>(log.entries());

  useEffect(() => { setC(getConn()); }, []);
  useEffect(() => { loadPairing().then(setPairing); }, []);
  useEffect(() => onStateChange(setTState), []);
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

  const adoptPairing = async (p: Pairing) => {
    // Persist the pairing BEFORE attempting to connect: the QR is valid even
    // if this first attempt times out, and auto-reconnect picks it up later.
    await savePairing(p);
    setPairingCache(p);
    setPairing(p);
    await saveConn({ baseUrl: "", password: "" });
    await connect(p.urls, p.room, p.pw);
  };

  const onQrScanned = async (raw: string) => {
    setScannerOpen(false);
    const p = parseQrPayload(raw);
    if (!p) {
      setScannerErr("That QR isn't a GOpencode pairing code");
      setTimeout(() => setScannerErr(null), 3500);
      return;
    }
    try {
      await adoptPairing(p);
      setScannerErr(null);
    } catch (e: any) {
      setScannerErr("Paired, but couldn't connect: " + (e?.message || "unknown"));
      setTimeout(() => setScannerErr(null), 4000);
    }
  };

  const connectManual = async () => {
    const url = normalizeWsUrl(gwUrl);
    if (!url || !gwRoom.trim()) { setGwMsg("Gateway URL and room ID are required"); return; }
    setGwBusy(true); setGwMsg("");
    try {
      await adoptPairing({ urls: [url], room: gwRoom.trim(), pw: gwPw });
      setShowManual(false);
      setGwMsg("");
    } catch (e: any) {
      setGwMsg(e?.message || "Connection failed");
    } finally {
      setGwBusy(false);
    }
  };

  const unpair = async () => {
    if (!confirm("Unpair from the desktop gateway?")) return;
    disconnect();
    await clearPairing();
    setPairingCache(null);
    setPairing(null);
  };

  const connected = tState === "connected";
  const statusLabel =
    tState === "connected" ? (isP2P() ? "Connected (direct P2P)" : "Connected") :
    tState === "connecting" ? "Connecting…" :
    tState === "reconnecting" ? "Reconnecting…" :
    tState === "stranded" ? "Can't reach desktop — retrying in background" :
    "Disconnected";
  const statusColor =
    tState === "connected" ? "var(--ok)" :
    tState === "connecting" || tState === "reconnecting" ? "var(--warn)" :
    "var(--danger)";

  return (
    <div className="screen">
      <div className="topbar"><div className="title">{t("settings.title")}</div></div>
      <div className="content scroll">
        {scannerErr && (
          <div className="errbox" style={{ margin: "12px 16px 0" }}>{scannerErr}</div>
        )}

        {/* ——— Gateway pairing: the one connection card ——— */}
        <div className="settings-section" style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: "14px 16px", marginTop: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
            <div style={{ fontSize: 14.5, fontWeight: 520, flex: 1 }}>Desktop gateway</div>
            {pairing && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: statusColor }}>
                <span className="dot" style={{ width: 8, height: 8, background: statusColor }} />
                {statusLabel}
              </span>
            )}
          </div>

          {pairing ? (
            <>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 2 }}>Endpoints (tried in order)</div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 11.5, lineHeight: 1.6, color: "var(--text-2)", marginBottom: 8, overflowWrap: "anywhere" }}>
                {pairing.urls.map((u, i) => (
                  <div key={i}>
                    {u}
                    {connected && getActiveUrl() === u && <span style={{ color: "var(--ok)" }}> ● active</span>}
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>
                Room <span style={{ fontFamily: "var(--mono)", color: "var(--text-2)" }}>{pairing.room}</span>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                {!connected && (
                  <button className="btn" style={{ flex: 1 }} onClick={() => reconnectNow()}>
                    <Icon name="refresh" size={16} strokeWidth={2.2} /> Reconnect
                  </button>
                )}
                <button className="btn secondary" style={{ flex: 1 }} onClick={() => setScannerOpen(true)}>
                  <Icon name="qr" size={16} strokeWidth={1.8} /> Re-scan QR
                </button>
                <button className="btn secondary" style={{ flex: 1 }} onClick={unpair}>Unpair</button>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5, marginBottom: 12 }}>
                On your PC, open the GOpencode tray icon → “Show pairing QR”, then scan it here.
              </div>
              <button className="btn" onClick={() => setScannerOpen(true)}>
                <Icon name="qr" size={18} strokeWidth={1.8} /> Scan QR to pair
              </button>
              <button
                className="linklike"
                style={{ display: "block", margin: "10px auto 0", fontSize: 12.5, color: "var(--accent-2)", background: "none", border: "none" }}
                onClick={() => setShowManual(!showManual)}
              >
                {showManual ? "Hide manual entry" : "Enter details manually instead"}
              </button>
              {showManual && (
                <div style={{ marginTop: 10 }}>
                  <div className="label" style={fieldLabel}>Gateway URL</div>
                  <input type="text" placeholder="ws://your-pc:8765" value={gwUrl} onChange={e => setGwUrl(e.target.value)} autoCapitalize="off" autoCorrect="off" />
                  <div className="label" style={fieldLabel}>Room ID</div>
                  <input type="text" placeholder="shown in the pairing window" value={gwRoom} onChange={e => setGwRoom(e.target.value)} autoCapitalize="off" />
                  <div className="label" style={fieldLabel}>Password</div>
                  <input type="password" placeholder="shown in the pairing window" value={gwPw} onChange={e => setGwPw(e.target.value)} />
                  <button className="btn" disabled={gwBusy} onClick={connectManual} style={{ marginTop: 4 }}>
                    {gwBusy ? "Connecting…" : "Connect"}
                  </button>
                  {gwMsg && <div className="hint" style={{ color: "var(--danger)", textAlign: "center", marginTop: 6 }}>{gwMsg}</div>}
                </div>
              )}
            </>
          )}
        </div>

        {/* ——— Notifications ——— */}
        <div className="settings-section" style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: "0 16px", marginTop: 8 }}>
          <div className="settings-toggle">
            <div>
              <div style={{ fontSize: 14.5, fontWeight: 520 }}>Sound on completion</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>Chime when a turn finishes</div>
            </div>
            <Switch on={c.soundOnDone} onChange={v => { set("soundOnDone", v); saveConn({ soundOnDone: v }); }} />
          </div>
          <div className="settings-toggle">
            <div>
              <div style={{ fontSize: 14.5, fontWeight: 520 }}>Notify on completion</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>Push notification when done</div>
            </div>
            <Switch on={c.notifyOnDone} onChange={v => { set("notifyOnDone", v); saveConn({ notifyOnDone: v }).then(() => { if (v) ensureNotifyPermission(); }); }} />
          </div>
        </div>

        {/* ——— Auto-reconnect ——— */}
        <div className="settings-section" style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: "14px 16px 4px", marginTop: 8 }}>
          <div style={{ fontSize: 14.5, fontWeight: 520, marginBottom: 4 }}>Auto-reconnect</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12, lineHeight: 1.45 }}>
            The connection drops whenever the phone sleeps, switches networks, or your PC's IP changes. This controls how hard the app retries.
          </div>
          {([
            ["normal", "Normal (recommended)", "Retries within seconds, then backs off. Keeps trying every 5 minutes in the background."],
            ["aggressive", "Aggressive", "Near-instant retries, more often. Fastest recovery at some battery cost."],
            ["off", "Off", "Reconnect manually from this screen only."],
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
                onChange={() => { set("reconnectMode", key); saveConn({ reconnectMode: key }); }}
                style={{ marginTop: 3, accentColor: "var(--accent)" }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 520, color: "var(--text)" }}>{label}</div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 1, lineHeight: 1.4 }}>{desc}</div>
              </div>
            </label>
          ))}
        </div>

        {/* ——— Advanced: direct connection without the gateway ——— */}
        <div className="settings-section" style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: "4px 16px", marginTop: 8 }}>
          <button
            style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "12px 0", background: "none", border: "none", color: "var(--text)", fontSize: 14.5, fontWeight: 520, textAlign: "left" }}
            onClick={() => setShowDirect(!showDirect)}
          >
            <span style={{ flex: 1 }}>Direct connection (advanced)</span>
            <Icon name={showDirect ? "chevronUp" : "chevronDown"} size={16} strokeWidth={2} />
          </button>
          {showDirect && (
            <div style={{ paddingBottom: 12 }}>
              <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5, marginBottom: 10 }}>
                Talk straight to the opencode server without the desktop gateway. Requires opencode started with CORS enabled, and only works while the phone can reach the PC directly.
              </div>
              <div className="label" style={fieldLabel}>Server URL</div>
              <input type="text" placeholder="http://your-pc:4096" value={c.baseUrl} onChange={e => set("baseUrl", e.target.value)} autoCapitalize="off" />
              <div className="label" style={fieldLabel}>Username</div>
              <input type="text" value={c.username} onChange={e => set("username", e.target.value)} autoCapitalize="off" />
              <div className="label" style={fieldLabel}>Password</div>
              <input type="password" value={c.password} onChange={e => set("password", e.target.value)} />

              <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "10px 0 4px", fontSize: 13 }}>
                <span className="dot" style={{ width: 8, height: 8, background: testing === "ok" ? "var(--ok)" : testing === "err" ? "var(--danger)" : testing === "testing" ? "var(--warn)" : "var(--fade)" }} />
                {testing === "testing" && <span style={{ color: "var(--muted)" }}>Testing…</span>}
                {testing === "ok" && <span style={{ color: "var(--ok)" }}>{testMsg}</span>}
                {testing === "err" && <span style={{ color: "var(--danger)" }}>{testMsg}</span>}
                {testing === "idle" && <span style={{ color: "var(--fade)" }}>Not tested</span>}
              </div>

              <div style={{ display: "flex", gap: 10, padding: "8px 0 2px" }}>
                <button className={"btn secondary" + (testing === "testing" ? " testing" : "")} style={{ flex: 1 }} onClick={testConn} disabled={testing === "testing"}>
                  {testing === "testing" ? "Testing…" : "Test"}
                </button>
                <button className="btn" style={{ flex: 1 }} onClick={save}>
                  {saved ? <><Icon name="check" size={17} strokeWidth={2.4} /> Saved</> : t("settings.save")}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ——— Debug: log viewer ——— */}
        <div className="settings-section" style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: "4px 16px", marginTop: 8 }}>
          <button
            style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "12px 0", background: "none", border: "none", color: "var(--text)", fontSize: 14.5, fontWeight: 520, textAlign: "left" }}
            onClick={() => { setShowLogs(!showLogs); if (!showLogs) setLogEntries(log.entries()); }}
          >
            <span style={{ flex: 1 }}>Debug log ({logEntries.length} entries)</span>
            <button
              style={{ background: "none", border: "none", color: "var(--fade)", fontSize: 11, padding: "2px 8px", marginRight: 4 }}
              onClick={e => { e.stopPropagation(); log.clear(); setLogEntries([]); }}
            >Clear</button>
            <Icon name={showLogs ? "chevronUp" : "chevronDown"} size={16} strokeWidth={2} />
          </button>
          {showLogs && (
            <div style={{ paddingBottom: 12, maxHeight: 300, overflow: "auto" }}>
              {logEntries.length === 0 && <div style={{ fontSize: 12, color: "var(--muted)", padding: "8px 0" }}>No entries</div>}
              {logEntries.map((e, i) => (
                <div key={i} style={{ fontFamily: "var(--mono)", fontSize: 11, lineHeight: 1.55, padding: "3px 0", borderBottom: "0.5px solid var(--border)", display: "flex", gap: 6, alignItems: "flex-start" }}>
                  <span style={{ color: "var(--fade)", whiteSpace: "nowrap", flex: "none" }}>{new Date(e.ts).toLocaleTimeString()}</span>
                  <span style={{ color: e.level === "error" ? "var(--danger)" : e.level === "warn" ? "var(--warn)" : "var(--muted)", fontWeight: 600, flex: "none", minWidth: 24 }}>{e.level.toUpperCase().slice(0, 4)}</span>
                  <span style={{ color: "var(--accent-2)", flex: "none", minWidth: 40 }}>[{e.category}]</span>
                  <span style={{ color: "var(--text-2)", wordBreak: "break-word" }}>{e.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="settings-footer">
          <Logo size={22} showText={true} textColor="var(--fade)" />
          <div className="settings-footer-v">v0.3.0</div>
        </div>
      </div>

      {scannerOpen && (
        <NativeQrScanner
          onResult={onQrScanned}
          onCancel={() => setScannerOpen(false)}
        />
      )}
    </div>
  );
}
