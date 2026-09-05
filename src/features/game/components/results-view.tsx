"use client";

import { useRef, useState } from "react";
import { ROLES, type PlayerCard } from "../domain";
import type { GameMode } from "../machine";
import type { TournamentState } from "../tournament";

export interface ResultsViewProps { mode: GameMode; tournament: TournamentState; cards: readonly PlayerCard[]; rerollsUsed: number; shareText: string; onRunAgain(): void; onModeChange(mode: GameMode): void }
export function ResultsView({ mode, tournament, cards, rerollsUsed, shareText, onRunAgain, onModeChange }: ResultsViewProps) {
  const [message, setMessage] = useState(""); const field = useRef<HTMLTextAreaElement>(null); const byId = new Map(cards.map(card => [card.id, card]));
  const fallback = (): void => { setMessage("Select and copy your result."); queueMicrotask(() => { field.current?.focus(); field.current?.select(); }); };
  const share = async (): Promise<void> => { try { if (typeof navigator.share === "function") { await navigator.share({ text: shareText }); setMessage("Share sheet opened."); return; } } catch (error) { if (error instanceof DOMException && error.name === "AbortError") { setMessage("Sharing cancelled."); return; } } try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(shareText); setMessage("Copied to clipboard."); return; } } catch { /* Selectable fallback below. */ } fallback(); };
  return <section aria-label="Results"><h2>{tournament.status === "champion" ? "Champion" : "Eliminated"}</h2><p>Stage reached: {tournament.completedSeries.at(-1)?.stage ?? tournament.currentStage}</p><ol>{tournament.completedSeries.map(series => <li key={series.stage}>{series.stage}: {series.userWins}–{series.opponentWins}<ul>{series.maps.map(map => <li key={map.map}>{map.map} {map.userScore}–{map.opponentScore}</li>)}</ul></li>)}</ol><section aria-label="Drafted roster">{ROLES.map(role => { const card = byId.get(tournament.userLineup.slots.find(slot => slot.role === role)?.cardId ?? ""); return <p key={role}>{role}: {card?.displayHandle ?? "Unknown"} {card?.year ?? ""}{card?.id === tournament.userLineup.iglCardId ? " · IGL" : ""}</p>; })}</section><p>Rerolls used: {rerollsUsed}</p><button type="button" onClick={share}>Share</button><button type="button" onClick={onRunAgain}>Run again</button><button type="button" aria-pressed={mode === "daily"} onClick={() => onModeChange("daily")}>Daily</button><button type="button" aria-pressed={mode === "free-play"} onClick={() => onModeChange("free-play")}>Free Play</button><textarea ref={field} readOnly value={shareText} aria-label="Share result" /><p aria-live="polite">{message}</p></section>;
}
