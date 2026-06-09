/* GOpencode — mock data (stands in for the opencode HTTP API) */
(function () {
  const now = Date.now();
  const min = 60000, hr = 3600000, day = 86400000;

  // ---- providers & models (mirrors /config/providers) ----
  const providers = [
    { id: "anthropic", name: "Anthropic", color: "#c96442", models: [
      { id: "claude-opus-4-6", label: "Claude Opus 4.6", tag: "reasoning" },
      { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", tag: "balanced" },
      { id: "claude-haiku-4-2", label: "Claude Haiku 4.2", tag: "fast" },
    ]},
    { id: "openai", name: "OpenAI", color: "#10a37f", models: [
      { id: "gpt-5.2", label: "GPT-5.2", tag: "reasoning" },
      { id: "gpt-5.2-mini", label: "GPT-5.2 mini", tag: "fast" },
      { id: "o5", label: "o5", tag: "reasoning" },
    ]},
    { id: "google", name: "Google", color: "#4285f4", models: [
      { id: "gemini-3-pro", label: "Gemini 3 Pro", tag: "balanced" },
      { id: "gemini-3-flash", label: "Gemini 3 Flash", tag: "fast" },
    ]},
    { id: "groq", name: "Groq", color: "#f55036", models: [
      { id: "kimi-k2.5", label: "Kimi K2.5", tag: "fast" },
      { id: "qwen3-max", label: "Qwen3 Max", tag: "balanced" },
    ]},
  ];

  const agents = [
    { name: "build", desc: "Full read/write + shell. Ships changes." },
    { name: "plan", desc: "Read-only. Proposes a plan, no edits." },
    { name: "code", desc: "Focused edits, minimal chatter." },
  ];

  const commands = [
    { name: "init", desc: "Generate AGENTS.md from the codebase" },
    { name: "review", desc: "Review the current diff for issues" },
    { name: "test", desc: "Run the test suite and triage failures" },
    { name: "commit", desc: "Stage, write a message, and commit" },
    { name: "compact", desc: "Summarise & compress the context window" },
  ];

  // ---- helpers ----
  const D = (parts) => {
    let ln = parts.start || 1, adds = 0, dels = 0;
    const lines = parts.lines.map((l) => {
      const o = { type: l[0], text: l[1] };
      if (l[0] === "add") { o.ln = ln++; adds++; }
      else if (l[0] === "del") { o.ln = ""; dels++; }
      else { o.ln = ln++; }
      return o;
    });
    return { type: "diff", file: parts.file, lines, adds, dels };
  };

  // ============================================================
  // Default session transcript — gopencode adds a reasoning pill
  // ============================================================
  const gopencodeSession = [
    { id: "u1", role: "user", time: now - 9 * min, parts: [
      { type: "text", text: "Add a reasoning-effort pill to the composer that cycles Low / Med / High, but only show it for models that support variants. Wire it through to the prompt call." },
    ]},
    { id: "a1", role: "assistant", time: now - 9 * min + 4000, model: "claude-opus-4-6", parts: [
      { type: "reasoning", text: "Let me scope this. The composer lives in Chat.tsx and already renders model + agent pills. I need to: (1) read the current chip row, (2) find where variants are exposed on the provider config, (3) add a conditional pill that cycles through the variant keys, (4) thread the selected variant into promptAsync. I'll start by reading the composer and the model types." },
      { type: "text", text: "I'll add the **reasoning-effort pill** in four steps:\n\n1. Read the composer chip row in `Chat.tsx`\n2. Check how model variants are surfaced in `types.ts`\n3. Add a conditional pill that cycles the variant keys\n4. Pass the variant through `api.promptAsync`\n\nLet me look at the current state first." },
      { type: "tool", tool: "read", status: "completed", title: "src/views/Chat.tsx", input: { filePath: "src/views/Chat.tsx", offset: 410, limit: 24 },
        output: "<div className=\"chips\">\n  <button className=\"pill\" onClick={() => setSheet('model')}><b>{modelLabel}</b></button>\n  <button className=\"pill\" onClick={() => setSheet('agent')}><b>{agent}</b></button>\n</div>" },
      { type: "tool", tool: "grep", status: "completed", title: "variants", input: { pattern: "variants", path: "src/lib/types.ts" },
        output: "types.ts:41:  variants?: Record<string, { label: string }>;\ntypes.ts:88:  variant?: string | null;" },
      { type: "text", text: "Good — `ProviderConfig.models[id].variants` is already typed, and `promptAsync` accepts a `variant` argument. I'll compute the current model's variants, store a `variant` state, and render the pill only when variants exist." },
      { type: "diff", _diff: D({ file: "src/views/Chat.tsx", start: 408, lines: [
        ["ctx", "<div className=\"chips\">"],
        ["ctx", "  <button className=\"pill\" onClick={() => setSheet('model')}><b>{modelLabel}</b></button>"],
        ["ctx", "  <button className=\"pill\" onClick={() => setSheet('agent')}><b>{agent}</b></button>"],
        ["add", "  {Object.keys(currentModelVariants).length > 0 && ("],
        ["add", "    <button className=\"pill\" onClick={() => {"],
        ["add", "      const keys = Object.keys(currentModelVariants);"],
        ["add", "      const i = keys.indexOf(variant || keys[0]);"],
        ["add", "      setVariant(keys[(i + 1) % keys.length]);"],
        ["add", "    }}><b>⚡ {variant || Object.keys(currentModelVariants)[0]}</b></button>"],
        ["add", "  )}"],
        ["ctx", "</div>"],
      ]})},
      { type: "tool", tool: "edit", status: "completed", title: "src/views/Chat.tsx",
        input: { filePath: "src/views/Chat.tsx" }, output: "Applied 1 edit · +7 lines" },
      { type: "tool", tool: "bash", status: "completed", title: "npx tsc --noEmit",
        input: { command: "npx tsc --noEmit" }, output: "✓ No type errors. (2.1s)" },
      { type: "text", text: "Done. The **⚡ pill** now appears only for variant-capable models (e.g. Opus, GPT-5.2, o5) and cycles `low → medium → high`. The selected variant is passed straight into `promptAsync`, so the next turn runs at that effort.\n\nWant me to persist the choice per-session in `localStorage` so it survives reloads?" },
    ]},
  ];

  // A second, shorter session in the same project
  const debugSession = [
    { id: "u1", role: "user", time: now - 2 * hr, parts: [
      { type: "text", text: "The SSE stream drops every ~30s on mobile and the chat freezes. Can you make it reconnect automatically?" },
    ]},
    { id: "a1", role: "assistant", time: now - 2 * hr + 3000, model: "claude-sonnet-4-6", parts: [
      { type: "text", text: "That's almost certainly the mobile radio idling the socket. I'll add a heartbeat + exponential-backoff reconnect to the transport layer." },
      { type: "tool", tool: "read", status: "completed", title: "src/lib/transport.ts", input: { filePath: "src/lib/transport.ts" }, output: "export function streamEvents(dir, onEvent) { … 84 lines … }" },
      { type: "tool", tool: "edit", status: "completed", title: "src/lib/transport.ts", input: { filePath: "src/lib/transport.ts" }, output: "Applied 2 edits · +31 −4 lines" },
      { type: "text", text: "Added a 20s heartbeat and a reconnect loop that backs off `1s → 2s → 4s → 8s` (capped). The offline banner now clears itself the moment the stream resumes." },
    ]},
  ];

  // ============================================================
  // Projects
  // ============================================================
  const projects = [
    { id: "p1", name: "gopencode", path: "~/dev/gopencode", vcs: "git", branch: "feat/reasoning-pill", updated: now - 8 * min, c1: "#c96442", c2: "#8f3f28", sessions: [
      { id: "s1", title: "Add reasoning-effort pill to composer", updated: now - 8 * min, transcript: gopencodeSession, busy: false, todos: [
        { content: "Read composer chip row in Chat.tsx", status: "completed" },
        { content: "Locate variant typing in types.ts", status: "completed" },
        { content: "Add conditional ⚡ pill + cycle logic", status: "completed" },
        { content: "Thread variant through promptAsync", status: "completed" },
        { content: "Persist selection in localStorage", status: "in_progress" },
      ]},
      { id: "s2", title: "SSE auto-reconnect on mobile", updated: now - 2 * hr, transcript: debugSession },
      { id: "s3", title: "i18n: add Traditional Chinese", updated: now - 1 * day },
      { id: "s4", title: "Diff viewer for patch cards", updated: now - 3 * day },
    ]},
    { id: "p2", name: "acme-dashboard", path: "~/work/acme-dashboard", vcs: "git", branch: "main", updated: now - 40 * min, c1: "#4f7cf0", c2: "#2d4bb0", sessions: [
      { id: "s1", title: "Migrate charts to server components", updated: now - 40 * min },
      { id: "s2", title: "Fix hydration mismatch in <Filters/>", updated: now - 5 * hr },
      { id: "s3", title: "Dark-mode polish pass", updated: now - 2 * day },
    ]},
    { id: "p3", name: "ledger-api", path: "~/work/ledger-api", vcs: "git", branch: "release/2.4", updated: now - 3 * hr, c1: "#3fae7a", c2: "#268052", sessions: [
      { id: "s1", title: "Idempotency keys for /transfers", updated: now - 3 * hr },
      { id: "s2", title: "N+1 query in account summary", updated: now - 1 * day },
    ]},
    { id: "p4", name: "portfolio-site", path: "~/personal/portfolio", vcs: "git", branch: "main", updated: now - 2 * day, c1: "#a874e0", c2: "#7048b0", sessions: [
      { id: "s1", title: "Rework hero typography", updated: now - 2 * day },
    ]},
    { id: "p5", name: "notes-sync", path: "~/dev/notes-sync", vcs: "folder", branch: "", updated: now - 6 * day, c1: "#e0a23f", c2: "#b07820", sessions: [
      { id: "s1", title: "CRDT merge conflict on rename", updated: now - 6 * day },
    ]},
  ];

  // ============================================================
  // Scripted "live" turn — plays when the user sends a message.
  // Each step is rendered with a delay to simulate streaming.
  // ============================================================
  function buildScriptedTurn() {
    return [
      { kind: "reasoning", delay: 600, text: "The user wants this persisted. The cleanest spot is a tiny effect keyed on [sid, variant] that writes to localStorage, plus a lazy initialiser that reads it back when the session mounts. I'll guard against unsupported variants so a stored value never leaks to a model that doesn't have it." },
      { kind: "text", delay: 700, text: "Good call. I'll persist the reasoning effort **per session** so it survives reloads — reading it back on mount and ignoring it if the active model doesn't expose that variant." },
      { kind: "tool", delay: 650, tool: "read", title: "src/lib/settings.ts", input: { filePath: "src/lib/settings.ts", limit: 12 }, output: "export const getConn = () => JSON.parse(localStorage.getItem('oc.conn') || '{}');\nexport const saveLastRoute = (h) => localStorage.setItem('oc.route', h);" },
      { kind: "tool", delay: 900, tool: "edit", title: "src/views/Chat.tsx", input: { filePath: "src/views/Chat.tsx" }, output: "Applied 2 edits · +9 −1 lines" },
      { kind: "diff", delay: 500, diff: {
        type: "diff", file: "src/views/Chat.tsx", adds: 5, dels: 1, lines: [
          { type: "del", ln: "", text: "const [variant, setVariant] = useState(null);" },
          { type: "add", ln: 71, text: "const vKey = `oc.variant.${sid}`;" },
          { type: "add", ln: 72, text: "const [variant, setVariant] = useState(" },
          { type: "add", ln: 73, text: "  () => localStorage.getItem(vKey)" },
          { type: "add", ln: 74, text: ");" },
          { type: "ctx", ln: 75, text: "" },
          { type: "add", ln: 76, text: "useEffect(() => { if (variant) localStorage.setItem(vKey, variant); }, [variant]);" },
        ],
      }},
      { kind: "perm", delay: 700, perm: { id: "pm1", title: "Run command", cmd: "npx tsc --noEmit && npm run test -- composer" } },
      { kind: "tool", delay: 1100, tool: "bash", title: "npx tsc --noEmit && npm test", input: { command: "npx tsc --noEmit && npm test -- composer" }, output: "✓ tsc: clean\n✓ composer.test.tsx (4 passed)\n  ✓ shows ⚡ pill only for variant models\n  ✓ cycles low → medium → high\n  ✓ persists selection across remount\n  ✓ ignores stored variant on unsupported model\n\nTest Suites: 1 passed   Tests: 4 passed   (1.8s)" },
      { kind: "text", delay: 700, text: "Shipped. The reasoning effort now persists per session and is restored on reload — with a guard so a stored `high` never leaks onto a model that doesn't support variants. All four tests pass. ✅" },
      { kind: "done", delay: 400, meta: "✓ done · 3.2k+1.1k tok · $0.041 · 18.4s" },
    ];
  }

  window.GO = {
    providers, agents, commands, projects,
    defaultProject: "p1", defaultSession: "s1",
    buildScriptedTurn,
    conn: { url: "https://mac-studio.local:4096", room: "gopencode-7f3a", user: "opencode", p2p: true },
    timeAgo(ms) {
      if (!ms) return "";
      const d = Date.now() - ms;
      if (d < min) return "just now";
      if (d < hr) return Math.floor(d / min) + "m ago";
      if (d < day) return Math.floor(d / hr) + "h ago";
      if (d < 7 * day) return Math.floor(d / day) + "d ago";
      return new Date(ms).toLocaleDateString();
    },
    fmtTime(ms) { return ms ? new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""; },
  };
})();
