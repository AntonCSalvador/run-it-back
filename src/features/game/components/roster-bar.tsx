"use client";

import { ROLES, type PlayerCard, type Role } from "../domain";

export interface RosterBarProps { slots: Partial<Record<Role, PlayerCard>>; onMove(cardId: string, role: Role): void }
type RosterBarIntegrationProps = RosterBarProps & { canMove?: boolean };
export function RosterBar({ slots, onMove, canMove = true }: RosterBarIntegrationProps) {
  return <section aria-label="Roster" className="roster-bar">{ROLES.map(role => {
    const card = slots[role];
    const compatibleTargets = card ? ROLES.filter(target => {
      const occupant = slots[target];
      return target !== role && card.eligibleRoles.includes(target) && (!occupant || occupant.eligibleRoles.includes(role));
    }) : [];
    const identity = card ? `${card.displayHandle} ${card.year}` : "";
    return <div key={role}><strong>{role}</strong>{card && <><span>{identity}</span>{canMove && <div aria-label={`Move ${identity}`}>{compatibleTargets.map(target => <button type="button" key={target} onClick={() => onMove(card.id, target)}>Move {identity} to {target}</button>)}</div>}</>}</div>;
  })}</section>;
}
