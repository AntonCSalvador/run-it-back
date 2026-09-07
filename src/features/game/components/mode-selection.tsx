"use client";

import type { GameMode } from "../machine";

export interface ModeSelectionProps {
  dailyState: "available" | "completed";
  streak: number;
  onStart(mode: GameMode): void;
  onViewDailyResult(): void;
}

export function ModeSelection({ dailyState, streak, onStart, onViewDailyResult }: ModeSelectionProps) {
  const completed = dailyState === "completed";

  return <section className="mode-selection" aria-labelledby="mode-selection-title">
    <div className="mode-selection__intro">
      <h2 id="mode-selection-title">Draft history. Rewrite the bracket.</h2>
      <p className="mode-selection__lede">Build a five-player Champions roster, assign every role, choose an IGL, and play through four tournament rounds.</p>
    </div>

    <div className="mode-selection__choices" aria-label="Choose how to play">
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
    </div>

    <ol className="mode-selection__format" aria-label="Run format">
      <li>Draft five</li>
      <li>Assign roles</li>
      <li>Choose an IGL</li>
      <li>Play four rounds</li>
    </ol>
  </section>;
}
