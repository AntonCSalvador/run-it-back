"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { championsDataset } from "@/data/champions";
import { type GameDataset } from "../domain";
import { canRerollOffer, isLineupReady, selectableCards, toLineup } from "../draft";
import { ROLES, type PlayerCard, type Role } from "../domain";
import { LocalSimulationGateway, type SimulationGateway } from "../gateway";
import { createGameReducer, createStartAction, initialGameState, type GameAction, type GameMode, type GameState } from "../machine";
import { parseDataset } from "../schema";
import { ACTIVE_RECORD, addDailyCompletion, DAILY_RECORD, HISTORY_RECORD, nextDailyStreak, prependFreePlayHistory, readRecord, removeRecord, type DailyRun, type FreePlayRun, writeRecord } from "../storage";
import { AppHeader } from "./app-header";
import { ErrorBoundary } from "./error-boundary";
import { TeamOffer } from "./team-offer";
import { PlayerPicker } from "./player-picker";
import { RosterBar } from "./roster-bar";
import { IglPicker } from "./igl-picker";
import type { PortraitForPlayer } from "./player-portrait";
import { TournamentView } from "./tournament-view";
import { HighlightFeed } from "./highlight-feed";
import { ResultsView, type StagedHighlight } from "./results-view";
import { useFireAccent } from "./use-fire-accent";
import type { Highlight } from "../narration";
import type { Stage } from "../opponents";
import { STAGE_ORDER, type SeriesResult } from "../tournament";
import { formatDailyShare, formatFreePlayShare } from "../share";
import { dailyDateFromSeed, dailySeed } from "../rng";
import { ModeSelection } from "./mode-selection";
import { RecentResults } from "./recent-results";
import { ExitRunDialog } from "./exit-run-dialog";
import type { MacroStage } from "./run-progress";
import { humanRole, RolePicker } from "./role-picker";
import { usePrefersReducedMotion } from "./use-prefers-reduced-motion";
import { projectTerminalResult } from "../result-projection";
import { restoreActiveRun, serializeActiveRun } from "../active-run";

export interface GameAppProps { dataset?: GameDataset; now?: () => Date; freeSeedFactory?: () => string; gateway?: SimulationGateway; gatewayFactory?: (dataset: GameDataset) => SimulationGateway; storage?: Storage | null; initialState?: GameState }
export function significantHighlights(highlights: readonly Highlight[]): readonly Highlight[] {
  const seen = new Set<string>();
  return highlights.filter(item => {
    if (seen.has(item.id) || !(item.kind === "clutch" || item.emphasis === "clutch" || item.emphasis === "decisive")) return false;
    seen.add(item.id);
    return true;
  });
}
function resultHighlights(highlights: Partial<Record<Stage, readonly Highlight[]>>): readonly StagedHighlight[] {
  return STAGE_ORDER.flatMap(stage => (highlights[stage] ?? []).map(highlight => ({ ...highlight, stage })));
}
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

function triggerPlaywrightErrorBoundaryOnce(): void {
  if (process.env.NEXT_PUBLIC_PLAYWRIGHT_TEST_BUILD !== "enabled" || typeof window === "undefined") return;
  if (new URLSearchParams(window.location.search).get("e2e-error-boundary") !== "once") return;
  throw new Error("Playwright error-boundary probe");
}

function clearPlaywrightErrorBoundaryProbe(): void {
  if (process.env.NEXT_PUBLIC_PLAYWRIGHT_TEST_BUILD !== "enabled" || typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has("e2e-error-boundary")) return;
  url.searchParams.delete("e2e-error-boundary");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
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
  const [session, setSession] = useState(() => ({ dataset: props.dataset, revision: 0, initialState: props.initialState, focusModeOnMount: false }));
  // Discard the old run before children render with a different dataset.
  if (session.dataset !== props.dataset) {
    setSession({ dataset: props.dataset, revision: session.revision + 1, initialState: initialGameState, focusModeOnMount: false });
  }
  const restart = (): void => {
    clearPlaywrightErrorBoundaryProbe();
    setSession(value => ({ ...value, revision: value.revision + 1, initialState: initialGameState, focusModeOnMount: true }));
  };
  return <ErrorBoundary key={session.revision} onRestart={restart}><GameAppCore {...props} initialState={session.initialState} focusModeOnMount={session.focusModeOnMount} onRestart={restart} /></ErrorBoundary>;
}

