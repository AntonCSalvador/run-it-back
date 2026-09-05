import { describe, expect, test } from "vitest";
import type { GameDataset, Lineup, PlayerCard, Role } from "./domain";
import { minimalDataset } from "../../data/fixtures/minimal-dataset";
import { parseDataset } from "./schema";
import { SeededRng } from "./rng";
import { cardBaseline, lineupStrength, mapWinProbability, rollMap } from "./rating";

const roles: Role[] = ["smokes", "duelist", "initiator", "sentinel", "flex"];

const baseDataset = parseDataset(minimalDataset);

function card(index: number, overrides: Partial<PlayerCard> = {}): PlayerCard {
  const source = baseDataset.cards[index];
  return {
    ...source,
    eligibleRoles: [roles[index % roles.length]],
    historicalIgl: index === 0,
    ...overrides,
  };
}

function dataset(cards: PlayerCard[]): GameDataset {
  const byId = new Map(baseDataset.cards.map(existing => [existing.id, existing]));
  cards.forEach(candidate => byId.set(candidate.id, candidate));
  return { ...baseDataset, cards: [...byId.values()] };
}

function lineup(cards: PlayerCard[], iglCardId = cards[0].id): Lineup {
  return { slots: cards.map((c, index) => ({ role: roles[index], cardId: c.id })), iglCardId };
}

describe("hidden lineup ratings", () => {
  test("uses the specified baseline trait weights and excludes leadership", () => {
    expect(cardBaseline(card(0, { traits: { firepower: 100, utility: 0, survival: 0, clutch: 0, consistency: 0, leadership: 100 } }))).toBe(35);
    expect(cardBaseline(card(0, { traits: { firepower: 0, utility: 100, survival: 0, clutch: 0, consistency: 0, leadership: 100 } }))).toBe(20);
    expect(cardBaseline(card(0, { traits: { firepower: 0, utility: 0, survival: 100, clutch: 0, consistency: 0, leadership: 100 } }))).toBe(15);
    expect(cardBaseline(card(0, { traits: { firepower: 0, utility: 0, survival: 0, clutch: 100, consistency: 0, leadership: 100 } }))).toBe(15);
    expect(cardBaseline(card(0, { traits: { firepower: 0, utility: 0, survival: 0, clutch: 0, consistency: 100, leadership: 100 } }))).toBe(15);
  });

  test("adds chemistry only for same event team and caps it at eight", () => {
    const cards = roles.map((role, index) => card(index, { eligibleRoles: [role], teamId: baseDataset.cards[(index + 1) * 5].teamId, year: baseDataset.cards[(index + 1) * 5].year }));
    const base = lineupStrength(lineup(cards), dataset(cards));
    const onePairCards = cards.map((c, index) => index < 2 ? { ...c, teamId: baseDataset.cards[5].teamId, year: baseDataset.cards[5].year } : c);
    const onePair = lineupStrength(lineup(onePairCards), dataset(onePairCards));
    expect(onePair - base).toBe(2);
    const crossYearPair = onePairCards.map((c, index) => index === 1 ? { ...c, teamId: baseDataset.cards[10].teamId, year: baseDataset.cards[10].year } : c);
    expect(lineupStrength(lineup(crossYearPair), dataset(crossYearPair))).toBe(base);

    const many = cards.map(c => ({ ...c, teamId: baseDataset.cards[5].teamId, year: baseDataset.cards[5].year }));
    expect(lineupStrength(lineup(many), dataset(many)) - base).toBe(8);
  });

  test("applies leadership only from the tagged IGL card", () => {
    const cards = roles.map((role, index) => card(index, { eligibleRoles: [role], traits: { firepower: 50, utility: 50, survival: 50, clutch: 50, consistency: 50, leadership: index === 0 ? 80 : 20 } }));
    expect(lineupStrength(lineup(cards), dataset(cards))).toBe(60.4);
    const nonIglChange = cards.map((c, index) => index === 1 ? { ...c, traits: { ...c.traits, leadership: 100 } } : c);
    expect(lineupStrength(lineup(nonIglChange), dataset(nonIglChange))).toBe(60.4);
  });

  test("rejects malformed lineups and cards assigned to ineligible roles", () => {
    const cards = roles.map((role, index) => card(index, { eligibleRoles: [role] }));
    expect(() => lineupStrength({ ...lineup(cards), slots: [...lineup(cards).slots, { role: "flex", cardId: cards[0].id }] }, dataset(cards))).toThrow(/exactly five|roles/i);
    expect(() => lineupStrength({ ...lineup(cards), slots: lineup(cards).slots.map(slot => slot.role === "flex" ? { ...slot, role: "duelist" } : slot) }, dataset(cards))).toThrow(/role/i);
    expect(() => lineupStrength({ ...lineup(cards), iglCardId: "missing" }, dataset(cards))).toThrow(/IGL|card/i);
  });

  test("uses a bounded logistic map probability and preserves deterministic upsets", () => {
    expect(mapWinProbability(0)).toBe(0.5);
    expect(mapWinProbability(12)).toBeCloseTo(1 / (1 + Math.exp(-1)), 12);
    expect(mapWinProbability(12) + mapWinProbability(-12)).toBeCloseTo(1, 12);
    expect(mapWinProbability(-6)).toBeLessThan(mapWinProbability(0));
    expect(mapWinProbability(0)).toBeLessThan(mapWinProbability(6));
    expect(mapWinProbability(10_000)).toBe(0.92);
    expect(mapWinProbability(-10_000)).toBe(0.08);
    const stronger = 0;
    const weaker = -30;
    let strongerWins = 0;
    let weakerWins = 0;
    for (let i = 0; i < 20_000; i += 1) {
      const result = rollMap(stronger, weaker, new SeededRng(`rating-stat-${i}`));
      if (result.winner === "user") strongerWins += 1;
      else weakerWins += 1;
    }
    expect(strongerWins).toBeGreaterThan(weakerWins);
    expect(weakerWins).toBeGreaterThan(0);
  });

  test("rollMap consumes one roll and applies strict less-than semantics", () => {
    let calls = 0;
    const rng = { next: () => { calls += 1; return 0.2; } };
    expect(rollMap(12, 0, rng)).toEqual({ probability: mapWinProbability(12), roll: 0.2, winner: "user" });
    expect(calls).toBe(1);
    expect(rollMap(0, 0, { next: () => 0.5 }).winner).toBe("opponent");
    for (const invalid of [Number.NaN, -Number.EPSILON, 1, Number.POSITIVE_INFINITY]) {
      expect(() => rollMap(0, 0, { next: () => invalid })).toThrow(/\[0, 1\)/);
    }
  });
});
