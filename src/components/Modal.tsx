import { useState, useEffect, useRef } from "react";

interface PromptOpts {
  title: string;
  message?: string;
  defaultValue?: string;
  placeholder?: string;
  inputType?: "text" | "password" | "number";
}

interface ConfirmOpts {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}

let showPrompt: ((opts: PromptOpts) => Promise<string | null>) | null = null;
let showConfirm: ((opts: ConfirmOpts) => Promise<boolean>) | null = null;

export function prompt(opts: PromptOpts): Promise<string | null> {
  return showPrompt!(opts);
}
export function confirm(opts: ConfirmOpts): Promise<boolean> {
  return showConfirm!(opts);
}

export function ModalHost() {
  const [promptState, setPromptState] = useState<PromptOpts & { resolve: (v: string | null) => void } | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmOpts & { resolve: (v: boolean) => void } | null>(null);
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    showPrompt = (opts) => new Promise<string | null>(resolve => { setPromptState({ ...opts, resolve }); setInput(opts.defaultValue || ""); });
    showConfirm = (opts) => new Promise<boolean>(resolve => { setConfirmState({ ...opts, resolve }); });
    return () => { showPrompt = null; showConfirm = null; };
  }, []);

  useEffect(() => { if (promptState) setTimeout(() => inputRef.current?.focus(), 50); }, [promptState]);

  const submitPrompt = () => { promptState?.resolve(input || null); setPromptState(null); };
  const submitConfirm = (v: boolean) => { confirmState?.resolve(v); setConfirmState(null); };

  if (!promptState && !confirmState) return null;

  return (
    <>
      {promptState && (
        <div className="sheet-bg" style={{ zIndex: 900 }} onClick={e => { if (e.target === e.currentTarget) { promptState.resolve(null); setPromptState(null); } }}>
          <div className="sheet" style={{ padding: "20px 22px 24px" }}>
            <h3 style={{ margin: "0 0 6px" }}>{promptState.title}</h3>
            {promptState.message && <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 14 }}>{promptState.message}</div>}
            <input
              ref={inputRef}
              type={promptState.inputType || "text"}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") submitPrompt(); if (e.key === "Escape") { promptState.resolve(null); setPromptState(null); } }}
              placeholder={promptState.placeholder || ""}
              style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 14, outline: "none", boxSizing: "border-box" }}
            />
            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <button className="btn secondary" style={{ flex: 1 }} onClick={() => { promptState.resolve(null); setPromptState(null); }}>Cancel</button>
              <button className="btn" style={{ flex: 1 }} onClick={submitPrompt}>OK</button>
            </div>
          </div>
        </div>
      )}
      {confirmState && (
        <div className="sheet-bg" style={{ zIndex: 900 }} onClick={e => { if (e.target === e.currentTarget) submitConfirm(false); }}>
          <div className="sheet" style={{ padding: "20px 22px 24px" }}>
            <h3 style={{ margin: "0 0 6px" }}>{confirmState.title}</h3>
            <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 18, lineHeight: 1.5 }}>{confirmState.message}</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn secondary" style={{ flex: 1 }} onClick={() => submitConfirm(false)}>Cancel</button>
              <button className={"btn" + (confirmState.danger ? " danger" : "")} style={{ flex: 1 }} onClick={() => submitConfirm(true)}>{confirmState.confirmLabel || "Confirm"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
