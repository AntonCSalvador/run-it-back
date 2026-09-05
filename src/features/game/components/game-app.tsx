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

export function GameApp(props: GameAppProps) {
  const [session, setSession] = useState(() => ({ dataset: props.dataset, revision: 0, initialState: props.initialState }));
  // Discard the old run before children render with a different dataset.
  if (session.dataset !== props.dataset) {
    setSession({ dataset: props.dataset, revision: session.revision + 1, initialState: initialGameState });
  }
  const restart = (): void => setSession(value => ({ ...value, revision: value.revision + 1, initialState: initialGameState }));
  return <ErrorBoundary key={session.revision} onRestart={restart}><GameAppCore {...props} initialState={session.initialState} onRestart={restart} /></ErrorBoundary>;
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
  const playSeries = async (): Promise<void> => {
    if (state.phase !== "tournament") return;
    const lock = state.tournament.currentStage;
    if (seriesLock.current === lock) return;
    seriesLock.current = lock; setLockedStage(lock);
    try {
      setSimulationError(null);
      const action = playCurrentTournamentSeries(state, gateway);
      // Commit the disabled control before revealing the next stage.
      await Promise.resolve();
      if (seriesLock.current === lock) dispatch(action);
    }
    catch { seriesLock.current = null; setLockedStage(null); setSimulationError("Unable to play the current series. Please restart the run."); }
  };
  const restart = (): void => { restartCurrentRun(() => setSimulationError(null), dispatch); onRestart(); };
  return <main>
      <AppHeader mode={mode} streak={streak} onStart={value => {
        if (state.phase !== "mode") {
          seriesLock.current = null; setLockedStage(null);
          restartCurrentRun(() => setSimulationError(null), dispatch);
        }
        dispatch(createStartAction(value, { now, freeSeedFactory }));
      }} onRestart={restart} />
      <p aria-live="polite">Current phase: {state.phase}</p>
      {state.phase === "tournament" && <p>Current stage: {state.tournament.currentStage}</p>}
      {state.phase === "tournament" && <p>Completed series: {state.tournament.completedSeries.length}</p>}
      {state.phase === "tournament" && <button type="button" disabled={lockedStage === state.tournament.currentStage} onClick={playSeries}>Play current series</button>}
      {simulationError && <p role="alert">{simulationError}</p>}
    </main>;
}
