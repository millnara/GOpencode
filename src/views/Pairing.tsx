import { useState } from "react";
import { connect, disconnect } from "../lib/transport";
import { savePairing, clearPairing } from "../lib/settings";
import type { Pairing } from "../lib/settings";

export default function Pairing({ onDone }: { onDone: () => void }) {
  const [url, setUrl] = useState("");
  const [room, setRoom] = useState("");
  const [pw, setPw] = useState("");
  const [status, setStatus] = useState<"idle" | "connecting" | "ok" | "err">("idle");
  const [msg, setMsg] = useState("");

  const doConnect = async () => {
    if (!url || !room) { setMsg("URL and pairing code required"); return; }
    const wsUrl = url.startsWith("ws") ? url : url.replace(/^http/, "ws");
    setStatus("connecting"); setMsg("");
    try {
      await connect(wsUrl, room, pw);
      await savePairing({ url: wsUrl, room, pw });
      setStatus("ok");
      setTimeout(onDone, 600);
    } catch (e: any) {
      setStatus("err"); setMsg(e.message || "Connection failed");
    }
  };

  const doDisconnect = async () => {
    disconnect();
    await clearPairing();
    setStatus("idle"); setMsg("Disconnected");
  };

  return (
    <div className="screen">
      <div className="topbar">
        <button className="iconbtn" onClick={() => history.back()}>‹</button>
        <div className="title">Pair device<div className="sub">Connect to your desktop gateway</div></div>
      </div>
      <div className="content">
        <div style={{ maxWidth: 420, margin: "0 auto", padding: "0 0 40px" }}>
          {status === "ok" && (
            <div className="errbox" style={{ margin: "16px", borderColor: "var(--ok)", color: "var(--ok)", textAlign: "center" }}>
              Connected! Redirecting…
            </div>
          )}

          <div className="settings-section">
            <div className="label">Gateway URL</div>
            <input type="text" placeholder="ws://your-pc:8765" value={url} onChange={e => setUrl(e.target.value)} autoCapitalize="off" autoCorrect="off" />
            <div className="label">Room ID</div>
            <input type="text" placeholder="from gateway terminal" value={room} onChange={e => setRoom(e.target.value)} autoCapitalize="off" />
            <div className="label">Password</div>
            <input type="password" placeholder="from gateway terminal" value={pw} onChange={e => setPw(e.target.value)} />

            <button className="btn" disabled={status === "connecting"} onClick={doConnect}>
              {status === "connecting" ? "Connecting…" : status === "ok" ? "✓ Connected" : "Connect"}
            </button>

            {msg && <div style={{ fontSize: 13, padding: "6px 0", textAlign: "center", color: status === "ok" ? "var(--ok)" : "var(--danger)" }}>{msg}</div>}

            {status === "ok" && (
              <button className="btn secondary" onClick={doDisconnect}>Disconnect</button>
            )}
          </div>

          <div style={{ padding: "0 20px", marginTop: 20 }}>
            <div style={{ fontSize: 11, color: "var(--fade)", textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 600, marginBottom: 12 }}>How to pair</div>
            <div className="hint">1. Start the GOpencode desktop app on your PC</div>
            <div className="hint">2. Right-click the tray icon → "Show pairing QR"</div>
            <div className="hint">3. Copy the URL, Room ID, and Password</div>
            <div className="hint">4. Paste them above and tap Connect</div>
          </div>
        </div>
      </div>
    </div>
  );
}
