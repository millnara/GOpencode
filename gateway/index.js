import { createServer } from "http";
import { WebSocketServer } from "ws";
import QRCode from "qrcode";
import { randomBytes } from "crypto";

const PORT = parseInt(process.env.GATEWAY_PORT || "8765");
const OC_URL = process.env.OPENCODE_URL || "http://127.0.0.1:4096";
const OC_USER = process.env.OPENCODE_USER || "opencode";
const OC_PASS = process.env.OPENCODE_PASSWORD || "";
const PAIRING_ROOM = process.env.PAIRING_ROOM || randomBytes(8).toString("hex");
const PAIRING_PW = process.env.PAIRING_PW || randomBytes(12).toString("base64url");

const ocAuth = "Basic " + Buffer.from(`${OC_USER}:${OC_PASS}`).toString("base64");

const server = createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") { res.writeHead(200); res.end(); return; }

  if (req.url === "/pairing") {
    const info = { ws: `ws://localhost:${PORT}`, room: PAIRING_ROOM, pw: PAIRING_PW };
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(info));
    return;
  }

  if (req.url === "/qr") {
    try {
      const data = JSON.stringify({ ws: `ws://localhost:${PORT}`, room: PAIRING_ROOM, pw: PAIRING_PW });
      const qr = await QRCode.toString(data, { type: "terminal", small: true });
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("SCAN WITH GOPENCODE TO PAIR\n\n" + qr + "\n\nRoom: " + PAIRING_ROOM + "\nPort: " + PORT);
    } catch (e) {
      res.writeHead(500);
      res.end(String(e));
    }
    return;
  }

  res.writeHead(404); res.end("not found");
});

const wss = new WebSocketServer({ server });
let phoneWs = null;

wss.on("connection", (ws) => {
  let authed = false;
  let room = "";
  const subscriptions = new Map();

  ws.on("message", async (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    if (!authed) {
      if (msg.type === "auth" && msg.room === PAIRING_ROOM && msg.pw === PAIRING_PW) {
        authed = true;
        room = msg.room;
        phoneWs = ws;
        ws.send(JSON.stringify({ id: msg.id, type: "authed" }));
      } else {
        ws.send(JSON.stringify({ id: msg.id, error: "auth failed" }));
      }
      return;
    }

    if (msg.type === "sse-start") {
      const subId = msg.id;
      const ac = new AbortController();
      subscriptions.set(subId, ac);
      try {
        const dir = msg.directory || "";
        const sep = msg.path?.includes("?") ? "&" : "?";
        const fullUrl = OC_URL + (msg.path || "/event") + (dir ? sep + "directory=" + encodeURIComponent(dir) : "");
        const resp = await fetch(fullUrl, { headers: { authorization: ocAuth }, signal: ac.signal });
        const reader = resp.body?.getReader();
        if (!reader) { ws.send(JSON.stringify({ id: subId, type: "sse-error", error: "no body" })); return; }
        const decoder = new TextDecoder();
        let buf = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() || "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith("data:")) {
              try {
                const data = JSON.parse(trimmed.slice(5).trim());
                ws.send(JSON.stringify({ id: subId, type: "sse-event", event: data }));
              } catch { /* skip partial */ }
            }
          }
        }
      } catch (e) {
        if (e.name !== "AbortError") ws.send(JSON.stringify({ id: subId, type: "sse-error", error: e.message }));
      }
      subscriptions.delete(subId);
      return;
    }

    if (msg.type === "sse-stop") {
      const ac = subscriptions.get(msg.id);
      if (ac) { ac.abort(); subscriptions.delete(msg.id); }
      return;
    }

    try {
      const url = OC_URL + (msg.path || "/");
      const opts = {
        method: msg.method || "GET",
        headers: { authorization: ocAuth, "content-type": "application/json" },
        signal: AbortSignal.timeout(120000),
      };
      if (msg.body && msg.method !== "GET") opts.body = JSON.stringify(msg.body);
      const resp = await fetch(url, opts);
      let body = null;
      const ct = resp.headers.get("content-type") || "";
      if (ct.includes("json")) body = await resp.json();
      else if (ct.includes("text")) body = await resp.text();
      else if (resp.status !== 204) { try { body = await resp.text(); } catch { body = ""; } }
      ws.send(JSON.stringify({ id: msg.id, status: resp.status, body, headers: Object.fromEntries(resp.headers) }));
    } catch (e) {
      ws.send(JSON.stringify({ id: msg.id, status: 0, error: e.message }));
    }
  });

  ws.on("close", () => {
    for (const ac of subscriptions.values()) ac.abort();
    subscriptions.clear();
    if (phoneWs === ws) phoneWs = null;
  });
});

server.listen(PORT, () => {
  console.log(`GOpencode gateway on ws://localhost:${PORT}`);
  console.log(`Room: ${PAIRING_ROOM}  PW: ${PAIRING_PW}`);
  QRCode.toString(JSON.stringify({ ws: `ws://localhost:${PORT}`, room: PAIRING_ROOM, pw: PAIRING_PW }), { type: "terminal", small: true }).then(qr => console.log(qr));
});
