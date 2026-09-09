"use client";

import { useEffect, useId, useRef } from "react";
import type { PlayerCard, Role } from "../domain";

export interface RolePickerProps {
  card: PlayerCard;
  roles: readonly { role: Role; available: boolean; reason?: string }[];
  teamName: string;
  onAssign(role: Role): void;
  onBack(): void;
}

export function humanRole(role: Role): string {
  return `${role[0].toUpperCase()}${role.slice(1)}`;
}

export function RolePicker({ card, roles, teamName, onAssign, onBack }: RolePickerProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const descriptionBaseId = useId();
  useEffect(() => headingRef.current?.focus(), []);

  return <section className="role-picker" aria-labelledby="role-picker-title">
    <div className="decision-heading">
      <h2 id="role-picker-title" ref={headingRef} tabIndex={-1}>Where should {card.displayHandle} play?</h2>
      <p>Selected from {teamName} · {card.year}. Choose one role for this card.</p>
    </div>
    <button className="secondary-action" type="button" onClick={onBack}>Back to {teamName} players</button>
    <div role="group" aria-label="Choose an open role"><ol className="role-picker__options" aria-label="Role assignment options">
      {roles.map((option, index) => {
        const reasonId = `${descriptionBaseId}-reason-${index}`;
        return <li key={option.role} data-role={option.role} data-state={option.available ? "available" : "unavailable"}>
          <button
            type="button"
            disabled={!option.available}
            aria-label={option.role}
            aria-describedby={!option.available ? reasonId : undefined}
            onClick={() => onAssign(option.role)}
          >{humanRole(option.role)}</button>
          {!option.available && <p id={reasonId}>{option.reason?.trim() || "This role is unavailable."}</p>}
        </li>;
      })}
    </ol></div>
  </section>;
}
