import { useState } from "react";
import type { QuestionRequest, QuestionInfo } from "../lib/types";

function SingleQuestion({
  q,
  onAnswer,
}: {
  q: QuestionInfo;
  onAnswer: (labels: string[]) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [customText, setCustomText] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const toggle = (label: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label); else next.add(label);
      return next;
    });
  };

  const submit = () => {
    const labels = [...selected];
    if (q.custom && customText.trim()) labels.push(customText.trim());
    if (labels.length === 0) return;
    setSubmitted(true);
    onAnswer(labels);
  };

  if (submitted) return <div className="q-answered">Answered</div>;

  return (
    <div className="q-block">
      {q.header && <div className="q-header">{q.header}</div>}
      <div className="q-text">{q.question}</div>
      <div className="q-options">
        {q.options.map((o) => {
          const active = selected.has(o.label);
          return (
            <button key={o.label}
              className={"q-opt" + (active ? " active" : "")}
              onClick={() => {
                if (q.multiple) toggle(o.label);
                else { setSelected(new Set([o.label])); if (!q.custom) { setSubmitted(true); onAnswer([o.label]); } }
              }}>
              <span className="q-label">{o.label}</span>
              {o.description && <span className="q-desc">{o.description}</span>}
            </button>
          );
        })}
      </div>
      {q.custom && (
        <div className="q-custom">
          <input className="inline-search" style={{ marginBottom: 0 }} placeholder="Other…" value={customText}
            onChange={(e) => setCustomText(e.target.value)} />
        </div>
      )}
      {(q.multiple || q.custom) && (
        <button className="q-submit" disabled={selected.size === 0 && !customText.trim()} onClick={submit}>
          Submit
        </button>
      )}
    </div>
  );
}

export default function QuestionPrompt({
  req,
  onReply,
  onReject,
}: {
  req: QuestionRequest;
  onReply: (answers: string[][]) => void;
  onReject: () => void;
}) {
  const [answered, setAnswered] = useState(false);
  const answers: string[][] = [];

  const handleAnswer = (qi: number, labels: string[]) => {
    answers[qi] = labels;
    const allDone = req.questions.every((_, i) => answers[i] != null);
    if (allDone) {
      setAnswered(true);
      onReply(answers);
    }
  };

  if (answered) return null;

  return (
    <div className="q-card">
      <div className="h">
        <span>Question</span>
        <button onClick={() => { setAnswered(true); onReject(); }}>Skip</button>
      </div>
      {req.questions.map((q, i) => (
        <SingleQuestion key={i} q={q} onAnswer={(labels) => handleAnswer(i, labels)} />
      ))}
    </div>
  );
}
