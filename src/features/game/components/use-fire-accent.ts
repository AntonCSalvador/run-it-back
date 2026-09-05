"use client";

import { useCallback, useEffect, useRef, useState, type AnimationEvent } from "react";

/** A short-lived visual acknowledgement that can be replayed after every action. */
export function useFireAccent() {
  const [active, setActive] = useState(false);
  const timeout = useRef<number | null>(null);

  const clear = useCallback(() => {
    if (timeout.current !== null) window.clearTimeout(timeout.current);
    timeout.current = null;
    setActive(false);
  }, []);
  const trigger = useCallback(() => {
    if (timeout.current !== null) window.clearTimeout(timeout.current);
    setActive(true);
    timeout.current = window.setTimeout(clear, 650);
  }, [clear]);
  const onAnimationEnd = useCallback((event: AnimationEvent<HTMLElement>) => {
    if (event.target === event.currentTarget) clear();
  }, [clear]);
  useEffect(() => clear, [clear]);

  return { fireClass: active ? "fire-accent" : "", trigger, onAnimationEnd };
}
