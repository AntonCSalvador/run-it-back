"use client";

import { useMemo, useReducer } from "react";
import { minimalDataset } from "@/data/fixtures/minimal-dataset";
import { type GameDataset } from "../domain";
import { LocalSimulationGateway, type SimulationGateway } from "../gateway";
import { createGameReducer, initialGameState, type GameMode } from "../machine";
import { parseDataset } from "../schema";
import { DAILY_RECORD, readRecord } from "../storage";
import { AppHeader } from "./app-header";
import { ErrorBoundary } from "./error-boundary";

export interface GameAppProps { dataset?: GameDataset; now?: () => Date; freeSeedFactory?: () => string; gateway?: SimulationGateway; storage?: Storage | null }
function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try { return window.localStorage; } catch { return null; }
}

export function GameApp({ dataset: suppliedDataset, now, freeSeedFactory, gateway: suppliedGateway, storage }: GameAppProps) {
  const dataset = useMemo(() => parseDataset(suppliedDataset ?? minimalDataset), [suppliedDataset]);
  const reducer = useMemo(() => createGameReducer({ dataset, now, freeSeedFactory }), [dataset, now, freeSeedFactory]);
  const [state, dispatch] = useReducer(reducer, initialGameState);
  const adapter = storage === undefined ? browserStorage() : storage;
  const streak = useMemo(() => readRecord(adapter, DAILY_RECORD).value.streak, [adapter]);
  const gateway = useMemo(() => suppliedGateway ?? new LocalSimulationGateway(dataset), [suppliedGateway, dataset]);
  void gateway;
  const mode: GameMode | null = state.phase === "mode" ? null : state.mode;
  return <ErrorBoundary onRestart={() => dispatch({ type: "restart" })}>
    <main>
      <AppHeader mode={mode} streak={streak} onStart={value => {
        if (state.phase !== "mode") dispatch({ type: "restart" });
        dispatch({ type: "start", mode: value });
      }} onRestart={() => dispatch({ type: "restart" })} />
      <p aria-live="polite">Current phase: {state.phase}</p>
    </main>
  </ErrorBoundary>;
}
