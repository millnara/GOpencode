export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogCategory = "transport" | "api" | "chat" | "ui" | "settings";

export interface LogEntry {
  ts: number;
  level: LogLevel;
  category: LogCategory;
  message: string;
  detail?: any;
}

const MAX = 500;
let entries: LogEntry[] = [];
let persistKey = "";

try {
  const saved = localStorage.getItem("oc_log");
  if (saved) {
    const parsed = JSON.parse(saved);
    if (Array.isArray(parsed)) entries = parsed.slice(-MAX);
  }
} catch { /* ignore */ }

function save() {
  if (!persistKey) return;
  try { localStorage.setItem(persistKey, JSON.stringify(entries)); } catch { /* */ }
}

function add(level: LogLevel, category: LogCategory, message: string, detail?: any) {
  const entry: LogEntry = { ts: Date.now(), level, category, message, detail };
  entries.push(entry);
  if (entries.length > MAX) entries = entries.slice(-MAX);
  save();
  const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.debug;
  fn(`[${category}] ${message}`, detail ?? "");
}

export const log = {
  debug: (c: LogCategory, m: string, d?: any) => add("debug", c, m, d),
  info: (c: LogCategory, m: string, d?: any) => add("info", c, m, d),
  warn: (c: LogCategory, m: string, d?: any) => add("warn", c, m, d),
  error: (c: LogCategory, m: string, d?: any) => add("error", c, m, d),
  entries: () => entries.slice(),
  clear() { entries = []; save(); },
  enablePersistence(key: string) { persistKey = key; save(); },
};

if (typeof window !== "undefined") {
  (window as any).__oclogs = log;
}

export function friendlyError(e: any): string {
  const raw = String(e?.message || e || "Unknown error");
  if (/refused/i.test(raw)) return "Server unreachable — is opencode running?";
  if (/Failed to fetch|NetworkError|fetch failed/i.test(raw)) return "Network request failed — check your connection";
  if (/timeout/i.test(raw)) return "Request timed out";
  if (/HTTP 401/i.test(raw)) return "Authentication failed — check credentials";
  if (/HTTP 403/i.test(raw)) return "Access denied";
  if (/HTTP 404/i.test(raw)) return "Not found";
  if (/HTTP 5\d\d/i.test(raw)) return "Server error — check opencode logs";
  if (/aborted/i.test(raw)) return "Request was cancelled";
  if (/disconnected/i.test(raw)) return "Connection lost";
  if (/not connected/i.test(raw)) return "Not connected to server";
  if (/reconnect needed/i.test(raw)) return "Gateway disconnected — reconnecting…";
  return raw;
}
