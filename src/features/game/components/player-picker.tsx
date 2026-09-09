"use client";

import type { PlayerCard, TeamAppearance } from "../domain";
import { PlayerPortrait, type PortraitForPlayer } from "./player-portrait";
import { useFireAccent } from "./use-fire-accent";

export interface PlayerPickerProps { team: TeamAppearance; cards: PlayerCard[]; onChoose(id: string): void; onBack(): void; portraitForPlayer?: PortraitForPlayer }
export function PlayerPicker({ team, cards, onChoose, onBack, portraitForPlayer = () => null }: PlayerPickerProps) {
  const fire = useFireAccent();
  return <section aria-labelledby="player-picker-title"><h2 id="player-picker-title">Choose from {team.name}</h2><button type="button" onClick={onBack}>Back to teams</button><div className="scroll-track player-picker__cards">{cards.map(card => <div data-testid={`player-card-${card.id}`} key={card.id}><button className={fire.fireClass} type="button" onClick={() => { fire.trigger(); onChoose(card.id); }}><PlayerPortrait portrait={portraitForPlayer(card.playerId)} handle={card.displayHandle} variant="choice" testId={`portrait-${card.playerId}`} />{card.displayHandle} {card.year}</button><span role="list" aria-label={`${card.displayHandle} roles`}>{card.eligibleRoles.map(role => <span className="role-chip" role="listitem" key={role}>{role}</span>)}</span></div>)}</div></section>;
}
