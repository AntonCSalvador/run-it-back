"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { minimalDataset } from "@/data/fixtures/minimal-dataset";
import { type GameDataset } from "../domain";
import { isLineupReady, selectableCards, toLineup } from "../draft";
import { ROLES, type PlayerCard, type Role } from "../domain";
import { LocalSimulationGateway, type SimulationGateway } from "../gateway";
import { createGameReducer, createStartAction, initialGameState, type GameAction, type GameMode, type GameState } from "../machine";
import { parseDataset } from "../schema";
import { DAILY_RECORD, readRecord } from "../storage";
import { AppHeader } from "./app-header";
import { ErrorBoundary } from "./error-boundary";
import { TeamOffer } from "./team-offer";
import { PlayerPicker } from "./player-picker";
import { RosterBar } from "./roster-bar";
import { IglPicker } from "./igl-picker";

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

export function restartCurrentRun(clearSimulationError: () => void, dispatch: (action: GameAction) => void, invalidatePendingSeries: () => void): void {
  invalidatePendingSeries();
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
  const reducer = useMemo(() => createGameReducer({ dataset }), [dataset]);
  const [state, dispatch] = useReducer(reducer, initialState);
  const [simulationError, setSimulationError] = useState<string | null>(null);
  const [lockedStage, setLockedStage] = useState<string | null>(null);
  const seriesLock = useRef<string | null>(null);
  const runGeneration = useRef(0);
  useEffect(() => () => {
    runGeneration.current += 1;
    seriesLock.current = null;
  }, []);
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
    const generation = runGeneration.current;
    try {
      setSimulationError(null);
      const action = playCurrentTournamentSeries(state, gateway);
      // Commit the disabled control before revealing the next stage.
      await Promise.resolve();
      if (runGeneration.current === generation && seriesLock.current === lock) dispatch(action);
    }
    catch { seriesLock.current = null; setLockedStage(null); setSimulationError("Unable to play the current series. Please restart the run."); }
  };
  const invalidatePendingSeries = (): void => {
    runGeneration.current += 1;
    seriesLock.current = null;
    setLockedStage(null);
  };
  const resetState = (): void => restartCurrentRun(() => setSimulationError(null), dispatch, invalidatePendingSeries);
  const restart = (): void => { resetState(); onRestart(); };
  const teams = new Map(dataset.teams.map(team => [team.id, team]));
  const cards = new Map(dataset.cards.map(card => [card.id, card]));
  const rosterSlots: Partial<Record<Role, PlayerCard>> = Object.fromEntries(ROLES.flatMap(role => {
    const card = state.phase !== "mode" ? cards.get(state.draft.slots[role] ?? "") : undefined;
    return card ? [[role, card] as const] : [];
  }));
  const draftedCards = ROLES.flatMap(role => rosterSlots[role] ? [rosterSlots[role]] : []);
  return <main>
      <AppHeader mode={mode} streak={streak} onStart={value => {
        if (state.phase !== "mode") {
          resetState();
        }
        dispatch(createStartAction(value, { now, freeSeedFactory }));
      }} onRestart={restart} />
      <p aria-live="polite">Current phase: {state.phase}</p>
      {state.phase === "team" && (() => { const offer = state.draft.offeredTeamIds.map(id => teams.get(id)).filter((team): team is NonNullable<typeof team> => Boolean(team)); return offer.length === 3 ? <><TeamOffer teams={offer as [typeof offer[0], typeof offer[1], typeof offer[2]]} rerolls={state.draft.rerollsRemaining} onChoose={teamId => dispatch({ type: "choose-team", teamId })} onReroll={() => dispatch({ type: "reroll" })} /><RosterBar slots={rosterSlots} onMove={() => undefined} /></> : <p role="alert">No valid team offer is available. <button type="button" onClick={restart}>Restart draft</button></p>; })()}
      {state.phase === "player" && (() => { const team = teams.get(state.draft.selectedTeamId ?? ""); return team ? <><PlayerPicker team={team} cards={selectableCards(state.draft, dataset)} onChoose={cardId => dispatch({ type: "choose-card", cardId })} onBack={() => dispatch({ type: "back-to-teams" })} /><RosterBar slots={rosterSlots} onMove={() => undefined} /></> : <p role="alert">Selected team is unavailable.</p>; })()}
      {state.phase === "role" && (() => { const card = cards.get(state.draft.pendingCardId ?? ""); const roles = card?.eligibleRoles.filter(role => !state.draft.slots[role]) ?? []; return <><section><h2>Assign {card?.displayHandle}</h2><div role="group" aria-label="Choose an open role">{roles.map(role => <button type="button" key={role} onClick={() => dispatch({ type: "assign-role", role })}>{role}</button>)}</div></section><RosterBar slots={rosterSlots} onMove={() => undefined} /></>; })()}
      {state.phase === "lineup" && <><RosterBar slots={rosterSlots} onMove={(cardId, role) => dispatch({ type: "move-card", cardId, role })} /><IglPicker cards={draftedCards} selectedId={state.draft.iglCardId} onSelect={cardId => dispatch({ type: "tag-igl", cardId })} onStart={() => { if (isLineupReady(state.draft)) dispatch({ type: "enter-tournament" }); }} /></>}
      {state.phase === "tournament" && <p>Current stage: {state.tournament.currentStage}</p>}
      {state.phase === "tournament" && <p>Completed series: {state.tournament.completedSeries.length}</p>}
      {state.phase === "tournament" && <button type="button" disabled={lockedStage === state.tournament.currentStage} onClick={playSeries}>Play current series</button>}
      {simulationError && <p role="alert">{simulationError}</p>}
    </main>;
}
