import { getConn } from "./settings";
import type {
  Project, Session, MessageWithParts, ProvidersResponse, Agent, OcEvent, ModelRef,
} from "./types";

function authHeader(): Record<string, string> {
  const { username, password } = getConn();
  if (!password) return {};
  return { Authorization: "Basic " + btoa(`${username}:${password}`) };
}
function url(path: string): string {
  const base = getConn().baseUrl.replace(/\/$/, "");
  return base + path;
}
async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const r = await fetch(url(path), {
    ...opts,
    headers: { "content-type": "application/json", ...authHeader(), ...(opts.headers || {}) },
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`HTTP ${r.status}${t ? ": " + t.slice(0, 200) : ""}`);
  }
  const t = await r.text();
  return (t ? JSON.parse(t) : null) as T;
}
const qd = (dir: string) => "directory=" + encodeURIComponent(dir);

export const api = {
  projects: () => req<Project[]>("/project"),
  sessions: (dir: string) => req<Session[]>(`/session?${qd(dir)}`),
  createSession: (dir: string, title?: string) =>
    req<Session>(`/session?${qd(dir)}`, { method: "POST", body: JSON.stringify(title ? { title } : {}) }),
  session: (dir: string, id: string) => req<Session>(`/session/${id}?${qd(dir)}`),
  messages: (dir: string, id: string) => req<MessageWithParts[]>(`/session/${id}/message?${qd(dir)}`),
  send: (dir: string, id: string, model: ModelRef, agent: string, text: string) =>
    req(`/session/${id}/message?${qd(dir)}`, {
      method: "POST",
      body: JSON.stringify({ model, agent, parts: [{ type: "text", text }] }),
    }),
  abort: (dir: string, id: string) => req<boolean>(`/session/${id}/abort?${qd(dir)}`, { method: "POST" }),
  respondPermission: (dir: string, id: string, permID: string, response: "once" | "always" | "reject") =>
    req<boolean>(`/session/${id}/permissions/${permID}?${qd(dir)}`, {
      method: "POST", body: JSON.stringify({ response }),
    }),
  providers: () => req<ProvidersResponse>("/provider"),
  agents: () => req<Agent[]>("/agent"),
};

/**
 * Stream the opencode global event bus via SSE using fetch() + ReadableStream,
 * so we can attach the Authorization header (EventSource can't). Returns an abort fn.
 */
export function streamEvents(dir: string, onEvent: (e: OcEvent) => void): () => void {
  const ctrl = new AbortController();
  (async () => {
    while (!ctrl.signal.aborted) {
      try {
        const r = await fetch(url(`/event?${qd(dir)}`), {
          headers: { Accept: "text/event-stream", ...authHeader() },
          signal: ctrl.signal,
        });
        if (!r.ok || !r.body) throw new Error("event stream " + r.status);
        const reader = r.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        while (!ctrl.signal.aborted) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let idx;
          while ((idx = buf.indexOf("\n\n")) >= 0) {
            const chunk = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            for (const line of chunk.split("\n")) {
              const m = line.match(/^data:\s?(.*)$/);
              if (m) { try { onEvent(JSON.parse(m[1])); } catch { /* ignore */ } }
            }
          }
        }
      } catch {
        if (ctrl.signal.aborted) return;
        await new Promise((res) => setTimeout(res, 1500)); // reconnect backoff
      }
    }
  })();
  return () => ctrl.abort();
}

/** Pick a sensible default model from /provider's connected list. */
export function defaultModel(p: ProvidersResponse): ModelRef {
  const ids = Array.isArray(p.connected) ? p.connected.map((x) => x.id) : Object.keys(p.connected || {});
  const first = ids[0];
  if (first) return { providerID: first, modelID: p.default?.[first] || Object.keys(p.all?.[first]?.models || {})[0] || "" };
  return { providerID: "opencode", modelID: "minimax-m3-free" };
}
export function connectedProviders(p: ProvidersResponse) {
  const ids = Array.isArray(p.connected) ? p.connected.map((x) => x.id) : Object.keys(p.connected || {});
  return ids.map((id) => ({ id, name: p.all?.[id]?.name || id, models: p.all?.[id]?.models || {} }));
}
