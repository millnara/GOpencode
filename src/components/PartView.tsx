import { md } from "../lib/markdown";
import type { Part, ToolPart } from "../lib/types";

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

export default function PartView({ part, role }: { part: Part; role: string }) {
  const p = part as any;
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
    case "file": return <div className="pill" style={{ margin: "6px 0" }}>📎 {p.filename || p.url || "file"}</div>;
    case "patch": return (
      <details className="collapsible">
        <summary>📝 Edited {(p.files?.length || 0)} file(s)</summary>
        <div className="body tool-io">{(p.files || []).join("\n")}</div>
      </details>
    );
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
