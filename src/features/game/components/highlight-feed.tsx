"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Highlight } from "../narration";

function HighlightRow({ item }: { item: Highlight }) {
  const hot = item.kind === "clutch" || item.emphasis === "clutch" || item.emphasis === "decisive";
  const label = item.emphasis === "decisive" ? "Decisive" : hot ? "Clutch" : null;
  return <article className="highlight-feed__moment" data-heat={hot || undefined}>
    {label && <span className="highlight-feed__tag">{label}</span>}
    <p>{item.text}</p>
  </article>;
}

export interface HighlightFeedProps {
  highlights: readonly Highlight[];
  onComplete(): void;
  instant?: boolean;
  focusOnMount?: boolean;
}

export function HighlightFeed(props: HighlightFeedProps) {
  const content = JSON.stringify(props.highlights);
  const [queue, setQueue] = useState(() => ({ highlights: props.highlights, content, instant: props.instant, revision: 0 }));
  // Reset before rendering replacement contents, with fresh timers and completion.
  const enterInstantPresentation = props.instant === true && queue.instant !== true;
  if (queue.highlights !== props.highlights || queue.content !== content || enterInstantPresentation) {
    setQueue({ highlights: props.highlights, content, instant: props.instant, revision: queue.revision + 1 });
  }
  return <HighlightQueue key={queue.revision} {...props} />;
}

function HighlightQueue({ highlights, onComplete, instant = false, focusOnMount = false }: HighlightFeedProps) {
  const [speed, setSpeed] = useState<"normal" | "fast">("normal");
  const [paused, setPaused] = useState(false);
  // The first moment is immediate; subsequent moments use the selected interval.
  const [count, setCount] = useState(instant ? highlights.length : Math.min(1, highlights.length));
  const completed = useRef(false);
  const completion = useRef(onComplete);
  const heading = useRef<HTMLHeadingElement>(null);
  const handledMountFocus = useRef(false);
  const finish = useCallback(() => {
    if (!completed.current) {
      completed.current = true;
      completion.current();
    }
  }, []);

  useEffect(() => { completion.current = onComplete; }, [onComplete]);
  useEffect(() => {
    if (!focusOnMount || handledMountFocus.current) return;
    handledMountFocus.current = true;
    heading.current?.focus();
  }, [focusOnMount]);
  useEffect(() => {
    if (count >= highlights.length) { finish(); return; }
    if (paused) return;
    const id = window.setTimeout(() => setCount(value => value + 1), speed === "fast" ? 800 : 1600);
    return () => window.clearTimeout(id);
  }, [count, highlights.length, paused, speed, finish]);

  const skip = () => { setCount(highlights.length); finish(); };
  const presentationComplete = count >= highlights.length;
  return <section aria-label="SIMULATED HIGHLIGHTS" className="highlight-feed">
    <h2 ref={heading} tabIndex={-1}>SIMULATED HIGHLIGHTS</h2>
    <p>Fantasy simulation moments from this series.</p>
    <div role="log" aria-label="Simulated series moments" aria-live="polite" aria-relevant="additions" aria-atomic="false">
      {highlights.slice(0, count).map(item => <HighlightRow key={item.id} item={item} />)}
    </div>
    {presentationComplete ? <p className="highlight-feed__complete">Highlights complete. Result ready.</p> : <div className="highlight-feed__controls" role="group" aria-label="Highlight playback controls">
      <button type="button" onClick={() => setPaused(value => !value)}>{paused ? "Resume highlights" : "Pause highlights"}</button>
      <button type="button" aria-pressed={speed === "normal"} onClick={() => setSpeed("normal")}>1x</button>
      <button type="button" aria-pressed={speed === "fast"} onClick={() => setSpeed("fast")}>2x</button>
      <button type="button" onClick={skip}>Skip to result</button>
    </div>}
  </section>;
}
