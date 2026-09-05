import { ROLES, type GameDataset, type Lineup, type Role } from "./domain";
import { type GeneratedOpponent, type Stage } from "./opponents";
import { lineupStrength, rollMap } from "./rating";
import { scopedRng } from "./rng";

export const MAP_POOL = Object.freeze(["Ascent", "Bind", "Haven", "Split", "Icebox", "Breeze", "Fracture", "Pearl", "Lotus", "Sunset", "Abyss", "Corrode"] as const);
export const STAGE_ORDER = Object.freeze(["group", "quarterfinal", "semifinal", "final"] as const);
type FrozenLineup = { readonly slots: readonly { readonly role: Role; readonly cardId: string }[]; readonly iglCardId: string };
export interface MapResult { readonly map: (typeof MAP_POOL)[number]; readonly userScore: number; readonly opponentScore: number; readonly winner: "user" | "opponent"; readonly probability: number; readonly roll: number }
export interface SeriesResult { readonly stage: Stage; readonly bestOf: 3 | 5; readonly userWins: number; readonly opponentWins: number; readonly maps: readonly MapResult[] }
export interface TournamentState { readonly seed: string; readonly userLineup: FrozenLineup; readonly currentStage: Stage; readonly status: "active" | "eliminated" | "champion"; readonly completedSeries: readonly SeriesResult[] }

function assertStage(stage: unknown): asserts stage is Stage { if (typeof stage !== "string" || !STAGE_ORDER.includes(stage as Stage)) throw new Error(`Invalid stage: ${String(stage)}`); }
function requiredWins(stage: Stage): number { return stage === "final" ? 3 : 2; }
function cloneLineup(lineup: FrozenLineup | Lineup): Lineup { return { slots: lineup.slots.map(slot => ({ role: slot.role, cardId: slot.cardId })), iglCardId: lineup.iglCardId }; }
function freezeLineup(lineup: FrozenLineup | Lineup): FrozenLineup { return Object.freeze({ slots: Object.freeze(lineup.slots.map(slot => Object.freeze({ role: slot.role, cardId: slot.cardId }))), iglCardId: lineup.iglCardId }); }
function freezeSeries(series: SeriesResult): SeriesResult { return Object.freeze({ ...series, maps: Object.freeze(series.maps.map(map => Object.freeze({ ...map }))) }); }
function freezeState(state: Omit<TournamentState, "userLineup" | "completedSeries"> & { userLineup: FrozenLineup | Lineup; completedSeries: readonly SeriesResult[] }): TournamentState { return Object.freeze({ ...state, userLineup: freezeLineup(state.userLineup), completedSeries: Object.freeze(state.completedSeries.map(freezeSeries)) }); }
function fingerprint(lineup: FrozenLineup | Lineup): string {
  const cardByRole = new Map(lineup.slots.map(slot => [slot.role, slot.cardId]));
  return JSON.stringify({ slots: ROLES.map(role => [role, cardByRole.get(role)]), iglCardId: lineup.iglCardId });
}

