"use client";

import type { PlayerCard, TeamAppearance } from "../domain";
import { MediaMark } from "./media-mark";

export interface PlayerPickerProps { team: TeamAppearance; cards: PlayerCard[]; onChoose(id: string): void; onBack(): void }
type PlayerPickerIntegrationProps = PlayerPickerProps & { portraitForPlayer?: (playerId: string) => string | null };
export function PlayerPicker({ team, cards, onChoose, onBack, portraitForPlayer }: PlayerPickerIntegrationProps) {
  return <section aria-labelledby="player-picker-title"><h2 id="player-picker-title">Choose from {team.name}</h2><button type="button" onClick={onBack}>Back to teams</button><div>{cards.map(card => <div data-testid={`player-card-${card.id}`} key={card.id}><button type="button" onClick={() => onChoose(card.id)}><MediaMark src={portraitForPlayer?.(card.playerId) ?? null} alt="" label={card.displayHandle} />{card.displayHandle} {card.year}</button><span role="list" aria-label={`${card.displayHandle} roles`}>{card.eligibleRoles.map(role => <span className="role-chip" role="listitem" key={role}>{role}</span>)}</span></div>)}</div></section>;
}
