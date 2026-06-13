import { useState } from "react";
import { md } from "../lib/markdown";
import { api } from "../lib/api";
import type { Part, ToolPart, PatchPart } from "../lib/types";
import { getConn } from "../lib/settings";
import ImageViewer from "./ImageViewer";

function toolTitle(tool: string, input: Record<string, any> = {}): string {
  const v = (k: string) => input[k];
  switch (tool) {
    case "bash": return v("command");
    case "read": return v("filePath") || v("path");
    case "edit": case "write": case "patch": return v("filePath") || v("path");
    case "grep": case "glob": return v("pattern");
    case "list": return v("path");
    case "webfetch": return v("url");
    case "task": return v("description") || v("subagent_type");
    default: { const k = Object.keys(input); return k.length ? JSON.stringify(input).slice(0, 120) : ""; }
  }
}

function ToolView({ part }: { part: ToolPart }) {
  const st = part.state || ({} as any);
  const status = st.status || "pending";
  const title = st.title || toolTitle(part.tool, st.input);
  return (
    <details className="collapsible" open={status === "error"}>
      <summary>
        <span className={"dot " + status} />
        <span className="tool-name">{part.tool || "tool"}</span>
        <span className="tool-title">{title}</span>
      </summary>
      <div className="body">
        {st.input && Object.keys(st.input).length > 0 && (
          <div className="tool-io">
            {Object.entries(st.input).map(([k, val]) => `${k}: ${typeof val === "string" ? val : JSON.stringify(val)}`).join("\n")}
          </div>
        )}
        {status === "completed" && st.output && (
          <div className="tool-io" style={{ marginTop: 8, borderTop: "1px solid var(--border)", paddingTop: 8 }}>{st.output}</div>
        )}
        {status === "error" && st.error && (
          <div className="tool-io err" style={{ marginTop: 8 }}>{st.error}</div>
        )}
      </div>
    </details>
  );
}

function PatchDiff({ part }: { part: PatchPart }) {
  const files = part.files || [];
  const [expanded, setExpanded] = useState(false);
  const [diffs, setDiffs] = useState<{ file: string; before: string; after: string }[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (diffs) { setExpanded(!expanded); return; }
    setLoading(true);
    try {
      const d = await api.diff("", part.sessionID);
      const fileNames = files.map((f) => f.split(/[\\/]/).pop() || f);
      const matched = d.filter((df) => fileNames.includes(df.file));
      setDiffs(matched.length ? matched : d.slice(0, files.length));
      setExpanded(true);
    } catch { setDiffs([]); setExpanded(true); }
    setLoading(false);
  };

  return (
    <div>
      <button className="pill" style={{ margin: "6px 0", cursor: "pointer" }} onClick={load}>
        📝 {files.length} file(s) changed {expanded ? "▾" : "▸"}
      </button>
      {loading && <div className="spinner" style={{ width: 14, height: 14, margin: 4 }} />}
      {expanded && diffs?.map((d, i) => {
        const name = d.file.split(/[\\/]/).pop() || d.file;
        const bLines = (d.before || "").split("\n");
        const aLines = (d.after || "").split("\n");
        const bSet = new Set(bLines);
        const aSet = new Set(aLines);
        const lines: { type: string; text: string }[] = [];
        const max = Math.max(bLines.length, aLines.length);
        for (let li = 0; li < max; li++) {
          const b = bLines[li] ?? "";
          const a = aLines[li] ?? "";
          if (b === a) { lines.push({ type: "ctx", text: a }); }
          else {
            if (b) lines.push({ type: "del", text: b });
            if (a) lines.push({ type: "add", text: a });
          }
        }
        const changes = lines.filter((l) => l.type !== "ctx");
        const adds = changes.filter((l) => l.type === "add").length;
        const dels = changes.filter((l) => l.type === "del").length;
        return (
          <details key={i} className="collapsible" style={{ marginBottom: 4 }}>
            <summary style={{ fontSize: 12 }}>{name} <span style={{ color: "var(--ok)" }}>+{adds}</span> <span style={{ color: "var(--danger)" }}>−{dels}</span></summary>
            <div className="body diff-view">
              {changes.slice(0, 30).map((l, j) => (
                <div key={j} className={"diff-line " + l.type}><span className="diff-marker">{l.type === "add" ? "+" : "−"}</span>{l.text}</div>
              ))}
              {changes.length > 30 && <div className="diff-line ctx" style={{ textAlign: "center" }}>… {changes.length - 30} more</div>}
            </div>
          </details>
        );
      })}
    </div>
  );
}

export default function PartView({ part, role }: { part: Part; role: string }) {
  const p = part as any;
  const [viewerSrc, setViewerSrc] = useState<string | null>(null);
  switch (part.type) {
    case "text": {
      if (p.synthetic || p.ignored) return null;
      const text: string = p.text || "";
      if (role === "user") return <div className="usertext">{text}</div>;
      if (!text.trim()) return null;
      return <div className="prose" dangerouslySetInnerHTML={{ __html: md(text) }} />;
    }
    case "reasoning": {
      if (!(p.text || "").trim()) return null;
      return (
        <details className="collapsible reasoning">
          <summary>💭 Thinking</summary>
          <div className="body">{p.text}</div>
        </details>
      );
    }
    case "tool": return <ToolView part={part as ToolPart} />;
    case "file": return (
        <>
          <div className="pill" style={{ margin: "6px 0", cursor: "pointer" }} onClick={() => { if (p.url) setViewerSrc(p.url); }}>
            📎 {p.filename || p.url || "file"}
          </div>
          {viewerSrc && <ImageViewer src={viewerSrc} onClose={() => setViewerSrc(null)} />}
        </>
      );
    case "patch": return <PatchDiff part={p as PatchPart} />;
    case "agent": return <div className="role">→ agent: {p.name}</div>;
    case "subtask": return (
      <details className="collapsible">
        <summary>🔱 Subtask: {p.description || p.agent}</summary>
        <div className="body tool-io">{p.prompt}</div>
      </details>
    );
    default: return null; // step-start/step-finish/snapshot -> hidden
  }
}
