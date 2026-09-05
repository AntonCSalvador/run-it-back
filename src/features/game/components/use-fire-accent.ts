"use client";

import { useCallback, useEffect, useRef, useState, type AnimationEvent } from "react";

/** A short-lived visual acknowledgement that can be replayed after every action. */
export function useFireAccent() {
  const [active, setActive] = useState(false);
  const activeRef = useRef(false);
  const timeout = useRef<number | null>(null);
  const frame = useRef<number | null>(null);

  const clear = useCallback(() => {
    if (timeout.current !== null) window.clearTimeout(timeout.current);
    if (frame.current !== null) window.cancelAnimationFrame(frame.current);
    timeout.current = null;
    frame.current = null;
    activeRef.current = false;
    setActive(false);
  }, []);
  const trigger = useCallback(() => {
    if (timeout.current !== null) window.clearTimeout(timeout.current);
    if (frame.current !== null) window.cancelAnimationFrame(frame.current);
    const arm = () => { frame.current = null; activeRef.current = true; setActive(true); timeout.current = window.setTimeout(clear, 650); };
    if (activeRef.current) {
      activeRef.current = false;
      setActive(false);
      frame.current = window.requestAnimationFrame(arm);
    } else { activeRef.current = true; arm(); }
  }, [clear]);
  const onAnimationEnd = useCallback((event: AnimationEvent<HTMLElement>) => {
    if (event.target === event.currentTarget) clear();
  }, [clear]);
  useEffect(() => clear, [clear]);

  return { fireClass: active ? "fire-accent" : "", trigger, onAnimationEnd };
}
