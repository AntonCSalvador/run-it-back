"use client";

import { RefreshCw } from "lucide-react";
import type { TeamAppearance } from "../domain";
import { MediaMark } from "./media-mark";

export interface TeamOfferProps { teams: TeamAppearance[]; rerolls: number; onChoose(id: string): void; onReroll(): void }
export function TeamOffer({ teams, rerolls, onChoose, onReroll }: TeamOfferProps) {
  if (teams.length !== 3) throw new Error("A team offer must contain exactly three teams");
  return <section aria-labelledby="team-offer-title"><h2 id="team-offer-title">Choose a team</h2><p aria-live="polite">{rerolls} rerolls remaining</p>
    <div>{teams.map(team => <button type="button" data-team-id={team.id} key={team.id} onClick={() => onChoose(team.id)}><MediaMark src={team.logo} alt={`${team.name} ${team.year} logo`} label={team.shortName} />{team.name} {team.year}</button>)}</div>
    <button type="button" disabled={rerolls === 0} onClick={onReroll}><RefreshCw aria-hidden="true" />Reroll teams</button>
  </section>;
}
