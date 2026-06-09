/* GOpencode — message part rendering (markdown, code, tools, diffs, todo, prompts) */

/* ---------------- lightweight syntax highlight ---------------- */
const KW = /\b(const|let|var|function|return|if|else|for|while|await|async|import|from|export|default|new|class|extends|type|interface|of|in|null|undefined|true|false|this)\b/g;
function highlight(code) {
  // escape
  let s = code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const stash = [];
  const hold = (cls, txt) => { stash.push('<span class="tok-' + cls + '">' + txt + "</span>"); return "\u0000" + (stash.length - 1) + "\u0000"; };
  s = s.replace(/(\/\/[^\n]*)/g, (m) => hold("c", m));
  s = s.replace(/(['"`])(?:\\.|(?!\1).)*\1/g, (m) => hold("s", m));
  s = s.replace(KW, (m) => hold("k", m));
  s = s.replace(/\b(\d[\d_.]*)\b/g, (m) => hold("n", m));
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => stash[+i]);
  return s;
}

function CodeBlock({ code, lang }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <div className="codeblock">
      <div className="cb-top">
        <span className="cb-lang">{lang || "code"}</span>
        <button className="cb-copy" onClick={() => { navigator.clipboard?.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1400); }}>
          {copied ? "✓ copied" : "⧉ copy"}
        </button>
      </div>
      <pre><code dangerouslySetInnerHTML={{ __html: highlight(code) }} /></pre>
    </div>
  );
}

/* ---------------- inline markdown ---------------- */
function inline(text, keyBase) {
  const out = [];
  let rest = text, k = 0;
  const re = /(\*\*([^*]+)\*\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)]+)\))/;
  let m;
  while ((m = re.exec(rest))) {
    if (m.index > 0) out.push(rest.slice(0, m.index));
    if (m[1]) out.push(<strong key={keyBase + "-" + k++}>{m[2]}</strong>);
    else if (m[3]) out.push(<code key={keyBase + "-" + k++}>{m[4]}</code>);
    else if (m[5]) out.push(<a key={keyBase + "-" + k++} href={m[7]} target="_blank" rel="noreferrer">{m[6]}</a>);
    rest = rest.slice(m.index + m[0].length);
  }
  if (rest) out.push(rest);
  return out;
}

