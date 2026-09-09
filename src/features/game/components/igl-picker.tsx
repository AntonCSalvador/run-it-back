"use client";

import type { PlayerCard } from "../domain";
import { PlayerPortrait, type PortraitForPlayer } from "./player-portrait";
import { useFireAccent } from "./use-fire-accent";

export interface IglPickerProps { cards: PlayerCard[]; selectedId: string | null; onSelect(id: string): void; onStart(): void; portraitForPlayer?: PortraitForPlayer }
export function IglPicker({ cards, selectedId, onSelect, onStart, portraitForPlayer = () => null }: IglPickerProps) {
  const fire = useFireAccent();
  return <section><div role="radiogroup" aria-label="Choose in-game leader">{cards.map(card => <label key={card.id}><input type="radio" name="igl" checked={selectedId === card.id} onChange={() => onSelect(card.id)} /><PlayerPortrait portrait={portraitForPlayer(card.playerId)} handle={card.displayHandle} variant="compact" testId={`portrait-${card.playerId}`} />{card.displayHandle} {card.year}</label>)}</div><button className={`action-button ${fire.fireClass}`} type="button" disabled={!selectedId || cards.length !== 5} onClick={() => { fire.trigger(); onStart(); }}>Start tournament</button></section>;
}
