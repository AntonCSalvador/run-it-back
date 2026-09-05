import { normalizeHandle } from "./handle";
import { ROLES, type GameDataset } from "./domain";
import type { StoredRunResult } from "./storage";

type ShareableRun = Pick<StoredRunResult, "utcDate" | "stageReached" | "series" | "rerollsUsed" | "roster">;
function summary(run: ShareableRun): string {
  const grid = run.series.map(series => `${series.userWins > series.opponentWins ? "W" : "L"} ${series.userWins}-${series.opponentWins}`).join(" · ");
  return [`Stage: ${run.stageReached}`, `Series: ${grid || "—"}`, `Rerolls: ${run.rerollsUsed}`].join("\n");
}
export function formatDailyShare(run: ShareableRun): string { return [`Run It Back — Daily ${run.utcDate ?? ""}`.trimEnd(), summary(run), "Run It Back"].join("\n"); }
export function formatFreePlayShare(run: ShareableRun, dataset: GameDataset): string {
  const byCard = new Map(dataset.cards.map(card => [card.id, card]));
  const selected = new Map(run.roster.map(slot => [slot.role, slot.cardId]));
  const roster = ROLES.map(role => {
    const card = byCard.get(selected.get(role) ?? "");
    let handle = "Unknown";
    if (card) try { handle = normalizeHandle(card.displayHandle); } catch { /* Safe share fallback. */ }
    return `${handle} (${role})`;
  }).join(" · ");
  return [`Run It Back — Free Play`, summary(run), roster, "Run It Back"].join("\n");
}
