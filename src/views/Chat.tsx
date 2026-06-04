import { useEffect, useReducer, useRef, useState } from "react";
import { api, streamEvents, defaultModel } from "../lib/api";
import type { ModelRef, OcEvent, PermissionRequest, ProvidersResponse, Agent, Part, ProviderConfig, Command, QuestionRequest } from "../lib/types";
import MessageView, { type Group } from "../components/MessageView";
import PermissionPrompt from "../components/PermissionPrompt";
import ModelSheet from "../components/ModelSheet";
import CommandMenu from "../components/CommandMenu";
import QuestionPrompt from "../components/QuestionPrompt";
import { getConn } from "../lib/settings";
import { playDone } from "../lib/sound";
import { notifyDone } from "../lib/notify";
import { t } from "../lib/i18n";

async function haptic(light = true) {
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: light ? ImpactStyle.Light : ImpactStyle.Medium });
  } catch { /* not native */ }
}

let wakeLock: WakeLockSentinel | null = null;
async function acquireWakeLock() {
  try { if ("wakeLock" in navigator) wakeLock = await navigator.wakeLock.request("screen"); } catch { /* */ }
}
async function releaseWakeLock() {
  try { if (wakeLock) { await wakeLock.release(); wakeLock = null; } } catch { /* */ }
}

