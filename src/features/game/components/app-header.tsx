"use client";

import type { GameMode } from "../machine";
import { assetUrl } from "../asset-url";
import { type MacroStage, RunProgress } from "./run-progress";

export function BrandWordmark({ alt = "" }: { alt?: string }) {
  // A native image keeps this static-exported, base-path-aware brand asset predictable.
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="app-banner__wordmark" src={assetUrl("/assets/brand/run-it-back-wordmark.png") ?? undefined} alt={alt} width={840} height={247} />;
}

export interface AppHeaderProps {
  mode: GameMode;
  stage: MacroStage;
  detail: string;
  onHome(): void;
  onExit?(): void;
}

export function AppHeader({ mode, stage, detail, onHome, onExit }: AppHeaderProps) {
  return <header className="app-banner">
    <h1><button className="app-banner__brand app-banner__home" type="button" onClick={onHome} aria-label="Run It Back home"><BrandWordmark /></button></h1>
    <div className="app-banner__run">
      <p aria-label="Current mode">{mode === "daily" ? "Daily" : "Free Play"}</p>
      <RunProgress stage={stage} detail={detail} />
    </div>
    {onExit && <button className="app-banner__exit" type="button" onClick={onExit}>Exit run</button>}
  </header>;
}
