"use client";

import { ROLES, type PlayerCard, type Role } from "../domain";

export interface RosterBarProps { slots: Partial<Record<Role, PlayerCard>>; onMove(cardId: string, role: Role): void; canMove?: boolean }
export function RosterBar({ slots, onMove, canMove = true }: RosterBarProps) {
  return <section aria-label="Roster" className="roster-bar">{ROLES.map(role => {
    const card = slots[role];
    const compatibleTargets = card ? ROLES.filter(target => {
      const occupant = slots[target];
      return target !== role && card.eligibleRoles.includes(target) && (!occupant || occupant.eligibleRoles.includes(role));
    }) : [];
    return <div key={role}><strong>{role}</strong>{card && <><span>{card.displayHandle}</span>{canMove && <div aria-label={`Move ${card.displayHandle}`}>{compatibleTargets.map(target => <button type="button" key={target} onClick={() => onMove(card.id, target)}>Move {card.displayHandle} to {target}</button>)}</div>}</>}</div>;
  })}</section>;
}
