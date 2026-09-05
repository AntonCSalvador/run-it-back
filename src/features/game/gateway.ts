import type { GameDataset, Lineup } from "./domain";
import { parseDataset } from "./schema";
import { generateOpponent, type GeneratedOpponent, type Stage } from "./opponents";
import { playSeries, type SeriesResult } from "./tournament";
import { createHighlights, type Highlight } from "./narration";

export interface SimulationGateway {
  generateOpponent(seed: string, stage: Stage, userLineup: Lineup): GeneratedOpponent;
  playSeries(seed: string, stage: Stage, userLineup: Lineup, opponent: GeneratedOpponent): SeriesResult;
  createHighlights(seed: string, series: SeriesResult, userLineup: Lineup, opponent: Lineup): readonly Highlight[];
}
function freezeDataset(dataset: GameDataset): GameDataset {
  const clone = structuredClone(dataset);
  for (const source of clone.sources) Object.freeze(source);
  for (const team of clone.teams) { Object.freeze(team.sourceIds); Object.freeze(team); }
  for (const player of clone.players) { Object.freeze(player.sourceIds); Object.freeze(player); }
  for (const card of clone.cards) { Object.freeze(card.eligibleRoles); Object.freeze(card.sourceIds); Object.freeze(card.traits); Object.freeze(card); }
  Object.freeze(clone.sources); Object.freeze(clone.teams); Object.freeze(clone.players); Object.freeze(clone.cards);
  return Object.freeze(clone);
}
export class LocalSimulationGateway implements SimulationGateway {
  private readonly dataset: GameDataset;
  constructor(dataset: GameDataset) { this.dataset = freezeDataset(parseDataset(dataset)); }
  generateOpponent(seed: string, stage: Stage, userLineup: Lineup): GeneratedOpponent { return generateOpponent(seed, stage, userLineup, this.dataset); }
  playSeries(seed: string, stage: Stage, userLineup: Lineup, opponent: GeneratedOpponent): SeriesResult { return playSeries(seed, stage, userLineup, opponent, this.dataset); }
  createHighlights(seed: string, series: SeriesResult, userLineup: Lineup, opponent: Lineup): readonly Highlight[] { return createHighlights(seed, series, userLineup, opponent, this.dataset); }
}
