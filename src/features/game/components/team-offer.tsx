"use client";

import { RefreshCw } from "lucide-react";
import type { TeamAppearance } from "../domain";
import { MediaMark } from "./media-mark";

export interface TeamOfferProps { teams: TeamAppearance[]; rerolls: number; onChoose(id: string): void; onReroll(): void }
type TeamOfferIntegrationProps = TeamOfferProps & { canReroll?: boolean };
export function TeamOffer({ teams, rerolls, onChoose, onReroll, canReroll = rerolls > 0 }: TeamOfferIntegrationProps) {
  if (teams.length !== 3) throw new Error("A team offer must contain exactly three teams");
  return <section aria-labelledby="team-offer-title"><h2 id="team-offer-title">Choose a team</h2><p aria-live="polite">{rerolls} rerolls remaining</p>
    <div>{teams.map(team => <button type="button" data-team-id={team.id} key={team.id} onClick={() => onChoose(team.id)}><MediaMark src={team.logo} alt="" label={team.shortName} />{team.name} {team.year}</button>)}</div>
    <button type="button" disabled={!canReroll} onClick={onReroll}><RefreshCw aria-hidden="true" />Reroll teams</button>
  </section>;
}
