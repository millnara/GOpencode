import { useEffect, useReducer, useRef, useState } from "react";
import { api, streamEvents, defaultModel } from "../lib/api";
import type { ModelRef, OcEvent, PermissionRequest, ProvidersResponse, Agent, Part, ProviderConfig, Command, QuestionRequest } from "../lib/types";
import MessageView, { type Group } from "../components/MessageView";
import PermissionPrompt from "../components/PermissionPrompt";
import ModelSheet from "../components/ModelSheet";
import CommandMenu from "../components/CommandMenu";
import QuestionPrompt from "../components/QuestionPrompt";
import TodoPanel from "../components/TodoPanel";
import Icon from "../components/Icon";
import { getConn } from "../lib/settings";
import { isConnected, isP2P } from "../lib/transport";
import { playDone } from "../lib/sound";
import { notifyDone } from "../lib/notify";
import { t } from "../lib/i18n";
import { b64uEnc } from "../lib/util";

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
  const [variant, setVariant] = useState<string | null>(null);
  const [sysPrompt, setSysPrompt] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [sheet, setSheet] = useState<null | "model" | "agent" | "session">(null);
  const [wedged, setWedged] = useState(false);
  const [turnMeta, setTurnMeta] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<{ name: string; dataUrl: string; mime: string }[]>([]);
  const [formatMode, setFormatMode] = useState<string | null>(null);
  const [toolsDisabled, setToolsDisabled] = useState(false);
  const [offline, setOffline] = useState(!navigator.onLine);
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
    await api.promptAsync(dir, sid, model, agent, text, variant, sysPrompt || null, attachments.length ? attachments : null, formatMode, toolsDisabled);
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
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    addEventListener("online", on);
    addEventListener("offline", off);
    return () => { removeEventListener("online", on); removeEventListener("offline", off); };
  }, []);

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

  const pickFile = async () => {
    try {
      const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
      const image = await Camera.getPhoto({ resultType: CameraResultType.DataUrl, source: CameraSource.Prompt, quality: 80 });
      if (image.dataUrl) setAttachments(prev => [...prev, { name: "image.jpg", dataUrl: image.dataUrl!, mime: "image/jpeg" }]);
    } catch { /* cancelled */ }
  };

  const send = async () => {
    const text = input.trim(); if (!text || busy || !model) return;
    setInput(""); if (taRef.current) taRef.current.style.height = "auto";
    setPending(text); setBusy(true); wasBusy.current = true;
    setAttachments([]);
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
        const ok = await api.promptAsync(dir, sid, model, agent, text, variant, sysPrompt || null);
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

  const forkSession = async () => {
    try {
      const s = await api.forkSession(dir, sid);
      location.hash = "#/p/" + b64uEnc(dir) + "/s/" + s.id;
    } catch (e: any) { ensure("err_" + Date.now()).parts.push({ id: "e", type: "text", text: "Fork failed: " + (e.message || e) } as any); force(); }
  };
  const compactSession = async () => {
    try { await api.compactSession(dir, sid); } catch (e: any) { ensure("err_" + Date.now()).parts.push({ id: "e", type: "text", text: "Compact failed: " + (e.message || e) } as any); force(); }
  };
  const shareSession = async () => {
    try {
      const r = await api.shareSession(dir, sid);
      if (r?.url) { await navigator.clipboard.writeText(r.url); ensure("info_" + Date.now()).parts.push({ id: "i", type: "text", text: "Link copied to clipboard" } as any); force(); }
    } catch (e: any) { ensure("err_" + Date.now()).parts.push({ id: "e", type: "text", text: "Share failed: " + (e.message || e) } as any); force(); }
  };
  const revertTo = async (messageID: string) => {
    setBusy(true); wasBusy.current = true;
    try { await api.revertSession(dir, sid, messageID); } catch (e: any) { ensure("err_" + Date.now()).parts.push({ id: "e", type: "text", text: "Revert failed: " + (e.message || e) } as any); force(); }
    const hist = await api.messages(dir, sid);
    msgs.current = new Map();
    for (const m of hist) msgs.current.set(m.info.id, { info: m.info, parts: m.parts || [] });
    setBusy(false); force();
  };

  const groups = [...msgs.current.values()].sort((a, b) => (a.info.time?.created || 0) - (b.info.time?.created || 0));
  const modelLabel = model?.modelID || "model";
  const currentModelVariants = (() => {
    if (!model || !providerConfig.length) return {};
    const prov = providerConfig.find((p) => p.id === model.providerID);
    const m = prov?.models?.[model.modelID];
    return m?.variants && Object.keys(m.variants).length > 0 ? m.variants : {};
  })();

  const modelProviders = providerConfig.length > 0
    ? providerConfig
    : (() => {
        if (!providers) return [];
        const ids = Array.isArray(providers.connected) ? providers.connected.map((x) => x.id) : Object.keys(providers.connected || {});
        return ids.map((id) => ({ id, name: providers.all?.[id]?.name || id, models: providers.all?.[id]?.models || {} }));
      })();

  return (
    <div className="screen">
      <div className="chat-header">
        <button className="back" onClick={() => history.length > 1 ? history.back() : (location.hash = "#/")} aria-label="Back">
          <Icon name="back" size={22} strokeWidth={2} />
        </button>
        <div className="info">
          <div className="name">{title || "Session"}</div>
          <div className="path">{dir.split(/[\\/]/).pop()}{isConnected() ? " · connected" : ""}</div>
        </div>
        <div className={"conn-dot " + (isP2P() ? "p2p" : isConnected() ? "ws" : "direct")} />
        {busy && <button className="back stop" aria-label="Stop" onClick={abort}><Icon name="stop" size={18} strokeWidth={2} /></button>}
        {!busy && <button className="back" aria-label="Session actions" onClick={() => setSheet("session")}><Icon name="more" size={20} strokeWidth={2} /></button>}
      </div>

      {offline && <div className="status-banner offline">Offline — reconnecting…</div>}

      <TodoPanel dir={dir} sid={sid} />

      <div className="msg-list" ref={contentRef}>
        {groups.map((g) => (
          <div key={g.info.id} className="msg-group">
            <MessageView group={g} onRevert={revertTo} />
          </div>
        ))}
        {pending && (
          <div className="msg-group">
            <div className="msg-row user">
              <div className="msg-avatar user">Y</div>
              <div className="msg-block">
                <div className="msg-bubble">{pending}</div>
              </div>
            </div>
          </div>
        )}
        {busy && !pending && (
          <div className="msg-group">
            <div className="msg-row assistant">
              <div className="msg-avatar assistant">oc</div>
              <div className="msg-block">
                <div className="typing"><span /><span /><span /></div>
              </div>
            </div>
          </div>
        )}
        {perms.map((req) => (
          <div key={req.id} className="msg-group">
            <PermissionPrompt req={req} onRespond={(r) => respond(req.id, r)} />
          </div>
        ))}
        {questions.map((qr) => (
          <div key={qr.id} className="msg-group">
            <QuestionPrompt req={qr} onReply={(a) => replyQuestion(qr.id, a)} onReject={() => rejectQuestion(qr.id)} />
          </div>
        ))}
        {wedged && !busy && (
          <div className="status-banner wedged">
            <span>Session appears stuck</span>
            <button onClick={resume}><Icon name="refresh" size={14} strokeWidth={2.2} /> Resume</button>
          </div>
        )}
        {turnMeta && !busy && <div className="turn-marker">{turnMeta}</div>}
      </div>

      <div className="composer">
        <div className="chips">
          <button className="pill" onClick={() => setSheet("model")}><b>{modelLabel}</b></button>
          <button className="pill" onClick={() => setSheet("agent")}><b>{agent}</b></button>
          {Object.keys(currentModelVariants).length > 0 && (
            <button className="pill" onClick={() => {
              const keys = Object.keys(currentModelVariants);
              setVariant(keys[(keys.indexOf(variant || keys[0]) + 1) % keys.length]);
            }}>
              <Icon name="bolt" size={13} strokeWidth={2.2} />
              <b>{variant || Object.keys(currentModelVariants)[0]}</b>
            </button>
          )}
        </div>
        <CommandMenu commands={commands} value={input} onPick={(name) => { setInput("/" + name + " "); taRef.current?.focus(); }} />
        {busy && <div className="statusline"><div className="spinner" /><span>{t("chat.working")}</span></div>}
        {showAdvanced && (
          <div style={{ padding: "4px 2px 8px", display: "flex", flexDirection: "column", gap: 6 }}>
            <textarea className="sysinput" rows={2} placeholder="System prompt override…" value={sysPrompt}
              onChange={(e) => setSysPrompt(e.target.value)} />
            <div style={{ display: "flex", gap: 6 }}>
              <select className="pill" value={formatMode || ""} onChange={(e) => setFormatMode(e.target.value || null)}>
                <option value="">Format: text</option>
                <option value="json_schema">Format: JSON Schema</option>
              </select>
              <label className="pill" style={{ cursor: "pointer" }}>
                <input type="checkbox" checked={toolsDisabled} onChange={(e) => setToolsDisabled(e.target.checked)} style={{ margin: 0, accentColor: "var(--accent)" }} />
                <span>No tools</span>
              </label>
            </div>
          </div>
        )}
        <div className="advanced-toggle" onClick={() => setShowAdvanced(!showAdvanced)}>
          <Icon name={showAdvanced ? "chevronUp" : "chevronDown"} size={12} strokeWidth={2.2} />
          <span>{showAdvanced ? "hide" : "advanced"}</span>
        </div>
        {attachments.length > 0 && (
          <div className="att-preview">
            {attachments.map((a, i) => (
              <div key={i} className="att-thumb">
                <img src={a.dataUrl} alt="" />
                <button className="att-remove" onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))} aria-label="Remove">
                  <Icon name="close" size={10} strokeWidth={2.5} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="box">
          <button className="camera-btn" onClick={pickFile} aria-label="Attach image">
            <Icon name="image" size={20} strokeWidth={1.8} />
          </button>
          <textarea ref={taRef} rows={1} placeholder={t("chat.placeholder")} value={input}
            onChange={(e) => { setInput(e.target.value); const el = e.target; el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 140) + "px"; }}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } }} />
          <button className={"send-btn" + (busy ? " stop" : "")} disabled={busy || (!input.trim() && !attachments.length)} onClick={send} aria-label={busy ? "Stop" : "Send"}>
            {busy ? <Icon name="stop" size={15} strokeWidth={0} fill="currentColor" /> : <Icon name="send" size={18} strokeWidth={2.2} />}
          </button>
        </div>
      </div>

      {sheet === "model" && (
        <ModelSheet providers={modelProviders} current={model} onPick={setModel} onClose={() => setSheet(null)} />
      )}
      {sheet === "agent" && (
        <div className="sheet-bg" onClick={e => { if (e.target === e.currentTarget) setSheet(null); }}>
          <div className="sheet">
            <div className="handle" />
            <h3>Agent</h3>
            {(agents.length ? agents.map(a => a.name) : ["build", "plan"]).map(a => (
              <div key={a} className={"opt" + (agent === a ? " sel" : "")} onClick={() => { setAgent(a); setSheet(null); }}>
                <span className="opt-label">{a}</span>
                {agent === a && <Icon name="check" size={18} strokeWidth={2.2} />}
              </div>
            ))}
          </div>
        </div>
      )}
      {sheet === "session" && (
        <div className="sheet-bg" onClick={e => { if (e.target === e.currentTarget) setSheet(null); }}>
          <div className="sheet">
            <div className="handle" />
            <h3>Session</h3>
            <div className="opt" onClick={() => { setSheet(null); forkSession(); }}>
              <span className="opt-icon"><Icon name="fork" size={18} strokeWidth={1.8} /></span>
              <span className="opt-label">Fork this session</span>
            </div>
            <div className="opt" onClick={() => { setSheet(null); compactSession(); }}>
              <span className="opt-icon"><Icon name="compact" size={18} strokeWidth={1.8} /></span>
              <span className="opt-label">Compact context</span>
            </div>
            <div className="opt" onClick={() => { setSheet(null); shareSession(); }}>
              <span className="opt-icon"><Icon name="share" size={18} strokeWidth={1.8} /></span>
              <span className="opt-label">Share (copy link)</span>
            </div>
            <div className="opt" onClick={async () => {
              setSheet(null);
              const cmd = prompt("Shell command:");
              if (cmd) { setBusy(true); wasBusy.current = true; try { await api.shell(dir, sid, cmd); } catch (e: any) { ensure("err_" + Date.now()).parts.push({ id: "e", type: "text", text: "Shell failed: " + (e.message || e) } as any); setBusy(false); force(); } }
            }}>
              <span className="opt-icon"><Icon name="shell" size={18} strokeWidth={1.8} /></span>
              <span className="opt-label">Run shell command</span>
            </div>
            <div className="opt danger" onClick={() => { setSheet(null); if (confirm("Delete this session?")) { api.deleteSession(dir, sid).then(() => history.back()); } }}>
              <span className="opt-icon"><Icon name="delete" size={18} strokeWidth={1.8} /></span>
              <span className="opt-label">Delete session</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
