import { useEffect, useState } from "react";
import Projects from "./views/Projects";
import Sessions from "./views/Sessions";
import Chat from "./views/Chat";
import Settings from "./views/Settings";
import BrowseFolder from "./views/BrowseFolder";
import BottomNav from "./components/BottomNav";
import LockScreen from "./components/LockScreen";
import Logo from "./components/Logo";
import Icon from "./components/Icon";
import { b64uDec } from "./lib/util";
import { saveLastRoute, loadLastRoute, isConfigured, loadPairing, hasPin, loadPhrases } from "./lib/settings";
import { connect, onStateChange, getState, reconnectNow, type TransportState } from "./lib/transport";
import { log } from "./lib/log";

log.enablePersistence("oc_log");

type Route =
  | { name: "projects" }
  | { name: "sessions"; dir: string }
  | { name: "chat"; dir: string; sid: string }
  | { name: "settings" }
  | { name: "browse"; dir?: string };

function parse(): Route {
  const hash = location.hash.replace(/^#/, "") || "/";
  const p = hash.split("/").filter(Boolean);
  if (p[0] === "settings") return { name: "settings" };
  if (p[0] === "pairing") return { name: "settings" }; // legacy route — pairing now lives in Settings
  if (p[0] === "browse") {
    if (p[1]) {
      try { return { name: "browse", dir: b64uDec(p[1]) }; } catch { /* */ }
    }
    return { name: "browse" };
  }
  if (p[0] === "p" && p[1]) {
    try {
      const dir = b64uDec(p[1]);
      if (p[2] === "s" && p[3]) return { name: "chat", dir, sid: p[3] };
      return { name: "sessions", dir };
    } catch { /* */ }
  }
  return { name: "projects" };
}

function isTunnelHost(h: string): boolean {
  if (h.startsWith("[") && h.endsWith("]")) return false;
  const parts = h.split(".");
  if (parts.length !== 4) return false;
  const a = parseInt(parts[0], 10);
  const b = parseInt(parts[1], 10);
  return a === 100 && b >= 64 && b <= 127;
}

function tunnelName(urls: string[]): string {
  for (const u of urls) {
    const m = u.match(/^ws:\/\/([^\/:]+)/);
    if (m && isTunnelHost(m[1])) return "Tailscale";
  }
  return "a tunnel";
}

export default function App() {
  const [route, setRoute] = useState<Route>(parse());
  const [ready, setReady] = useState(false);
  const [locked, setLocked] = useState(false);
  const [pinEnabled, setPinEnabled] = useState(false);
  const [paired, setPaired] = useState(false);
  const [transport, setTransport] = useState<TransportState>(getState());
  const [pairingUrls, setPairingUrls] = useState<string[]>([]);

  useEffect(() => {
    hasPin().then(h => setPinEnabled(h));
  }, []);

  useEffect(() => {
    const off = onStateChange((s) => setTransport(s));
    return () => { off(); };
  }, []);

  useEffect(() => {
    const h = () => {
      const r = parse();
      setRoute(r);
      const hash = location.hash;
      if (hash && hash !== "#/" && hash !== "#" && r.name !== "settings") {
        saveLastRoute(hash);
      }
    };
    addEventListener("hashchange", h);

    const onVis = () => {
      if (document.visibilityState === "hidden" && pinEnabled && paired) {
        setLocked(true);
      }
    };
    document.addEventListener("visibilitychange", onVis);

    (async () => {
      loadPhrases();
      const pairing = await loadPairing();
      if (pairing && pairing.urls.length > 0) {
        setPaired(true);
        setPairingUrls(pairing.urls);
        // If the saved endpoints are stale on a cold launch, connect() self-heals
        // once via /pairing; on failure kick the background loop so it keeps
        // retrying (and re-healing) instead of sitting disconnected until a
        // foreground/online event nudges it.
        try { await connect(pairing.urls, pairing.room, pairing.pw); } catch { reconnectNow(); }
      }
      setReady(true);
      if (pinEnabled && (pairing || isConfigured())) setLocked(true);

      const onRoot = !location.hash || location.hash === "#/" || location.hash === "#";
      const hasConnection = !!pairing || isConfigured();
      if (onRoot && !hasConnection) {
        location.hash = "#/settings";
      } else if (onRoot) {
        loadLastRoute().then((last) => {
          if (last && last !== "#/" && last !== "#" && (isConfigured() || pairing)) {
            location.hash = last;
          }
        });
      }
    })();

    return () => {
      removeEventListener("hashchange", h);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  if (!ready) return (
    <div className="screen" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, background: "var(--bg)" }}>
      <Logo size={48} showText={false} />
      <div className="spinner" style={{ margin: 0 }} />
    </div>
  );

  let view: JSX.Element;
  switch (route.name) {
    case "sessions": view = <Sessions dir={route.dir} />; break;
    case "chat": view = <Chat dir={route.dir} sid={route.sid} />; break;
    case "settings": view = <Settings />; break;
    case "browse": view = <BrowseFolder startDir={route.dir} />; break;
    default: view = <Projects />;
  }
  const showNav = route.name === "projects" || route.name === "settings";

  const stranded = transport === "stranded" && pairingUrls.length > 0;

  return (
    <>
      {stranded && (
        <div className="topbanner stranded">
          <div className="topbanner-ic"><Icon name="warning" size={18} strokeWidth={2} /></div>
          <div className="topbanner-tx">
            Can't reach your desktop — still retrying in the background. If you use {tunnelName(pairingUrls)} on this phone, check it's enabled.
          </div>
          <button className="topbanner-btn" onClick={() => reconnectNow()}>Retry now</button>
        </div>
      )}
      {transport === "reconnecting" && pairingUrls.length > 0 && !stranded && (
        <div className="topbanner">
          <div className="topbanner-ic"><Icon name="refresh" size={16} strokeWidth={2.2} /></div>
          <div className="topbanner-tx">Reconnecting to your desktop…</div>
        </div>
      )}
      {showNav ? (
        <div className="screen with-nav">
          {view}
          <BottomNav active={route.name} />
        </div>
      ) : (
        <div className="screen">{view}</div>
      )}
      {locked && <LockScreen onUnlock={() => setLocked(false)} />}
    </>
  );
}
