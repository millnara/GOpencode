import { Preferences } from "@capacitor/preferences";

export type ReconnectMode = "off" | "normal" | "aggressive";

export interface Conn {
  baseUrl: string;
  username: string;
  password: string;
  soundOnDone: boolean;
  notifyOnDone: boolean;
  locale: string;
  reconnectMode: ReconnectMode;
}

const KEY = "gopencode.conn";
const DEFAULTS: Conn = {
  baseUrl: import.meta.env.DEV ? "/api" : "",
  username: "opencode",
  password: "",
  soundOnDone: true,
  notifyOnDone: true,
  locale: "en",
  reconnectMode: "normal",
};

let cache: Conn = { ...DEFAULTS };

export async function loadConn(): Promise<Conn> {
  try {
    const { value } = await Preferences.get({ key: KEY });
    if (value) {
      const parsed = JSON.parse(value);
      cache = { ...DEFAULTS, ...parsed };
    }
  } catch { /* ignore */ }
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

export interface Pairing { urls: string[]; room: string; pw: string; }
const PAIRING_KEY = "gopencode.pairing";

export async function savePairing(p: Pairing): Promise<void> {
  try { await Preferences.set({ key: PAIRING_KEY, value: JSON.stringify(p) }); } catch { /* ignore */ }
}
export async function loadPairing(): Promise<Pairing | null> {
  try {
    const { value } = await Preferences.get({ key: PAIRING_KEY });
    if (!value) return null;
    const p = JSON.parse(value);
    if (Array.isArray(p.urls)) return p;
    if (typeof p.url === "string") return { urls: [p.url], room: p.room, pw: p.pw };
    return null;
  } catch { return null; }
}
export async function clearPairing(): Promise<void> {
  try { await Preferences.remove({ key: PAIRING_KEY }); } catch { /* ignore */ }
}

// ---- Working-indicator phrase sets ----
// A phrase is one OR more lines: lines are joined with ":" and animate in
// sequence (linked), stacked. Single-line phrases are self-contained. The
// indicator picks phrases at random. Sets are authored on desktop and synced to
// the phone over the gateway (transport handles the "phrases" message), with a
// baked-in default so the phone always has something to show.
export interface PhraseSet { name: string; phrases: string[]; }
export const DEFAULT_PHRASES: PhraseSet = {
  name: "Default",
  phrases: [
    "Calm your knickers, I'm doing it...",
    "Hope I don't fuck this up...",
    "Gimme dat...:Gimme dat...:I'm jokin'...",
  ],
};
const PHRASES_KEY = "gopencode.phrases";
let phrasesCache: PhraseSet = DEFAULT_PHRASES;

export function getPhrases(): PhraseSet { return phrasesCache; }
export async function loadPhrases(): Promise<PhraseSet> {
  try {
    const { value } = await Preferences.get({ key: PHRASES_KEY });
    if (value) {
      const p = JSON.parse(value);
      if (p && Array.isArray(p.phrases) && p.phrases.length) {
        phrasesCache = { name: typeof p.name === "string" ? p.name : "Set", phrases: p.phrases.filter((x: any) => typeof x === "string") };
      }
    }
  } catch { /* keep default */ }
  return phrasesCache;
}
export async function savePhrases(p: PhraseSet): Promise<void> {
  const clean: PhraseSet = { name: p.name || "Set", phrases: (p.phrases || []).filter((x) => typeof x === "string" && x.length) };
  if (!clean.phrases.length) return;
  phrasesCache = clean;
  try { await Preferences.set({ key: PHRASES_KEY, value: JSON.stringify(clean) }); } catch { /* ignore */ }
}

let pairingCache: Pairing | null = null;
export async function hasSavedPairing(): Promise<boolean> {
  if (pairingCache !== undefined) return pairingCache !== null;
  pairingCache = await loadPairing();
  return pairingCache !== null;
}
export function setPairingCache(p: Pairing | null) { pairingCache = p; }

const PIN_KEY = "gopencode.pinHash";

async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function setPin(pin: string): Promise<void> {
  try { await Preferences.set({ key: PIN_KEY, value: await sha256(pin) }); } catch { /* */ }
}

export async function checkPin(pin: string): Promise<boolean> {
  try {
    const { value } = await Preferences.get({ key: PIN_KEY });
    if (!value) return true;
    return (await sha256(pin)) === value;
  } catch { return true; }
}

export async function hasPin(): Promise<boolean> {
  try { const { value } = await Preferences.get({ key: PIN_KEY }); return !!value; } catch { return false; }
}

export async function clearPin(): Promise<void> {
  try { await Preferences.remove({ key: PIN_KEY }); } catch { /* */ }
}
