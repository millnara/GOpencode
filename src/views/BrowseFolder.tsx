import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { FileEntry } from "../lib/types";
import { b64uEnc, leaf } from "../lib/util";

function parentDir(p: string): string | null {
  const norm = (p || "").replace(/[\\/]+$/, "");
  const idx = Math.max(norm.lastIndexOf("\\"), norm.lastIndexOf("/"));
  if (idx < 0) return null;
  let parent = norm.slice(0, idx);
  if (/^[A-Za-z]:$/.test(parent)) parent += "\\";
  if (!parent || parent === norm) return null;
  return parent;
}

export default function BrowseFolder({ startDir }: { startDir?: string }) {
  const [dir, setDir] = useState(startDir || "");
  const [entries, setEntries] = useState<FileEntry[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!dir) {
      api.path()
        .then((p) => setDir(p.home || "C:\\"))
        .catch((e) => setErr(String(e.message || e)));
      return;
    }
    setEntries(null);
    setErr(null);
    api.listDir(dir)
      .then((es) => setEntries(es))
      .catch((e) => setErr(String(e.message || e)));
  }, [dir]);

  const dirs = (entries || [])
    .filter((x) => x.type === "directory")
    .sort((a, b) => {
      const ad = a.name.startsWith("."), bd = b.name.startsWith(".");
      if (ad !== bd) return ad ? 1 : -1;
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });

  const par = dir ? parentDir(dir) : null;

  return (
    <div className="screen" style={{ position: "relative" }}>
      <div className="topbar">
        <button className="iconbtn" onClick={() => (location.hash = "#/")}>‹</button>
        <div className="title">{leaf(dir) || dir}<div className="sub">browse</div></div>
        <button className="iconbtn" style={{ width: "auto", padding: "0 12px", color: "var(--accent2)", fontSize: 15, fontWeight: 600 }}
          onClick={() => (location.hash = "#/p/" + b64uEnc(dir))}>Open ▸</button>
      </div>
      <div className="content">
        <div className="list" style={{ paddingBottom: 96 }}>
          <div className="section-label" style={{ wordBreak: "break-all", textTransform: "none", letterSpacing: 0 }}>
            {dir}
          </div>
          {err && <div className="errbox">{err}</div>}
          {!entries && !err && <div className="loading"><div className="spinner" /></div>}
          {par && (
            <button className="card" onClick={() => setDir(par)}>
              <div className="avatar" style={{ background: "linear-gradient(135deg,#3a3a40,#26262b)", fontSize: 18 }}>⬆</div>
              <div className="meta"><div className="name">..</div><div className="desc">Up one level</div></div>
              <div className="chev">›</div>
            </button>
          )}
          {entries && dirs.length === 0 && <div className="empty">No subfolders here.</div>}
          {dirs.map((d) => (
            <button key={d.absolute} className="card" onClick={() => setDir(d.absolute)}>
              <div className="avatar" style={{ background: "linear-gradient(135deg,#3a3a40,#26262b)", fontSize: 18 }}>📁</div>
              <div className="meta">
                <div className="name">{d.name}</div>
                {d.ignored && <div className="desc">ignored</div>}
              </div>
              <div className="chev">›</div>
            </button>
          ))}
        </div>
      </div>
      <button className="fab" style={{ left: 18, right: 18, justifyContent: "center" }}
        onClick={() => (location.hash = "#/p/" + b64uEnc(dir))}>
        ▶ Open opencode here
      </button>
    </div>
  );
}
