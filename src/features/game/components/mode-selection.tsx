"use client";

import { useEffect, useRef } from "react";
import type { GameMode } from "../machine";

export interface ModeSelectionProps {
  dailyState: "available" | "completed";
  streak: number;
  focusOnMount?: boolean;
  savedRun: { mode: GameMode; detail: string } | null;
  onStart(mode: GameMode): void;
  onViewDailyResult(): void;
  onContinueSavedRun(): void;
  onStartOver(): void;
}

export function ModeSelection({ dailyState, streak, focusOnMount = false, savedRun, onStart, onViewDailyResult, onContinueSavedRun, onStartOver }: ModeSelectionProps) {
  const completed = dailyState === "completed";
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (focusOnMount) heading.current?.focus(); }, [focusOnMount]);

  return <section className="mode-selection" aria-labelledby="mode-selection-title">
    <div className="mode-selection__intro">
      <h2 id="mode-selection-title" ref={heading} tabIndex={-1}>Draft history. Rewrite the bracket.</h2>
      <p className="mode-selection__lede">Build a five-player Champions roster, assign every role, choose an IGL, and play through four tournament rounds.</p>
    </div>

    <div className="mode-selection__choices" aria-label="Choose how to play">
      {savedRun ? <section className="mode-selection__saved" aria-labelledby="saved-run-title">
        <h3 id="saved-run-title">Unfinished {savedRun.mode === "daily" ? "Daily" : "Free Play"} run</h3>
        <p>{savedRun.detail}</p>
        <div className="mode-selection__actions">
          <button className="action-button" type="button" onClick={onContinueSavedRun}>Continue saved run</button>
          <button type="button" onClick={onStartOver}>Start over</button>
        </div>
      </section> : <>
        <section className="mode-selection__daily" aria-labelledby="daily-mode-title">
          <div className="mode-selection__choice-heading">
            <h3 id="daily-mode-title">Daily</h3>
            <p className="mode-status" role="status">{completed ? "Completed today" : "Available today"}</p>
          </div>
          <p>One shared draft each UTC day.</p>
          <p aria-label="Daily streak">Current streak: {streak}</p>
          <div className="mode-selection__actions">
            {completed
              ? <>
                  <button className="action-button" type="button" onClick={onViewDailyResult}>View today&apos;s result</button>
                  <button type="button" onClick={() => onStart("daily")}>Replay today&apos;s Daily</button>
                </>
              : <button className="action-button" type="button" onClick={() => onStart("daily")}>Start today&apos;s Daily</button>}
          </div>
        </section>

        <section className="mode-selection__free" aria-labelledby="free-play-title">
          <h3 id="free-play-title">Free Play</h3>
          <p>Unlimited drafts with a fresh bracket each run.</p>
          <button type="button" onClick={() => onStart("free-play")}>Start Free Play</button>
        </section>
      </>}
    </div>

    <ol className="mode-selection__format" aria-label="Run format">
      <li>Draft five</li>
      <li>Assign roles</li>
      <li>Choose an IGL</li>
      <li>Play four rounds</li>
    </ol>
  </section>;
}
