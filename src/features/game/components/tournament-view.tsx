"use client";

import { useEffect, useRef } from "react";
import { ROLES, type Lineup, type PlayerCard } from "../domain";
import type { GeneratedOpponent } from "../opponents";
import type { SeriesResult } from "../tournament";
import { PlayerPortrait, type PortraitForPlayer } from "./player-portrait";
import { useFireAccent } from "./use-fire-accent";

const stageLabel: Record<GeneratedOpponent["stage"], string> = { group: "Group stage", quarterfinal: "Quarterfinal", semifinal: "Semifinal", final: "Final" };
function Roster({ label, lineup, cards, portraitForPlayer }: { label: string; lineup: Lineup; cards: readonly PlayerCard[]; portraitForPlayer: PortraitForPlayer }) {
  const byId = new Map(cards.map(card => [card.id, card]));
  return <section aria-label={label}><h3>{label}</h3>{ROLES.map(role => { const id = lineup.slots.find(slot => slot.role === role)?.cardId; const card = byId.get(id ?? ""); return <article key={role}><div className="player-row">{card ? <><PlayerPortrait portrait={portraitForPlayer(card.playerId)} handle={card.displayHandle} variant="compact" testId={`portrait-${card.playerId}`} /><span><strong>{role}</strong><span>{card.displayHandle} {card.year}{lineup.iglCardId === card.id ? " · IGL" : ""}</span></span></> : <><strong>{role}</strong><span>Unavailable</span></>}</div></article>; })}</section>;
}
export interface TournamentViewProps { opponent: GeneratedOpponent; userLineup: Lineup; cards: readonly PlayerCard[]; result: SeriesResult | null; resolving?: boolean; onPlay(): void; onContinue(): void; continueDisabled?: boolean; portraitForPlayer?: PortraitForPlayer }
export function TournamentView({ opponent, userLineup, cards, result, resolving = false, onPlay, onContinue, continueDisabled = false, portraitForPlayer = () => null }: TournamentViewProps) {
  const { fireClass, trigger } = useFireAccent();
  const stageHeading = useRef<HTMLHeadingElement>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const previousStage = useRef(opponent.stage);
  const previousResult = useRef<SeriesResult | null>(null);

  useEffect(() => {
    if (result) resultHeading.current?.focus();
  }, [result]);
  useEffect(() => {
    if (result && result !== previousResult.current && result.userWins > result.opponentWins) trigger();
    previousResult.current = result;
  }, [result, trigger]);
  useEffect(() => {
    if (previousStage.current !== opponent.stage) stageHeading.current?.focus();
    previousStage.current = opponent.stage;
  }, [opponent.stage]);

  return <section aria-label="Tournament">
    <h2 ref={stageHeading} tabIndex={-1}>{stageLabel[opponent.stage]}</h2>
    <p>{opponent.stage === "final" ? "BO5" : "BO3"}</p>
    <div>
      <Roster label="Your roster" lineup={userLineup} cards={cards} portraitForPlayer={portraitForPlayer} />
      <Roster label="Opponent roster" lineup={opponent.lineup} cards={cards} portraitForPlayer={portraitForPlayer} />
    </div>
    <div className={result ? fireClass : ""} role="status" aria-label="Series result announcement" aria-live="polite">
      {result && <>
        <h3 ref={resultHeading} tabIndex={-1}>Series result: {result.userWins}–{result.opponentWins}</h3>
        <ol aria-label="Map results">{result.maps.map(map => <li key={map.map}>{map.map} {map.userScore}–{map.opponentScore}</li>)}</ol>
      </>}
    </div>
    {result
      ? <button key="continue" type="button" disabled={continueDisabled} onClick={onContinue}>Continue</button>
      : <button key="play" type="button" disabled={resolving} onClick={onPlay}>Play series</button>}
  </section>;
}
