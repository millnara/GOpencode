const PREFIX = "oc_cache_";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function cacheGet<T = any>(key: string): { data: T; ts: number } | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.ts > MAX_AGE_MS) { localStorage.removeItem(PREFIX + key); return null; }
    return parsed;
  } catch { return null; }
}

export function cacheSet(key: string, data: any): void {
  try { localStorage.setItem(PREFIX + key, JSON.stringify({ data, ts: Date.now() })); } catch { /* quota exceeded — ignore */ }
}

export function cacheRemove(key: string): void {
  try { localStorage.removeItem(PREFIX + key); } catch { /* ignore */ }
}

export function cacheAge(key: string): number | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    return Date.now() - JSON.parse(raw).ts;
  } catch { return null; }
}
