import type { GameDataset, Lineup } from "./domain";
import { type GeneratedOpponent, type Stage } from "./opponents";
import { lineupStrength, rollMap } from "./rating";
import { scopedRng } from "./rng";

export const MAP_POOL = ["Ascent", "Bind", "Haven", "Split", "Icebox", "Breeze", "Fracture", "Pearl", "Lotus", "Sunset", "Abyss", "Corrode"] as const;
export const STAGE_ORDER: Stage[] = ["group", "quarterfinal", "semifinal", "final"];

export interface MapResult {
  map: (typeof MAP_POOL)[number];
  userScore: number;
  opponentScore: number;
  winner: "user" | "opponent";
  probability: number;
  roll: number;
}

export interface SeriesResult {
  stage: Stage;
  bestOf: 3 | 5;
  userWins: number;
  opponentWins: number;
  maps: MapResult[];
}

export interface TournamentState {
  seed: string;
  userLineup: Lineup;
  currentStage: Stage;
  status: "active" | "eliminated" | "champion";
  completedSeries: SeriesResult[];
}

function assertStage(stage: Stage): void {
  if (!STAGE_ORDER.includes(stage)) throw new Error(`Invalid stage: ${String(stage)}`);
}

function cloneLineup(lineup: Lineup): Lineup {
  return { slots: lineup.slots.map(slot => ({ ...slot })), iglCardId: lineup.iglCardId };
}

function opponentStrength(opponent: GeneratedOpponent, stage: Stage, dataset: GameDataset): number {
  assertStage(stage);
  if (opponent.stage !== stage) throw new Error(`Opponent stage ${opponent.stage} does not match ${stage}`);
  const calculated = lineupStrength(opponent.lineup, dataset);
  if (!Number.isFinite(opponent.strength) || Math.abs(opponent.strength - calculated) > 1e-9) throw new Error("Opponent strength does not match its lineup");
  return calculated;
}

function scoreMap(seed: string, stage: Stage, index: number, winner: "user" | "opponent", strengthDelta: number): Pick<MapResult, "userScore" | "opponentScore"> {
  const rng = scopedRng(seed, `series:${stage}:score:${index}`);
  const overtime = rng.next() < 0.12;
  let winnerScore: number;
  let loserScore: number;
  if (overtime) {
    const overtimeScores: readonly [number, number][] = [[14, 12], [15, 13], [16, 14]];
    [winnerScore, loserScore] = overtimeScores[rng.int(overtimeScores.length)];
  } else {
    winnerScore = 13;
    const closeness = Math.max(0, 1 - Math.min(Math.abs(strengthDelta), 30) / 30);
    const minimumLoserScore = 3 + Math.floor(closeness * 4);
    loserScore = minimumLoserScore + rng.int(12 - minimumLoserScore);
  }
  return winner === "user" ? { userScore: winnerScore, opponentScore: loserScore } : { userScore: loserScore, opponentScore: winnerScore };
}

/** Simulates a single stage; its scoped streams make outcomes independent of other stages. */
export function playSeries(seed: string, stage: Stage, userLineup: Lineup, opponent: GeneratedOpponent, dataset: GameDataset): SeriesResult {
  assertStage(stage);
  const userStrength = lineupStrength(userLineup, dataset);
  const foeStrength = opponentStrength(opponent, stage, dataset);
  const bestOf: 3 | 5 = stage === "final" ? 5 : 3;
  const requiredWins = (bestOf + 1) / 2;
  const order = scopedRng(seed, `series:${stage}:maps`).shuffle(MAP_POOL);
  const outcomeRng = scopedRng(seed, `series:${stage}:outcomes`);
  const maps: MapResult[] = [];
  let userWins = 0;
  let opponentWins = 0;

  while (userWins < requiredWins && opponentWins < requiredWins) {
    const outcome = rollMap(userStrength, foeStrength, outcomeRng);
    const scores = scoreMap(seed, stage, maps.length, outcome.winner, userStrength - foeStrength);
    maps.push({ map: order[maps.length], ...scores, ...outcome });
    if (outcome.winner === "user") userWins += 1;
    else opponentWins += 1;
  }
  return { stage, bestOf, userWins, opponentWins, maps };
}

export function startTournament(seed: string, userLineup: Lineup): TournamentState {
  if (typeof seed !== "string" || seed.length === 0) throw new Error("Tournament seed must be a non-empty string");
  return { seed, userLineup: cloneLineup(userLineup), currentStage: "group", status: "active", completedSeries: [] };
}

export function playCurrentSeries(state: TournamentState, dataset: GameDataset, opponent: GeneratedOpponent): TournamentState {
  if (state.status !== "active") throw new Error("Cannot play a series in a terminal tournament state");
  if (state.completedSeries.some(series => series.stage === state.currentStage)) throw new Error(`Stage ${state.currentStage} is already resolved`);
  const series = playSeries(state.seed, state.currentStage, state.userLineup, opponent, dataset);
  return { ...state, userLineup: cloneLineup(state.userLineup), completedSeries: [...state.completedSeries, series] };
}

export function advanceTournament(state: TournamentState): TournamentState {
  if (state.status !== "active") throw new Error("Cannot advance a terminal tournament state");
  const series = state.completedSeries.at(-1);
  if (!series || series.stage !== state.currentStage) throw new Error("Current stage must be played before advancing");
  if (series.opponentWins > series.userWins) return { ...state, userLineup: cloneLineup(state.userLineup), status: "eliminated", completedSeries: [...state.completedSeries] };
  if (state.currentStage === "final") return { ...state, userLineup: cloneLineup(state.userLineup), status: "champion", completedSeries: [...state.completedSeries] };
  const nextStage = STAGE_ORDER[STAGE_ORDER.indexOf(state.currentStage) + 1];
  return { ...state, userLineup: cloneLineup(state.userLineup), currentStage: nextStage, completedSeries: [...state.completedSeries] };
}
