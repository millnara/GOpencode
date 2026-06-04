import PartView from "./PartView";
import type { Message, Part } from "../lib/types";

export interface Group { info: Message; parts: Part[]; }

function fmtTime(ms?: number): string {
  if (!ms) return "";
  const d = new Date(ms);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function MessageView({ group, onRevert }: { group: Group; onRevert?: (id: string) => void }) {
  const role = group.info.role;
  const err = (group.info as any).error;
  return (
    <div className={"msg-row " + role}>
      {role === "assistant" && <div className="msg-avatar assistant">oc</div>}
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
        </div>
        <div className="msg-time">
          {fmtTime(group.info.time?.created)}
          {(group.info as any).modelID ? ` · ${(group.info as any).modelID}` : ""}
        </div>
      </div>
    </div>
  );
}
