"use client";

import { useEffect, useRef, useState } from "react";
import type { Highlight } from "../narration";

export interface HighlightFeedProps { highlights: readonly Highlight[]; onComplete(): void; instant?: boolean }
export function HighlightFeed({ highlights, onComplete, instant = false }: HighlightFeedProps) {
  const [speed, setSpeed] = useState<"normal" | "fast">("normal"); const [count, setCount] = useState(highlights.length ? 1 : 0); const completed = useRef(false);
  const finish = (): void => { if (!completed.current) { completed.current = true; onComplete(); } };
  // The queue deliberately resets when the immutable simulation payload changes.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { completed.current = false; setCount(highlights.length ? 1 : 0); if (!highlights.length || instant) { if (instant) setCount(highlights.length); finish(); } }, [highlights, instant]);
  useEffect(() => { if (count >= highlights.length) { finish(); return; } const id = window.setTimeout(() => setCount(value => Math.min(highlights.length, value + 1)), speed === "fast" ? 800 : 1600); return () => window.clearTimeout(id); }, [count, highlights.length, speed]);
  const skip = (): void => { setCount(highlights.length); finish(); };
  return <section aria-label="SIMULATED HIGHLIGHTS"><h2>SIMULATED HIGHLIGHTS</h2><p>Fantasy simulation moments from this series.</p><div>{highlights.slice(0, count).map(item => <p key={item.id}>{item.text}</p>)}</div><div><button type="button" aria-pressed={speed === "normal"} onClick={() => setSpeed("normal")}>1x</button><button type="button" aria-pressed={speed === "fast"} onClick={() => setSpeed("fast")}>2x</button><button type="button" onClick={skip}>Skip</button></div></section>;
}
