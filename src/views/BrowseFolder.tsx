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

function highlightSyntax(code: string): string {
  return code
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/(\/\/.*)/g, '<span class="syn-c">$1</span>')
    .replace(/("(?:[^"\\]|\\.)*")/g, '<span class="syn-s">$1</span>')
    .replace(/('(?:[^'\\]|\\.)*')/g, '<span class="syn-s">$1</span>')
    .replace(/\b(import|export|const|let|var|function|return|if|else|for|while|class|interface|type|enum|async|await|try|catch|throw|new|extends|implements|default|from|as|of|in|typeof|instanceof|void|null|undefined|true|false|this|super|switch|case|break|continue|do|static|public|private|protected|readonly|abstract)\b/g, '<span class="syn-k">$1</span>')
    .replace(/\b(\d+\.?\d*)\b/g, '<span class="syn-n">$1</span>');
}
export default function BrowseFolder({ startDir }: { startDir?: string }) {
  const [dir, setDir] = useState(startDir || "");
  const [entries, setEntries] = useState<FileEntry[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [viewing, setViewing] = useState<{ path: string; name: string } | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);

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
  const files = (entries || [])
    .filter((x) => x.type === "file")
    .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
    .slice(0, 20);

  const par = dir ? parentDir(dir) : null;

  const viewFile = async (name: string) => {
    setViewing({ path: name, name });
    setFileContent(null);
    try {
      const r = await api.fileContent(dir, name);
      setFileContent(r.content || "");
    } catch (e: any) { setFileContent("// Error: " + (e.message || e)); }
  };

  return (
    <div className="screen" style={{ position: "relative" }}>
      <div className="topbar">
        <button className="iconbtn" onClick={() => (location.hash = "#/")}>‹</button>
        <div className="title">{leaf(dir) || dir}<div className="sub">{entries ? dirs.length + " folders" + (files.length ? ", " + files.length + " files" : "") : "browse"}</div></div>
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
              <div className="avatar" style={{ background: "linear-gradient(135deg,#3a3a40,#26262b)", fontSize: 16 }}>⬆</div>
              <div className="meta"><div className="name">..</div><div className="desc">Up one level</div></div>
              <div className="chev">›</div>
            </button>
          )}
          {entries && dirs.length === 0 && <div className="empty">No subfolders here.</div>}
          {dirs.map((d) => (
            <button key={d.absolute} className="card" onClick={() => setDir(d.absolute)}>
              <div className="avatar" style={{ background: "linear-gradient(135deg,#3a3a40,#26262b)", fontSize: 16 }}>📁</div>
              <div className="meta">
                <div className="name">{d.name}</div>
                {d.ignored && <div className="desc">ignored</div>}
              </div>
              <div className="chev">›</div>
            </button>
          ))}
          {files.length > 0 && (
            <>
              <div className="section-label">Files ({files.length})</div>
              {files.map((f) => (
                <button key={f.absolute} className="card" onClick={() => viewFile(f.name)}>
                  <div className="avatar" style={{ background: "linear-gradient(135deg,#2a2a30,#1d1d22)", fontSize: 14 }}>📄</div>
                  <div className="meta">
                    <div className="name" style={{ fontSize: 14 }}>{f.name}</div>
                    {f.ignored && <div className="desc">ignored</div>}
                  </div>
                  <div className="chev">›</div>
                </button>
              ))}
            </>
          )}
        </div>
      </div>
      <button className="fab" style={{ left: 18, right: 18, justifyContent: "center" }}
        onClick={() => (location.hash = "#/p/" + b64uEnc(dir))}>
        ▶ Open opencode here
      </button>
      {viewing && (
        <div className="sheet-bg" onClick={(e) => { if (e.target === e.currentTarget) { setViewing(null); setFileContent(null); } }}>
          <div className="sheet" style={{ maxHeight: "90%" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 18px", borderBottom: "1px solid var(--border)" }}>
              <button className="iconbtn" onClick={() => { setViewing(null); setFileContent(null); }}>✕</button>
              <div style={{ fontSize: 14, fontWeight: 600, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{viewing.name}</div>
              <div style={{ fontSize: 11, color: "var(--faint)" }}>{dir}</div>
            </div>
            <div style={{ padding: 14, overflow: "auto", maxHeight: "calc(80vh - 60px)" }}>
              {!fileContent && <div className="loading"><div className="spinner" /></div>}
              {fileContent && (
                <pre className="file-view" dangerouslySetInnerHTML={{ __html: highlightSyntax(fileContent) }} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
