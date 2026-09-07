"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { championsDataset } from "@/data/champions";
import { type GameDataset } from "../domain";
import { canRerollOffer, isLineupReady, selectableCards, toLineup } from "../draft";
import { ROLES, type PlayerCard, type Role } from "../domain";
import { LocalSimulationGateway, type SimulationGateway } from "../gateway";
import { createGameReducer, createStartAction, initialGameState, type GameAction, type GameMode, type GameState } from "../machine";
import { parseDataset } from "../schema";
import { addDailyCompletion, DAILY_RECORD, HISTORY_RECORD, nextDailyStreak, prependFreePlayHistory, readRecord, type DailyRun, type FreePlayRun, writeRecord } from "../storage";
import { AppHeader } from "./app-header";
import { ErrorBoundary } from "./error-boundary";
import { TeamOffer } from "./team-offer";
import { PlayerPicker } from "./player-picker";
import { RosterBar } from "./roster-bar";
import { IglPicker } from "./igl-picker";
import { TournamentView } from "./tournament-view";
import { HighlightFeed } from "./highlight-feed";
import { ResultsView } from "./results-view";
import { useFireAccent } from "./use-fire-accent";
import type { Highlight } from "../narration";
import type { SeriesResult } from "../tournament";
import { formatDailyShare, formatFreePlayShare } from "../share";
import { dailyDateFromSeed, dailySeed } from "../rng";
import { ModeSelection } from "./mode-selection";
import { RecentResults } from "./recent-results";
import { ExitRunDialog } from "./exit-run-dialog";
import type { MacroStage } from "./run-progress";
import { humanRole, RolePicker } from "./role-picker";

export interface GameAppProps { dataset?: GameDataset; now?: () => Date; freeSeedFactory?: () => string; gateway?: SimulationGateway; gatewayFactory?: (dataset: GameDataset) => SimulationGateway; storage?: Storage | null; initialState?: GameState }
function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try { return window.localStorage; } catch { return null; }
}

function playwrightQuerySeed(): string | null {
  // `NEXT_PUBLIC_PLAYWRIGHT_TEST_BUILD` is a compile-time flag supplied only by
  // playwright.config.ts. In normal production exports this entire branch is removed.
  if (process.env.NEXT_PUBLIC_PLAYWRIGHT_TEST_BUILD !== "enabled" || typeof window === "undefined") return null;
  const seed = new URLSearchParams(window.location.search).get("e2e-seed");
  return seed && /^[a-z0-9-]{3,80}$/i.test(seed) ? seed : null;
}

export function restartCurrentRun(clearSimulationError: () => void, dispatch: (action: GameAction) => void, invalidatePendingSeries: () => void): void {
  invalidatePendingSeries();
  clearSimulationError();
  dispatch({ type: "restart" });
}

const tournamentStageLabels = {
  group: "Group stage",
  quarterfinal: "Quarterfinal",
  semifinal: "Semifinal",
  final: "Final",
} as const;

function sampleNow(now?: () => Date): Date {
  return new Date((now?.() ?? new Date()).getTime());
}