export default function Chat({ dir, sid }: { dir: string; sid: string }) {
  const msgs = useRef<Map<string, Group>>(new Map());
  const wasBusy = useRef(false);
  const [, force] = useReducer((x) => x + 1, 0);
  const raf = useRef<number | null>(null);
  const schedule = () => { if (raf.current == null) raf.current = requestAnimationFrame(() => { raf.current = null; force(); }); };

  const [title, setTitle] = useState("Session");
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [perms, setPerms] = useState<PermissionRequest[]>([]);
  const [questions, setQuestions] = useState<QuestionRequest[]>([]);
  const [providers, setProviders] = useState<ProvidersResponse | null>(null);
  const [providerConfig, setProviderConfig] = useState<ProviderConfig[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [commands, setCommands] = useState<Command[]>([]);
  const [model, setModel] = useState<ModelRef | null>(null);
  const [agent, setAgent] = useState("build");
  const [sheet, setSheet] = useState<null | "model" | "agent">(null);
  const [wedged, setWedged] = useState(false);
  const [turnMeta, setTurnMeta] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const ensure = (messageID: string): Group => {
    let g = msgs.current.get(messageID);
    if (!g) { g = { info: { id: messageID, role: "assistant", sessionID: sid, time: { created: Date.now() } } as any, parts: [] }; msgs.current.set(messageID, g); }
    return g;
  };
  const upsertMessage = (info: any) => {
    let g = msgs.current.get(info.id);
    if (!g) { if (info.role === "user") setPending(null); msgs.current.set(info.id, { info, parts: [] }); }
    else g.info = info;
    schedule();
  };
  const upsertPart = (part: Part) => {
    const g = ensure(part.messageID);
    const i = g.parts.findIndex((p) => p.id === part.id);
    if (i >= 0) g.parts[i] = part; else g.parts.push(part);
    schedule();
  };
  const appendDelta = (p: any) => {
    const g = msgs.current.get(p.messageID); if (!g) return;
    let part: any = g.parts.find((x) => x.id === p.partID);
    if (!part) { part = { id: p.partID, type: "text", sessionID: sid, messageID: p.messageID }; g.parts.push(part); }
    const f = p.field || "text"; part[f] = (part[f] || "") + p.delta;
    schedule();
  };
  const lastAssistantText = (): string => {
    const groups = [...msgs.current.values()];
    for (let i = groups.length - 1; i >= 0; i--) {
      if (groups[i].info.role === "assistant") {
        const tp: any = groups[i].parts.filter((p) => p.type === "text").pop();
        if (tp?.text) return tp.text.slice(0, 120);
      }
    }
    return "Turn complete";
  };
  const onDone = () => {
    const c = getConn();
    if (c.soundOnDone) playDone();
    if (c.notifyOnDone) notifyDone(title || "opencode", lastAssistantText());
  };

  const checkWedged = () => {
    const gs = [...msgs.current.values()].sort((a, b) => (a.info.time?.created || 0) - (b.info.time?.created || 0));
    if (gs.length === 0) { setWedged(false); return; }
    const last = gs[gs.length - 1];
    if (last.info.role === "user") { setWedged(true); return; }
    if (last.info.role === "assistant") {
      const hasStepFinish = last.parts.some((p) => p.type === "step-finish");
      const hasStuckTool = last.parts.some((p: any) => p.type === "tool" && p.state && (p.state.status === "running" || p.state.status === "pending"));
      const hasError = !!(last.info as any).error;
      const hasContent = last.parts.some((p) => p.type === "text" || p.type === "tool");
      if (hasStuckTool && !hasStepFinish) { setWedged(true); return; }
      if (!hasContent && !hasStepFinish && !hasError) { setWedged(true); return; }
    }
    setWedged(false);
  };

  const lastUserText = (): string | null => {
    const gs = [...msgs.current.values()].sort((a, b) => (a.info.time?.created || 0) - (b.info.time?.created || 0));
    for (let i = gs.length - 1; i >= 0; i--) {
      if (gs[i].info.role === "user") {
        const tp: any = gs[i].parts.find((p) => p.type === "text");
        if (tp?.text) return tp.text;
      }
    }
    return null;
  };

  const resume = async () => {
    if (!model) return;
    setWedged(false);
    try { await api.abort(dir, sid); } catch { /* */ }
    const text = lastUserText() || "Continue.";
    setBusy(true); wasBusy.current = true;
    await api.promptAsync(dir, sid, model, agent, text);
  };

  const handleEvent = (ev: OcEvent) => {
    const p = ev.properties || {};
    switch (ev.type) {
      case "message.updated": if (p.info?.sessionID === sid) upsertMessage(p.info); break;
      case "message.part.updated": if (p.part?.sessionID === sid) upsertPart(p.part); break;
      case "message.part.delta": if (p.sessionID === sid) appendDelta(p); break;
      case "message.part.removed": if (p.sessionID === sid) { const g = msgs.current.get(p.messageID); if (g) { g.parts = g.parts.filter((x) => x.id !== p.partID); schedule(); } } break;
      case "message.removed": if (p.sessionID === sid) { msgs.current.delete(p.messageID); schedule(); } break;
      case "session.status":
        if (p.sessionID === sid) { const b = p.status?.type === "busy"; setBusy(b); if (b) { wasBusy.current = true; setWedged(false); } else if (wasBusy.current) { wasBusy.current = false; onDone(); } }
        break;
      case "session.idle": if (p.sessionID === sid) {
        setBusy(false);
        const gs = [...msgs.current.values()].sort((a, b) => (a.info.time?.created || 0) - (b.info.time?.created || 0));
        const lastA: any = gs.filter((g) => g.info.role === "assistant").pop();
        if (lastA) {
          const sf: any = lastA.parts.find((pp: any) => pp.type === "step-finish");
          const toks = sf?.state?.metadata?.tokens || lastA.info?.tokens;
          const cost = lastA.info?.cost;
          let meta = "✓ done";
          if (toks) meta += " · " + (typeof toks === "number" ? toks : (toks.input || 0) + "+" + (toks.output || 0)) + " tok";
          if (cost) meta += " · $" + Number(cost).toFixed(4);
          setTurnMeta(meta);
        }
        if (wasBusy.current) { wasBusy.current = false; onDone(); }
      } break;
      case "session.error": if (p.sessionID === sid) { ensure("err_" + Date.now()).parts.push({ id: "e", type: "text", text: "⚠ " + (p.error?.name || "error") + ": " + (p.error?.data?.message || "") } as any); setBusy(false); schedule(); } break;
      case "permission.asked": if (p.sessionID === sid) setPerms((prev) => prev.find((x) => x.id === p.id) ? prev : [...prev, p]); break;
      case "permission.replied": setPerms((prev) => prev.filter((x) => x.id !== (p.id || p.permissionID))); break;
      case "question.asked": if (p.sessionID === sid) setQuestions((prev) => prev.find((x) => x.id === p.id) ? prev : [...prev, p]); break;
      case "question.replied": setQuestions((prev) => prev.filter((x) => x.id !== (p.id || p.questionID))); break;
      case "session.updated": if (p.info?.id === sid && p.info.title) setTitle(p.info.title); break;
    }
  };

  useEffect(() => {
    let stop = () => {};
    (async () => {
      try {
        const prov = await api.providers(); setProviders(prov);
        const ags = (await api.agents()).filter((a) => a.mode !== "subagent"); setAgents(ags);
        try { const cp = await api.configProviders(); setProviderConfig(cp.providers || []); } catch { /* use fallback */ }
        try { setCommands(await api.commands()); } catch { /* no commands */ }
        const hist = await api.messages(dir, sid);
        msgs.current = new Map();
        for (const m of hist) msgs.current.set(m.info.id, { info: m.info, parts: m.parts || [] });
        const lastA: any = hist.map((m) => m.info).filter((m: any) => m.role === "assistant" && m.modelID).pop();
        setModel(lastA ? { providerID: lastA.providerID, modelID: lastA.modelID } : defaultModel(prov));
        if (lastA?.agent) setAgent(lastA.agent);
        force();
        checkWedged();
        api.session(dir, sid).then((s) => s?.title && setTitle(s.title)).catch(() => {});
      } catch (e: any) {
        ensure("load_err").parts.push({ id: "e", type: "text", text: "Failed to load: " + (e.message || e) } as any); force();
      }
      stop = streamEvents(dir, handleEvent);
    })();
    return () => { stop(); if (raf.current) cancelAnimationFrame(raf.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dir, sid]);

  useEffect(() => { const c = contentRef.current; if (c && c.scrollHeight - c.scrollTop - c.clientHeight < 160) c.scrollTop = c.scrollHeight; });

  useEffect(() => {
    if (busy) acquireWakeLock(); else releaseWakeLock();
    return () => { releaseWakeLock(); };
  }, [busy]);

  useEffect(() => {
    const onVis = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const hist = await api.messages(dir, sid);
        const newMap = new Map<string, Group>();
        for (const m of hist) newMap.set(m.info.id, { info: m.info, parts: m.parts || [] });
        msgs.current = newMap;
        const last = hist.map((m) => m.info).filter((m: any) => m.role === "assistant").pop() as any;
        if (last?.completed) setBusy(false);
        force();
      } catch { /* ignore */ }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [dir, sid]);

  const send = async () => {
    const text = input.trim(); if (!text || busy || !model) return;
    setInput(""); if (taRef.current) taRef.current.style.height = "auto";
    setPending(text); setBusy(true); wasBusy.current = true;
    haptic();
    try {
      let cmdName: string | null = null;
      let cmdArgs = "";
      if (text.startsWith("/")) {
        const sp = text.indexOf(" ");
        const name = (sp < 0 ? text.slice(1) : text.slice(1, sp)).trim();
        if (commands.some((c) => c.name === name)) {
          cmdName = name;
          cmdArgs = sp < 0 ? "" : text.slice(sp + 1).trim();
        }
      }
      if (cmdName) {
        try { await api.runCommand(dir, sid, cmdName, cmdArgs); } catch (e: any) {
          if (/Failed to fetch|NetworkError|aborted/i.test(e.message)) {
            ensure("net_warn_" + Date.now()).parts.push({ id: "w", type: "text", text: "⚠ Connection blip — reply will appear on reconnect" } as any); force();
          } else { throw e; }
        }
      } else {
        const ok = await api.promptAsync(dir, sid, model, agent, text);
        if (!ok) {
          ensure("net_warn_" + Date.now()).parts.push({ id: "w", type: "text", text: "⚠ Connection blip — reply will appear on reconnect" } as any); force();
        }
      }
    } catch (e: any) { ensure("send_err_" + Date.now()).parts.push({ id: "e", type: "text", text: "Send failed: " + (e.message || e) } as any); force(); }
  };
  const abort = async () => { try { await api.abort(dir, sid); } catch { /* */ } setBusy(false); };
  const respond = async (id: string, r: "once" | "always" | "reject") => {
    setPerms((prev) => prev.filter((x) => x.id !== id));
    try { await api.respondPermission(dir, sid, id, r); } catch { /* */ }
  };
  const replyQuestion = async (id: string, answers: string[][]) => {
    setQuestions((prev) => prev.filter((x) => x.id !== id));
    try { await api.replyQuestion(dir, id, answers); } catch { /* */ }
  };
  const rejectQuestion = async (id: string) => {
    setQuestions((prev) => prev.filter((x) => x.id !== id));
    try { await api.rejectQuestion(dir, id); } catch { /* */ }
  };

  const groups = [...msgs.current.values()].sort((a, b) => (a.info.time?.created || 0) - (b.info.time?.created || 0));
  const modelLabel = model?.modelID || "model";

  const modelProviders = providerConfig.length > 0
    ? providerConfig
    : (() => {
        if (!providers) return [];
        const ids = Array.isArray(providers.connected) ? providers.connected.map((x) => x.id) : Object.keys(providers.connected || {});
        return ids.map((id) => ({ id, name: providers.all?.[id]?.name || id, models: providers.all?.[id]?.models || {} }));
      })();

  return (
    <div className="screen">
      <div className="topbar">
        <button className="iconbtn" onClick={() => history.length > 1 ? history.back() : (location.hash = "#/")}>‹</button>
        <div className="title">{title}<div className="sub">{dir.split(/[\\/]/).pop()}</div></div>
        {busy && <button className="iconbtn" style={{ color: "var(--danger)" }} onClick={abort}>■</button>}
      </div>

      <div className="content" ref={contentRef}>
        <div className="msgs">
          {groups.map((g) => <MessageView key={g.info.id} group={g} />)}
          {pending && <div className="msg user"><div className="bubble">{pending}</div></div>}
          {perms.map((req) => <PermissionPrompt key={req.id} req={req} onRespond={(r) => respond(req.id, r)} />)}
          {questions.map((qr) => (
            <QuestionPrompt key={qr.id} req={qr}
              onReply={(answers) => replyQuestion(qr.id, answers)}
              onReject={() => rejectQuestion(qr.id)} />
          ))}
          {wedged && !busy && (
            <div className="errbox" style={{ borderColor: "var(--warn)", color: "var(--warn)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>Session appears stuck</span>
              <button className="q-submit" style={{ marginTop: 0, padding: "6px 14px", fontSize: 13 }} onClick={resume}>⟳ Resume</button>
            </div>
          )}
          {turnMeta && !busy && <div className="turn-marker">{turnMeta}</div>}
        </div>
      </div>

      <div className="composer">
        <div className="modelbar">
          <button className="pill" onClick={() => setSheet("model")}>🧠 <b>{modelLabel}</b></button>
          <button className="pill" onClick={() => setSheet("agent")}>⚙ <b>{agent}</b></button>
        </div>
        <CommandMenu commands={commands} value={input} onPick={(name) => { setInput("/" + name + " "); taRef.current?.focus(); }} />
        {busy && <div className="statusline"><div className="spinner" /><span>{t("chat.working")}</span></div>}
        <div className="box">
          <textarea
            ref={taRef} rows={1} placeholder={t("chat.placeholder")} value={input}
            onChange={(e) => { setInput(e.target.value); const el = e.target; el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 160) + "px"; }}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } }}
          />
          <button className={"send" + (busy ? " stop" : "")} disabled={busy || !input.trim()} onClick={send}>↑</button>
        </div>
      </div>

      {sheet === "model" && (
        <ModelSheet providers={modelProviders} current={model} onPick={setModel} onClose={() => setSheet(null)} />
      )}
      {sheet === "agent" && (
        <div className="sheet-bg" onClick={(e) => { if (e.target === e.currentTarget) setSheet(null); }}>
          <div className="sheet">
            <h3>Agent</h3>
            {(agents.length ? agents.map((a) => a.name) : ["build", "plan"]).map((a) => (
              <div key={a} className={"opt" + (agent === a ? " sel" : "")} onClick={() => { setAgent(a); setSheet(null); }}>
                <span>{a}</span>{agent === a && <span>✓</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
