import { describe, expect, test } from "vitest";
import type { GameDataset, Lineup, PlayerCard, Role } from "./domain";
import { SeededRng } from "./rng";
import { cardBaseline, lineupStrength, mapWinProbability, rollMap } from "./rating";

const roles: Role[] = ["smokes", "duelist", "initiator", "sentinel", "flex"];

function card(index: number, overrides: Partial<PlayerCard> = {}): PlayerCard {
  return {
    id: `card-${index}`,
    playerId: `player-${index}`,
    teamId: `team-${index}`,
    year: 2024,
    displayHandle: `player${index}`,
    mapsPlayed: 20,
    eligibleRoles: [roles[index % roles.length]],
    historicalIgl: index === 0,
    traits: { firepower: 50, utility: 50, survival: 50, clutch: 50, consistency: 50, leadership: 50 },
    sourceIds: [],
    ...overrides,
  };
}

function dataset(cards: PlayerCard[]): GameDataset {
  return { version: 1, sources: [], teams: [], players: [], cards };
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
    const cards = roles.map((role, index) => card(index, { eligibleRoles: [role], teamId: `team-${index}`, year: 2024 }));
    const base = lineupStrength(lineup(cards), dataset(cards));
    const onePairCards = cards.map((c, index) => index === 1 ? { ...c, teamId: "pair" } : index === 0 ? { ...c, teamId: "pair" } : c);
    const onePair = lineupStrength(lineup(onePairCards), dataset(onePairCards));
    expect(onePair - base).toBe(2);
    const crossYearPair = onePairCards.map((c, index) => index === 1 ? { ...c, year: 2023 as const } : c);
    expect(lineupStrength(lineup(crossYearPair), dataset(crossYearPair))).toBe(50);

    const many = cards.map(c => ({ ...c, teamId: "same", year: 2024 as const }));
    expect(lineupStrength(lineup(many), dataset(many)) - base).toBe(8);
  });

  test("applies leadership only from the tagged IGL card", () => {
    const low = roles.map((role, index) => card(index, { eligibleRoles: [role], traits: { firepower: 50, utility: 50, survival: 50, clutch: 50, consistency: 50, leadership: index === 0 ? 20 : 50 } }));
    const high = low.map((c, index) => index === 0 ? { ...c, traits: { ...c.traits, leadership: 80 } } : c);
    expect(lineupStrength(lineup(high), dataset(high))).toBeGreaterThan(lineupStrength(lineup(low), dataset(low)));
  });

  test("rejects malformed lineups and cards assigned to ineligible roles", () => {
    const cards = roles.map((role, index) => card(index, { eligibleRoles: [role] }));
    expect(() => lineupStrength({ ...lineup(cards), slots: [...lineup(cards).slots, { role: "flex", cardId: cards[0].id }] }, dataset(cards))).toThrow(/exactly five|roles/i);
    expect(() => lineupStrength({ ...lineup(cards), slots: lineup(cards).slots.map(slot => slot.role === "flex" ? { ...slot, role: "duelist" } : slot) }, dataset(cards))).toThrow(/role/i);
    expect(() => lineupStrength({ ...lineup(cards), iglCardId: "missing" }, dataset(cards))).toThrow(/IGL|card/i);
  });

  test("uses a bounded logistic map probability and preserves deterministic upsets", () => {
    expect(mapWinProbability(0)).toBe(0.5);
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

  test("rollMap returns its single roll, probability, and winner consistently", () => {
    const result = rollMap(12, 0, new SeededRng("shape"));
    expect(result).toEqual({ probability: mapWinProbability(12), roll: result.roll, winner: result.roll < result.probability ? "user" : "opponent" });
  });
});
