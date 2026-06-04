import { useEffect, useState } from "react";
import Projects from "./views/Projects";
import Sessions from "./views/Sessions";
import Chat from "./views/Chat";
import Settings from "./views/Settings";
import BrowseFolder from "./views/BrowseFolder";
import BottomNav from "./components/BottomNav";
import { b64uDec } from "./lib/util";

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
  if (p[0] === "browse") {
    if (p[1]) {
      try { return { name: "browse", dir: b64uDec(p[1]) }; } catch { /* fall through */ }
    }
    return { name: "browse" };
  }
  if (p[0] === "p" && p[1]) {
    try {
      const dir = b64uDec(p[1]);
      if (p[2] === "s" && p[3]) return { name: "chat", dir, sid: p[3] };
      return { name: "sessions", dir };
    } catch { /* fall through */ }
  }
  return { name: "projects" };
}

export default function App() {
  const [route, setRoute] = useState<Route>(parse());
  useEffect(() => {
    const h = () => setRoute(parse());
    addEventListener("hashchange", h);
    return () => removeEventListener("hashchange", h);
  }, []);

  let view: JSX.Element;
  switch (route.name) {
    case "sessions": view = <Sessions dir={route.dir} />; break;
    case "chat": view = <Chat dir={route.dir} sid={route.sid} />; break;
    case "settings": view = <Settings />; break;
    case "browse": view = <BrowseFolder startDir={route.dir} />; break;
    default: view = <Projects />;
  }
  const showNav = route.name === "projects" || route.name === "settings";
  return (
    <>
      <div className={showNav ? "with-nav" : ""}>{view}</div>
      {showNav && <BottomNav active={route.name} />}
    </>
  );
}
