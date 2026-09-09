"use client";

import { useId } from "react";
import { ROLES, type PlayerCard, type Role } from "../domain";
import { PlayerPortrait, type PortraitForPlayer } from "./player-portrait";

export interface RosterBarProps { slots: Partial<Record<Role, PlayerCard>>; iglCardId?: string | null; headingLevel?: 2 | 3; onMove(cardId: string, role: Role): void; portraitForPlayer?: PortraitForPlayer }
type RosterBarIntegrationProps = RosterBarProps & { canMove?: boolean };
export function RosterBar({ slots, iglCardId = null, headingLevel = 3, onMove, canMove = true, portraitForPlayer = () => null }: RosterBarIntegrationProps) {
  const headingId = useId();
  const filledCount = ROLES.filter(role => Boolean(slots[role])).length;
  return <section aria-labelledby={headingId} role="region" className="roster-bar">
    {headingLevel === 2
      ? <h2 id={headingId}>Roster · {filledCount} of 5 filled</h2>
      : <h3 id={headingId}>Roster · {filledCount} of 5 filled</h3>}
    <ol className="roster-bar__slots" aria-label="Five-player roster">{ROLES.map(role => {
    const card = slots[role];
    const compatibleTargets = card ? ROLES.filter(target => {
      const occupant = slots[target];
      return target !== role && card.eligibleRoles.includes(target) && (!occupant || occupant.eligibleRoles.includes(role));
    }) : [];
    const identity = card ? `${card.displayHandle} ${card.year}` : "";
    return <li key={role} aria-label={`${role} slot`} data-role={role} data-state={card ? "filled" : "open"}>
      <strong>{role}</strong>
      {card ? <>
        <PlayerPortrait portrait={portraitForPlayer(card.playerId)} handle={card.displayHandle} variant="compact" testId={`portrait-${card.playerId}`} />
        <span>{identity}</span>
        {iglCardId === card.id && <span className="roster-bar__igl">IGL</span>}
        {canMove && compatibleTargets.length > 0 && <details className="roster-bar__swaps">
          <summary>Compatible swaps</summary>
          <div aria-label={`Move ${identity}`}>{compatibleTargets.map(target => <button aria-label={`Move ${identity} to ${target}`} type="button" key={target} onClick={() => onMove(card.id, target)}>Swap with {target}</button>)}</div>
        </details>}
      </> : <span>Open</span>}
    </li>;
  })}</ol></section>;
}
