import { useState } from "react";
import PartView from "./PartView";
import type { Message, Part } from "../lib/types";
import { Mark } from "./Logo";
import Icon from "./Icon";

export interface Group { info: Message; parts: Part[]; }

function fmtTime(ms?: number): string {
  if (!ms) return "";
  const d = new Date(ms);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function MessageView({ group, onRevert }: { group: Group; onRevert?: (id: string) => void }) {
  const role = group.info.role;
  const err = (group.info as any).error;
  const [copied, setCopied] = useState(false);
  const copyText = () => {
    const text = group.parts.filter(p => p.type === "text" && !((p as any).synthetic)).map(p => (p as any).text).join("\n");
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }).catch(() => {});
  };
  return (
    <div className={"msg-row " + role}>
      {role === "assistant" && <div className="msg-avatar assistant" style={{ overflow: "hidden" }}><Mark size={28} /></div>}
      {role === "user" && <div className="msg-avatar user">Y</div>}
      <div className="msg-block">
        {role === "assistant" && <div className="role">opencode</div>}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div className={role === "user" ? "msg-bubble" : "msg-bubble"}>
            {group.parts.map((p) => <PartView key={p.id} part={p} role={role} />)}
            {err && <div className="errbox">{err.name}{err.data?.message ? ": " + err.data.message : ""}</div>}
          </div>
          {role === "user" && onRevert && (
            <button className="revert-btn" onClick={() => onRevert(group.info.id)}>↩</button>
          )}
          {role === "assistant" && group.parts.some(p => p.type === "text" && (p as any).text) && (
            <button className="copy-btn" onClick={copyText} aria-label="Copy message">
              {copied ? <Icon name="check" size={14} strokeWidth={2.5} /> : <Icon name="copy" size={14} strokeWidth={2} />}
            </button>
          )}
        </div>
        <div className="msg-time">
          {fmtTime(group.info.time?.created)}
          {(group.info as any).modelID ? ` · ${(group.info as any).modelID}` : ""}
        </div>
      </div>
    </div>
  );
}
