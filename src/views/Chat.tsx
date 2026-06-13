import { useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import { api, streamEvents, defaultModel, healthProbe } from "../lib/api";
import type { ModelRef, OcEvent, PermissionRequest, ProvidersResponse, Agent, Part, ProviderConfig, Command, QuestionRequest } from "../lib/types";
import MessageView, { type Group } from "../components/MessageView";
import PermissionPrompt from "../components/PermissionPrompt";
import ModelSheet from "../components/ModelSheet";
import CommandMenu from "../components/CommandMenu";
import QuestionPrompt from "../components/QuestionPrompt";
import TodoPanel from "../components/TodoPanel";
import WorkingHorse from "../components/WorkingHorse";
import Icon from "../components/Icon";
import { getConn } from "../lib/settings";
import { isConnected, isP2P, onStateChange } from "../lib/transport";
import { playDone } from "../lib/sound";
import { notifyDone } from "../lib/notify";
import { t } from "../lib/i18n";
import { b64uEnc } from "../lib/util";
import { Mark } from "../components/Logo";
import { log, friendlyError } from "../lib/log";
import { showToast } from "../components/Toast";
import { prompt as modalPrompt, confirm as modalConfirm } from "../components/Modal";

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
  const pendingUpdate = useRef(false);
  const schedule = () => {
    if (pendingUpdate.current) return;
    pendingUpdate.current = true;
    raf.current = requestAnimationFrame(() => { raf.current = null; pendingUpdate.current = false; force(); });
  };

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
  const [apiOk, setApiOk] = useState<boolean | null>(null);
  const [visibleCount, setVisibleCount] = useState(30);
  const msgQueue = useRef<{ text: string; files: typeof attachments }[]>([]);
  const [queueLen, setQueueLen] = useState(0);
  const sessionDir = useRef(dir);
  const prevScrollHeight = useRef<number | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const loadEarlier = () => {
    prevScrollHeight.current = contentRef.current?.scrollHeight ?? null;
    setVisibleCount((v) => v + 100);
  };
  // Keep the viewport anchored on the same message after older ones render above it.
  useLayoutEffect(() => {
    if (prevScrollHeight.current != null) {
      const c = contentRef.current;
      if (c) c.scrollTop += c.scrollHeight - prevScrollHeight.current;
      prevScrollHeight.current = null;
    }
  }, [visibleCount]);

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
        // Drain queued messages
        if (msgQueue.current.length > 0) requestAnimationFrame(() => drainQueue());
      } break;
      case "session.error": if (p.sessionID === sid) { log.error("chat", "session error: " + (p.error?.name || "unknown"), p.error?.data); ensure("err_" + Date.now()).parts.push({ id: "e", type: "text", text: "⚠ " + (p.error?.name || "error") + ": " + (p.error?.data?.message || "") } as any); setBusy(false); schedule(); } break;
      case "permission.asked": if (p.sessionID === sid) setPerms((prev) => prev.find((x) => x.id === p.id) ? prev : [...prev, p]); break;
      case "permission.replied": setPerms((prev) => prev.filter((x) => x.id !== (p.id || p.permissionID))); break;
      case "question.asked": if (p.sessionID === sid) setQuestions((prev) => prev.find((x) => x.id === p.id) ? prev : [...prev, p]); break;
      case "question.replied": setQuestions((prev) => prev.filter((x) => x.id !== (p.id || p.questionID))); break;
      case "session.updated": if (p.info?.id === sid && p.info.title) setTitle(p.info.title); break;
    }
  };

  useEffect(() => {
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
        setVisibleCount(30);
        force();
        checkWedged();
        requestAnimationFrame(() => { const c = contentRef.current; if (c) c.scrollTop = c.scrollHeight; });
        api.session(dir, sid).then((s) => { if (s?.title) setTitle(s.title); if (s?.directory) sessionDir.current = s.directory; }).catch(() => {});
      } catch (e: any) {
        log.error("chat", "session load failed", e?.message || e);
        ensure("load_err").parts.push({ id: "e", type: "text", text: "Failed to load: " + friendlyError(e) } as any); force();
      }
    })();
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
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
    if (!isConnected()) { setApiOk(null); return; }
    let stopped = false;
    healthProbe().then(r => { if (!stopped) setApiOk(r.ok); });
    return () => { stopped = true; };
  }, [isConnected()]);

  // Refetch the transcript and reconcile the busy spinner. The live event stream
  // only carries FUTURE events, so a session.idle that fired while we were
  // backgrounded or mid-reconnect is gone — without this resync the spinner would
  // be stuck on "working" forever even though the turn already finished.
  const reconcileSession = async () => {
    try {
      const hist = await api.messages(dir, sid);
      const newMap = new Map<string, Group>();
      for (const m of hist) newMap.set(m.info.id, { info: m.info, parts: m.parts || [] });
      msgs.current = newMap;
      const last = hist.map((m) => m.info).filter((m: any) => m.role === "assistant").pop() as any;
      if (last?.completed) { setBusy(false); wasBusy.current = false; }
      force();
    } catch { /* ignore */ }
  };

  useEffect(() => {
    const onVis = () => { if (document.visibilityState === "visible") reconcileSession(); };
    document.addEventListener("visibilitychange", onVis);
    let stopSse = () => {};
    // The transport re-arms the SSE subscription on reconnect, but events missed
    // during the outage are lost — resync once the link is back.
    const offState = onStateChange((s) => {
      if (s === "connected") {
        reconcileSession();
        stopSse();
        stopSse = streamEvents(sessionDir.current, handleEvent);
      }
    });
    if (isConnected()) stopSse = streamEvents(sessionDir.current, handleEvent);
    return () => { document.removeEventListener("visibilitychange", onVis); offState(); stopSse(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dir, sid]);

  const compressImage = (dataUrl: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1024;
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) {
          if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
          else { w = Math.round(w * MAX / h); h = MAX; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(dataUrl); return; }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.6));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  };

  const pickFile = async () => {
    try {
      const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
      const image = await Camera.getPhoto({ resultType: CameraResultType.DataUrl, source: CameraSource.Prompt, quality: 80 });
      if (image.dataUrl) {
        const compressed = await compressImage(image.dataUrl);
        setAttachments(prev => [...prev, { name: "image.jpg", dataUrl: compressed, mime: "image/jpeg" }]);
      }
    } catch { /* cancelled */ }
  };

  const doSend = async (text: string, files: typeof attachments) => {
    if (!model) return;
    const d = sessionDir.current;
    setPending(text || "🖼 image"); setBusy(true); wasBusy.current = true;
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
        try { await api.runCommand(d, sid, cmdName, cmdArgs); } catch (e: any) {
          if (/Failed to fetch|NetworkError|aborted/i.test(e.message)) {
            log.warn("chat", "connection blip on command send", e?.message || e);
            showToast("Connection blip — reply will appear on reconnect");
          } else { throw e; }
        }
      } else {
        const ok = await api.promptAsync(d, sid, model, agent, text, variant, sysPrompt || null, files.length ? files : null, formatMode, toolsDisabled);
        if (!ok) {
          log.warn("chat", "promptAsync returned false — connection blip");
          showToast("Connection blip — reply will appear on reconnect");
        }
      }
    } catch (e: any) { log.error("chat", "send failed", e?.message || e); showToast("Send failed: " + friendlyError(e), "error"); }
  };

  const drainQueue = async () => {
    while (msgQueue.current.length > 0) {
      const next = msgQueue.current.shift()!;
      setQueueLen(msgQueue.current.length);
      await doSend(next.text, next.files);
      // wait for this turn to complete before sending next
      await new Promise<void>((resolve) => {
        const check = () => { if (!busy) resolve(); else requestAnimationFrame(check); };
        check();
      });
    }
  };

  const send = async () => {
    const text = input.trim();
    const files = attachments;
    if ((!text && !files.length) || !model) return;
    setInput(""); if (taRef.current) taRef.current.style.height = "auto";
    setAttachments([]);
    // Auto-dismiss any pending questions
    if (questions.length > 0) {
      for (const q of questions) { try { await api.rejectQuestion(sessionDir.current, q.id); } catch { /* */ } }
      setQuestions([]);
    }
    if (busy) {
      // Queue the message — it'll be sent when the current turn finishes
      msgQueue.current.push({ text, files });
      setQueueLen(msgQueue.current.length);
      showToast("Message queued — will send when ready", "info");
      return;
    }
    await doSend(text, files);
  };
  const abort = async () => { try { await api.abort(sessionDir.current, sid); } catch { /* */ } setBusy(false); };
  const respond = async (id: string, r: "once" | "always" | "reject") => {
    setPerms((prev) => prev.filter((x) => x.id !== id));
    try { await api.respondPermission(sessionDir.current, sid, id, r); } catch { /* */ }
  };
  const replyQuestion = async (id: string, answers: string[][]) => {
    setQuestions((prev) => prev.filter((x) => x.id !== id));
    try { await api.replyQuestion(sessionDir.current, id, answers); } catch { /* */ }
  };
  const rejectQuestion = async (id: string) => {
    setQuestions((prev) => prev.filter((x) => x.id !== id));
    try { await api.rejectQuestion(sessionDir.current, id); } catch { /* */ }
  };

  const forkSession = async () => {
    try {
      const s = await api.forkSession(sessionDir.current, sid);
      location.hash = "#/p/" + b64uEnc(dir) + "/s/" + s.id;
    } catch (e: any) { log.error("chat", "fork failed", e?.message || e); ensure("err_" + Date.now()).parts.push({ id: "e", type: "text", text: "Fork failed: " + friendlyError(e) } as any); force(); }
  };
  const compactSession = async () => {
    try { await api.compactSession(sessionDir.current, sid); } catch (e: any) { log.error("chat", "compact failed", e?.message || e); ensure("err_" + Date.now()).parts.push({ id: "e", type: "text", text: "Compact failed: " + friendlyError(e) } as any); force(); }
  };
  const shareSession = async () => {
    try {
      const r = await api.shareSession(sessionDir.current, sid);
      if (r?.url) { await navigator.clipboard.writeText(r.url); ensure("info_" + Date.now()).parts.push({ id: "i", type: "text", text: "Link copied to clipboard" } as any); force(); }
    } catch (e: any) { log.error("chat", "share failed", e?.message || e); ensure("err_" + Date.now()).parts.push({ id: "e", type: "text", text: "Share failed: " + friendlyError(e) } as any); force(); }
  };
  const revertTo = async (messageID: string) => {
    setBusy(true); wasBusy.current = true;
    try { await api.revertSession(sessionDir.current, sid, messageID); } catch (e: any) { log.error("chat", "revert failed", e?.message || e); ensure("err_" + Date.now()).parts.push({ id: "e", type: "text", text: "Revert failed: " + friendlyError(e) } as any); force(); }
    const hist = await api.messages(dir, sid);
    msgs.current = new Map();
    for (const m of hist) msgs.current.set(m.info.id, { info: m.info, parts: m.parts || [] });
    setBusy(false); force();
  };

  const groups = [...msgs.current.values()].sort((a, b) => (a.info.time?.created || 0) - (b.info.time?.created || 0));
  const hiddenCount = Math.max(0, groups.length - visibleCount);
  const shownGroups = hiddenCount > 0 ? groups.slice(hiddenCount) : groups;
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
        <div className={"conn-dot " + (isP2P() ? "p2p" : apiOk === true ? "ws" : apiOk === false ? "err" : isConnected() ? "ws" : "direct")} />
        <button className="back" aria-label="Session actions" onClick={() => setSheet("session")}><Icon name="more" size={20} strokeWidth={2} /></button>
      </div>

      {offline && <div className="status-banner offline">Offline — reconnecting…</div>}

      <TodoPanel dir={dir} sid={sid} />

      <div className="msg-list" ref={contentRef}>
        {hiddenCount > 0 && (
          <button className="load-earlier" onClick={loadEarlier}>
            Show earlier messages ({hiddenCount})
          </button>
        )}
        {shownGroups.map((g) => (
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
              <div className="msg-avatar assistant" style={{ overflow: "hidden" }}><Mark size={28} /></div>
              <div className="msg-block">
                <div className="typing" role="status" aria-label="Assistant is typing"><span /><span /><span /></div>
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
          <button
            className={"pill" + (showAdvanced || sysPrompt || formatMode || toolsDisabled ? " pill-active" : "")}
            onClick={() => setShowAdvanced(!showAdvanced)}
            aria-expanded={showAdvanced}
          >
            <Icon name="settings" size={13} strokeWidth={2} />
            <b>Advanced</b>
            <Icon name={showAdvanced ? "chevronUp" : "chevronDown"} size={12} strokeWidth={2.2} />
          </button>
        </div>
        <CommandMenu commands={commands} value={input} onPick={(name) => { setInput("/" + name + " "); taRef.current?.focus(); }} />
        {busy && <WorkingHorse />}
        {showAdvanced && (
          <div className="advanced-panel">
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
          {busy && (
            <button className="stop-btn" aria-label="Hold 3s to stop"
              onMouseDown={() => {
                const t = setTimeout(() => { abort(); showToast("Turn aborted"); }, 3000);
                const cancel = () => { clearTimeout(t); document.removeEventListener("mouseup", cancel); document.removeEventListener("touchend", cancel); };
                document.addEventListener("mouseup", cancel);
                document.addEventListener("touchend", cancel);
              }}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="8" stroke="currentColor" strokeWidth="1.5" strokeDasharray="50.3" strokeDashoffset="50.3" className="stop-ring" /></svg>
              <span className="stop-label">Stop</span>
            </button>
          )}
          <button className={"send-btn" + (busy ? " busying" : "")}
            disabled={!busy && (!input.trim() && !attachments.length)}
            onClick={send} aria-label={busy ? "Queue" : "Send"}>
            {busy ? <Icon name="send" size={16} strokeWidth={2.2} /> : <Icon name="send" size={18} strokeWidth={2.2} />}
          </button>
          {queueLen > 0 && <span className="queue-badge">{queueLen}</span>}
        </div>
      </div>

      {sheet === "model" && (
        <ModelSheet providers={modelProviders} current={model} onPick={setModel} onClose={() => setSheet(null)} />
      )}
      {sheet === "agent" && (
        <div className="sheet-bg" role="dialog" aria-modal="true" aria-label="Agent" onClick={e => { if (e.target === e.currentTarget) setSheet(null); }}>
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
        <div className="sheet-bg" role="dialog" aria-modal="true" aria-label="Session actions" onClick={e => { if (e.target === e.currentTarget) setSheet(null); }}>
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
              const cmd = await modalPrompt({ title: "Shell command", placeholder: "Enter command..." });
              if (cmd) { setBusy(true); wasBusy.current = true; try { await api.shell(sessionDir.current, sid, cmd); } catch (e: any) { log.error("chat", "shell failed", e?.message || e); ensure("err_" + Date.now()).parts.push({ id: "e", type: "text", text: "Shell failed: " + friendlyError(e) } as any); setBusy(false); force(); } }
            }}>
              <span className="opt-icon"><Icon name="shell" size={18} strokeWidth={1.8} /></span>
              <span className="opt-label">Run shell command</span>
            </div>
            <div className="opt danger" onClick={async () => { setSheet(null); if (await modalConfirm({ title: "Delete session?", message: "This will permanently delete this session and all its messages.", danger: true, confirmLabel: "Delete" })) { api.deleteSession(sessionDir.current, sid).then(() => history.back()); } }}>
              <span className="opt-icon"><Icon name="delete" size={18} strokeWidth={1.8} /></span>
              <span className="opt-label">Delete session</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
