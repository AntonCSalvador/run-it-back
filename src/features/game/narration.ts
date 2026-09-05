import { ROLES, type GameDataset, type Lineup, type PlayerCard, type Role } from "./domain";
import { normalizeHandle } from "./handle";
import { scopedRng, type SeededRng } from "./rng";
import { canonicalLineupFingerprint, type MapResult, type SeriesResult, validateSeries } from "./tournament";

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
function hash128(value: string): string {
  const hashes = [2166136261, 2246822519, 3266489917, 668265263];
  for (const code of Array.from(value, character => character.codePointAt(0)!)) for (let index = 0; index < hashes.length; index += 1) hashes[index] = Math.imul(hashes[index] ^ code, [16777619, 2246822519, 3266489917, 668265263][index]);
  return hashes.map(part => (part >>> 0).toString(16).padStart(8, "0")).join("");
}
function resolveLineup(lineup: Lineup, dataset: GameDataset): readonly Participant[] {
  if (!lineup || !Array.isArray(lineup.slots) || lineup.slots.length !== ROLES.length || !Array.isArray(dataset.players) || !Array.isArray(dataset.cards)) fail("Invalid narration lineup");
  const byRole = new Map<Role, string>(); const cards = new Set<string>();
  for (const slot of lineup.slots) { if (!ROLES.includes(slot.role) || byRole.has(slot.role) || cards.has(slot.cardId)) fail("Invalid narration lineup"); byRole.set(slot.role, slot.cardId); cards.add(slot.cardId); }
  if (!cards.has(lineup.iglCardId) || byRole.size !== ROLES.length) fail("Invalid narration lineup");
  return ROLES.map(role => {
    const cardId = byRole.get(role)!;
    const slot = lineup.slots.find(candidate => candidate.role === role)!;
    const card = dataset.cards.find(candidate => candidate.id === cardId);
    if (!card || !card.eligibleRoles.includes(slot.role) || !dataset.players.some(player => player.id === card.playerId)) fail("Narration participant cannot be resolved");
    try { return { card, handle: normalizeHandle(card.displayHandle) }; } catch { return fail("Narration participant cannot be resolved"); }
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
function makeHighlight(feed: string, result: MapResult, mapIndex: number, eventIndex: number, side: Side, kind: HighlightKind, actor: Participant, target: Participant | undefined, emphasis: Highlight["emphasis"]): Highlight {
  const identity = JSON.stringify({ feed, map: result.map, mapIndex, eventIndex, kind, actor: actor.card.id, target: target?.card.id ?? null, side, emphasis });
  return Object.freeze({ id: `hl-${hash128(identity)}`, kind, actorCardId: actor.card.id, ...(target ? { targetCardId: target.card.id } : {}), side, text: template(kind, actor.handle, target?.handle), emphasis, map: result.map, mapIndex });
}
function eventFor(rng: SeededRng, own: readonly Participant[], other: readonly Participant[], kinds: readonly HighlightKind[]): { kind: HighlightKind; actor: Participant; target?: Participant } {
  const kind = weighted(rng, kinds, candidate => own.reduce((sum, participant) => sum + kindWeight(candidate, participant.card), 0));
  const actor = weighted(rng, own, participant => kindWeight(kind, participant.card));
  const target = kind === "ace" ? undefined : weighted(rng, other, participant => Math.max(0, participant.card.traits.survival));
  return { kind, actor, target };
}

export function createHighlights(seed: string, series: SeriesResult, userLineup: Lineup, opponent: Lineup, dataset: GameDataset): readonly Highlight[] {
  if (typeof seed !== "string" || seed.length === 0) fail("Narration seed must be non-empty");
  validateSeries(series);
  const user = resolveLineup(userLineup, dataset); const foe = resolveLineup(opponent, dataset);
  const shared = new Set(user.map(participant => participant.card.id)); if (foe.some(participant => shared.has(participant.card.id))) fail("Narration lineups must not share cards");
  if (series.stage === "group" || series.stage === "quarterfinal") return Object.freeze([]);
  const matchup = JSON.stringify({ user: canonicalLineupFingerprint(userLineup), opponent: canonicalLineupFingerprint(opponent) });
  const highlights: Highlight[] = [];
  for (const [mapIndex, result] of series.maps.entries()) {
    const scope = JSON.stringify({ narration: 1, matchup, stage: series.stage, map: result.map, mapIndex });
    const rng = scopedRng(seed, scope); const count = 4 + rng.int(3);
    for (let eventIndex = 0; eventIndex < count - 1; eventIndex += 1) {
      const side: Side = rng.next() < 0.5 ? "user" : "opponent"; const own = side === "user" ? user : foe; const other = side === "user" ? foe : user;
      const event = eventFor(rng, own, other, ["ace", "clutch", "ninja-defuse", "retake", "eco", "failed-clutch", "throw"]);
      highlights.push(makeHighlight(JSON.stringify({ seed, matchup, stage: series.stage }), result, mapIndex, eventIndex, side, event.kind, event.actor, event.target, event.kind === "clutch" ? "clutch" : "normal"));
    }
    const winner = result.winner; const own = winner === "user" ? user : foe; const other = winner === "user" ? foe : user;
    const finish = eventFor(rng, own, other, positiveKinds);
    highlights.push(makeHighlight(JSON.stringify({ seed, matchup, stage: series.stage }), result, mapIndex, count - 1, winner, finish.kind, finish.actor, finish.target, "decisive"));
  }
  return Object.freeze(highlights);
}

export const generateHighlights = createHighlights;
