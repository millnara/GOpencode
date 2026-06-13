import { useEffect, useRef, useState } from "react";
import { api, streamEvents } from "../lib/api";

interface TodoItem { content: string; status: string; priority: string; }

export default function TodoPanel({ dir, sid }: { dir: string; sid: string }) {
  const [todos, setTodos] = useState<TodoItem[] | null>(null);
  const [open, setOpen] = useState(false);
  const lastSnap = useRef("");

  const load = () => api.todo(dir, sid).then(t => {
    const snap = JSON.stringify(t);
    if (snap !== lastSnap.current) {
      lastSnap.current = snap;
      setTodos(t);
    }
  }).catch(() => setTodos(null));

  useEffect(() => {
    load();
    const iv = setInterval(load, 8000);
    return () => clearInterval(iv);
  }, [dir, sid]);

  useEffect(() => {
    const off = streamEvents(dir, (ev: any) => {
      if (ev.type === "todo.updated" || ev.type === "todo.removed") { load(); return; }
      if (ev.type === "message.part.updated" || ev.type === "message.updated") { load(); return; }
      // When the turn ends, hide any orphaned (stale in-progress) todos
      if (ev.type === "session.idle") {
        api.todo(dir, sid).then(t => {
          if (!t || t.length === 0) return setTodos(null);
          const allDone = t.every((x: TodoItem) => x.status === "completed");
          const snap = JSON.stringify(t);
          // If turn ended and todos haven't changed since last poll, they're orphaned
          if (allDone || snap === lastSnap.current) { setTodos(null); lastSnap.current = ""; }
          else { setTodos(t); }
        }).catch(() => {});
      }
    });
    return off;
  }, [dir, sid]);

  if (!todos || todos.length === 0) return null;

  const done = todos.filter((t) => t.status === "completed").length;
  if (done === todos.length) return null;
  const pct = Math.round((done / todos.length) * 100);

  return (
    <div className="todo-panel">
      <button className="todo-header" onClick={() => setOpen(!open)}>
        <span className="todo-progress">{done}/{todos.length}</span>
        <div className="todo-bar"><div className="todo-fill" style={{ width: pct + "%" }} /></div>
        <span className="todo-chevron">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="todo-list">
          {todos.map((t, i) => (
            <div key={i} className={"todo-item " + t.status}>
              <span className="todo-dot" />
              <span className="todo-text">{t.content}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
