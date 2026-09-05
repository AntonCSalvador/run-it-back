import { ROLES, type GameDataset, type Lineup, type PlayerCard, type Role } from "./domain";
import { lineupStrength } from "./rating";
import { scopedRng, type SeededRng } from "./rng";

export type Stage = "group" | "quarterfinal" | "semifinal" | "final";

const STAGE_TARGETS: Record<Stage, readonly [number, number]> = {
  group: [50, 62],
  quarterfinal: [58, 70],
  semifinal: [66, 78],
  final: [74, 90],
};

export interface GeneratedOpponent {
  id: string;
  stage: Stage;
  lineup: Lineup;
  strength: number;
}

interface Candidate {
  lineup: Lineup;
  strength: number;
}

function findLineup(candidates: readonly PlayerCard[], rng: SeededRng): Lineup | undefined {
  const byRole = new Map<Role, PlayerCard[]>();
  for (const role of ROLES) {
    byRole.set(role, rng.shuffle(candidates.filter(card => card.eligibleRoles.includes(role))));
  }
  const slots: Lineup["slots"] = [];
  const used = new Set<string>();
  const choose = (index: number): boolean => {
    if (index === ROLES.length) return true;
    const role = ROLES[index];
    for (const card of byRole.get(role) ?? []) {
      if (used.has(card.id)) continue;
      used.add(card.id);
      slots.push({ role, cardId: card.id });
      if (choose(index + 1)) return true;
      slots.pop();
      used.delete(card.id);
    }
    return false;
  };
  if (!choose(0)) return undefined;
  const selected = slots.map(slot => candidates.find(card => card.id === slot.cardId)!);
  const leadership = Math.max(...selected.map(card => card.traits.leadership));
  const leaders = selected.filter(card => card.traits.leadership === leadership);
  return { slots, iglCardId: rng.pick(leaders).id };
}

function distanceFromRange(value: number, range: readonly [number, number]): number {
  const midpoint = (range[0] + range[1]) / 2;
  return Math.abs(value - midpoint);
}

function opponentId(seed: string, stage: Stage, lineup: Lineup): string {
  let first = 2166136261;
  let second = 2166136261;
  const input = `${seed}:${stage}:${lineup.slots.map(slot => `${slot.role}:${slot.cardId}`).join(",")}:${lineup.iglCardId}`;
  const alternate = `opponent-id:v2:${input}`;
  for (let index = 0; index < input.length; index += 1) first = Math.imul(first ^ input.charCodeAt(index), 16777619);
  for (let index = 0; index < alternate.length; index += 1) second = Math.imul(second ^ alternate.charCodeAt(index), 16777619);
  return `opponent-${stage}-${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0).toString(16).padStart(8, "0")}`;
}

function generated(seed: string, stage: Stage, candidate: Candidate): GeneratedOpponent {
  return { id: opponentId(seed, stage, candidate.lineup), stage, lineup: candidate.lineup, strength: candidate.strength };
}

export function generateOpponent(seed: string, stage: Stage, userLineup: Lineup, dataset: GameDataset): GeneratedOpponent {
  if (!Object.prototype.hasOwnProperty.call(STAGE_TARGETS, stage)) throw new Error(`Invalid stage: ${String(stage)}`);
  lineupStrength(userLineup, dataset);
  const userCards = new Set(userLineup.slots.map(slot => slot.cardId));
  const candidates = dataset.cards.filter(card => !userCards.has(card.id));
  const target = STAGE_TARGETS[stage];
  let closest: Candidate | undefined;

  for (let attempt = 0; attempt < 250; attempt += 1) {
    const lineup = findLineup(candidates, scopedRng(seed, `opponent:${stage}:${attempt}`));
    if (!lineup) continue;
    const candidate = { lineup, strength: lineupStrength(lineup, dataset) };
    if (candidate.strength >= target[0] && candidate.strength <= target[1]) return generated(seed, stage, candidate);
    if (!closest || distanceFromRange(candidate.strength, target) < distanceFromRange(closest.strength, target)) closest = candidate;
  }

  if (!closest) throw new Error(`No valid opponent lineup exists for stage ${stage}`);
  return generated(seed, stage, closest);
}
