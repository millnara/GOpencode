import { getConn, type ReconnectMode } from "./settings";

let ws: WebSocket | null = null;
let msgId = 0;
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();
let sseHandlers = new Map<number, (ev: any) => void>();
let pc: RTCPeerConnection | null = null;
let dc: RTCDataChannel | null = null;

let currentUrls: string[] = [];
let currentRoom: string = "";
let currentPw: string = "";
let isConnectedFlag = false;
let isStranded = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempt = 0;
let lastSuccessfulIdx = -1;
let keepaliveTimer: ReturnType<typeof setInterval> | null = null;
let lastPongAt = 0;
let pingSentAt = 0;

type StateListener = (state: TransportState) => void;
const stateListeners = new Set<StateListener>();

export type TransportState = "disconnected" | "connecting" | "connected" | "reconnecting" | "stranded";

function setState(s: TransportState) {
  isStranded = s === "stranded";
  for (const l of stateListeners) l(s);
}

export function onStateChange(fn: StateListener): () => void {
  stateListeners.add(fn);
  return () => { stateListeners.delete(fn); };
}

export function getState(): TransportState {
  if (isConnectedFlag) return "connected";
  return isStranded ? "stranded" : "disconnected";
}

export function isConnected(): boolean {
  return isConnectedFlag;
}

export function isP2P(): boolean {
  return dc?.readyState === "open";
}

export function getCurrentUrls(): string[] {
  return currentUrls.slice();
}

function send(msg: any) {
  if (dc && dc.readyState === "open") {
    dc.send(JSON.stringify(msg));
    return;
  }
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function clearKeepalive() {
  if (keepaliveTimer) {
    clearInterval(keepaliveTimer);
    keepaliveTimer = null;
  }
}

function startKeepalive() {
  clearKeepalive();
  lastPongAt = Date.now();
  pingSentAt = 0;
  keepaliveTimer = setInterval(() => {
    const now = Date.now();
    if (pingSentAt > 0) {
      if (now - pingSentAt > 8000) {
        onConnectionLost("keepalive timeout");
        return;
      }
    } else if (now - lastPongAt > 8000) {
      pingSentAt = now;
      send({ type: "ping" });
    }
  }, 2000);
}

function notePong() {
  lastPongAt = Date.now();
  pingSentAt = 0;
}

async function setupWebRTC(offer: any) {
  try {
    const config: RTCConfiguration = {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" }
      ],
    };
    pc = new RTCPeerConnection(config);

    pc.onicecandidate = (e) => {
      if (e.candidate && ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "webrtc-candidate", candidate: JSON.stringify(e.candidate) }));
      }
    };

    pc.ondatachannel = (e) => {
      dc = e.channel;
      setupDataChannel();
    };

    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "webrtc-answer", sdp: JSON.stringify(answer) }));
    }
  } catch (e) {
    pc = null;
  }
}

function setupDataChannel() {
  if (!dc) return;
  dc.onopen = () => { /* routing switches to dc */ };
  dc.onmessage = (e) => handleMessage(e.data);
  dc.onclose = () => { dc = null; };
}

function handleMessage(raw: any) {
  let msg: any;
  try { msg = JSON.parse(raw); } catch { return; }

  if (msg.type === "sse-event") {
    const handler = sseHandlers.get(msg.id);
    if (handler) handler(msg.event);
    return;
  }
  if (msg.type === "sse-error") {
    const handler = sseHandlers.get(msg.id);
    if (handler) handler({ type: "sse.error", properties: { error: msg.error } });
    sseHandlers.delete(msg.id);
    return;
  }
  if (msg.type === "pong") {
    notePong();
    return;
  }
  if (msg.type === "relocate" && Array.isArray(msg.endpoints)) {
    handleRelocate(msg.endpoints);
    return;
  }
  const p = pending.get(msg.id);
  if (p) {
    pending.delete(msg.id);
    if (msg.error) p.reject(new Error(msg.error));
    else p.resolve({ status: msg.status || 200, body: msg.body, headers: msg.headers || {} });
  }
}

