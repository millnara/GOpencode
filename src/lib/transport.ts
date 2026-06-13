import { getConn, savePairing, setPairingCache, savePhrases, type ReconnectMode } from "./settings";
import { log } from "./log";

let ws: WebSocket | null = null;
let msgId = 0;
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();
let sseHandlers = new Map<number, (ev: any) => void>();
// Subscription intent, kept ACROSS reconnects. onConnectionLost clears the live
// sseHandlers routing map, but these survive so attachSocket can replay sse-start
// on the fresh socket — otherwise a reconnect leaves every stream silent (chat
// spinner stuck on "working" forever because session.idle never arrives).
const activeSubs = new Map<number, { path: string; directory: string; handler: (ev: any) => void }>();
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
  log.info("transport", "state → " + s);
  for (const l of stateListeners) l(s);
}

export function onStateChange(fn: StateListener): () => void {
  stateListeners.add(fn);
  return () => { stateListeners.delete(fn); };
}

type AppUpdateListener = (hash: string, version: string) => void;
const appUpdateListeners = new Set<AppUpdateListener>();
export function onAppUpdate(fn: AppUpdateListener): () => void {
  appUpdateListeners.add(fn);
  return () => { appUpdateListeners.delete(fn); };
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

export function getActiveUrl(): string | null {
  return lastSuccessfulIdx >= 0 && lastSuccessfulIdx < currentUrls.length
    ? currentUrls[lastSuccessfulIdx] : null;
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

const KEEPALIVE_IDLE_MS = 10_000;
const PONG_TIMEOUT_MS = 15_000;

function startKeepalive() {
  clearKeepalive();
  lastPongAt = Date.now();
  pingSentAt = 0;
  keepaliveTimer = setInterval(() => {
    const now = Date.now();
    // A large frame (e.g. an image upload) still flushing keeps the link busy;
    // pings queue behind it, so don't count silence against the connection.
    if (ws && ws.bufferedAmount > 0) {
      lastPongAt = now;
      pingSentAt = 0;
      return;
    }
    if (pingSentAt > 0) {
      if (now - pingSentAt > PONG_TIMEOUT_MS) {
        onConnectionLost("keepalive timeout");
        return;
      }
    } else if (now - lastPongAt > KEEPALIVE_IDLE_MS) {
      pingSentAt = now;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "ping" }));
      }
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

  notePong(); // any inbound traffic proves the link is alive

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
    log.info("transport", "relocate: " + msg.endpoints.join(", "));
    handleRelocate(msg.endpoints);
    return;
  }
  if (msg.type === "phrases" && msg.set && Array.isArray(msg.set.phrases)) {
    log.info("transport", "phrases set received: " + (msg.set.name || ""));
    savePhrases({ name: msg.set.name || "Set", phrases: msg.set.phrases });
    return;
  }
  if (msg.type === "app-update") {
    log.info("transport", "app-update received hash=" + (msg.hash || ""));
    for (const l of appUpdateListeners) l(msg.hash, msg.version);
    return;
  }
  const p = pending.get(msg.id);
  if (p) {
    pending.delete(msg.id);
    if (msg.error) { log.error("transport", "server error: " + msg.error); p.reject(new Error(msg.error)); }
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
  // Only force reconnect if the currently-active endpoint was removed
  const activeUrl = lastSuccessfulIdx >= 0 && lastSuccessfulIdx < currentUrls.length
    ? currentUrls[lastSuccessfulIdx] : null;
  currentUrls = merged;
  if (!activeUrl || merged.includes(activeUrl)) {
    lastSuccessfulIdx = activeUrl ? merged.indexOf(activeUrl) : -1;
    return;
  }
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
    log.info("transport", "ws connecting: " + url);
    let socket: WebSocket;
    try {
      socket = new WebSocket(url);
    } catch (e: any) {
      log.error("transport", "ws constructor failed: " + url, e?.message || e);
      if (!settled) { settled = true; reject(new Error("constructor: " + (e?.message || String(e)))); }
      return;
    }
    const t = setTimeout(() => {
      if (settled) return;
      settled = true;
      console.error("[ws] timeout after", timeoutMs, "ms on", url);
      socket.close();
      reject(new Error("timeout"));
    }, timeoutMs);
    socket.onopen = () => {
      log.debug("transport", "ws open: " + url);
      socket.send(JSON.stringify({ type: "auth", room, pw, id: -1 }));
    };
    socket.onmessage = (e) => {
      let msg: any;
      try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.type === "authed") {
        if (settled) return;
        settled = true;
        log.info("transport", "ws authed: " + url);
        clearTimeout(t);
        resolve(socket);
        return;
      }
      if (msg.error) {
        if (settled) return;
        settled = true;
        clearTimeout(t);
        socket.close();
        if (msg.error === "auth failed") {
          reject(new Error("auth changed — rescan QR"));
        } else {
          reject(new Error(msg.error));
        }
      }
      if (settled) {
        preAttachQueue.push(msg);
      }
    };
    socket.onerror = () => {
      if (settled) return;
      settled = true;
      clearTimeout(t);
      log.error("transport", "ws error: " + url);
      reject(new Error("connection failed"));
    };
    socket.onclose = (ev) => {
      if (settled) return;
      settled = true;
      clearTimeout(t);
      log.error("transport", "ws closed: " + url + " code=" + ev.code + " reason=" + ev.reason);
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

  lastEndpointErrors = [];

  for (const { url, idx } of ordered) {
    try {
      const sock = await tryConnectUrl(url, currentRoom, currentPw, 3500);
      lastSuccessfulIdx = idx;
      return sock;
    } catch (e: any) {
      lastEndpointErrors.push({ url, error: e?.message || String(e) });
    }
  }
  return null;
}

let lastEndpointErrors: { url: string; error: string }[] = [];
export function getLastEndpointErrors() { return lastEndpointErrors; }
let preAttachQueue: any[] = [];

function httpBaseFromWs(wsUrl: string): string | null {
  try {
    const u = new URL(wsUrl);
    const proto = u.protocol === "wss:" ? "https:" : "http:";
    return `${proto}//${u.host}`;
  } catch { return null; }
}

// When every saved ws:// endpoint is unreachable, the desktop's LAN/public IPs
// may have changed while we were away (the gateway only pushes `relocate` to a
// LIVE phone). Any host that still answers HTTP GET /pairing — typically the
// stable Tailscale address — hands back the gateway's current endpoint list, so
// we adopt it and retry instead of stranding the user on dead URLs. Returns
// true only when the endpoint set actually changed (so the caller retries),
// avoiding a tight loop when the same dead list comes back.
async function selfHealEndpoints(): Promise<boolean> {
  const seen = new Set<string>();
  const bases: string[] = [];
  for (const u of currentUrls) {
    const b = httpBaseFromWs(u);
    if (b && !seen.has(b)) { seen.add(b); bases.push(b); }
  }
  for (const base of bases) {
    try {
      const r = await fetch(base + "/pairing", { signal: AbortSignal.timeout(3000) });
      if (!r.ok) continue;
      const p = await r.json();
      const fresh: string[] = Array.isArray(p.endpoints) ? p.endpoints : [];
      if (fresh.length === 0) continue;
      // Preserve stable tunnel (Tailscale) URLs even if the gateway didn't list
      // them this round — mirrors handleRelocate.
      const merged: string[] = [];
      const ms = new Set<string>();
      for (const e of fresh) if (typeof e === "string" && !ms.has(e)) { merged.push(e); ms.add(e); }
      for (const t of currentUrls) if (isTunnelUrl(t) && !ms.has(t)) { merged.push(t); ms.add(t); }
      const changed = merged.length !== currentUrls.length || merged.some((u, i) => u !== currentUrls[i]);
      currentUrls = merged;
      if (typeof p.room === "string" && p.room) currentRoom = p.room;
      if (typeof p.pw === "string" && p.pw) currentPw = p.pw;
      lastSuccessfulIdx = -1;
      await savePairing({ urls: merged, room: currentRoom, pw: currentPw });
      setPairingCache({ urls: merged, room: currentRoom, pw: currentPw });
      log.info("transport", `self-heal: refreshed ${merged.length} endpoint(s) from ${base}` + (changed ? " (changed)" : " (unchanged)"));
      return changed;
    } catch { /* try next host */ }
  }
  return false;
}

export async function connect(urls: string[] | string, room: string, pw: string): Promise<void> {
  if (typeof urls === "string") urls = [urls];
  if (urls.length === 0) throw new Error("no URLs provided");

  cancelReconnect();
  disconnect(false);

  currentUrls = urls.slice();
  currentRoom = room;
  currentPw = pw;
  lastSuccessfulIdx = -1;
  reconnectAttempt = 0;
  isStranded = false;
  preAttachQueue = [];
  setState("connecting");

  try {
    let socket = await tryAllEndpoints();
    if (!socket && await selfHealEndpoints()) {
      socket = await tryAllEndpoints();
    }
    if (!socket) {
      const details = lastEndpointErrors.map(e => `${e.url}: ${e.error}`).join("; ");
      throw new Error("all endpoints failed" + (details ? " — " + details : ""));
    }
    await attachSocket(socket);
  } catch (e: any) {
    const msg = e?.message || "";
    if (msg.includes("auth changed") || msg.includes("auth failed")) {
      currentUrls = [];
      currentRoom = "";
      currentPw = "";
    }
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
  for (const msg of preAttachQueue) {
    if (msg.type === "webrtc-offer" && msg.sdp) {
      try { setupWebRTC(JSON.parse(msg.sdp)); } catch { /* */ }
    } else if (msg.type === "webrtc-candidate" && msg.candidate && pc) {
      try { pc.addIceCandidate(new RTCIceCandidate(JSON.parse(msg.candidate))); } catch { /* */ }
    }
  }
  preAttachQueue = [];
  socket.onclose = () => onConnectionLost("closed");
  socket.onerror = () => { /* onclose will follow */ };

  isConnectedFlag = true;
  reconnectAttempt = 0;
  isStranded = false;

  // Re-arm any SSE subscriptions that outlived the previous socket. The gateway's
  // per-connection subscription table is fresh, so replaying sse-start is what
  // brings the chat/todo event streams back after a reconnect. Without this the
  // socket is "connected" but no events flow.
  for (const [id, sub] of activeSubs) {
    sseHandlers.set(id, sub.handler);
    send({ id, type: "sse-start", path: sub.path, directory: sub.directory });
  }

  setState("connected");
  startKeepalive();
}

function onConnectionLost(reason: string) {
  if (!isConnectedFlag && !ws && !dc) return;
  log.warn("transport", "connection lost: " + reason);
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
}

function getBackoffMs(mode: ReconnectMode, attempt: number): number {
  if (mode === "aggressive") {
    const seq = [500, 1_000, 2_000, 5_000, 10_000, 30_000];
    return seq[Math.min(attempt, seq.length - 1)];
  }
  const seq = [1_000, 3_000, 10_000, 30_000, 60_000, 120_000];
  return seq[Math.min(attempt, seq.length - 1)];
}

const STRANDED_AFTER_ATTEMPTS = 10;
const STRANDED_RETRY_MS = 300_000;

function scheduleReconnect(delayMs: number, stranded = false) {
  cancelReconnect();
  log.info("transport", "reconnect scheduled in " + delayMs + "ms" + (stranded ? " (stranded)" : ""));
  setState(stranded ? "stranded" : "reconnecting");
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    if (!currentUrls.length || !currentRoom) return;
    if (!stranded) setState("connecting");
    try {
      let socket = await tryAllEndpoints();
      // All saved endpoints dead — refresh from any host still answering
      // /pairing (e.g. Tailscale) before counting this as a failed attempt.
      if (!socket && await selfHealEndpoints()) {
        socket = await tryAllEndpoints();
      }
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
    reconnectAttempt++;
    // Never give up while a pairing exists — just slow down. The banner tells
    // the user we're stranded, but a background retry keeps running so the
    // connection comes back on its own when the desktop is reachable again.
    if (reconnectAttempt >= STRANDED_AFTER_ATTEMPTS) {
      log.warn("transport", "stranded after " + reconnectAttempt + " attempts");
      scheduleReconnect(STRANDED_RETRY_MS, true);
      return;
    }
    scheduleReconnect(getBackoffMs(mode, reconnectAttempt));
  }, delayMs);
}

// Retry immediately when the app comes back to the foreground or the network
// returns — backgrounded WebSockets die silently on Android, and waiting out
// a long backoff window after reopening the app feels broken.
function nudgeReconnect() {
  if (isConnectedFlag) return;
  if (!currentUrls.length || !currentRoom) return;
  reconnectAttempt = 0;
  scheduleReconnect(0);
}
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") nudgeReconnect();
  });
}
if (typeof window !== "undefined") {
  window.addEventListener("online", () => nudgeReconnect());
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
  activeSubs.clear(); // intentional teardown — drop subscription intent too
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
  // Large payloads (image attachments) can take a while to flush on a slow
  // uplink — give them more headroom than plain calls.
  const timeoutMs = body ? 90_000 : 30_000;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    send({ id, method, path, body });
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); log.error("transport", "request timeout: " + method + " " + path); reject(new Error("timeout")); } }, timeoutMs);
  });
}

export function subscribeSSE(path: string, directory: string, handler: (ev: any) => void): () => void {
  const id = ++msgId;
  // Record intent regardless of connection state; if we're momentarily down the
  // sub is armed on the next attachSocket so the consumer never has to re-subscribe.
  activeSubs.set(id, { path, directory, handler });
  if (isConnectedFlag) {
    sseHandlers.set(id, handler);
    send({ id, type: "sse-start", path, directory });
  }
  return () => {
    sseHandlers.delete(id);
    activeSubs.delete(id);
    if (isConnectedFlag) send({ id, type: "sse-stop" });
  };
}
