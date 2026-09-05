"use client";

import type { GameMode } from "../machine";

export function AppHeader({ mode, streak, dailyHistoryCount = 0, onStart, onRestart }: { mode: GameMode | null; streak: number; dailyHistoryCount?: number; onStart: (mode: GameMode) => void; onRestart: () => void }) {
  return <header>
    <h1>Run It Back</h1>
    <div role="group" aria-label="Game mode">
      <button type="button" aria-pressed={mode === "daily"} onClick={() => onStart("daily")}>Daily</button>
      <button type="button" aria-pressed={mode === "free-play"} onClick={() => onStart("free-play")}>Free Play</button>
    </div>
    <p aria-label="Daily streak">Streak: {streak}</p>
    <p aria-label="Daily history">Daily history: {dailyHistoryCount}</p>
    <button type="button" onClick={onRestart}>Reset current run</button>
  </header>;
}
