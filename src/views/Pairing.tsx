import { useRef, useState } from "react";
import { connect, disconnect } from "../lib/transport";
import { savePairing, clearPairing } from "../lib/settings";
import type { Pairing } from "../lib/settings";
import jsQR from "jsqr";
import Icon from "../components/Icon";

export default function Pairing({ onDone }: { onDone: () => void }) {
  const [url, setUrl] = useState("");
  const [room, setRoom] = useState("");
  const [pw, setPw] = useState("");
  const [status, setStatus] = useState<"idle" | "connecting" | "ok" | "err">("idle");
  const [msg, setMsg] = useState("");
  const [scanning, setScanning] = useState(false);
  const [endpoints, setEndpoints] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const doConnect = async () => {
    if (!url || !room) { setMsg("URL and room ID required"); return; }
    const wsUrl = url.startsWith("ws") ? url : url.replace(/^http/, "ws");
    const urls = endpoints.length > 0 ? endpoints : [wsUrl];
    setStatus("connecting"); setMsg("");
    try {
      await connect(urls, room, pw);
      await savePairing({ urls, room, pw });
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

  const onPicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setScanning(true); setMsg("Reading QR…");
    try {
      const img = await loadImage(f);
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(data.data, data.width, data.height);
      if (!code) throw new Error("No QR code found in image");
      applyPayload(code.data);
    } catch (err: any) {
      setMsg(err.message || "Failed to read QR");
    } finally {
      setScanning(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const applyPayload = (raw: string) => {
    try {
      const j = JSON.parse(raw);
      if (Array.isArray(j.endpoints)) {
        setEndpoints(j.endpoints);
        setUrl(j.endpoints[0] || "");
      } else if (j.ws) {
        setUrl(j.ws);
        setEndpoints([j.ws]);
      } else if (j.url) {
        setUrl(j.url);
        setEndpoints([j.url]);
      }
      if (j.room) setRoom(j.room);
      if (j.pw) setPw(j.pw);
      setMsg(j.endpoints
        ? `QR scanned — ${j.endpoints.length} endpoint(s) found. Review and tap Connect.`
        : "QR scanned — review and tap Connect");
    } catch {
      setMsg("QR is not a valid pairing code");
    }
  };

  return (
    <div className="screen">
      <div className="topbar">
        <button className="iconbtn" onClick={() => history.back()} aria-label="Back">
          <Icon name="back" size={22} strokeWidth={2} />
        </button>
        <div className="title">Pair device<div className="sub">Scan the QR from your desktop gateway</div></div>
      </div>
      <div className="content">
        <div style={{ maxWidth: 420, margin: "0 auto", padding: "0 20px 40px" }}>
          {status === "ok" && (
            <div className="errbox" style={{ margin: "16px 0", borderColor: "var(--ok)", color: "var(--ok)", background: "var(--ok-bg)", textAlign: "center" }}>
              Connected! Redirecting…
            </div>
          )}

          <div className="settings-section">
            <button
              className="btn"
              style={{ marginBottom: 12 }}
              disabled={scanning}
              onClick={() => fileRef.current?.click()}
            >
              {scanning ? (
                <><Icon name="refresh" size={17} strokeWidth={2.2} /> Reading…</>
              ) : (
                <><Icon name="qr" size={18} strokeWidth={1.8} /> Scan QR from desktop</>
              )}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={onPicked}
              style={{ display: "none" }}
            />
            <div className="hint" style={{ textAlign: "center", marginBottom: 8 }}>
              On your PC: open GOpencode tray → "Show pairing QR", then scan it here.
            </div>
          </div>

          <div className="settings-section">
            <div className="label">Primary gateway URL</div>
            <input type="text" placeholder="ws://your-pc:8765" value={url} onChange={e => setUrl(e.target.value)} autoCapitalize="off" autoCorrect="off" />
            {endpoints.length > 1 && (
              <>
                <div className="label" style={{ marginTop: 10 }}>Backup endpoints ({endpoints.length - 1})</div>
                <div className="hint" style={{ fontFamily: "monospace", fontSize: 11, lineHeight: 1.5 }}>
                  {endpoints.slice(1).map((e, i) => <div key={i}>{e}</div>)}
                </div>
              </>
            )}
            <div className="label">Room ID</div>
            <input type="text" placeholder="from gateway terminal" value={room} onChange={e => setRoom(e.target.value)} autoCapitalize="off" />
            <div className="label">Password</div>
            <input type="password" placeholder="from gateway terminal" value={pw} onChange={e => setPw(e.target.value)} />

            <button className="btn" disabled={status === "connecting"} onClick={doConnect}>
              {status === "connecting" ? "Connecting…" : status === "ok" ? <><Icon name="check" size={17} strokeWidth={2.4} /> Connected</> : "Connect"}
            </button>

            {msg && <div className="hint" style={{ textAlign: "center", marginTop: 8, color: status === "ok" ? "var(--ok)" : status === "err" ? "var(--danger)" : "var(--muted)" }}>{msg}</div>}

            {status === "ok" && (
              <button className="btn secondary" onClick={doDisconnect}>Disconnect</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not load image")); };
    img.src = url;
  });
}
