import { normalizeHandle } from "./handle";
import { ROLES, type GameDataset } from "./domain";
import { dailyRunSchema, freePlayRunSchema, type DailyRun, type FreePlayRun } from "./storage";

type ShareableRun = Pick<DailyRun, "stageReached" | "series" | "rerollsUsed" | "roster">;
function summary(run: ShareableRun): string {
  const grid = run.series.map(series => `${series.userWins > series.opponentWins ? "W" : "L"} ${series.userWins}-${series.opponentWins}`).join(" · ");
  return [`Stage: ${run.stageReached}`, `Series: ${grid || "—"}`, `Rerolls: ${run.rerollsUsed}`].join("\n");
}
function isUtcDate(value: string): boolean { const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value); if (!match) return false; const [year, month, day] = match.slice(1).map(Number); const parsed = new Date(Date.UTC(year, month - 1, day)); return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day; }
export function formatDailyShare(run: DailyRun): string { if (!isUtcDate(run.utcDate) || !dailyRunSchema.safeParse(run).success) throw new Error("Daily share requires a valid UTC date and run"); return [`Run It Back — Daily ${run.utcDate}`, summary(run), "Run It Back"].join("\n"); }
export function formatFreePlayShare(run: FreePlayRun, dataset: GameDataset): string {
  if (!freePlayRunSchema.safeParse(run).success) throw new Error("Free Play share requires a valid run");
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
