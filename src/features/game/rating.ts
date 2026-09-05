import { ROLES, type GameDataset, type Lineup, type PlayerCard, type Role } from "./domain";

const TRAIT_WEIGHTS = {
  firepower: 0.35,
  utility: 0.2,
  survival: 0.15,
  clutch: 0.15,
  consistency: 0.15,
} as const;

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite`);
  return value;
}

export function cardBaseline(card: PlayerCard): number {
  return finite(
    TRAIT_WEIGHTS.firepower * finite(card.traits.firepower, "firepower") +
      TRAIT_WEIGHTS.utility * finite(card.traits.utility, "utility") +
      TRAIT_WEIGHTS.survival * finite(card.traits.survival, "survival") +
      TRAIT_WEIGHTS.clutch * finite(card.traits.clutch, "clutch") +
      TRAIT_WEIGHTS.consistency * finite(card.traits.consistency, "consistency"),
    "card baseline",
  );
}

function resolveLineup(lineup: Lineup, dataset: GameDataset): Array<{ card: PlayerCard; role: Role }> {
  if (!lineup || !Array.isArray(lineup.slots) || lineup.slots.length !== ROLES.length) {
    throw new Error("Lineup must contain exactly five roles");
  }
  const expectedRoles = new Set<Role>(ROLES);
  const seenRoles = new Set<Role>();
  const seenCards = new Set<string>();
  const resolved = lineup.slots.map((slot) => {
    if (!expectedRoles.has(slot.role) || seenRoles.has(slot.role)) throw new Error("Lineup must contain each official role exactly once");
    seenRoles.add(slot.role);
    if (seenCards.has(slot.cardId)) throw new Error("Lineup cards must be distinct");
    seenCards.add(slot.cardId);
    const card = dataset.cards.find((candidate) => candidate.id === slot.cardId);
    if (!card) throw new Error(`Lineup card not found: ${slot.cardId}`);
    if (!card.eligibleRoles.includes(slot.role)) throw new Error(`Card ${slot.cardId} is not eligible for role ${slot.role}`);
    return { card, role: slot.role };
  });
  if (seenRoles.size !== ROLES.length || !seenCards.has(lineup.iglCardId)) throw new Error("Lineup must include its IGL card");
  return resolved;
}

export function lineupStrength(lineup: Lineup, dataset: GameDataset): number {
  const resolved = resolveLineup(lineup, dataset);
  const average = resolved.reduce((sum, entry) => sum + cardBaseline(entry.card), 0) / resolved.length;
  let chemistry = 0;
  for (let left = 0; left < resolved.length; left += 1) {
    for (let right = left + 1; right < resolved.length; right += 1) {
      const first = resolved[left].card;
      const second = resolved[right].card;
      if (first.teamId === second.teamId && first.year === second.year) chemistry += 2;
    }
  }
  const cappedChemistry = Math.min(8, chemistry);
  const igl = resolved.find((entry) => entry.card.id === lineup.iglCardId);
  if (!igl) throw new Error("Lineup must include its IGL card");
  const leadership = (finite(igl.card.traits.leadership, "leadership") - 50) * 0.08;
  return finite(average + cappedChemistry + leadership, "lineup strength");
}

export function mapWinProbability(strengthDelta: number): number {
  finite(strengthDelta, "strength delta");
  const raw = 1 / (1 + Math.exp(-strengthDelta / 12));
  return Math.min(0.92, Math.max(0.08, raw));
}

export interface MapRoll {
  probability: number;
  roll: number;
  winner: "user" | "opponent";
}

export interface RandomSource {
  next(): number;
}

export function rollMap(userStrength: number, opponentStrength: number, rng: RandomSource): MapRoll {
  const probability = mapWinProbability(finite(userStrength, "user strength") - finite(opponentStrength, "opponent strength"));
  const roll = rng.next();
  if (!Number.isFinite(roll) || roll < 0 || roll >= 1) throw new RangeError("rng.next() must return a value in [0, 1)");
  return { probability, roll, winner: roll < probability ? "user" : "opponent" };
}
