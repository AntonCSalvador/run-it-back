"use client";

import { RefreshCw } from "lucide-react";
import type { TeamAppearance } from "../domain";
import { MediaMark } from "./media-mark";
import { useFireAccent } from "./use-fire-accent";

export interface TeamOfferProps { teams: TeamAppearance[]; rerolls: number; onChoose(id: string): void; onReroll(): void }
type TeamOfferIntegrationProps = TeamOfferProps & { canReroll?: boolean };
export function TeamOffer({ teams, rerolls, onChoose, onReroll, canReroll = rerolls > 0 }: TeamOfferIntegrationProps) {
  const rerollFire = useFireAccent();
  if (teams.length !== 3) throw new Error("A team offer must contain exactly three teams");
  return <section aria-labelledby="team-offer-title"><h2 id="team-offer-title">Choose a team</h2><p aria-live="polite">{rerolls} rerolls remaining</p>
    <div className="team-offer__cards scroll-track">{teams.map(team => <button className="team-card" type="button" data-team-id={team.id} key={team.id} onClick={() => onChoose(team.id)}><MediaMark src={team.logo} alt="" label={team.shortName} />{team.name} {team.year}</button>)}</div>
    <button className={`action-button ${rerollFire.fireClass}`} type="button" disabled={!canReroll} onAnimationEnd={rerollFire.onAnimationEnd} onClick={() => { onReroll(); rerollFire.trigger(); }}><RefreshCw aria-hidden="true" />Reroll teams</button>
  </section>;
}