function renderMarkdown(text) {
  const blocks = [];
  const segs = text.split(/```/);
  segs.forEach((seg, si) => {
    if (si % 2 === 1) {
      const nl = seg.indexOf("\n");
      const lang = nl > 0 ? seg.slice(0, nl).trim() : "";
      const code = nl > 0 ? seg.slice(nl + 1).replace(/\n$/, "") : seg;
      blocks.push(<CodeBlock key={"cb" + si} code={code} lang={lang} />);
      return;
    }
    const lines = seg.split("\n");
    let i = 0, bk = 0;
    while (i < lines.length) {
      let line = lines[i];
      if (!line.trim()) { i++; continue; }
      if (/^#{1,3}\s/.test(line)) {
        const lvl = line.match(/^#+/)[0].length;
        const H = "h" + Math.min(lvl, 3);
        blocks.push(React.createElement(H, { key: si + "h" + i }, inline(line.replace(/^#+\s/, ""), si + "h" + i)));
        i++; continue;
      }
      if (/^>\s/.test(line)) {
        const buf = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, "")); i++; }
        blocks.push(<blockquote key={si + "q" + i}>{inline(buf.join(" "), si + "q" + i)}</blockquote>);
        continue;
      }
      if (/^(\d+)\.\s/.test(line)) {
        const items = [];
        while (i < lines.length && /^\d+\.\s/.test(lines[i])) { items.push(lines[i].replace(/^\d+\.\s/, "")); i++; }
        blocks.push(<ol key={si + "ol" + bk++}>{items.map((it, j) => <li key={j}>{inline(it, si + "li" + j)}</li>)}</ol>);
        continue;
      }
      if (/^[-*]\s/.test(line)) {
        const items = [];
        while (i < lines.length && /^[-*]\s/.test(lines[i])) { items.push(lines[i].replace(/^[-*]\s/, "")); i++; }
        blocks.push(<ul key={si + "ul" + bk++}>{items.map((it, j) => <li key={j}>{inline(it, si + "uli" + j)}</li>)}</ul>);
        continue;
      }
      const buf = [];
      while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|>\s|[-*]\s|\d+\.\s)/.test(lines[i])) { buf.push(lines[i]); i++; }
      blocks.push(<p key={si + "p" + bk++}>{inline(buf.join(" "), si + "p" + bk)}</p>);
    }
  });
  return blocks;
}

function Prose({ text, streaming }) {
  return <div className={"prose" + (streaming ? " cursor" : "")}>{renderMarkdown(text)}</div>;
}

/* ---------------- tool view ---------------- */
function ToolView({ part, defaultOpen }) {
  const status = part.status || "pending";
  const [open, setOpen] = React.useState(defaultOpen || status === "error");
  const inputRows = part.input ? Object.entries(part.input) : [];
  return (
    <details className="collapsible" open={open}>
      <summary onClick={(e) => { e.preventDefault(); setOpen(!open); }}>
        <span className={"dot " + status} />
        <span className="tool-name">{part.tool}</span>
        <span className="tool-title">{part.title}</span>
        <span className="chev">›</span>
      </summary>
      <div className="body">
        {inputRows.length > 0 && (
          <div className="tool-io">{inputRows.map(([key, v], idx) => (
            <div key={idx}><span className="k">{key}</span>: {typeof v === "string" ? v : JSON.stringify(v)}</div>
          ))}</div>
        )}
        {part.output && status !== "running" && <div className="tool-io out">{part.output}</div>}
      </div>
    </details>
  );
}

/* ---------------- diff view ---------------- */
function DiffView({ diff }) {
  const [open, setOpen] = React.useState(false);
  const name = diff.file.split("/").pop();
  return (
    <div className="diff-card">
      <div className="diff-head" onClick={() => setOpen(!open)}>
        <span className="dot completed" />
        <span className="fname">{diff.file}</span>
        <span className="stat"><span className="add">+{diff.adds}</span><span className="del">−{diff.dels}</span><span className="chev" style={{ color: "var(--fade)" }}>{open ? "▾" : "▸"}</span></span>
      </div>
      {open && (
        <div className="diff-body scroll">
          {diff.lines.map((l, i) => (
            <div key={i} className={"diff-line " + l.type}>
              <span className="ln">{l.ln}</span>
              <span className="mk">{l.type === "add" ? "+" : l.type === "del" ? "−" : ""}</span>
              <span className="tx">{l.text || " "}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- reasoning ---------------- */
function Reasoning({ text }) {
  const [open, setOpen] = React.useState(false);
  return (
    <details className="collapsible reasoning" open={open}>
      <summary onClick={(e) => { e.preventDefault(); setOpen(!open); }}>
        <span style={{ fontSize: 14 }}>✦</span> Thought for a moment
        <span className="chev" style={{ marginLeft: "auto" }}>›</span>
      </summary>
      <div className="body">{text}</div>
    </details>
  );
}

/* ---------------- one part ---------------- */
function PartView({ part, streaming }) {
  switch (part.type) {
    case "text": return <Prose text={part.text} streaming={streaming} />;
    case "reasoning": return <Reasoning text={part.text} />;
    case "tool": return <ToolView part={part} />;
    case "diff": return <DiffView diff={part._diff || part} />;
    default: return null;
  }
}

/* ---------------- permission prompt ---------------- */
function PermPrompt({ perm, onRespond }) {
  return (
    <div className="perm">
      <div className="ph"><span className="ic">!</span> {perm.title || "Permission required"}</div>
      <div className="pcmd">$ {perm.cmd}</div>
      <div className="prow">
        <button className="allow" onClick={() => onRespond("once")}>Allow once</button>
        <button className="always" onClick={() => onRespond("always")}>Always</button>
        <button className="reject" onClick={() => onRespond("reject")}>Deny</button>
      </div>
    </div>
  );
}

/* ---------------- todo panel ---------------- */
function TodoPanel({ todos }) {
  const [open, setOpen] = React.useState(true);
  if (!todos || !todos.length) return null;
  const done = todos.filter((t) => t.status === "completed").length;
  const pct = Math.round((done / todos.length) * 100);
  return (
    <div className="todo-panel">
      <button className="todo-head" onClick={() => setOpen(!open)}>
        <span className="todo-pct">{done}/{todos.length}</span>
        <div className="todo-bar"><div className="todo-fill" style={{ width: pct + "%" }} /></div>
        <span className={"todo-chev" + (open ? " open" : "")}>›</span>
      </button>
      {open && (
        <div className="todo-list">
          {todos.map((t, i) => (
            <div key={i} className={"todo-row " + t.status}>
              <span className="todo-mark" />
              <span className="todo-text">{t.content}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

Object.assign(window, { renderMarkdown, Prose, CodeBlock, ToolView, DiffView, Reasoning, PartView, PermPrompt, TodoPanel, highlight });
