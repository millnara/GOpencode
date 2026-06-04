import { useEffect, useState } from "react";
import { api } from "../lib/api";

interface TodoItem { content: string; status: string; priority: string; }

export default function TodoPanel({ dir, sid }: { dir: string; sid: string }) {
  const [todos, setTodos] = useState<TodoItem[] | null>(null);
  const [open, setOpen] = useState(false);

  const load = () => api.todo(dir, sid).then(setTodos).catch(() => setTodos(null));

  useEffect(() => { load(); const iv = setInterval(load, 8000); return () => clearInterval(iv); }, [dir, sid]);

  if (!todos || todos.length === 0) return null;

  const done = todos.filter((t) => t.status === "completed").length;
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
