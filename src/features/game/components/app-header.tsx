"use client";

import type { GameMode } from "../machine";
import { type MacroStage, RunProgress } from "./run-progress";

export interface AppHeaderProps {
  mode: GameMode;
  stage: MacroStage;
  detail: string;
  onExit?(): void;
}

export function AppHeader({ mode, stage, detail, onExit }: AppHeaderProps) {
  return <header className="app-banner">
    <h1>Run It Back</h1>
    <div className="app-banner__run">
      <p aria-label="Current mode">{mode === "daily" ? "Daily" : "Free Play"}</p>
      <RunProgress stage={stage} detail={detail} />
    </div>
    {onExit && <button className="app-banner__exit" type="button" onClick={onExit}>Exit run</button>}
  </header>;
}
