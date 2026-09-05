import { describe, expect, test } from "vitest";
import type { GameDataset, Lineup, PlayerCard, Role } from "./domain";
import { lineupStrength } from "./rating";
import { generateOpponent } from "./opponents";

const roles: readonly Role[] = ["smokes", "duelist", "initiator", "sentinel", "flex"];
const traits = (rating: number, leadership = rating): PlayerCard["traits"] => ({
  firepower: rating, utility: rating, survival: rating, clutch: rating, consistency: rating, leadership,
});

function dataset(levels = [40, 48, 56, 64, 72, 80, 88]): GameDataset {
  const cards = roles.flatMap((role, roleIndex) => levels.map((rating, levelIndex) => ({
    id: `${role}-${rating}`,
    playerId: `${role}-player-${rating}`,
    teamId: `team-${roleIndex}-${levelIndex}`,
    year: 2025 as const,
    displayHandle: `${role}-${rating}`,
    mapsPlayed: 10,
    eligibleRoles: [role],
    historicalIgl: false,
    traits: traits(rating, rating + (levelIndex % 2)),
    sourceIds: ["source"],
  })));
  return {
    version: 1,
    sources: [{ id: "source", url: "https://example.com/source", retrievedAt: "2025-01-01", usage: "facts" }],
    teams: cards.map(card => ({ id: card.teamId, name: card.teamId, shortName: card.teamId, year: 2025 as const, logo: null, sourceIds: ["source"] })),
    players: cards.map(card => ({ id: card.playerId, canonicalHandle: card.playerId, portrait: null, sourceIds: ["source"] })),
    cards,
  };
}

function userLineup(): Lineup {
  return { slots: roles.map(role => ({ role, cardId: `${role}-40` })), iglCardId: "smokes-40" };
}

describe("generateOpponent", () => {
  test("is deterministic for the same seed, stage, user lineup, and dataset", () => {
    const data = dataset(); const user = userLineup();
    expect(generateOpponent("repeatable", "quarterfinal", user, data)).toEqual(generateOpponent("repeatable", "quarterfinal", user, data));
  });

  test("fills every official role once with distinct eligible cards and a lineup IGL", () => {
    const data = dataset();
    const opponent = generateOpponent("valid", "semifinal", userLineup(), data);
    expect(opponent.lineup.slots.map(slot => slot.role).sort()).toEqual([...roles].sort());
    expect(new Set(opponent.lineup.slots.map(slot => slot.cardId)).size).toBe(5);
    expect(opponent.lineup.slots.some(slot => slot.cardId === opponent.lineup.iglCardId)).toBe(true);
    opponent.lineup.slots.forEach(slot => expect(data.cards.find(card => card.id === slot.cardId)?.eligibleRoles).toContain(slot.role));
    expect(opponent.strength).toBe(lineupStrength(opponent.lineup, data));
  });

  test("excludes every exact user card ID", () => {
    const data = dataset(); const user = userLineup();
    const opponent = generateOpponent("exclude", "group", user, data);
    const used = new Set(user.slots.map(slot => slot.cardId));
    expect(opponent.lineup.slots.every(slot => !used.has(slot.cardId))).toBe(true);
  });

  test("allows an alternate event-year card for a user player", () => {
    const data = dataset([40]);
    const alternates = data.cards.map((card, index): PlayerCard => ({ ...card, id: `${card.id}-2024`, playerId: index === 0 ? card.playerId : `${card.playerId}-2024`, teamId: `${card.teamId}-2024`, year: 2024, traits: traits(80) }));
    data.cards = [...alternates, ...data.cards];
    data.teams = [...alternates.map(card => ({ id: card.teamId, name: card.teamId, shortName: card.teamId, year: 2024 as const, logo: null, sourceIds: ["source"] })), ...data.teams];
    data.players = [...alternates.slice(1).map(card => ({ id: card.playerId, canonicalHandle: card.playerId, portrait: null, sourceIds: ["source"] })), ...data.players];
    const user = userLineup();
    expect(generateOpponent("alternate", "final", user, data).lineup.slots.find(slot => slot.role === "smokes")?.cardId).toBe("smokes-40-2024");
  });

  test("uses deterministic bounded fallback when no valid lineup reaches the stage band", () => {
    const data = dataset([20, 24]); const user = userLineup();
    const first = generateOpponent("fallback", "final", user, data);
    expect(first).toEqual(generateOpponent("fallback", "final", user, data));
    expect(first.strength).toBeLessThan(74);
  });

  test("has strictly increasing average strength from groups through finals over deterministic seeds", () => {
    const data = dataset(); const user = userLineup();
    const stages = ["group", "quarterfinal", "semifinal", "final"] as const;
    const averages = stages.map(stage => Array.from({ length: 1_000 }, (_, seed) => generateOpponent(`trend-${seed}`, stage, user, data).strength).reduce((sum, value) => sum + value, 0) / 1_000);
    expect(averages[0]).toBeLessThan(averages[1]);
    expect(averages[1]).toBeLessThan(averages[2]);
    expect(averages[2]).toBeLessThan(averages[3]);
  });

  test("throws a useful deterministic error only when no valid lineup exists", () => {
    const data = dataset([60]);
    const user: Lineup = { slots: roles.map(role => ({ role, cardId: `${role}-60` })), iglCardId: "smokes-60" };
    expect(() => generateOpponent("impossible", "group", user, data)).toThrow(/no valid opponent lineup/i);
    expect(() => generateOpponent("impossible", "group", user, data)).toThrow(/no valid opponent lineup/i);
  });
});
