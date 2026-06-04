import PartView from "./PartView";
import type { Message, Part } from "../lib/types";

export interface Group { info: Message; parts: Part[]; }

export default function MessageView({ group, onRevert }: { group: Group; onRevert?: (id: string) => void }) {
  const role = group.info.role;
  const err = (group.info as any).error;
  return (
    <div className={"msg " + role} data-id={group.info.id}>
      {role === "assistant" && <div className="role">opencode</div>}
      <div className={role === "user" ? "bubble-wrap" : ""}>
        <div className={role === "user" ? "bubble" : ""}>
          {group.parts.map((p) => <PartView key={p.id} part={p} role={role} />)}
          {err && <div className="errbox">⚠ {err.name}{err.data?.message ? ": " + err.data.message : ""}</div>}
        </div>
        {role === "user" && onRevert && (
          <button className="revert-btn" title="Revert to here" onClick={() => onRevert(group.info.id)}>↩</button>
        )}
      </div>
    </div>
  );
}