function handleRelocate(newEndpoints: string[]) {
  if (newEndpoints.length === 0) return;
  const tunnelIps = currentUrls.filter(u => isTunnelUrl(u));
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const e of newEndpoints) {
    if (!seen.has(e)) { merged.push(e); seen.add(e); }
  }
  for (const t of tunnelIps) {
    if (!seen.has(t)) { merged.push(t); seen.add(t); }
  }
  currentUrls = merged;
  lastSuccessfulIdx = -1;
  reconnectAttempt = 0;
  cancelReconnect();
  if (isConnectedFlag) {
    isConnectedFlag = false;
    clearKeepalive();
    if (ws) { ws.onclose = null; try { ws.close(); } catch {} ; ws = null; }
    if (dc) { try { dc.close(); } catch {} ; dc = null; }
    if (pc) { try { pc.close(); } catch {} ; pc = null; }
  }
  scheduleReconnect(0);
}

function isTunnelUrl(u: string): boolean {
  const m = u.match(/^ws:\/\/([^\/:]+)/);
  if (!m) return false;
  const host = m[1];
  if (host.startsWith("[") && host.endsWith("]")) return false;
  const parts = host.split(".");
  if (parts.length !== 4) return false;
  const a = parseInt(parts[0], 10);
  const b = parseInt(parts[1], 10);
  return a === 100 && b >= 64 && b <= 127;
}

function tryConnectUrl(url: string, room: string, pw: string, timeoutMs: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const socket = new WebSocket(url);
    const t = setTimeout(() => {
      if (settled) return;
      settled = true;
      socket.close();
      reject(new Error("timeout"));
    }, timeoutMs);
    socket.onopen = () => {
      socket.send(JSON.stringify({ type: "auth", room, pw, id: -1 }));
    };
    socket.onmessage = (e) => {
      let msg: any;
      try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.type === "authed") {
        if (settled) return;
        settled = true;
        clearTimeout(t);
        resolve(socket);
        return;
      }
      if (msg.error) {
        if (settled) return;
        settled = true;
        clearTimeout(t);
        socket.close();
        reject(new Error(msg.error));
      }
    };
    socket.onerror = () => {
      if (settled) return;
      settled = true;
      clearTimeout(t);
      reject(new Error("connection failed"));
    };
    socket.onclose = (ev) => {
      if (settled) return;
      settled = true;
      clearTimeout(t);
      reject(new Error("closed (" + ev.code + ")"));
    };
  });
}

async function tryAllEndpoints(): Promise<WebSocket | null> {
  const startIdx = lastSuccessfulIdx >= 0 ? lastSuccessfulIdx : 0;
  const ordered: { url: string; idx: number }[] = [];
  for (let i = 0; i < currentUrls.length; i++) {
    const url = currentUrls[(startIdx + i) % currentUrls.length];
    ordered.push({ url, idx: (startIdx + i) % currentUrls.length });
  }

  for (const { url, idx } of ordered) {
    try {
      const sock = await tryConnectUrl(url, currentRoom, currentPw, 3500);
      lastSuccessfulIdx = idx;
      return sock;
    } catch {
      // try next
    }
  }
  return null;
}

export async function connect(urls: string[] | string, room: string, pw: string): Promise<void> {
  if (typeof urls === "string") urls = [urls];
  if (urls.length === 0) throw new Error("no URLs provided");

  cancelReconnect();
  currentUrls = urls.slice();
  currentRoom = room;
  currentPw = pw;
  lastSuccessfulIdx = -1;
  reconnectAttempt = 0;
  isStranded = false;
  setState("connecting");

  disconnect(false);

  try {
    const socket = await tryAllEndpoints();
    if (!socket) throw new Error("all endpoints failed");
    await attachSocket(socket);
  } catch (e) {
    setState("disconnected");
    throw e;
  }
}

async function attachSocket(socket: WebSocket): Promise<void> {
  ws = socket;
  socket.onmessage = (e) => {
    let msg: any;
    try { msg = JSON.parse(e.data); } catch { return; }
    if (msg.type === "authed") return;
    if (msg.type === "webrtc-offer" && msg.sdp) {
      try { setupWebRTC(JSON.parse(msg.sdp)); } catch { /* */ }
      return;
    }
    if (msg.type === "webrtc-candidate" && msg.candidate && pc) {
      try { pc.addIceCandidate(new RTCIceCandidate(JSON.parse(msg.candidate))); } catch { /* */ }
      return;
    }
    handleMessage(e.data);
  };
  socket.onclose = () => onConnectionLost("closed");
  socket.onerror = () => { /* onclose will follow */ };

  isConnectedFlag = true;
  reconnectAttempt = 0;
  isStranded = false;
  setState("connected");
  startKeepalive();
}

