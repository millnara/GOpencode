import type { Command } from "../lib/types";

interface Props {
  commands: Command[];
  value: string;
  onPick: (name: string) => void;
}

export default function CommandMenu({ commands, value, onPick }: Props) {
  const m = value.match(/^\/(\S*)$/);
  if (!m) return null;
  const q = m[1].toLowerCase();
  const matches = commands.filter((c) => c.name.toLowerCase().startsWith(q)).slice(0, 8);
  if (!matches.length) return null;

  return (
    <div className="cmdmenu">
      {matches.map((c) => (
        <div key={c.name} className="cmdrow" onClick={() => onPick(c.name)}>
          <span className="cmdname">/{c.name}</span>
          <span className="cmddesc">{c.description || ""}</span>
        </div>
      ))}
    </div>
  );
}
