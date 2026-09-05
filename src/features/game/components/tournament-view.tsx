"use client";

import { ROLES, type Lineup, type PlayerCard } from "../domain";
import type { GeneratedOpponent } from "../opponents";
import type { SeriesResult } from "../tournament";

const stageLabel: Record<GeneratedOpponent["stage"], string> = { group: "Group stage", quarterfinal: "Quarterfinal", semifinal: "Semifinal", final: "Final" };
function Roster({ label, lineup, cards }: { label: string; lineup: Lineup; cards: readonly PlayerCard[] }) {
  const byId = new Map(cards.map(card => [card.id, card]));
  return <section aria-label={label}><h3>{label}</h3>{ROLES.map(role => { const id = lineup.slots.find(slot => slot.role === role)?.cardId; const card = byId.get(id ?? ""); return <article key={role}><strong>{role}</strong> {card ? <span>{card.displayHandle} {card.year}{lineup.iglCardId === card.id ? " · IGL" : ""}</span> : <span>Unavailable</span>}</article>; })}</section>;
}
export interface TournamentViewProps { opponent: GeneratedOpponent; userLineup: Lineup; cards: readonly PlayerCard[]; result: SeriesResult | null; resolving?: boolean; onPlay(): void; onContinue(): void; continueDisabled?: boolean }
export function TournamentView({ opponent, userLineup, cards, result, resolving = false, onPlay, onContinue, continueDisabled = false }: TournamentViewProps) {
  return <section aria-label="Tournament"><h2>{stageLabel[opponent.stage]}</h2><p>{opponent.stage === "final" ? "BO5" : "BO3"}</p><div><Roster label="Your roster" lineup={userLineup} cards={cards} /><Roster label="Opponent roster" lineup={opponent.lineup} cards={cards} /></div>{result ? <><p aria-label="Series score">{result.userWins}–{result.opponentWins}</p><ol aria-label="Map results">{result.maps.map(map => <li key={map.map}>{map.map} {map.userScore}–{map.opponentScore}</li>)}</ol><button type="button" disabled={continueDisabled} onClick={onContinue}>Continue</button></> : <button type="button" disabled={resolving} onClick={onPlay}>Play series</button>}</section>;
}
