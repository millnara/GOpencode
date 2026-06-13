import { useEffect, useRef, useState } from "react";
import horse from "../assets/horse-anim.png";
import { getPhrases } from "../lib/settings";

// The "thinking" indicator: the smoking horse (glowing cigar ember + rising
// smoke, animated in CSS) next to a typed-out phrase. Phrases are picked at
// random from the active set; a phrase split on ":" becomes linked lines that
// type one after another, stacked. The cigar tip sits at 19%/70% of the mark.

const TYPE_MIN = 62;   // ms per char (min)
const TYPE_RND = 55;   // + up to this much jitter
const LINE_PAUSE = 240; // pause before a linked line starts
const HOLD = 1700;      // hold the finished phrase
const ERASE = 7;        // ms per char while erasing
const GAP = 340;        // blank pause between phrases

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function WorkingHorse() {
  const [lines, setLines] = useState<string[]>([""]);
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    let lastIdx = -1;

    const run = async () => {
      while (!cancelled.current) {
        const phrases = getPhrases().phrases;
        if (!phrases.length) { await sleep(500); continue; }

        // random pick, avoid repeating the same phrase twice in a row
        let idx = Math.floor(Math.random() * phrases.length);
        if (phrases.length > 1 && idx === lastIdx) idx = (idx + 1) % phrases.length;
        lastIdx = idx;

        const segs = phrases[idx].split(":");
        const acc: string[] = [""];
        setLines([""]);

        for (let si = 0; si < segs.length; si++) {
          if (cancelled.current) return;
          if (si > 0) { acc.push(""); setLines([...acc]); await sleep(LINE_PAUSE); }
          for (const ch of segs[si]) {
            if (cancelled.current) return;
            acc[acc.length - 1] += ch;
            setLines([...acc]);
            await sleep(TYPE_MIN + Math.random() * TYPE_RND);
          }
        }

        await sleep(HOLD);

        // erase last line → first, then move on
        while (acc.length) {
          let s = acc[acc.length - 1];
          while (s.length) {
            if (cancelled.current) return;
            s = s.slice(0, -1);
            acc[acc.length - 1] = s;
            setLines([...acc]);
            await sleep(ERASE);
          }
          acc.pop();
          if (acc.length) setLines([...acc]);
        }
        setLines([""]);
        await sleep(GAP);
      }
    };

    run();
    return () => { cancelled.current = true; };
  }, []);

  return (
    <div className="statusline">
      <div className="work-horse" style={{ ["--tx" as any]: "19%", ["--ty" as any]: "70%" }}>
        <img src={horse} alt="" aria-hidden="true" draggable={false} />
        <div className="tip" />
        <div className="smoke s1" />
        <div className="smoke s2" />
        <div className="smoke s3" />
      </div>
      <div className="typed" aria-live="polite">
        {lines.map((ln, i) => (
          <div className="ln" key={i}>
            {ln}
            {i === lines.length - 1 && <span className="cursor" />}
          </div>
        ))}
      </div>
    </div>
  );
}
