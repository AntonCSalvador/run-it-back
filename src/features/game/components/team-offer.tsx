"use client";

import { RefreshCw } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import type { TeamAppearance } from "../domain";
import { MediaMark } from "./media-mark";
import { useFireAccent } from "./use-fire-accent";

interface TeamOfferBaseProps {
  teams: TeamAppearance[];
  rerolls: number;
  onChoose(id: string): void;
  onReroll(): void;
}

export type TeamOfferProps = TeamOfferBaseProps & (
  | { canReroll: true; rerollReason?: never }
  | { canReroll: false; rerollReason: string }
);

export function TeamOffer({ teams, rerolls, canReroll, rerollReason, onChoose, onReroll }: TeamOfferProps) {
  const rerollFire = useFireAccent();
  const rerollDescriptionId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);
  if (teams.length !== 3) throw new Error("A team offer must contain exactly three teams");
  const rerollDescription = canReroll
    ? "This replaces every team in the current offer."
    : rerollReason?.trim() || "Reroll unavailable";
  return <section className="team-offer" aria-labelledby="team-offer-title">
    <div className="decision-heading"><h2 id="team-offer-title" ref={headingRef} tabIndex={-1}>Choose a team to scout</h2><p>Open an event roster, then draft one eligible player.</p></div>
    <div className="team-offer__cards scroll-track">{teams.map((team, index) => <button className="team-card" type="button" data-team-id={team.id} key={team.id} onClick={() => onChoose(team.id)}>
      <span className="team-card__year">{team.year}</span>
      <MediaMark src={team.logo} alt="" label={team.shortName} />
      <strong className="team-card__name">{team.name}</strong>
      <span className="team-card__cue">Scout roster</span>
      <span className="team-card__position">Team {index + 1} of {teams.length}</span>
    </button>)}</div>
    <div className="team-offer__reroll">
      <button className={`secondary-action ${rerollFire.fireClass}`} type="button" disabled={!canReroll} aria-describedby={rerollDescriptionId} onClick={() => { onReroll(); rerollFire.trigger(); }}><RefreshCw aria-hidden="true" />Replace all 3 teams · {rerolls} left</button>
      <p id={rerollDescriptionId} aria-live="polite">{rerollDescription}</p>
    </div>
  </section>;
}
