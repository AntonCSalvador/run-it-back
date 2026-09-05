import { ROLES, type GameDataset, type Lineup, type PlayerCard } from "./domain";
import { scopedRng, type SeededRng } from "./rng";
import { lineupStrength } from "./rating";
import { MAP_POOL, type MapResult, type SeriesResult } from "./tournament";

export type HighlightKind = "ace" | "clutch" | "ninja-defuse" | "retake" | "eco" | "failed-clutch" | "throw";
export interface Highlight {
  readonly id: string;
  readonly kind: HighlightKind;
  readonly actorCardId: string;
  readonly targetCardId?: string;
  readonly side: "user" | "opponent";
  readonly text: string;
  readonly emphasis: "normal" | "clutch" | "decisive";
  readonly map: MapResult["map"];
  readonly mapIndex: number;
}

type Side = Highlight["side"];
type Participant = { readonly card: PlayerCard; readonly handle: string };
const positiveKinds: readonly HighlightKind[] = ["ace", "clutch", "ninja-defuse", "retake", "eco"];

function fail(message: string): never { throw new Error(message); }
function hash(value: string): string {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) result = Math.imul(result ^ value.charCodeAt(index), 16777619);
  return (result >>> 0).toString(36);
}
function assertMap(result: unknown): asserts result is MapResult {
  if (!result || typeof result !== "object") fail("Invalid narration series map");
  const map = result as MapResult;
  if (!MAP_POOL.includes(map.map) || (map.winner !== "user" && map.winner !== "opponent")) fail("Invalid narration map identity");
  if (!Number.isFinite(map.probability) || map.probability < 0.08 || map.probability > 0.92 || !Number.isFinite(map.roll) || map.roll < 0 || map.roll >= 1) fail("Invalid narration map roll");
  if (map.winner !== (map.roll < map.probability ? "user" : "opponent")) fail("Invalid narration map winner");
  if (![map.userScore, map.opponentScore].every(Number.isInteger) || map.userScore < 0 || map.opponentScore < 0) fail("Invalid narration map score");
  const high = map.winner === "user" ? map.userScore : map.opponentScore;
  const low = map.winner === "user" ? map.opponentScore : map.userScore;
  if (high <= low || !((high === 13 && low >= 3 && low <= 11) || ([14, 15, 16].includes(high) && low === high - 2))) fail("Invalid narration map score");
}
function assertSeries(series: SeriesResult): void {
  if (!series || typeof series !== "object" || !["group", "quarterfinal", "semifinal", "final"].includes(series.stage)) fail("Invalid narration series");
  const needed = series.stage === "final" ? 3 : 2;
  if (series.bestOf !== (series.stage === "final" ? 5 : 3) || !Array.isArray(series.maps) || !Number.isInteger(series.userWins) || !Number.isInteger(series.opponentWins)) fail("Invalid narration series shape");
  if (!((series.userWins === needed && series.opponentWins < needed) || (series.opponentWins === needed && series.userWins < needed)) || series.maps.length !== series.userWins + series.opponentWins) fail("Invalid narration series result");
  let userWins = 0; let opponentWins = 0; const maps = new Set<string>();
  for (const result of series.maps) { assertMap(result); if (maps.has(result.map)) fail("Duplicate narration map"); maps.add(result.map); if (result.winner === "user") userWins += 1; else opponentWins += 1; }
  if (userWins !== series.userWins || opponentWins !== series.opponentWins) fail("Invalid narration series wins");
}
function resolveLineup(lineup: Lineup, dataset: GameDataset): readonly Participant[] {
  lineupStrength(lineup, dataset);
  if (!Array.isArray(dataset.players) || !Array.isArray(dataset.cards) || lineup.slots.length !== ROLES.length) fail("Invalid narration lineup");
  return lineup.slots.map(slot => {
    const card = dataset.cards.find(candidate => candidate.id === slot.cardId);
    if (!card || !dataset.players.some(player => player.id === card.playerId) || typeof card.displayHandle !== "string" || card.displayHandle.trim().length === 0) fail("Narration participant cannot be resolved");
    return { card, handle: card.displayHandle };
  });
}
function weighted<T>(rng: SeededRng, choices: readonly T[], weight: (choice: T) => number): T {
  const weights = choices.map(choice => Math.max(0, Number.isFinite(weight(choice)) ? weight(choice) : 0));
  const total = weights.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return choices[rng.int(choices.length)];
  let roll = rng.next() * total;
  for (let index = 0; index < choices.length; index += 1) { roll -= weights[index]; if (roll < 0) return choices[index]; }
  return choices.at(-1)!;
}
function kindWeight(kind: HighlightKind, card: PlayerCard): number {
  const traits = card.traits;
  if (kind === "ace") return traits.firepower;
  if (kind === "clutch") return traits.clutch;
  if (kind === "ninja-defuse" || kind === "retake") return traits.utility;
  if (kind === "eco") return (traits.firepower + traits.consistency) / 2;
  return 101 - traits.consistency;
}
function template(kind: HighlightKind, actor: string, target?: string): string {
  switch (kind) {
    case "ace": return `${actor} closes the simulated round with an ace.`;
    case "clutch": return `${actor} wins a simulated late-round clutch over ${target!}.`;
    case "ninja-defuse": return `${actor} slips in a simulated ninja defuse against ${target!}.`;
    case "retake": return `${actor} leads a simulated retake past ${target!}.`;
    case "eco": return `${actor} turns a simulated eco round against ${target!}.`;
    case "failed-clutch": return `${actor}'s simulated clutch attempt falls short against ${target!}.`;
    case "throw": return `${actor} lets a simulated advantage slip to ${target!}.`;
  }
}
function makeHighlight(scope: string, result: MapResult, mapIndex: number, eventIndex: number, side: Side, kind: HighlightKind, actor: Participant, target: Participant | undefined, emphasis: Highlight["emphasis"]): Highlight {
  return Object.freeze({ id: `hl-${hash(`${scope}:${eventIndex}:${actor.card.id}:${target?.card.id ?? ""}`)}`, kind, actorCardId: actor.card.id, ...(target ? { targetCardId: target.card.id } : {}), side, text: template(kind, actor.handle, target?.handle), emphasis, map: result.map, mapIndex });
}
function eventFor(rng: SeededRng, own: readonly Participant[], other: readonly Participant[], kinds: readonly HighlightKind[]): { kind: HighlightKind; actor: Participant; target?: Participant } {
  const kind = weighted(rng, kinds, candidate => own.reduce((sum, participant) => sum + kindWeight(candidate, participant.card), 0));
  const actor = weighted(rng, own, participant => kindWeight(kind, participant.card));
  const target = weighted(rng, other, participant => Math.max(0, participant.card.traits.survival));
  return { kind, actor, target };
}

