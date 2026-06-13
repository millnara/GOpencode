import { Preferences } from "@capacitor/preferences";
import { log } from "./log";
import { getActiveUrl } from "./transport";
import { getConn } from "./settings";

const HASH_KEY = "oc-update-hash";
const HTML_KEY = "oc-update-html";
const BUILD_HASH = import.meta.env.VITE_BUILD_HASH || "dev";

export function getBuildHash(): string { return BUILD_HASH; }

export async function getStoredHash(): Promise<string | null> {
  try { const { value } = await Preferences.get({ key: HASH_KEY }); return value || null; } catch { return null; }
}

async function getGatewayHttpUrl(): Promise<string | null> {
  const activeUrl = getActiveUrl();
  if (activeUrl) {
    const m = activeUrl.match(/^ws:\/\/(.+)/);
    if (m) return "http://" + m[1];
  }
  const conn = getConn();
  if (conn.baseUrl) return conn.baseUrl;
  return null;
}

export async function checkForUpdate(): Promise<{ available: boolean; remoteHash?: string; version?: string }> {
  const httpUrl = await getGatewayHttpUrl();
  if (!httpUrl) return { available: false };
  try {
    const r = await fetch(httpUrl + "/app-manifest", { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return { available: false };
    const m = await r.json();
    const stored = await getStoredHash();
    if (m.hash && m.hash !== stored) return { available: true, remoteHash: m.hash, version: m.version };
    return { available: false };
  } catch { return { available: false }; }
}

export async function pullUpdate(onProgress?: (msg: string) => void): Promise<boolean> {
  const httpUrl = await getGatewayHttpUrl();
  if (!httpUrl) throw new Error("No gateway connection");

  onProgress?.("Fetching manifest...");
  const manifestR = await fetch(httpUrl + "/app-manifest", { signal: AbortSignal.timeout(10000) });
  if (!manifestR.ok) throw new Error("Manifest fetch failed: " + manifestR.status);
  const manifest = await manifestR.json();

  onProgress?.("Downloading index.html...");
  const htmlR = await fetch(httpUrl + "/app/index.html", { signal: AbortSignal.timeout(15000) });
  if (!htmlR.ok) throw new Error("Index fetch failed: " + htmlR.status);
  let html = await htmlR.text();

  // Rewrite relative asset paths to absolute gateway URLs
  html = html.replace(/(src|href)=["']\.\/(assets\/)/g, `$1="${httpUrl}/app/$2`);
  html = html.replace(/(src|href)=["']\/assets\//g, `$1="${httpUrl}/app/assets/`);

  // Store the rewritten HTML
  onProgress?.("Saving update...");
  await Preferences.set({ key: HTML_KEY, value: html });
  await Preferences.set({ key: HASH_KEY, value: manifest.hash });

  log.info("ui", "Update pulled: " + manifest.hash.slice(0, 8));
  onProgress?.("Update saved — reloading...");
  return true;
}

export async function loadCachedUpdate(): Promise<string | null> {
  try {
    const { value } = await Preferences.get({ key: HTML_KEY });
    return value || null;
  } catch { return null; }
}

export async function clearUpdate(): Promise<void> {
  try {
    await Preferences.remove({ key: HTML_KEY });
    await Preferences.remove({ key: HASH_KEY });
  } catch { /* */ }
}
