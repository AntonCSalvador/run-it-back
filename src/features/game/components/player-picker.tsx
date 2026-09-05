"use client";

import type { PlayerCard, TeamAppearance } from "../domain";
import { MediaMark } from "./media-mark";

export interface PlayerPickerProps { team: TeamAppearance; cards: PlayerCard[]; onChoose(id: string): void; onBack(): void }
export function PlayerPicker({ team, cards, onChoose, onBack }: PlayerPickerProps) {
  return <section aria-labelledby="player-picker-title"><h2 id="player-picker-title">Choose from {team.name}</h2><button type="button" onClick={onBack}>Back to teams</button><div>{cards.map(card => <button type="button" key={card.id} onClick={() => onChoose(card.id)}><MediaMark src={null} alt={`${card.displayHandle} portrait`} label={card.displayHandle} />{card.displayHandle} {card.year}<span>{card.eligibleRoles.join(", ")}</span></button>)}</div></section>;
}
