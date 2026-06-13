import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { FileEntry } from "../lib/types";
import { b64uEnc, leaf } from "../lib/util";
import Icon from "../components/Icon";
import { log, friendlyError } from "../lib/log";

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
      api.path().then(p => setDir(p.home || "C:\\")).catch(e => { log.error("ui", "path load failed", e?.message || e); setErr(friendlyError(e)); });
      return;
    }
    setEntries(null); setErr(null);
    api.listDir(dir).then(setEntries).catch(e => { log.error("ui", "listDir failed for " + dir, e?.message || e); setErr(friendlyError(e)); });
  }, [dir]);

  const dirs = (entries || [])
    .filter(x => x.type === "directory")
    .sort((a, b) => {
      const ad = a.name.startsWith("."), bd = b.name.startsWith(".");
      if (ad !== bd) return ad ? 1 : -1;
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });
  const files = (entries || [])
    .filter(x => x.type === "file")
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
    <div className="screen">
      <div className="topbar">
        <button className="iconbtn" onClick={() => (location.hash = "#/")} aria-label="Back">
          <Icon name="back" size={22} strokeWidth={2} />
        </button>
        <div className="title">{leaf(dir) || dir}<div className="sub">{entries ? dirs.length + " folders" + (files.length ? ", " + files.length + " files" : "") : "browse"}</div></div>
        <button className="btn" style={{ width: "auto", padding: "8px 14px", fontSize: 13, margin: 0 }}
          onClick={() => (location.hash = "#/p/" + b64uEnc(dir))}>Open</button>
      </div>
      <div className="content">
        {err && <div className="errbox" style={{ margin: "12px 16px" }}>{err}</div>}
        {!entries && !err && <div className="spinner" />}
        <div className="list">
          <div style={{ padding: "4px 20px 8px", fontSize: 11, color: "var(--fade)", textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 600, wordBreak: "break-all" }}>{dir}</div>
          {par && (
            <button className="row" onClick={() => setDir(par)}>
              <div className="row-icon" style={{ background: "var(--surface-2)", color: "var(--muted)" }}><Icon name="back" size={18} strokeWidth={1.8} /></div>
              <div className="row-body"><div className="row-title">..</div><div className="row-sub">Up</div></div>
              <div className="row-chev">›</div>
            </button>
          )}
          {entries && dirs.length === 0 && files.length === 0 && <div className="empty-state"><div className="empty-icon" style={{ color: "var(--fade)" }}><Icon name="folder" size={44} strokeWidth={1.4} /></div>Empty folder</div>}
          {dirs.map(d => (
            <div key={d.absolute}><div className="divider" /><button className="row" onClick={() => setDir(d.absolute)}>
              <div className="row-icon" style={{ background: "var(--surface-2)", color: "var(--text-2)" }}><Icon name="folder" size={20} strokeWidth={1.6} /></div>
              <div className="row-body">
                <div className="row-title">{d.name}</div>
                {d.ignored && <div className="row-sub">ignored</div>}
              </div>
              <div className="row-chev">›</div>
            </button></div>
          ))}
          {files.length > 0 && (
            <>
              <div style={{ padding: "20px 20px 8px", fontSize: 11, color: "var(--fade)", textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 600 }}>Files ({files.length})</div>
              {files.map(f => (
                <div key={f.absolute}><div className="divider" /><button className="row" onClick={() => viewFile(f.name)}>
                  <div className="row-icon" style={{ background: "var(--surface-2)", color: "var(--text-2)" }}><Icon name="info" size={18} strokeWidth={1.6} /></div>
                  <div className="row-body">
                    <div className="row-title" style={{ fontSize: 14 }}>{f.name}</div>
                    {f.ignored && <div className="row-sub">ignored</div>}
                  </div>
                  <div className="row-chev">›</div>
                </button></div>
              ))}
            </>
          )}
        </div>
      </div>
      <button className="fab" onClick={() => (location.hash = "#/p/" + b64uEnc(dir))}>
        <Icon name="play" size={14} strokeWidth={2.4} fill="currentColor" /> Open opencode here
      </button>
      {viewing && (
        <div className="sheet-bg" onClick={e => { if (e.target === e.currentTarget) { setViewing(null); setFileContent(null); } }}>
          <div className="sheet">
            <div className="handle" />
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 20px", borderBottom: "1px solid var(--border)" }}>
              <button className="iconbtn" onClick={() => { setViewing(null); setFileContent(null); }} aria-label="Close">
                <Icon name="close" size={20} strokeWidth={2.2} />
              </button>
              <div style={{ fontSize: 14, fontWeight: 600, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{viewing.name}</div>
              <div style={{ fontSize: 11, color: "var(--fade)" }}>{dir}</div>
            </div>
            <div style={{ padding: 14, overflow: "auto", maxHeight: "calc(80vh - 60px)" }}>
              {!fileContent && <div className="spinner" />}
              {fileContent && <pre className="file-view" dangerouslySetInnerHTML={{ __html: highlightSyntax(fileContent) }} />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
