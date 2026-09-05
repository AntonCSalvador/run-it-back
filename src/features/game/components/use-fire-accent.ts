"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** A short-lived visual acknowledgement that can be replayed after every action. */
export function useFireAccent() {
  const [active, setActive] = useState(false);
  const [variant, setVariant] = useState<"a" | "b">("a");
  const activeRef = useRef(false);
  const timeout = useRef<number | null>(null);
  const frame = useRef<number | null>(null);
  const generation = useRef(0);
  const cancelScheduled = useCallback(() => {
    if (timeout.current !== null) window.clearTimeout(timeout.current);
    if (frame.current !== null) window.cancelAnimationFrame(frame.current);
    timeout.current = null;
    frame.current = null;
  }, []);
  const trigger = useCallback(() => {
    cancelScheduled();
    const currentGeneration = ++generation.current;
    setVariant(currentGeneration % 2 ? "a" : "b");
    const arm = () => {
      if (generation.current !== currentGeneration) return;
      frame.current = null;
      activeRef.current = true;
      setActive(true);
      // Animation names repeat, so animationend cannot identify a generation.
      // This timer also bounds the static accent when reduced motion is enabled.
      timeout.current = window.setTimeout(() => {
        if (generation.current !== currentGeneration) return;
        timeout.current = null;
        activeRef.current = false;
        setActive(false);
      }, 650);
    };
    if (activeRef.current) {
      activeRef.current = false;
      setActive(false);
      frame.current = window.requestAnimationFrame(arm);
    } else { arm(); }
  }, [cancelScheduled]);
  useEffect(() => () => {
    generation.current += 1;
    cancelScheduled();
    activeRef.current = false;
  }, [cancelScheduled]);

  return { fireClass: active ? `fire-accent fire-accent--${variant}` : "", trigger };
}
