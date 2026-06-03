export const leaf = (p: string): string => (p || "").replace(/[\\/]+$/, "").split(/[\\/]/).pop() || p;

export function timeAgo(ms?: number): string {
  if (!ms) return "";
  const d = Date.now() - ms, m = 60000, hh = 3600000, dd = 86400000;
  if (d < m) return "just now";
  if (d < hh) return Math.floor(d / m) + "m ago";
  if (d < dd) return Math.floor(d / hh) + "h ago";
  if (d < 7 * dd) return Math.floor(d / dd) + "d ago";
  return new Date(ms).toLocaleDateString();
}

export function b64uEnc(str: string): string {
  const b = new TextEncoder().encode(str);
  let s = ""; b.forEach((x) => (s += String.fromCharCode(x)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function b64uDec(s: string): string {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  return new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));
}
