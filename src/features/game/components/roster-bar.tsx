"use client";

import { useId } from "react";
import { ROLES, type PlayerCard, type Role } from "../domain";

export interface RosterBarProps { slots: Partial<Record<Role, PlayerCard>>; onMove(cardId: string, role: Role): void }
type RosterBarIntegrationProps = RosterBarProps & { canMove?: boolean };
export function RosterBar({ slots, onMove, canMove = true }: RosterBarIntegrationProps) {
  const headingId = useId();
  const filledCount = ROLES.filter(role => Boolean(slots[role])).length;
  return <section aria-labelledby={headingId} role="region" className="roster-bar">
    <h3 id={headingId}>Roster · {filledCount} of 5 filled</h3>
    <ul className="roster-bar__slots">{ROLES.map(role => {
    const card = slots[role];
    const compatibleTargets = card ? ROLES.filter(target => {
      const occupant = slots[target];
      return target !== role && card.eligibleRoles.includes(target) && (!occupant || occupant.eligibleRoles.includes(role));
    }) : [];
    const identity = card ? `${card.displayHandle} ${card.year}` : "";
    return <li key={role} aria-label={`${role} slot`} data-state={card ? "filled" : "open"}><strong>{role}</strong>{card ? <><span>{identity}</span>{canMove && <div aria-label={`Move ${identity}`}>{compatibleTargets.map(target => <button type="button" key={target} onClick={() => onMove(card.id, target)}>Move {identity} to {target}</button>)}</div>}</> : <span>Open</span>}</li>;
  })}</ul></section>;
}
