"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Highlight } from "../narration";

export interface HighlightFeedProps {
  highlights: readonly Highlight[];
  onComplete(): void;
  instant?: boolean;
}

export function HighlightFeed(props: HighlightFeedProps) {
  const content = JSON.stringify(props.highlights);
  const [queue, setQueue] = useState(() => ({ highlights: props.highlights, content, instant: props.instant, revision: 0 }));
  // Reset before rendering replacement contents, with fresh timers and completion.
  if (queue.highlights !== props.highlights || queue.content !== content || queue.instant !== props.instant) {
    setQueue({ highlights: props.highlights, content, instant: props.instant, revision: queue.revision + 1 });
  }
  return <HighlightQueue key={queue.revision} {...props} />;
}

function HighlightQueue({ highlights, onComplete, instant = false }: HighlightFeedProps) {
  const [speed, setSpeed] = useState<"normal" | "fast">("normal");
  // The first moment is immediate; subsequent moments use the selected interval.
  const [count, setCount] = useState(instant ? highlights.length : Math.min(1, highlights.length));
  const completed = useRef(false);
  const completion = useRef(onComplete);
  const finish = useCallback(() => {
    if (!completed.current) {
      completed.current = true;
      completion.current();
    }
  }, []);

  useEffect(() => { completion.current = onComplete; }, [onComplete]);
  useEffect(() => {
    if (count >= highlights.length) { finish(); return; }
    const id = window.setTimeout(() => setCount(value => value + 1), speed === "fast" ? 800 : 1600);
    return () => window.clearTimeout(id);
  }, [count, highlights.length, speed, finish]);

  const skip = () => { setCount(highlights.length); finish(); };
  return <section aria-label="SIMULATED HIGHLIGHTS">
    <h2>SIMULATED HIGHLIGHTS</h2>
    <p>Fantasy simulation moments from this series.</p>
    <div>{highlights.slice(0, count).map(item => <p key={item.id}>{item.text}</p>)}</div>
    <div>
      <button type="button" aria-pressed={speed === "normal"} onClick={() => setSpeed("normal")}>1x</button>
      <button type="button" aria-pressed={speed === "fast"} onClick={() => setSpeed("fast")}>2x</button>
      <button type="button" onClick={skip}>Skip</button>
    </div>
  </section>;
}