function onConnectionLost(reason: string) {
  if (!isConnectedFlag && !ws && !dc) return;
  isConnectedFlag = false;
  clearKeepalive();
  if (dc) { try { dc.close(); } catch {} ; dc = null; }
  if (pc) { try { pc.close(); } catch {} ; pc = null; }
  if (ws) { ws.onclose = null; try { ws.close(); } catch {} ; ws = null; }
  for (const [, p] of pending) p.reject(new Error("disconnected"));
  pending.clear();
  sseHandlers.clear();

  const mode = getConn().reconnectMode;
  if (mode === "off") {
    setState("disconnected");
    return;
  }
  scheduleReconnect(getBackoffMs(mode, reconnectAttempt));
  reconnectAttempt++;
}

function getBackoffMs(mode: ReconnectMode, attempt: number): number {
  if (mode === "aggressive") {
    const seq = [30_000, 60_000, 120_000, 120_000, 120_000];
    return seq[Math.min(attempt, seq.length - 1)];
  }
  const seq = [60_000, 300_000, 900_000, 900_000, 900_000];
  return seq[Math.min(attempt, seq.length - 1)];
}

function scheduleReconnect(delayMs: number) {
  cancelReconnect();
  setState("reconnecting");
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    if (!currentUrls.length || !currentRoom) return;
    setState("connecting");
    try {
      const socket = await tryAllEndpoints();
      if (socket) {
        await attachSocket(socket);
        return;
      }
    } catch { /* fall through */ }

    const mode = getConn().reconnectMode;
    if (mode === "off") {
      setState("disconnected");
      return;
    }
    if (reconnectAttempt >= 5) {
      const hasTunnel = currentUrls.some(isTunnelUrl);
      setState(hasTunnel ? "stranded" : "stranded");
      return;
    }
    scheduleReconnect(getBackoffMs(mode, reconnectAttempt));
    reconnectAttempt++;
  }, delayMs);
}

function cancelReconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

export function disconnect(cancelReconnectToo: boolean = true) {
  if (cancelReconnectToo) cancelReconnect();
  currentUrls = [];
  currentRoom = "";
  currentPw = "";
  lastSuccessfulIdx = -1;
  reconnectAttempt = 0;
  isStranded = false;
  isConnectedFlag = false;
  clearKeepalive();
  if (dc) { try { dc.close(); } catch {} ; dc = null; }
  if (pc) { try { pc.close(); } catch {} ; pc = null; }
  if (ws) { ws.onclose = null; try { ws.close(); } catch {} ; ws = null; }
  for (const [, p] of pending) p.reject(new Error("disconnected"));
  pending.clear();
  sseHandlers.clear();
  setState("disconnected");
}

export function reconnectNow() {
  if (!currentUrls.length || !currentRoom) return;
  reconnectAttempt = 0;
  isStranded = false;
  cancelReconnect();
  if (isConnectedFlag) {
    isConnectedFlag = false;
    clearKeepalive();
    if (ws) { ws.onclose = null; try { ws.close(); } catch {} ; ws = null; }
    if (dc) { try { dc.close(); } catch {} ; dc = null; }
    if (pc) { try { pc.close(); } catch {} ; pc = null; }
  }
  scheduleReconnect(0);
}

export async function request(method: string, path: string, body?: any): Promise<{ status: number; body: any; headers: Record<string, string> }> {
  if (!isConnectedFlag) throw new Error("not connected");
  const id = ++msgId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    send({ id, method, path, body });
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error("timeout")); } }, 60000);
  });
}

export function subscribeSSE(path: string, directory: string, handler: (ev: any) => void): () => void {
  if (!isConnectedFlag) { handler({ type: "sse.error", properties: { error: "not connected" } }); return () => {}; }
  const id = ++msgId;
  sseHandlers.set(id, handler);
  send({ id, type: "sse-start", path, directory });
  return () => {
    sseHandlers.delete(id);
    if (isConnectedFlag) send({ id, type: "sse-stop" });
  };
}
