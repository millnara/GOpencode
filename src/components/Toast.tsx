import { useEffect, useState, useRef } from "react";

interface ToastItem { id: number; text: string; kind: "error" | "warn" | "info"; }

let nextId = 0;
let listeners: ((toasts: ToastItem[]) => void)[] = [];
let queue: ToastItem[] = [];

function notify() { for (const l of listeners) l(queue.slice()); }

export function showToast(text: string, kind: ToastItem["kind"] = "warn", ms = 4000) {
  const t: ToastItem = { id: nextId++, text, kind };
  queue = [...queue, t].slice(-3);
  notify();
  setTimeout(() => { queue = queue.filter(x => x.id !== t.id); notify(); }, ms);
}

export default function ToastContainer() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const ref = useRef(false);

  useEffect(() => {
    if (ref.current) return;
    ref.current = true;
    const l = (t: ToastItem[]) => setItems(t);
    listeners.push(l);
    return () => { listeners = listeners.filter(x => x !== l); };
  }, []);

  if (!items.length) return null;
  return (
    <div className="toast-stack">
      {items.map(t => (
        <div key={t.id} className={"toast " + t.kind}>
          <span className="toast-tx">{t.text}</span>
        </div>
      ))}
    </div>
  );
}
