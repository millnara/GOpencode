import { useState } from "react";
import type { ModelRef, ProviderConfig } from "../lib/types";

interface Props {
  providers: ProviderConfig[];
  current: ModelRef | null;
  onPick: (m: ModelRef) => void;
  onClose: () => void;
}

export default function ModelSheet({ providers, current, onPick, onClose }: Props) {
  const [viewing, setViewing] = useState<string | null>(
    providers.find((p) => p.id === current?.providerID)?.id ?? null
  );
  const [q, setQ] = useState("");

  if (viewing) {
    const prov = providers.find((p) => p.id === viewing);
    if (!prov) { setViewing(null); return null; }
    const mids = Object.keys(prov.models).sort((a, b) => a.localeCompare(b));
    const filtered = q
      ? mids.filter(
          (m) =>
            m.toLowerCase().includes(q.toLowerCase()) ||
            (prov.models[m].name || "").toLowerCase().includes(q.toLowerCase())
        )
      : mids;
    return (
      <div className="sheet-bg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="sheet">
          <div style={{ display: "flex", alignItems: "center", gap: 2, padding: "2px 6px" }}>
            <button className="iconbtn" onClick={() => { setViewing(null); setQ(""); }}>‹</button>
            <h3 style={{ margin: "10px 4px", flex: 1 }}>{prov.name}</h3>
          </div>
          {mids.length > 8 && (
            <input className="search" style={{ margin: "6px 14px", width: "calc(100% - 28px)" }}
              placeholder={`Search ${mids.length} models…`}
              value={q} onChange={(e) => setQ(e.target.value)} />
          )}
          <div>
            {filtered.map((mid) => {
              const sel = current?.providerID === prov.id && current?.modelID === mid;
              return (
                <div key={mid} className={"opt" + (sel ? " sel" : "")}
                  onClick={() => { onPick({ providerID: prov.id, modelID: mid }); onClose(); }}>
                  <span>{prov.models[mid].name || mid}</span>
                  {sel && <span>✓</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="sheet-bg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet">
        <h3>Provider</h3>
        {providers.length === 0 && (
          <div className="empty" style={{ padding: 24 }}>
            No providers found.
          </div>
        )}
        {providers.map((p) => {
          const n = Object.keys(p.models).length;
          return (
            <div key={p.id} className={"opt" + (current?.providerID === p.id ? " sel" : "")}
              onClick={() => setViewing(p.id)}>
              <span>{p.name}</span>
              <span style={{ color: "var(--faint)", fontSize: "12.5px" }}>{n} models ›</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
