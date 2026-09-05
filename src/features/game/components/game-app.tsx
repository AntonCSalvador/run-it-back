"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { minimalDataset } from "@/data/fixtures/minimal-dataset";
import { type GameDataset } from "../domain";
import { toLineup } from "../draft";
import { LocalSimulationGateway, type SimulationGateway } from "../gateway";
import { createGameReducer, createStartAction, initialGameState, type GameAction, type GameMode, type GameState } from "../machine";
import { parseDataset } from "../schema";
import { DAILY_RECORD, readRecord } from "../storage";
import { AppHeader } from "./app-header";
import { ErrorBoundary } from "./error-boundary";

export interface GameAppProps { dataset?: GameDataset; now?: () => Date; freeSeedFactory?: () => string; gateway?: SimulationGateway; gatewayFactory?: (dataset: GameDataset) => SimulationGateway; storage?: Storage | null; initialState?: GameState }
function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try { return window.localStorage; } catch { return null; }
}

export function playCurrentTournamentSeries(state: Extract<GameState, { phase: "tournament" }>, gateway: SimulationGateway): GameAction {
  const lineup = toLineup(state.draft);
  const { seed, currentStage } = state.tournament;
  const opponent = gateway.generateOpponent(seed, currentStage, lineup);
  return { type: "resolve-series", series: gateway.playSeries(seed, currentStage, lineup, opponent) };
}

export function restartCurrentRun(clearSimulationError: () => void, dispatch: (action: GameAction) => void): void {
  clearSimulationError();
  dispatch({ type: "restart" });
}

const datasetKeys = new WeakMap<object, number>(); let nextDatasetKey = 1;
function datasetKey(dataset: object): number { const existing = datasetKeys.get(dataset); if (existing) return existing; const key = nextDatasetKey++; datasetKeys.set(dataset, key); return key; }

export function GameApp(props: GameAppProps) {
  const [restartKey, setRestartKey] = useState(0);
  const key = datasetKey(props.dataset ?? minimalDataset);
  const restart = (): void => setRestartKey(value => value + 1);
  return <ErrorBoundary onRestart={restart}><GameAppCore key={`${key}:${restartKey}`} {...props} onRestart={restart} /></ErrorBoundary>;
}

export function GameAppCore({ dataset: suppliedDataset, now, freeSeedFactory, gateway: suppliedGateway, gatewayFactory, storage, initialState = initialGameState, onRestart }: GameAppProps & { onRestart: () => void }) {
  const dataset = useMemo(() => parseDataset(suppliedDataset ?? minimalDataset), [suppliedDataset]);
  const reducer = useMemo(() => createGameReducer({ dataset, now, freeSeedFactory }), [dataset, now, freeSeedFactory]);
  const [state, dispatch] = useReducer(reducer, initialState);
  const [simulationError, setSimulationError] = useState<string | null>(null);
  const [lockedStage, setLockedStage] = useState<string | null>(null);
  const seriesLock = useRef<string | null>(null);
  const [streak, setStreak] = useState(0);
  useEffect(() => {
    const adapter = storage === undefined ? browserStorage() : storage;
    const update = (): void => { try { setStreak(readRecord(adapter, DAILY_RECORD).value.streak); } catch { setStreak(0); } };
    update();
    if (typeof window === "undefined") return undefined;
    window.addEventListener("storage", update);
    return () => window.removeEventListener("storage", update);
  }, [storage]);
  const gateway = useMemo(() => suppliedGateway ?? gatewayFactory?.(dataset) ?? new LocalSimulationGateway(dataset), [suppliedGateway, gatewayFactory, dataset]);
  const mode: GameMode | null = state.phase === "mode" ? null : state.mode;
  const playSeries = (): void => {
    if (state.phase !== "tournament") return;
    const lock = state.tournament.currentStage;
    if (seriesLock.current === lock) return;
    seriesLock.current = lock; setLockedStage(lock);
    try { setSimulationError(null); dispatch(playCurrentTournamentSeries(state, gateway)); }
    catch { seriesLock.current = null; setLockedStage(null); setSimulationError("Unable to play the current series. Please restart the run."); }
  };
  const restart = (): void => { restartCurrentRun(() => setSimulationError(null), dispatch); onRestart(); };
  return <main>
      <AppHeader mode={mode} streak={streak} onStart={value => {
        if (state.phase !== "mode") restart();
        dispatch(createStartAction(value, { now, freeSeedFactory }));
      }} onRestart={restart} />
      <p aria-live="polite">Current phase: {state.phase}</p>
      {state.phase === "tournament" && <button type="button" disabled={lockedStage === state.tournament.currentStage} onClick={playSeries}>Play current series</button>}
      {simulationError && <p role="alert">{simulationError}</p>}
    </main>;
}