function millisecondsToNextUtcDay(value: Date): number {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate() + 1) - value.getTime();
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
  const actionFire = useFireAccent();
  const dataset = useMemo(() => parseDataset(suppliedDataset ?? championsDataset), [suppliedDataset]);
  const reducer = useMemo(() => createGameReducer({ dataset }), [dataset]);
  const [state, dispatch] = useReducer(reducer, initialState);
  const [simulationError, setSimulationError] = useState<string | null>(null);
  const [lockedStage, setLockedStage] = useState<string | null>(null);
  const [presentedSeries, setPresentedSeries] = useState<SeriesResult | null>(null);
  const [presentedHighlights, setPresentedHighlights] = useState<readonly Highlight[] | null>(null);
  const [highlightsComplete, setHighlightsComplete] = useState(false);
  const seriesLock = useRef<string | null>(null);
  const runGeneration = useRef(0);
  useEffect(() => () => {
    runGeneration.current += 1;
    seriesLock.current = null;
  }, []);
  const [streak, setStreak] = useState(0);
  const [savedDaily, setSavedDaily] = useState<readonly DailyRun[]>([]);
  const [savedFree, setSavedFree] = useState<readonly FreePlayRun[]>([]);
  const [recentResultsOpen, setRecentResultsOpen] = useState(false);
  const [selectedResultKey, setSelectedResultKey] = useState<string | null>(null);
  const [exitDialogOpen, setExitDialogOpen] = useState(false);
  const [draftAnnouncement, setDraftAnnouncement] = useState("");
  const [storageState, setStorageState] = useState({ recovered: false, persistent: true });
  const refreshSavedResults = useRef<() => void>(() => undefined);
  const persistedResult = useRef<string | null>(null);
  const adapter = useMemo(() => storage === undefined ? browserStorage() : storage, [storage]);
  useEffect(() => {
    const update = (): void => {
      const daily = readRecord(adapter, DAILY_RECORD);
      const free = readRecord(adapter, HISTORY_RECORD);
      setStreak(daily.value.streak);
      setSavedDaily(daily.value.completions); setSavedFree(free.value.runs);
      setStorageState({ recovered: daily.recovered || free.recovered, persistent: daily.persistent && free.persistent });
    };
    refreshSavedResults.current = update;
    update();
    if (typeof window === "undefined") return undefined;
    window.addEventListener("storage", update);
    return () => window.removeEventListener("storage", update);
  }, [adapter]);
  const [today, setToday] = useState(() => sampleNow(now));
  const todayUtc = useMemo(() => dailyDateFromSeed(dailySeed(today)), [today]);
  const todayDaily = savedDaily.find(run => run.utcDate === todayUtc);
  useEffect(() => {
    if (state.phase !== "mode") return undefined;
    const timer = window.setTimeout(() => setToday(sampleNow(now)), Math.max(1, millisecondsToNextUtcDay(today)));
    return () => window.clearTimeout(timer);
  }, [now, state.phase, today]);
  const testSeed = useMemo(() => playwrightQuerySeed(), []);
  useEffect(() => {
    if (state.phase !== "results") return;
    const completedAtUtc = state.mode === "daily" ? dailyDateFromSeed(state.tournament.seed) : new Date().toISOString().slice(0, 10);
    const outcome: "champion" | "eliminated" = state.tournament.status === "champion" ? "champion" : "eliminated";
    const run = {
      completedAtUtc,
      stageReached: state.tournament.completedSeries.at(-1)?.stage ?? state.tournament.currentStage,
      outcome,
      series: state.tournament.completedSeries.map(series => ({ stage: series.stage, userWins: series.userWins, opponentWins: series.opponentWins, maps: series.maps.map(map => ({ map: map.map, userScore: map.userScore, opponentScore: map.opponentScore })) })),
      rerollsUsed: 3 - state.draft.rerollsRemaining,
      roster: state.tournament.userLineup.slots,
      iglCardId: state.tournament.userLineup.iglCardId,
    };
    const signature = `${state.mode}:${JSON.stringify(run)}`;
    if (persistedResult.current === signature) return;
    persistedResult.current = signature;
    if (state.mode === "daily") {
      const current = readRecord(adapter, DAILY_RECORD).value;
      const completion = { ...run, mode: "daily" as const, utcDate: dailyDateFromSeed(state.tournament.seed) };
      const value = addDailyCompletion(current, completion);
      writeRecord(adapter, DAILY_RECORD, { ...value, streak: nextDailyStreak(current.completions, completion.utcDate, current.streak) });
      // Storage events are intentionally cross-document only. Refresh this
      // document through the app-owned callback instead of synthesizing one.
      refreshSavedResults.current();
    } else {
      const current = readRecord(adapter, HISTORY_RECORD).value;
      writeRecord(adapter, HISTORY_RECORD, prependFreePlayHistory(current, { ...run, mode: "free" }));
      refreshSavedResults.current();
    }
  }, [state, adapter]);
  const gateway = useMemo(() => suppliedGateway ?? gatewayFactory?.(dataset) ?? new LocalSimulationGateway(dataset), [suppliedGateway, gatewayFactory, dataset]);
  const opponent = useMemo(() => {
    if (state.phase !== "tournament") return null;
    try { return gateway.generateOpponent(state.tournament.seed, state.tournament.currentStage, toLineup(state.draft)); }
    catch { return null; }
  }, [gateway, state]);
  const playSeries = async (): Promise<void> => {
    if (state.phase !== "tournament") return;
    const lock = state.tournament.currentStage;
    if (seriesLock.current === lock) return;
    seriesLock.current = lock; setLockedStage(lock);
    const generation = runGeneration.current;
    try {
      setSimulationError(null);
      if (!opponent) throw new Error("Opponent unavailable");
      const series = gateway.playSeries(state.tournament.seed, state.tournament.currentStage, toLineup(state.draft), opponent);
      const highlights = series.stage === "semifinal" || series.stage === "final"
        ? gateway.createHighlights(state.tournament.seed, series, toLineup(state.draft), opponent.lineup)
        : null;
      // Commit the disabled control before revealing the next stage.
      await Promise.resolve();
      if (runGeneration.current === generation && seriesLock.current === lock) {
        setPresentedHighlights(highlights);
        setPresentedSeries(series);
        setHighlightsComplete(highlights === null);
      }
    }
    catch { seriesLock.current = null; setLockedStage(null); setSimulationError("Unable to play the current series. Please restart the run."); }
  };
  const invalidatePendingSeries = (): void => {
    runGeneration.current += 1;
    seriesLock.current = null;
    setLockedStage(null);
    setPresentedSeries(null);
    setPresentedHighlights(null);
    setHighlightsComplete(false);
  };
  const resetState = (): void => {
    setDraftAnnouncement("");
    restartCurrentRun(() => setSimulationError(null), dispatch, invalidatePendingSeries);
  };
  const restart = (): void => { resetState(); onRestart(); };
  const teams = new Map(dataset.teams.map(team => [team.id, team]));
  const cards = new Map(dataset.cards.map(card => [card.id, card]));
  const players = new Map(dataset.players.map(player => [player.id, player]));
  const rosterSlots: Partial<Record<Role, PlayerCard>> = Object.fromEntries(ROLES.flatMap(role => {
    const card = state.phase !== "mode" ? cards.get(state.draft.slots[role] ?? "") : undefined;
    return card ? [[role, card] as const] : [];
  }));
  const draftedCards = ROLES.flatMap(role => rosterSlots[role] ? [rosterSlots[role]] : []);
  const draftPick = state.phase === "team" || state.phase === "player" || state.phase === "role" ? Math.min(Object.keys(state.draft.slots).length + 1, ROLES.length) : null;
  const progress: { stage: MacroStage; detail: string } | null = (() => {
    if (state.phase === "mode") return null;
    if (state.phase === "lineup") return { stage: "igl", detail: "Choose your IGL" };
    if (state.phase === "tournament") return { stage: "tournament", detail: `Round ${state.tournament.completedSeries.length + 1} of 4 · ${tournamentStageLabels[state.tournament.currentStage]}` };
    if (state.phase === "results") return { stage: "recap", detail: "Run complete" };
    const task = state.phase === "team" ? "Choose a team to scout" : state.phase === "player" ? "Choose a player" : "Assign an open role";
    return { stage: "draft", detail: `Pick ${draftPick} of ${ROLES.length} · ${task}` };
  })();
  const startMode = (value: GameMode): void => {
    if (state.phase !== "mode") return;
    const startedAt = sampleNow(now);
    setDraftAnnouncement("");
    setRecentResultsOpen(false);
    setSelectedResultKey(null);
    dispatch(createStartAction(value, { now: () => startedAt, freeSeedFactory: freeSeedFactory ?? (() => testSeed ?? crypto.randomUUID()) }));
  };
  const continueTournament = (): void => {
    if (state.phase !== "tournament" || !presentedSeries || !highlightsComplete || seriesLock.current !== state.tournament.currentStage) return;
    // Consume the presentation synchronously, including two clicks in one task.
    seriesLock.current = null;
    dispatch({ type: "resolve-series", series: presentedSeries });
    setLockedStage(null); setPresentedSeries(null); setPresentedHighlights(null); setHighlightsComplete(false);
  };
  const resultShare = state.phase === "results" ? (() => {
    const run = { completedAtUtc: new Date().toISOString().slice(0, 10), stageReached: state.tournament.completedSeries.at(-1)?.stage ?? state.tournament.currentStage, series: state.tournament.completedSeries.map(series => ({ stage: series.stage, userWins: series.userWins, opponentWins: series.opponentWins })), rerollsUsed: 3 - state.draft.rerollsRemaining, roster: state.tournament.userLineup.slots };
    return state.mode === "daily" ? formatDailyShare({ ...run, mode: "daily", utcDate: dailyDateFromSeed(state.tournament.seed) }) : formatFreePlayShare({ ...run, mode: "free" }, dataset);
  })() : "";
  return <>
      <a className="skip-link" href="#game-content">Skip to current decision</a>
      {state.phase === "mode"
        ? <header className="app-banner app-banner--entry"><h1>Run It Back</h1><p>Fantasy Champions draft</p></header>
        : <AppHeader mode={state.mode} stage={progress!.stage} detail={progress!.detail} onExit={state.phase === "results" ? undefined : () => setExitDialogOpen(true)} />}
      <main id="game-content" tabIndex={-1} className={`game-shell ${actionFire.fireClass}`}>
      <p className="sr-only" role="status" aria-label="Draft update" aria-live="polite" aria-atomic="true">{draftAnnouncement}</p>
      {storageState.recovered && <p role="status" aria-label="Saved result storage status">Saved results were recovered from invalid storage.</p>}
      {!storageState.persistent && <p role="alert">Results cannot persist in this browser session.</p>}
      {state.phase === "mode" && <>
        <ModeSelection dailyState={todayDaily ? "completed" : "available"} streak={streak} onStart={startMode} onViewDailyResult={() => {
          setRecentResultsOpen(true);
          setSelectedResultKey(`daily-${todayUtc}`);
        }} />
        <RecentResults daily={savedDaily} free={savedFree} cards={dataset.cards} open={recentResultsOpen} selectedKey={selectedResultKey} onOpenChange={setRecentResultsOpen} onSelectedKeyChange={setSelectedResultKey} />
      </>}
      {state.phase === "team" && (() => {
        const offer = state.draft.offeredTeamIds.map(id => teams.get(id)).filter((team): team is NonNullable<typeof team> => Boolean(team));
        const canReroll = canRerollOffer(state.draft, dataset);
        const rerollState = canReroll
          ? { canReroll: true as const }
          : { canReroll: false as const, rerollReason: state.draft.rerollsRemaining <= 0 ? "No rerolls left" : "No other eligible team offers are available" };
        return offer.length === 3 ? <div className="draft-layout"><TeamOffer teams={offer} rerolls={state.draft.rerollsRemaining} {...rerollState} onChoose={teamId => { actionFire.trigger(); dispatch({ type: "choose-team", teamId }); }} onReroll={() => dispatch({ type: "reroll" })} /><RosterBar slots={rosterSlots} onMove={() => undefined} canMove={false} /></div> : <p role="alert">No valid team offer is available. <button type="button" onClick={restart}>Restart draft</button></p>;
      })()}
      {state.phase === "player" && (() => { const team = teams.get(state.draft.selectedTeamId ?? ""); const available = selectableCards(state.draft, dataset); const openRoles = ROLES.filter(role => !state.draft.slots[role]); return !team ? <p role="alert">Selected team is unavailable. <button type="button" onClick={() => dispatch({ type: "back-to-teams" })}>Back to teams</button> <button type="button" onClick={restart}>Restart draft</button></p> : !available.length ? <p role="alert">No eligible players are available. <button type="button" onClick={() => dispatch({ type: "back-to-teams" })}>Back to teams</button> <button type="button" onClick={restart}>Restart draft</button></p> : <div className="draft-layout"><PlayerPicker team={team} cards={available} openRoles={openRoles} portraitForPlayer={playerId => players.get(playerId)?.portrait ?? null} onChoose={cardId => { actionFire.trigger(); dispatch({ type: "choose-card", cardId }); }} onBack={() => dispatch({ type: "back-to-teams" })} /><RosterBar slots={rosterSlots} onMove={() => undefined} canMove={false} /></div>; })()}
      {state.phase === "role" && (() => {
        const card = cards.get(state.draft.pendingCardId ?? "");
        const team = teams.get(state.draft.selectedTeamId ?? "");
        const roles = card ? ROLES.map(role => {
          const occupant = rosterSlots[role];
          if (occupant) return { role, available: false, reason: `${humanRole(role)} is filled by ${occupant.displayHandle} ${occupant.year}.` } as const;
          if (!card.eligibleRoles.includes(role)) return { role, available: false, reason: `${card.displayHandle} is not eligible for ${humanRole(role)}.` } as const;
          return { role, available: true } as const;
        }) : [];
        return !card || !team || !roles.some(role => role.available)
          ? <p role="alert">No eligible role is available. <button type="button" onClick={() => dispatch({ type: "back-to-player" })}>Back to player selection</button> <button type="button" onClick={restart}>Restart draft</button></p>
          : <div className="draft-layout"><RolePicker card={card} roles={roles} teamName={team.name} onAssign={role => {
            actionFire.trigger();
            setDraftAnnouncement(`${card.displayHandle} added as ${humanRole(role)}. ${draftedCards.length + 1} of 5 drafted.`);
            dispatch({ type: "assign-role", role });
          }} onBack={() => dispatch({ type: "back-to-player" })} /><RosterBar slots={rosterSlots} onMove={() => undefined} canMove={false} /></div>;
      })()}
      {state.phase === "lineup" && (draftedCards.length !== ROLES.length || new Set(draftedCards.map(card => card.id)).size !== ROLES.length ? <p role="alert">Roster is incomplete. <button type="button" onClick={restart}>Restart draft</button></p> : <><RosterBar slots={rosterSlots} iglCardId={state.draft.iglCardId} onMove={(cardId, role) => dispatch({ type: "move-card", cardId, role })} /><IglPicker cards={draftedCards} selectedId={state.draft.iglCardId} onSelect={cardId => dispatch({ type: "tag-igl", cardId })} onStart={() => { if (isLineupReady(state.draft)) { actionFire.trigger(); dispatch({ type: "enter-tournament" }); } }} /></>)}
      {state.phase === "tournament" && !opponent && <p role="alert">No valid opponent is available. <button type="button" onClick={restart}>Restart run</button></p>}
      {state.phase === "tournament" && opponent && <><TournamentView opponent={opponent} userLineup={toLineup(state.draft)} cards={dataset.cards} result={presentedSeries} resolving={lockedStage === state.tournament.currentStage} onPlay={playSeries} onContinue={continueTournament} continueDisabled={!highlightsComplete} />{presentedHighlights !== null && <HighlightFeed highlights={presentedHighlights} onComplete={() => setHighlightsComplete(true)} />}</>}
      {state.phase === "results" && <ResultsView mode={state.mode} tournament={state.tournament} cards={dataset.cards} rerollsUsed={3 - state.draft.rerollsRemaining} shareText={resultShare} onRunAgain={() => { resetState(); dispatch(createStartAction(state.mode, { now, freeSeedFactory: freeSeedFactory ?? (() => testSeed ?? crypto.randomUUID()) })); }} onModeChange={value => { resetState(); dispatch(createStartAction(value, { now, freeSeedFactory: freeSeedFactory ?? (() => testSeed ?? crypto.randomUUID()) })); }} />}
      {simulationError && <p role="alert">{simulationError}</p>}
      </main>
      <ExitRunDialog open={exitDialogOpen} onCancel={() => setExitDialogOpen(false)} onConfirm={() => {
        setExitDialogOpen(false);
        resetState();
      }} />
    </>;
}