export function createHighlights(seed: string, series: SeriesResult, userLineup: Lineup, opponent: Lineup, dataset: GameDataset): Highlight[] {
  if (typeof seed !== "string" || seed.length === 0) fail("Narration seed must be non-empty");
  assertSeries(series);
  const user = resolveLineup(userLineup, dataset); const foe = resolveLineup(opponent, dataset);
  const shared = new Set(user.map(participant => participant.card.id)); if (foe.some(participant => shared.has(participant.card.id))) fail("Narration lineups must not share cards");
  if (series.stage === "group" || series.stage === "quarterfinal") return Object.freeze([]) as unknown as Highlight[];
  const highlights: Highlight[] = [];
  for (const [mapIndex, result] of series.maps.entries()) {
    const scope = `narration:${series.stage}:${mapIndex}:${result.map}:${series.userWins}-${series.opponentWins}`;
    const rng = scopedRng(seed, scope); const count = 4 + rng.int(3);
    for (let eventIndex = 0; eventIndex < count - 1; eventIndex += 1) {
      const side: Side = rng.next() < 0.5 ? "user" : "opponent"; const own = side === "user" ? user : foe; const other = side === "user" ? foe : user;
      const event = eventFor(rng, own, other, ["ace", "clutch", "ninja-defuse", "retake", "eco", "failed-clutch", "throw"]);
      highlights.push(makeHighlight(scope, result, mapIndex, eventIndex, side, event.kind, event.actor, event.target, event.kind === "clutch" ? "clutch" : "normal"));
    }
    const winner = result.winner; const own = winner === "user" ? user : foe; const other = winner === "user" ? foe : user;
    const finish = eventFor(rng, own, other, positiveKinds);
    highlights.push(makeHighlight(scope, result, mapIndex, count - 1, winner, finish.kind, finish.actor, finish.target, "decisive"));
  }
  return Object.freeze(highlights) as unknown as Highlight[];
}

export const generateHighlights = createHighlights;
