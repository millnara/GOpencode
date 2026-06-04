import { useState } from "react";
import { connect, disconnect } from "../lib/transport";
import { savePairing, clearPairing, type Pairing } from "../lib/settings";

export default function Pairing({ onDone }: { onDone: () => void }) {
  const [url, setUrl] = useState("");
  const [room, setRoom] = useState("");
  const [pw, setPw] = useState("");
  const [status, setStatus] = useState<"idle" | "connecting" | "ok" | "err">("idle");
  const [msg, setMsg] = useState("");
  const [scanMode, setScanMode] = useState(false);

  const doConnect = async () => {
    if (!url || !room) { setMsg("URL and pairing code are required"); return; }
    const wsUrl = url.startsWith("ws") ? url : url.replace(/^http/, "ws");
    setStatus("connecting"); setMsg("");
    try {
      await connect(wsUrl, room, pw);
      const pair: Pairing = { url: wsUrl, room, pw };
      await savePairing(pair);
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
        <div className="title">Pair device<div className="sub">Connect to your opencode server</div></div>
      </div>
      <div className="content">
        <div className="list" style={{ maxWidth: 420, margin: "0 auto" }}>
          {status === "ok" && (
            <div className="errbox" style={{ borderColor: "var(--ok)", color: "var(--ok)", textAlign: "center" }}>
              Connected! Redirecting…
            </div>
          )}

          <label className="field">
            <span>Gateway URL</span>
            <input className="search" placeholder="ws://your-pc:8765" value={url} onChange={(e) => setUrl(e.target.value)} autoCapitalize="off" autoCorrect="off" />
          </label>
          <label className="field">
            <span>Room ID</span>
            <input className="search" placeholder="from gateway terminal" value={room} onChange={(e) => setRoom(e.target.value)} autoCapitalize="off" />
          </label>
          <label className="field">
            <span>Password</span>
            <input className="search" type="password" placeholder="from gateway terminal" value={pw} onChange={(e) => setPw(e.target.value)} />
          </label>

          <button className="primary" style={{ marginBottom: 8 }} disabled={status === "connecting"} onClick={doConnect}>
            {status === "connecting" ? "Connecting…" : status === "ok" ? "✓ Connected" : "Connect"}
          </button>

          {msg && <div className="hint" style={{ color: status === "ok" ? "var(--ok)" : status === "err" ? "var(--danger)" : "var(--muted)", textAlign: "center" }}>{msg}</div>}

          {status === "ok" && (
            <button className="primary" style={{ background: "var(--surface2)", color: "var(--muted)", marginTop: 8 }} onClick={doDisconnect}>Disconnect</button>
          )}

          <div style={{ marginTop: 24, borderTop: "1px solid var(--border)", paddingTop: 20 }}>
            <div className="section-label">How to pair</div>
            <div className="hint" style={{ marginBottom: 10 }}>
              1. Run <code>node gateway/index.js</code> on your PC<br/>
              2. Copy the URL, Room ID, and Password from the terminal<br/>
              3. Paste them above and tap Connect
            </div>
            <div className="hint">
              The gateway proxies all traffic to opencode running on <code>http://127.0.0.1:4096</code>.
              Keep it running while using GOpencode.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
