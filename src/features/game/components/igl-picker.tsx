"use client";

import { useEffect, useId, useRef } from "react";
import type { PlayerCard } from "../domain";
import { PlayerPortrait, type PortraitForPlayer } from "./player-portrait";
import { useFireAccent } from "./use-fire-accent";

export interface IglPickerProps { cards: PlayerCard[]; selectedId: string | null; onSelect(id: string): void; onStart(): void; portraitForPlayer?: PortraitForPlayer }
export function IglPicker({ cards, selectedId, onSelect, onStart, portraitForPlayer = () => null }: IglPickerProps) {
  const fire = useFireAccent();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const startGuidanceId = useId();
  const selectedIsValid = cards.some(card => card.id === selectedId);
  useEffect(() => headingRef.current?.focus(), []);

  return <section className="igl-picker" aria-labelledby="igl-picker-title">
    <div className="decision-heading">
      <h2 id="igl-picker-title" ref={headingRef} tabIndex={-1}>Choose your IGL</h2>
      <p>Lock the lineup before the first series.</p>
    </div>
    <fieldset className="igl-picker__group">
      <legend>Choose your IGL</legend>
      <p>Any drafted player can lead. Your choice affects the simulation.</p>
      <div className="igl-picker__choices">
        {cards.map(card => {
          const selected = selectedId === card.id;
          return <label className="igl-picker__choice" data-selected={selected || undefined} data-testid={`igl-choice-${card.id}`} key={card.id}>
            <input aria-label={`${card.displayHandle} ${card.year}`} type="radio" name="igl" checked={selected} onChange={() => onSelect(card.id)} />
            <PlayerPortrait portrait={portraitForPlayer(card.playerId)} handle={card.displayHandle} variant="compact" testId={`portrait-${card.playerId}`} />
            <span><strong>{card.displayHandle}</strong><span>{card.year}</span></span>
            {selected && <span className="igl-picker__selected">Selected</span>}
          </label>;
        })}
      </div>
    </fieldset>
    {!selectedIsValid && <p id={startGuidanceId} className="igl-picker__guidance">Choose an IGL to enter the tournament.</p>}
    <button className={`action-button ${fire.fireClass}`} type="button" aria-describedby={!selectedIsValid ? startGuidanceId : undefined} disabled={!selectedIsValid || cards.length !== 5} onClick={() => { fire.trigger(); onStart(); }}>Start tournament</button>
  </section>;
}
