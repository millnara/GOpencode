let ws: WebSocket | null = null;
let msgId = 0;
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();
let sseHandlers = new Map<number, (ev: any) => void>();
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectUrl = "";
let reconnectRoom = "";
let reconnectPw = "";

export function isConnected(): boolean {
  return ws?.readyState === WebSocket.OPEN;
}

export async function connect(url: string, room: string, pw: string): Promise<void> {
  disconnect();
  reconnectUrl = url;
  reconnectRoom = room;
  reconnectPw = pw;

  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.onopen = () => {
      socket.send(JSON.stringify({ type: "auth", room, pw, id: -1 }));
    };
    socket.onmessage = (e) => {
      let msg: any;
      try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.type === "authed") {
        ws = socket;
        resolve();
        return;
      }
      if (!ws) { reject(new Error(msg.error || "auth failed")); socket.close(); return; }
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
      const p = pending.get(msg.id);
      if (p) {
        pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error));
        else p.resolve({ status: msg.status || 200, body: msg.body, headers: msg.headers || {} });
      }
    };
    socket.onclose = () => {
      ws = null;
      for (const [, p] of pending) p.reject(new Error("disconnected"));
      pending.clear();
      if (reconnectUrl) {
        reconnectTimer = setTimeout(() => connect(reconnectUrl, reconnectRoom, reconnectPw).catch(() => {}), 3000);
      }
    };
    socket.onerror = () => { if (!ws) reject(new Error("connection failed")); };
    setTimeout(() => { if (!ws) { socket.close(); reject(new Error("timeout")); } }, 10000);
  });
}

export function disconnect() {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  reconnectUrl = "";
  if (ws) { ws.onclose = null; ws.close(); ws = null; }
  for (const [, p] of pending) p.reject(new Error("disconnected"));
  pending.clear();
  sseHandlers.clear();
}

export async function request(method: string, path: string, body?: any): Promise<{ status: number; body: any; headers: Record<string, string> }> {
  if (!isConnected()) throw new Error("not connected");
  const id = ++msgId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws!.send(JSON.stringify({ id, method, path, body }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error("timeout")); } }, 60000);
  });
}

export function subscribeSSE(path: string, directory: string, handler: (ev: any) => void): () => void {
  if (!isConnected()) { handler({ type: "sse.error", properties: { error: "not connected" } }); return () => {}; }
  const id = ++msgId;
  sseHandlers.set(id, handler);
  ws!.send(JSON.stringify({ id, type: "sse-start", path, directory }));
  return () => {
    sseHandlers.delete(id);
    if (isConnected()) ws!.send(JSON.stringify({ id, type: "sse-stop" }));
  };
}
