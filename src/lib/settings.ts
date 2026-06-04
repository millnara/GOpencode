import { Preferences } from "@capacitor/preferences";

export interface Conn {
  baseUrl: string;   // e.g. "/api" (web dev proxy) or "http://gg-45-ferngrove:4096" (native)
  username: string;  // opencode Basic-auth username (default "opencode")
  password: string;  // OPENCODE_SERVER_PASSWORD
  soundOnDone: boolean;
  notifyOnDone: boolean;
  locale: string;
}

const KEY = "gopencode.conn";
const DEFAULTS: Conn = {
  baseUrl: import.meta.env.DEV ? "/api" : "",
  username: "opencode",
  password: "",
  soundOnDone: true,
  notifyOnDone: true,
  locale: "en",
};

let cache: Conn = { ...DEFAULTS };

export async function loadConn(): Promise<Conn> {
  try {
    const { value } = await Preferences.get({ key: KEY });
    if (value) cache = { ...DEFAULTS, ...JSON.parse(value) };
  } catch {
    /* ignore */
  }
  return cache;
}
export async function saveConn(next: Partial<Conn>): Promise<Conn> {
  cache = { ...cache, ...next };
  try { await Preferences.set({ key: KEY, value: JSON.stringify(cache) }); } catch { /* ignore */ }
  return cache;
}
export function getConn(): Conn { return cache; }
export function isConfigured(): boolean {
  return !!getConn().baseUrl && (getConn().baseUrl === "/api" || !!getConn().password);
}

const LAST_KEY = "gopencode.lastRoute";

export async function saveLastRoute(route: string): Promise<void> {
  try { await Preferences.set({ key: LAST_KEY, value: route }); } catch { /* ignore */ }
}
export async function loadLastRoute(): Promise<string | null> {
  try { const { value } = await Preferences.get({ key: LAST_KEY }); return value || null; } catch { return null; }
}