export function GameAppCore({ dataset: suppliedDataset, now, freeSeedFactory, gateway: suppliedGateway, gatewayFactory, storage, initialState = initialGameState, focusModeOnMount = false, onRestart }: GameAppProps & { focusModeOnMount?: boolean; onRestart: () => void }) {
  triggerPlaywrightErrorBoundaryOnce();
  const actionFire = useFireAccent();
  const dataset = useMemo(() => parseDataset(suppliedDataset ?? championsDataset), [suppliedDataset]);
  const reducer = useMemo(() => createGameReducer({ dataset }), [dataset]);
  type AppAction = GameAction | { type: "restore-active"; state: GameState };
  const appReducer = useMemo(() => (state: GameState, action: AppAction) => action.type === "restore-active" ? action.state : reducer(state, action), [reducer]);
  const [state, dispatch] = useReducer(appReducer, initialState);
  const managesActiveRun = initialState === initialGameState;
  const gateway = useMemo(() => suppliedGateway ?? gatewayFactory?.(dataset) ?? new LocalSimulationGateway(dataset), [suppliedGateway, gatewayFactory, dataset]);
  const [focusTournamentOnMount, setFocusTournamentOnMount] = useState(false);
  const [simulationError, setSimulationError] = useState<string | null>(null);
  const [opponentRevision, setOpponentRevision] = useState(0);
  const [lockedStage, setLockedStage] = useState<string | null>(null);
  const [presentedSeries, setPresentedSeries] = useState<SeriesResult | null>(null);
  const [presentedHighlights, setPresentedHighlights] = useState<readonly Highlight[] | null>(null);
  const [highlightsComplete, setHighlightsComplete] = useState(false);
  const prefersReducedMotion = usePrefersReducedMotion();
  const seriesLock = useRef<string | null>(null);
  const runGeneration = useRef(0);
  const [runHighlights, setRunHighlights] = useState<Partial<Record<Stage, readonly Highlight[]>>>({});
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
  const [focusModeAfterExit, setFocusModeAfterExit] = useState(false);
  const [draftAnnouncement, setDraftAnnouncement] = useState("");
  const [resultStorageState, setResultStorageState] = useState({ recovered: false, persistent: true });
  const [activeStorageState, setActiveStorageState] = useState({ recovered: false, persistent: true });
  const [hydrated, setHydrated] = useState(false);
  const [restoreNotice, setRestoreNotice] = useState<string | null>(null);
  const [activeReadStatus, setActiveReadStatus] = useState<"pending" | "unresolved" | "resolved">("pending");
  const dispatchGame = (action: GameAction): void => {
    setActiveReadStatus("resolved");
    dispatch(action);
  };
  const refreshSavedResults = useRef<() => void>(() => undefined);
  const persistedResult = useRef<string | null>(null);
  const adapter = useMemo(() => storage === undefined ? browserStorage() : storage, [storage]);
  useEffect(() => {
    const update = (): void => {
      const daily = readRecord(adapter, DAILY_RECORD);
      const free = readRecord(adapter, HISTORY_RECORD);
      setStreak(daily.value.streak);
      setSavedDaily(daily.value.completions); setSavedFree(free.value.runs);
      setResultStorageState({ recovered: daily.recovered || free.recovered, persistent: daily.persistent && free.persistent });
    };
    refreshSavedResults.current = update;
    update();
    if (typeof window === "undefined") return undefined;
    window.addEventListener("storage", update);
    return () => window.removeEventListener("storage", update);
  }, [adapter]);
  useEffect(() => {
    if (hydrated) return undefined;
    let cancelled = false;
    const hydrate = async (): Promise<void> => {
      if (!managesActiveRun) { setActiveReadStatus("resolved"); setHydrated(true); return; }
      const active = readRecord(adapter, ACTIVE_RECORD);
      const unresolved = !active.persistent && !active.recovered;
      setActiveReadStatus(unresolved ? "unresolved" : "resolved");
      let recovered = active.recovered;
      if (active.value.run) {
        const restored = await restoreActiveRun(active.value.run, dataset, gateway);
        if (cancelled) return;
        if (restored) {
          dispatch({ type: "restore-active", state: restored.state });
          if (restored.state.phase === "tournament") {
            setFocusTournamentOnMount(true);
            if (restored.highlights.length) setRunHighlights({ semifinal: restored.highlights });
          }
          setRestoreNotice("Saved run restored. Continue from this decision.");
        } else {
          recovered = true;
          if (!unresolved) removeRecord(adapter, ACTIVE_RECORD);
          setRestoreNotice("The saved run could not be restored. Completed results are safe. Start a new run when ready.");
        }
      } else if (active.recovered) {
        setRestoreNotice("The saved run could not be restored. Completed results are safe. Start a new run when ready.");
      }
      setActiveStorageState({ recovered, persistent: active.persistent });
      setHydrated(true);
    };
    void hydrate();
    return () => { cancelled = true; };
  }, [adapter, dataset, gateway, hydrated, managesActiveRun]);
  useEffect(() => {
    if (!hydrated || !managesActiveRun || activeReadStatus !== "resolved") return;
    const run = serializeActiveRun(state);
    const result = run ? writeRecord(adapter, ACTIVE_RECORD, { run }) : removeRecord(adapter, ACTIVE_RECORD);
    const updatePersistence = (): void => setActiveStorageState(current => ({ recovered: current.recovered, persistent: result.persistent }));
    updatePersistence();
  }, [activeReadStatus, adapter, hydrated, managesActiveRun, state]);
  const [today, setToday] = useState(() => sampleNow(now));
  const todayUtc = useMemo(() => dailyDateFromSeed(dailySeed(today)), [today]);
  const todayDaily = savedDaily.find(run => run.utcDate === todayUtc);
  useEffect(() => {
    if (state.phase !== "mode") return undefined;
    const timer = window.setTimeout(() => setToday(sampleNow(now)), Math.max(1, millisecondsToNextUtcDay(today)));
    return () => window.clearTimeout(timer);
  }, [now, state.phase, today]);
  const testSeed = useMemo(() => playwrightQuerySeed(), []);
  const terminalResult = useMemo(() => state.phase === "results" ? projectTerminalResult(state.tournament) : null, [state]);
  useEffect(() => {
    if (state.phase !== "results" || terminalResult?.status !== "valid") return;
    const tournament = terminalResult.tournament;
    const completedAtUtc = state.mode === "daily" ? dailyDateFromSeed(tournament.seed) : new Date().toISOString().slice(0, 10);
    const run = {
      completedAtUtc,
      stageReached: terminalResult.stageReached,
      outcome: terminalResult.outcome,
      series: tournament.completedSeries.map(series => ({ stage: series.stage, userWins: series.userWins, opponentWins: series.opponentWins, maps: series.maps.map(map => ({ map: map.map, userScore: map.userScore, opponentScore: map.opponentScore })) })),
      rerollsUsed: 3 - state.draft.rerollsRemaining,
      roster: tournament.userLineup.slots,
      iglCardId: tournament.userLineup.iglCardId,
    };
    const signature = `${state.mode}:${JSON.stringify(run)}`;
    if (persistedResult.current === signature) return;
    persistedResult.current = signature;
    if (state.mode === "daily") {
      const current = readRecord(adapter, DAILY_RECORD).value;
      const completion = { ...run, mode: "daily" as const, utcDate: dailyDateFromSeed(tournament.seed) };
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
  }, [state, adapter, terminalResult]);
  const opponentState = useMemo(() => {
    void opponentRevision;
    if (state.phase !== "tournament") return { opponent: null, error: null };
    try { return { opponent: gateway.generateOpponent(state.tournament.seed, state.tournament.currentStage, toLineup(state.draft)), error: null }; }
    catch { return { opponent: null, error: "We couldn't build a valid opponent for this round. Your roster is safe." }; }
  }, [gateway, opponentRevision, state]);
  const opponent = opponentState.opponent;
  const playSeries = async (): Promise<void> => {
    if (state.phase !== "tournament") return;
    const lock = state.tournament.currentStage;
    if (seriesLock.current === lock) return;
    seriesLock.current = lock; setLockedStage(lock);
    const generation = runGeneration.current;
    try {
      setSimulationError(null);
      if (!opponent) throw new Error("Opponent unavailable");
      const series = await Promise.resolve(gateway.playSeries(state.tournament.seed, state.tournament.currentStage, toLineup(state.draft), opponent));
      if (runGeneration.current !== generation || seriesLock.current !== lock) return;
      const highlights = series.stage === "semifinal" || series.stage === "final"
        ? gateway.createHighlights(state.tournament.seed, series, toLineup(state.draft), opponent.lineup)
        : null;
      if (runGeneration.current === generation && seriesLock.current === lock) {
        if (highlights) setRunHighlights(current => ({ ...current, [series.stage]: significantHighlights(highlights) }));
        setLockedStage(null);
        setPresentedHighlights(highlights);
        setPresentedSeries(series);
        setHighlightsComplete(highlights === null);
      }
    }
    catch {
      if (runGeneration.current !== generation || seriesLock.current !== lock) return;
      seriesLock.current = null;
      setLockedStage(null);
      const label = lock === "group" ? "group stage" : lock;
      setSimulationError(`The ${label} couldn't be simulated. Your draft and round are unchanged.`);
    }
  };
  const invalidatePendingSeries = (): void => {
    runGeneration.current += 1;
    seriesLock.current = null;
    setLockedStage(null);
    setPresentedSeries(null);
    setPresentedHighlights(null);
    setHighlightsComplete(false);
    setFocusTournamentOnMount(false);
    setRunHighlights({});
  };
  const resetState = (): void => {
    setDraftAnnouncement("");
    restartCurrentRun(() => setSimulationError(null), dispatchGame, invalidatePendingSeries);
  };
  const beginAnotherRun = (mode: GameMode): void => {
    setRecentResultsOpen(false);
    setSelectedResultKey(null);
    resetState();
    dispatchGame(createStartAction(mode, { now, freeSeedFactory: freeSeedFactory ?? (() => testSeed ?? crypto.randomUUID()) }));
  };
  const restart = (): void => { resetState(); onRestart(); };
  const teams = new Map(dataset.teams.map(team => [team.id, team]));
  const cards = new Map(dataset.cards.map(card => [card.id, card]));
  const players = new Map(dataset.players.map(player => [player.id, player]));
  const portraitForPlayer: PortraitForPlayer = playerId => players.get(playerId)?.portrait ?? null;
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
    if (state.phase === "results") return { stage: "recap", detail: terminalResult?.status === "valid" ? "Run complete" : "Recap unavailable" };
    const task = state.phase === "team" ? "Choose a team to scout" : state.phase === "player" ? "Choose a player" : "Assign an open role";
    return { stage: "draft", detail: `Pick ${draftPick} of ${ROLES.length} · ${task}` };
  })();
  const startMode = (value: GameMode): void => {
    if (state.phase !== "mode") return;
    const startedAt = sampleNow(now);
    setDraftAnnouncement("");
    setRecentResultsOpen(false);
    setSelectedResultKey(null);
    setFocusModeAfterExit(false);
    dispatchGame(createStartAction(value, { now: () => startedAt, freeSeedFactory: freeSeedFactory ?? (() => testSeed ?? crypto.randomUUID()) }));
  };
  const continueTournament = (): void => {
    if (state.phase !== "tournament" || !presentedSeries || !highlightsComplete || seriesLock.current !== state.tournament.currentStage) return;
    // Consume the presentation synchronously, including two clicks in one task.
    seriesLock.current = null;
    dispatchGame({ type: "resolve-series", series: presentedSeries });
    setLockedStage(null); setPresentedSeries(null); setPresentedHighlights(null); setHighlightsComplete(false);
  };
  const resultShare = state.phase === "results" && terminalResult?.status === "valid" ? (() => {
    const tournament = terminalResult.tournament;
    const run = { completedAtUtc: new Date().toISOString().slice(0, 10), stageReached: terminalResult.stageReached, series: tournament.completedSeries.map(series => ({ stage: series.stage, userWins: series.userWins, opponentWins: series.opponentWins })), rerollsUsed: 3 - state.draft.rerollsRemaining, roster: tournament.userLineup.slots };
    return state.mode === "daily" ? formatDailyShare({ ...run, mode: "daily", utcDate: dailyDateFromSeed(tournament.seed) }) : formatFreePlayShare({ ...run, mode: "free" }, dataset);
  })() : "";
  const storageState = { recovered: resultStorageState.recovered || activeStorageState.recovered, persistent: resultStorageState.persistent && activeStorageState.persistent };
  if (!hydrated) return <>
    <a className="skip-link" href="#game-content">Skip to current decision</a>
    <header className="app-banner app-banner--entry"><h1>Run It Back</h1><p>Fantasy Champions draft</p></header>
    <main id="game-content" tabIndex={-1} className="game-shell restoration-shell" aria-busy="true"><section role="status" aria-live="polite"><h2>Restoring saved run…</h2><p>Checking this browser for an unfinished draft.</p></section></main>
  </>;
  return <>
      <a className="skip-link" href="#game-content">Skip to current decision</a>
      {state.phase === "mode"
        ? <header className="app-banner app-banner--entry"><h1>Run It Back</h1><p>Fantasy Champions draft</p></header>
        : <AppHeader mode={state.mode} stage={progress!.stage} detail={progress!.detail} onExit={state.phase === "results" ? undefined : () => setExitDialogOpen(true)} />}
      <main id="game-content" tabIndex={-1} className={`game-shell ${actionFire.fireClass}`}>
      <p className="sr-only" role="status" aria-label="Draft update" aria-live="polite" aria-atomic="true">{draftAnnouncement}</p>
      {resultStorageState.recovered && <p role="status" aria-label="Saved result storage status">Saved results were recovered from invalid storage.</p>}
      {restoreNotice && <p role="status" aria-label="Active run restoration status">{restoreNotice}</p>}
      {!storageState.persistent && <p role="alert">Local progress cannot persist in this browser session. You can keep playing while this page stays open.</p>}
      {state.phase === "mode" && <>
        <ModeSelection dailyState={todayDaily ? "completed" : "available"} streak={streak} focusOnMount={focusModeOnMount || focusModeAfterExit} onStart={startMode} onViewDailyResult={() => {
          setRecentResultsOpen(true);
          setSelectedResultKey(`daily-${todayUtc}`);
        }} />
        <RecentResults daily={savedDaily} free={savedFree} cards={dataset.cards} portraitForPlayer={portraitForPlayer} open={recentResultsOpen} selectedKey={selectedResultKey} onOpenChange={setRecentResultsOpen} onSelectedKeyChange={setSelectedResultKey} />
      </>}
      {state.phase === "team" && (() => {
        const offer = state.draft.offeredTeamIds.map(id => teams.get(id)).filter((team): team is NonNullable<typeof team> => Boolean(team));
        const canReroll = canRerollOffer(state.draft, dataset);
        const rerollState = canReroll
          ? { canReroll: true as const }
          : { canReroll: false as const, rerollReason: state.draft.rerollsRemaining <= 0 ? "No rerolls left" : "No other eligible team offers are available" };
        return offer.length === 3 ? <div className="draft-layout"><TeamOffer teams={offer} rerolls={state.draft.rerollsRemaining} {...rerollState} onChoose={teamId => { actionFire.trigger(); dispatchGame({ type: "choose-team", teamId }); }} onReroll={() => dispatchGame({ type: "reroll" })} /><RosterBar slots={rosterSlots} onMove={() => undefined} canMove={false} portraitForPlayer={portraitForPlayer} /></div> : <p role="alert">No valid team offer is available. <button type="button" onClick={restart}>Restart draft</button></p>;
      })()}
      {state.phase === "player" && (() => { const team = teams.get(state.draft.selectedTeamId ?? ""); const available = selectableCards(state.draft, dataset); const openRoles = ROLES.filter(role => !state.draft.slots[role]); return !team ? <p role="alert">Selected team is unavailable. <button type="button" onClick={() => dispatchGame({ type: "back-to-teams" })}>Back to teams</button> <button type="button" onClick={restart}>Restart draft</button></p> : !available.length ? <p role="alert">No eligible players are available. <button type="button" onClick={() => dispatchGame({ type: "back-to-teams" })}>Back to teams</button> <button type="button" onClick={restart}>Restart draft</button></p> : <div className="draft-layout"><PlayerPicker team={team} cards={available} openRoles={openRoles} portraitForPlayer={portraitForPlayer} onChoose={cardId => { actionFire.trigger(); dispatchGame({ type: "choose-card", cardId }); }} onBack={() => dispatchGame({ type: "back-to-teams" })} /><RosterBar slots={rosterSlots} onMove={() => undefined} canMove={false} portraitForPlayer={portraitForPlayer} /></div>; })()}
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
          ? <p role="alert">No eligible role is available. <button type="button" onClick={() => dispatchGame({ type: "back-to-player" })}>Back to player selection</button> <button type="button" onClick={restart}>Restart draft</button></p>
          : <div className="draft-layout"><RolePicker card={card} roles={roles} teamName={team.name} onAssign={role => {
            actionFire.trigger();
            setDraftAnnouncement(`${card.displayHandle} added as ${humanRole(role)}. ${draftedCards.length + 1} of 5 drafted.`);
            dispatchGame({ type: "assign-role", role });
          }} onBack={() => dispatchGame({ type: "back-to-player" })} /><RosterBar slots={rosterSlots} onMove={() => undefined} canMove={false} portraitForPlayer={portraitForPlayer} /></div>;
      })()}
      {state.phase === "lineup" && (draftedCards.length !== ROLES.length || new Set(draftedCards.map(card => card.id)).size !== ROLES.length ? <p role="alert">Roster is incomplete. <button type="button" onClick={restart}>Restart draft</button></p> : <><RosterBar slots={rosterSlots} iglCardId={state.draft.iglCardId} headingLevel={2} onMove={(cardId, role) => dispatchGame({ type: "move-card", cardId, role })} portraitForPlayer={portraitForPlayer} /><IglPicker cards={draftedCards} selectedId={state.draft.iglCardId} portraitForPlayer={portraitForPlayer} onSelect={cardId => dispatchGame({ type: "tag-igl", cardId })} onStart={() => { if (isLineupReady(state.draft)) { actionFire.trigger(); setFocusTournamentOnMount(true); dispatchGame({ type: "enter-tournament" }); } }} /></>)}
      {state.phase === "tournament" && <TournamentView tournament={state.tournament} opponent={opponent} cards={dataset.cards} result={highlightsComplete ? presentedSeries : null} revealComplete={highlightsComplete} resolving={lockedStage === state.tournament.currentStage} error={opponentState.error ?? simulationError} focusOnMount={focusTournamentOnMount} portraitForPlayer={portraitForPlayer} reveal={presentedHighlights !== null ? <HighlightFeed highlights={presentedHighlights} onComplete={() => setHighlightsComplete(true)} instant={prefersReducedMotion} focusOnMount /> : null} onPlay={playSeries} onRetryOpponent={() => { setSimulationError(null); setOpponentRevision(value => value + 1); }} onRetrySeries={() => void playSeries()} onContinue={continueTournament} />}
      {state.phase === "results" && terminalResult && <>
        <ResultsView mode={state.mode} result={terminalResult} cards={dataset.cards} highlights={resultHighlights(runHighlights)} rerollsUsed={3 - state.draft.rerollsRemaining} shareText={resultShare} portraitForPlayer={portraitForPlayer} onRunAgain={() => beginAnotherRun(state.mode)} onModeChange={beginAnotherRun} />
        <RecentResults daily={savedDaily} free={savedFree} cards={dataset.cards} portraitForPlayer={portraitForPlayer} open={recentResultsOpen} selectedKey={selectedResultKey} onOpenChange={setRecentResultsOpen} onSelectedKeyChange={setSelectedResultKey} />
      </>}
      </main>
      <ExitRunDialog open={exitDialogOpen} onCancel={() => setExitDialogOpen(false)} onConfirm={() => {
        setExitDialogOpen(false);
        setFocusModeAfterExit(true);
        resetState();
      }} />
    </>;
}
