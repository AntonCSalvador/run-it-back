"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { ROLES, type PlayerCard, type Role } from "../domain";
import type { GeneratedOpponent, Stage } from "../opponents";
import { STAGE_ORDER, type SeriesResult, type TournamentState } from "../tournament";
import { PlayerPortrait, type PortraitForPlayer } from "./player-portrait";
import { useFireAccent } from "./use-fire-accent";

const stageLabel: Record<Stage, string> = {
  group: "Group stage",
  quarterfinal: "Quarterfinal",
  semifinal: "Semifinal",
  final: "Final",
};

function actionStage(stage: Stage): string {
  return stage === "group" ? "group stage" : stage;
}

type DisplayLineup = { readonly slots: readonly { readonly role: Role; readonly cardId: string }[]; readonly iglCardId: string };

function Roster({ label, lineup, cards, portraitForPlayer }: { label: string; lineup: DisplayLineup; cards: readonly PlayerCard[]; portraitForPlayer: PortraitForPlayer }) {
  const byId = new Map(cards.map(card => [card.id, card]));
  return <section aria-label={label} className="tournament-roster">
    <h3>{label}</h3>
    <div className="tournament-roster__slots">
      {ROLES.map(role => {
        const id = lineup.slots.find(slot => slot.role === role)?.cardId;
        const card = byId.get(id ?? "");
        return <article key={role}><strong>{role}</strong>{card ? <><PlayerPortrait portrait={portraitForPlayer(card.playerId)} handle={card.displayHandle} variant="compact" testId={`portrait-${card.playerId}`} /><span>{card.displayHandle} {card.year}{lineup.iglCardId === card.id ? " · IGL" : ""}</span></> : <span>Unavailable</span>}</article>;
      })}
    </div>
  </section>;
}

export interface TournamentViewProps {
  tournament: TournamentState;
  opponent: GeneratedOpponent | null;
  cards: readonly PlayerCard[];
  result: SeriesResult | null;
  revealComplete: boolean;
  resolving: boolean;
  error: string | null;
  reveal?: ReactNode;
  focusOnMount?: boolean;
  portraitForPlayer?: PortraitForPlayer;
  onPlay(): void;
  onRetryOpponent(): void;
  onRetrySeries(): void;
  onContinue(): void;
}

export function TournamentView({ tournament, opponent, cards, result, revealComplete, resolving, error, reveal, focusOnMount = false, portraitForPlayer = () => null, onPlay, onRetryOpponent, onRetrySeries, onContinue }: TournamentViewProps) {
  const { fireClass, trigger } = useFireAccent();
  const stageHeading = useRef<HTMLHeadingElement>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const retryAction = useRef<HTMLButtonElement>(null);
  const previousStage = useRef(tournament.currentStage);
  const previousOpponent = useRef(opponent?.id ?? null);
  const previousError = useRef(error);
  const previousResult = useRef<SeriesResult | null>(null);
  const handledMountFocus = useRef(false);
  const stageIndex = STAGE_ORDER.indexOf(tournament.currentStage);
  const nextStage = STAGE_ORDER[stageIndex + 1];
  const userWon = result ? result.userWins > result.opponentWins : null;
  const updateId = useId();
  const update = result
    ? `${stageLabel[tournament.currentStage]} complete. You ${userWon ? "won" : "lost"} ${result.userWins}–${result.opponentWins}.`
    : resolving ? `Simulating ${actionStage(tournament.currentStage)}.` : "";

  useEffect(() => {
    if (result) resultHeading.current?.focus();
  }, [result]);
  useEffect(() => {
    if (result && result !== previousResult.current && result.userWins > result.opponentWins) trigger();
    previousResult.current = result;
  }, [result, trigger]);
  useEffect(() => {
    if (previousStage.current !== tournament.currentStage) stageHeading.current?.focus();
    previousStage.current = tournament.currentStage;
  }, [tournament.currentStage]);
  useEffect(() => {
    if (opponent && previousOpponent.current === null) stageHeading.current?.focus();
    previousOpponent.current = opponent?.id ?? null;
  }, [opponent]);
  useEffect(() => {
    if (error && previousError.current === null && opponent) retryAction.current?.focus();
    previousError.current = error;
  }, [error, opponent]);
  useEffect(() => {
    if (!focusOnMount || handledMountFocus.current) return;
    handledMountFocus.current = true;
    (error ? retryAction : stageHeading).current?.focus();
  }, [error, focusOnMount]);

  return <>
  <section aria-label="Tournament" aria-busy={resolving} aria-describedby={updateId} className="tournament-view">
    <nav aria-label="Tournament stages" className="tournament-stage-rail">
      <ol>{STAGE_ORDER.map((stage, index) => {
        const completed = tournament.completedSeries.find(series => series.stage === stage) ?? (stage === tournament.currentStage ? result : null);
        const state = index < stageIndex ? "complete" : index === stageIndex ? "current" : userWon === false ? "locked" : "future";
        const detail = completed ? `${completed.userWins > completed.opponentWins ? "Won" : "Lost"} ${completed.userWins}–${completed.opponentWins}` : state === "current" ? "Current" : state === "locked" ? "Not reached" : "Upcoming";
        return <li key={stage} data-state={state} aria-current={state === "current" ? "step" : undefined}>{stageLabel[stage]} · {detail}</li>;
      })}</ol>
    </nav>
    <header className="tournament-view__heading">
      <p>{stageLabel[tournament.currentStage]} · Round {stageIndex + 1} of {STAGE_ORDER.length}</p>
      <h2 ref={stageHeading} tabIndex={-1}>Your roster vs. {opponent ? "Challenger roster" : "Opponent pending"}</h2>
      <p>{tournament.currentStage === "final" ? "Best of 5" : "Best of 3"}</p>
    </header>
    {error && <div className="tournament-view__error" role="alert"><p>{error}</p>{opponent
      ? <button ref={retryAction} type="button" onClick={onRetrySeries}>Retry {actionStage(tournament.currentStage)}</button>
      : <button ref={retryAction} type="button" onClick={onRetryOpponent}>Retry opponent</button>}</div>}
    <div className={`tournament-view__result ${result ? fireClass : ""}`}>
      {result && <>
        <h3 ref={resultHeading} tabIndex={-1}>Series result: {userWon ? "Win" : "Loss"}, {result.userWins}–{result.opponentWins}</h3>
        <ol aria-label="Map results">{result.maps.map(map => <li key={map.map}>{map.map} {map.userScore}–{map.opponentScore}</li>)}</ol>
      </>}
    </div>
    {result
      ? <button key="continue" className="action-button" type="button" disabled={!revealComplete} onClick={onContinue}>{userWon && nextStage ? `Continue to ${stageLabel[nextStage].toLowerCase()}` : "Continue to results"}</button>
      : opponent && !error && reveal == null && <button key="play" className="action-button" type="button" disabled={resolving} onClick={onPlay}>{resolving ? `Playing ${actionStage(tournament.currentStage)}…` : `Play ${actionStage(tournament.currentStage)}`}</button>}
    {reveal}
    <div className="tournament-view__rosters">
      <Roster label="Your roster" lineup={tournament.userLineup} cards={cards} portraitForPlayer={portraitForPlayer} />
      {opponent && <Roster label="Opponent roster" lineup={opponent.lineup} cards={cards} portraitForPlayer={portraitForPlayer} />}
    </div>
  </section>
  <p id={updateId} className="sr-only" role="status" aria-label="Tournament update" aria-live="polite" aria-atomic="true">{update}</p>
  </>;
}
