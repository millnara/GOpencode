import { getConn } from "./settings";
import { isConnected, request as wsRequest, subscribeSSE } from "./transport";
import type {
  Project, Session, MessageWithParts, ProvidersResponse, Agent, OcEvent, ModelRef,
  ConfigProvidersResponse, Command, FileEntry, PathResponse,
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
  if (isConnected()) {
    const method = opts.method || "GET";
    let body = undefined;
    if (opts.body) {
      try { body = JSON.parse(opts.body as string); } catch { body = undefined; }
    }
    const r = await wsRequest(method, path, body);
    if (r.status >= 400) throw new Error(`HTTP ${r.status}`);
    return r.body as T;
  }

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
  deleteSession: (dir: string, id: string) => req(`/session/${id}?${qd(dir)}`, { method: "DELETE" }),
  updateSession: (dir: string, id: string, patch: Record<string, any>) =>
    req<Session>(`/session/${id}?${qd(dir)}`, { method: "PATCH", body: JSON.stringify(patch) }),
  shareSession: (dir: string, id: string) => req<{ url: string }>(`/session/${id}/share?${qd(dir)}`, { method: "POST" }),
  forkSession: (dir: string, id: string, messageID?: string) =>
    req<Session>(`/session/${id}/fork?${qd(dir)}`, { method: "POST", body: JSON.stringify(messageID ? { messageID } : {}) }),
  compactSession: (dir: string, id: string, providerID?: string, modelID?: string) =>
    req(`/session/${id}/summarize?${qd(dir)}`, { method: "POST", body: JSON.stringify({ providerID, modelID }) }),
  revertSession: (dir: string, id: string, messageID: string) =>
    req(`/session/${id}/revert?${qd(dir)}`, { method: "POST", body: JSON.stringify({ messageID }) }),
  shell: (dir: string, id: string, command: string) =>
    req(`/session/${id}/shell?${qd(dir)}`, { method: "POST", body: JSON.stringify({ command }) }),
  send: (dir: string, id: string, model: ModelRef, agent: string, text: string) =>
    req(`/session/${id}/message?${qd(dir)}`, {
      method: "POST",
      body: JSON.stringify({ model, agent, parts: [{ type: "text", text }] }),
    }),
  promptAsync: async (dir: string, id: string, model: ModelRef, agent: string, text: string, variant?: string | null, system?: string | null) => {
    try {
      const body: Record<string, any> = { model, agent, parts: [{ type: "text", text }] };
      if (variant) body.variant = variant;
      if (system) body.system = system;

      if (isConnected()) {
        await wsRequest("POST", `/session/${id}/prompt_async?${qd(dir)}`, body);
        return true;
      }

      const r = await fetch(url(`/session/${id}/prompt_async?${qd(dir)}`), {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeader() },
        body: JSON.stringify(body),
      });
      return r.ok;
    } catch {
      return false;
    }
  },
  abort: (dir: string, id: string) => req<boolean>(`/session/${id}/abort?${qd(dir)}`, { method: "POST" }),
  respondPermission: (dir: string, id: string, permID: string, response: "once" | "always" | "reject") =>
    req<boolean>(`/session/${id}/permissions/${permID}?${qd(dir)}`, {
      method: "POST", body: JSON.stringify({ response }),
    }),
  providers: () => req<ProvidersResponse>("/provider"),
  agents: () => req<Agent[]>("/agent"),
  configProviders: () => req<ConfigProvidersResponse>("/config/providers"),
  commands: () => req<Command[]>("/command"),
  runCommand: (dir: string, id: string, command: string, args: string) =>
    req(`/session/${id}/command?${qd(dir)}`, {
      method: "POST",
      body: JSON.stringify({ command, arguments: args }),
    }),
  listDir: (dir: string) => req<FileEntry[]>(`/file?path=.&${qd(dir)}`),
  path: () => req<PathResponse>("/path"),
  replyQuestion: (dir: string, id: string, answers: string[][]) =>
    req(`/question/${id}/reply?${qd(dir)}`, {
      method: "POST",
      body: JSON.stringify({ answers }),
    }),
  rejectQuestion: (dir: string, id: string) =>
    req(`/question/${id}/reject?${qd(dir)}`, { method: "POST" }),
  diff: (dir: string, id: string) => req<{ file: string; before: string; after: string }[]>(`/session/${id}/diff?${qd(dir)}`),
  todo: (dir: string, id: string) => req<{ content: string; status: string; priority: string }[]>(`/session/${id}/todo?${qd(dir)}`),
};

export function defaultModel(prov: ProvidersResponse | null): ModelRef | null {
  const connected = Array.isArray(prov?.connected) ? prov!.connected : [];
  if (!connected.length) return null;
  const first = connected[0];
  const models = Object.keys(first?.models || prov?.all?.[first.id]?.models || {});
  if (!models.length) return null;
  const pref = models.find((m) => m.includes("gpt-5") || m.includes("sonnet") || m.includes("claude")) || models[0];
  return { providerID: first.id, modelID: pref };
}

export function streamEvents(dir: string, onEvent: (ev: OcEvent) => void): () => void {
  if (isConnected()) {
    return subscribeSSE("/event", dir, onEvent);
  }

  let abort = new AbortController();
  let stopped = false;
  const stop = () => { stopped = true; abort.abort(); };

  const run = async () => {
    const u = url(`/event?${qd(dir)}`);
    const h = authHeader();
    try {
      const r = await fetch(u, { headers: { ...h, Accept: "text/event-stream" }, signal: abort.signal });
      const reader = r.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let buf = "";
      while (!stopped) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("data:")) {
            try { onEvent(JSON.parse(trimmed.slice(5).trim())); } catch { /* */ }
          }
        }
      }
    } catch {
      if (!stopped) setTimeout(() => { if (!stopped) run(); }, 3000);
    }
  };
  run();
  return stop;
}
