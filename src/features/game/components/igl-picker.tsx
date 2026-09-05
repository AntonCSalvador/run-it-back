"use client";

import type { PlayerCard } from "../domain";
import { useFireAccent } from "./use-fire-accent";

export interface IglPickerProps { cards: PlayerCard[]; selectedId: string | null; onSelect(id: string): void; onStart(): void }
export function IglPicker({ cards, selectedId, onSelect, onStart }: IglPickerProps) {
  const fire = useFireAccent();
  return <section><div role="radiogroup" aria-label="Choose in-game leader">{cards.map(card => <label key={card.id}><input type="radio" name="igl" checked={selectedId === card.id} onChange={() => onSelect(card.id)} />{card.displayHandle} {card.year}</label>)}</div><button className={`action-button ${fire.fireClass}`} type="button" disabled={!selectedId || cards.length !== 5} onAnimationEnd={fire.onAnimationEnd} onClick={() => { fire.trigger(); onStart(); }}>Start tournament</button></section>;
}
