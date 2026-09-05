import { vi } from "vitest";
import { minimalDataset } from "@/data/fixtures/minimal-dataset";
import { ROLES, type Lineup } from "../domain";
import { LocalSimulationGateway, type SimulationGateway } from "../gateway";
import type { GameState } from "../machine";
import type { Highlight } from "../narration";
import type { Stage } from "../opponents";
import { parseDataset } from "../schema";
import { advanceTournament, MAP_POOL, STAGE_ORDER, startTournament, validateSeries, type SeriesResult } from "../tournament";

export const dataset = parseDataset(minimalDataset);
export const runSeed = "run-it-back:daily:2026-09-05:v1";
export const lineup: Lineup = {
  slots: ROLES.map((role, index) => ({ role, cardId: dataset.cards[index].id })),
  iglCardId: dataset.cards[0].id,
};

// Decisive, validated results with mixed map winners, including a five-map final.
export function series(stage: Stage, won = true): SeriesResult {
  const wins = stage === "final" ? [true, false, true, false, true] : [true, false, true];
  const maps = wins.map((winner, index) => {
    const userWon = won ? winner : !winner;
    return { map: MAP_POOL[index], winner: userWon ? "user" as const : "opponent" as const,
      userScore: userWon ? 13 : 7, opponentScore: userWon ? 7 : 13, probability: .6, roll: userWon ? .2 : .8 };
  });
  const result: SeriesResult = { stage, bestOf: stage === "final" ? 5 : 3,
    userWins: maps.filter(map => map.winner === "user").length,
    opponentWins: maps.filter(map => map.winner === "opponent").length, maps };
  validateSeries(result);
  return result;
}

export function activeState(stage: Stage = "group"): Extract<GameState, { phase: "tournament" }> {
  let tournament = startTournament(runSeed, lineup);
  for (const previous of STAGE_ORDER.slice(0, STAGE_ORDER.indexOf(stage))) {
    tournament = advanceTournament({ ...tournament, completedSeries: [...tournament.completedSeries, series(previous)] });
  }
  return { phase: "tournament", mode: "daily", tournament,
    draft: { seed: runSeed, offerIndex: 5, rerollsRemaining: 2, offeredTeamIds: [], selectedTeamId: null,
      pendingCardId: null, slots: Object.fromEntries(lineup.slots.map(slot => [slot.role, slot.cardId])), iglCardId: lineup.iglCardId } };
}

export function terminalState(champion: boolean): Extract<GameState, { phase: "results" }> {
  const state = activeState(champion ? "final" : "group");
  const tournament = advanceTournament({ ...state.tournament, completedSeries: [...state.tournament.completedSeries, series(state.tournament.currentStage, champion)] });
  return { ...state, phase: "results", tournament };
}

export function gatewayFixture() {
  const local = new LocalSimulationGateway(dataset);
  return {
    generateOpponent: vi.fn(local.generateOpponent.bind(local)),
    playSeries: vi.fn<SimulationGateway["playSeries"]>((_seed, stage) => series(stage)),
    createHighlights: vi.fn<SimulationGateway["createHighlights"]>((_seed, result): readonly Highlight[] => [1, 2, 3].map(index => ({
      id: `${result.stage}-${index}`, kind: "ace", actorCardId: lineup.iglCardId, side: "user", text: `${result.stage} moment ${index}`,
      emphasis: "normal", map: result.maps[0].map, mapIndex: 0,
    }))),
  };
}
