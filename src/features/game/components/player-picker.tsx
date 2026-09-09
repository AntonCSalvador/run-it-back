"use client";

import { useEffect, useId, useRef } from "react";
import type { PlayerCard, Role, TeamAppearance } from "../domain";
import { PlayerPortrait, type PortraitForPlayer } from "./player-portrait";
import { useFireAccent } from "./use-fire-accent";

export interface PlayerPickerProps {
  team: TeamAppearance;
  cards: PlayerCard[];
  openRoles: readonly Role[];
  portraitForPlayer?: PortraitForPlayer;
  onChoose(id: string): void;
  onBack(): void;
}

export function PlayerPicker({ team, cards, openRoles, onChoose, onBack, portraitForPlayer = () => null }: PlayerPickerProps) {
  const fire = useFireAccent();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const roleDescriptionBaseId = useId();
  useEffect(() => headingRef.current?.focus(), []);
  const openRoleSet = new Set(openRoles);
  return <section className="player-picker" aria-labelledby="player-picker-title">
    <div className="decision-heading">
      <h2 id="player-picker-title" ref={headingRef} tabIndex={-1}>Choose from {team.name}</h2>
      <p>Only players who can fill an open role are shown.</p>
    </div>
    <button className="secondary-action" type="button" onClick={onBack}>Back to teams</button>
    <div className="scroll-track player-picker__cards">{cards.map((card, index) => {
      const eligibleOpenRoles = card.eligibleRoles.filter(role => openRoleSet.has(role));
      const roleDescriptionId = `${roleDescriptionBaseId}-roles-${index}`;
      const eligibleRoleLabels = eligibleOpenRoles.map(role => `${role[0].toUpperCase()}${role.slice(1)}`);
      return <div className="player-card" data-testid={`player-card-${card.id}`} key={card.id}>
        <button aria-label={`${card.displayHandle} ${card.year}`} aria-describedby={roleDescriptionId} className={`player-card__choice ${fire.fireClass}`} type="button" onClick={() => { fire.trigger(); onChoose(card.id); }}>
          <PlayerPortrait portrait={portraitForPlayer(card.playerId)} handle={card.displayHandle} variant="choice" testId={`portrait-${card.playerId}`} />
          <span className="player-card__identity"><strong className="player-card__handle">{card.displayHandle}</strong><span>{team.name} · {card.year}</span></span>
        </button>
        <span className="player-card__roles" id={roleDescriptionId}>
          <span className="role-chip player-card__role-summary">Eligible open roles: {eligibleRoleLabels.join(", ")}</span>
        </span>
      </div>;
    })}</div>
  </section>;
}
