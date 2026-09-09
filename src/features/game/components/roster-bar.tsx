"use client";

import type { KeyboardEvent } from "react";
import { ROLES, type PlayerCard, type Role } from "../domain";
import { PlayerPortrait, type PortraitForPlayer } from "./player-portrait";

export interface RosterBarProps { slots: Partial<Record<Role, PlayerCard>>; onMove(cardId: string, role: Role): void; canMove?: boolean; portraitForPlayer?: PortraitForPlayer }
export function RosterBar({ slots, onMove, canMove = true, portraitForPlayer = () => null }: RosterBarProps) {
  const scroll = (event: KeyboardEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
    event.preventDefault();
    event.currentTarget.scrollBy({ left: event.key === "ArrowRight" ? 260 : -260 });
  };
  return <section aria-label="Roster" role="region" tabIndex={0} onKeyDown={scroll} className="roster-bar scroll-track">{ROLES.map(role => {
    const card = slots[role];
    const compatibleTargets = card ? ROLES.filter(target => {
      const occupant = slots[target];
      return target !== role && card.eligibleRoles.includes(target) && (!occupant || occupant.eligibleRoles.includes(role));
    }) : [];
    const identity = card ? `${card.displayHandle} ${card.year}` : "";
    return <div key={role} aria-label={`${role} slot`}><strong>{role}</strong>{card && <><PlayerPortrait portrait={portraitForPlayer(card.playerId)} handle={card.displayHandle} variant="compact" testId={`portrait-${card.playerId}`} /><span>{identity}</span>{canMove && <div aria-label={`Move ${identity}`}>{compatibleTargets.map(target => <button type="button" key={target} onClick={() => onMove(card.id, target)}>Move {identity} to {target}</button>)}</div>}</>}</div>;
  })}</section>;
}
