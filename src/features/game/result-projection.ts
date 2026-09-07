import type { Stage } from "./opponents";
import { STAGE_ORDER, validateSeries, type TournamentState } from "./tournament";

export interface ValidatedTerminalResult {
  readonly status: "valid";
  readonly tournament: TournamentState;
  readonly outcome: "champion" | "eliminated";
  readonly stageReached: Stage;
}
export interface InvalidTerminalResult {
  readonly status: "invalid";
  readonly reason: "no-series" | "incomplete-or-malformed";
}
export type TerminalResultProjection = ValidatedTerminalResult | InvalidTerminalResult;

export function projectTerminalResult(tournament: TournamentState): TerminalResultProjection {
  const malformed = (): InvalidTerminalResult => ({ status: "invalid", reason: "incomplete-or-malformed" });
  if (!tournament || typeof tournament !== "object") return malformed();
  if (!Array.isArray(tournament.completedSeries)) return malformed();
  const completed = tournament.completedSeries;
  const invalid = (): InvalidTerminalResult => ({ status: "invalid", reason: completed.length === 0 ? "no-series" : "incomplete-or-malformed" });
  if (tournament.status !== "champion" && tournament.status !== "eliminated") return invalid();
  if (!STAGE_ORDER.includes(tournament.currentStage)) return invalid();
  if (completed.length === 0 || completed.length > STAGE_ORDER.length) return invalid();
  try {
    completed.forEach((series, index) => validateSeries(series, STAGE_ORDER[index]));
  } catch {
    return invalid();
  }
  if (completed.slice(0, -1).some(series => series.userWins <= series.opponentWins)) return invalid();
  const last = completed.at(-1)!;
  if (last.stage !== tournament.currentStage) return invalid();
  if (tournament.status === "champion") {
    if (last.stage !== "final" || last.userWins <= last.opponentWins) return invalid();
  } else if (last.opponentWins <= last.userWins) return invalid();
  return { status: "valid", tournament, outcome: tournament.status, stageReached: last.stage };
}