function opponentStrength(opponent: GeneratedOpponent, stage: Stage, dataset: GameDataset): number {
  if (!opponent || opponent.stage !== stage) throw new Error(`Opponent stage ${String(opponent?.stage)} does not match ${stage}`);
  const calculated = lineupStrength(opponent.lineup, dataset);
  if (!Number.isFinite(opponent.strength) || Math.abs(opponent.strength - calculated) > 1e-9) throw new Error("Opponent strength does not match its lineup");
  return calculated;
}
function scoreMap(scope: string, index: number, winner: "user" | "opponent", delta: number): Pick<MapResult, "userScore" | "opponentScore"> {
  const rng = scopedRng(scope, `score:${index}`); let high: number; let low: number;
  if (rng.next() < 0.12) [high, low] = ([[14, 12], [15, 13], [16, 14]] as const)[rng.int(3)];
  else { high = 13; const minimum = 3 + Math.floor(Math.max(0, 1 - Math.min(Math.abs(delta), 30) / 30) * 4); low = minimum + rng.int(12 - minimum); }
  return winner === "user" ? { userScore: high, opponentScore: low } : { userScore: low, opponentScore: high };
}
function validateMap(map: unknown): asserts map is MapResult {
  if (!map || typeof map !== "object") throw new Error("Invalid series map"); const value = map as MapResult;
  if (!MAP_POOL.includes(value.map) || (value.winner !== "user" && value.winner !== "opponent")) throw new Error("Invalid series map winner or name");
  if (!Number.isFinite(value.probability) || value.probability < 0.08 || value.probability > 0.92) throw new Error("Invalid series map probability");
  if (!Number.isFinite(value.roll) || value.roll < 0 || value.roll >= 1) throw new Error("Invalid series map roll");
  if (value.winner !== (value.roll < value.probability ? "user" : "opponent")) throw new Error("Series map winner does not match roll");
  if (![value.userScore, value.opponentScore].every(Number.isInteger) || value.userScore < 0 || value.opponentScore < 0) throw new Error("Invalid series map score");
  const high = value.winner === "user" ? value.userScore : value.opponentScore; const low = value.winner === "user" ? value.opponentScore : value.userScore;
  if (high <= low || !((high === 13 && low >= 3 && low <= 11) || ([14, 15, 16].includes(high) && low === high - 2))) throw new Error("Invalid series map score");
}
function validateSeries(series: unknown, stage: Stage): asserts series is SeriesResult {
  if (!series || typeof series !== "object") throw new Error("Invalid series"); const value = series as SeriesResult; const required = requiredWins(stage); const bestOf: 3 | 5 = stage === "final" ? 5 : 3;
  if (value.stage !== stage) throw new Error("Series stage does not match current stage"); if (value.bestOf !== bestOf) throw new Error("Series best-of does not match stage");
  if (!Number.isInteger(value.userWins) || !Number.isInteger(value.opponentWins) || value.userWins < 0 || value.opponentWins < 0 || !Array.isArray(value.maps)) throw new Error("Invalid series wins or maps");
  if (!((value.userWins === required && value.opponentWins < required) || (value.opponentWins === required && value.userWins < required))) throw new Error("Invalid series winning count");
  if (value.maps.length !== value.userWins + value.opponentWins || value.maps.length < required || value.maps.length > required * 2 - 1) throw new Error("Invalid series maps count");
  const names = new Set<string>(); let user = 0; let opponent = 0;
  for (const map of value.maps) { validateMap(map); if (names.has(map.map)) throw new Error("Series map names must be unique"); names.add(map.map); if (map.winner === "user") user += 1; else opponent += 1; }
  if (user !== value.userWins || opponent !== value.opponentWins) throw new Error("Series wins do not match map winners");
}

export function playSeries(seed: string, stage: Stage, userLineup: Lineup, opponent: GeneratedOpponent, dataset: GameDataset): SeriesResult {
  assertStage(stage); const userStrength = lineupStrength(userLineup, dataset); const foeStrength = opponentStrength(opponent, stage, dataset); const bestOf: 3 | 5 = stage === "final" ? 5 : 3; const required = requiredWins(stage);
  const scope = `series:${stage}:${fingerprint(userLineup)}:${opponent.id}:${fingerprint(opponent.lineup)}`; const order = scopedRng(seed, `${scope}:maps`).shuffle(MAP_POOL); const outcomes = scopedRng(seed, `${scope}:outcomes`); const maps: MapResult[] = []; let userWins = 0; let opponentWins = 0;
  while (userWins < required && opponentWins < required) { const result = rollMap(userStrength, foeStrength, outcomes); maps.push({ map: order[maps.length], ...scoreMap(`${seed}:${scope}`, maps.length, result.winner, userStrength - foeStrength), ...result }); if (result.winner === "user") userWins += 1; else opponentWins += 1; }
  return freezeSeries({ stage, bestOf, userWins, opponentWins, maps });
}
export function startTournament(seed: string, userLineup: Lineup): TournamentState { if (typeof seed !== "string" || seed.length === 0) throw new Error("Tournament seed must be a non-empty string"); return freezeState({ seed, userLineup, currentStage: "group", status: "active", completedSeries: [] }); }
export function playCurrentSeries(state: TournamentState, dataset: GameDataset, opponent: GeneratedOpponent): TournamentState { if (state.status !== "active") throw new Error("Cannot play a series in a terminal tournament state"); assertStage(state.currentStage); if (state.completedSeries.some(series => series.stage === state.currentStage)) throw new Error(`Stage ${state.currentStage} is already resolved`); return freezeState({ ...state, userLineup: state.userLineup, completedSeries: [...state.completedSeries, playSeries(state.seed, state.currentStage, cloneLineup(state.userLineup), opponent, dataset)] }); }
export function advanceTournament(state: TournamentState): TournamentState { if (state.status !== "active") throw new Error("Cannot advance a terminal tournament state"); assertStage(state.currentStage); const series = state.completedSeries.at(-1); validateSeries(series, state.currentStage); if (series.opponentWins > series.userWins) return freezeState({ ...state, userLineup: state.userLineup, status: "eliminated", completedSeries: state.completedSeries }); if (state.currentStage === "final") return freezeState({ ...state, userLineup: state.userLineup, status: "champion", completedSeries: state.completedSeries }); const next = STAGE_ORDER[STAGE_ORDER.indexOf(state.currentStage) + 1]; return freezeState({ ...state, userLineup: state.userLineup, currentStage: next, completedSeries: state.completedSeries }); }
