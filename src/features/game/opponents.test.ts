import { describe, expect, test } from "vitest";
import type { GameDataset, Lineup, PlayerCard, Role } from "./domain";
import { lineupStrength } from "./rating";
import { generateOpponent } from "./opponents";
import { minimalDataset } from "../../data/fixtures/minimal-dataset";
import { parseDataset } from "./schema";

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

function userLineup(data = dataset()): Lineup {
  const slots = roles.map(role => ({ role, cardId: data.cards.find(card => card.eligibleRoles.includes(role))!.id }));
  return { slots, iglCardId: slots[0].cardId };
}

describe("generateOpponent", () => {
  test("is deterministic for the same seed, stage, user lineup, and dataset", () => {
    const data = dataset(); const user = userLineup(data);
    expect(generateOpponent("repeatable", "quarterfinal", user, data)).toEqual(generateOpponent("repeatable", "quarterfinal", user, data));
  });

  test("validates the complete user lineup before excluding cards", () => {
    const data = dataset(); const valid = userLineup(data);
    const malformed: Lineup[] = [
      { ...valid, slots: valid.slots.slice(0, 4) },
      { ...valid, slots: [...valid.slots, { role: "flex", cardId: "flex-48" }] },
      { ...valid, slots: valid.slots.map(slot => slot.role === "flex" ? { ...slot, role: "duelist" } : slot) },
      { ...valid, slots: valid.slots.map(slot => slot.role === "flex" ? { ...slot, cardId: "smokes-40" } : slot) },
      { ...valid, slots: valid.slots.map(slot => slot.role === "smokes" ? { ...slot, cardId: "missing" } : slot) },
      { ...valid, slots: valid.slots.map(slot => slot.role === "smokes" ? { ...slot, cardId: "duelist-40" } : slot) },
      { ...valid, iglCardId: "initiator-48" },
    ];
    malformed.forEach(lineup => expect(() => generateOpponent("bad-user", "group", lineup, data)).toThrow(/lineup|role|card|IGL/i));
  });

  test("rejects a serialized invalid stage with a domain error", () => {
    const data = dataset();
    expect(() => generateOpponent("bad-stage", "playoffs" as never, userLineup(data), data)).toThrow(/invalid stage/i);
  });

  test("uses a stable opaque 16-hex-character ID with useful distinctions", () => {
    const data = dataset(); const user = userLineup(data);
    const same = generateOpponent("opaque", "group", user, data);
    expect(same.id).toMatch(/^opponent-group-[0-9a-f]{16}$/);
    expect(same.id).toBe(generateOpponent("opaque", "group", user, data).id);
    expect(same.id).not.toBe(generateOpponent("different", "group", user, data).id);
  });

  test("fills every official role once with distinct eligible cards and a lineup IGL", () => {
    const data = dataset();
    const opponent = generateOpponent("valid", "semifinal", userLineup(data), data);
    expect(opponent.lineup.slots.map(slot => slot.role).sort()).toEqual([...roles].sort());
    expect(new Set(opponent.lineup.slots.map(slot => slot.cardId)).size).toBe(5);
    expect(opponent.lineup.slots.some(slot => slot.cardId === opponent.lineup.iglCardId)).toBe(true);
    opponent.lineup.slots.forEach(slot => expect(data.cards.find(card => card.id === slot.cardId)?.eligibleRoles).toContain(slot.role));
    expect(opponent.strength).toBe(lineupStrength(opponent.lineup, data));
  });

  test("excludes every exact user card ID", () => {
    const data = dataset(); const user = userLineup(data);
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
    const user: Lineup = { slots: roles.map(role => ({ role, cardId: `${role}-40` })), iglCardId: "smokes-40" };
    expect(generateOpponent("alternate", "final", user, data).lineup.slots.find(slot => slot.role === "smokes")?.cardId).toBe("smokes-40-2024");
  });

  test("uses deterministic bounded fallback when no valid lineup reaches the stage band", () => {
    const data = dataset([20, 24]); const user = userLineup(data);
    const first = generateOpponent("fallback", "final", user, data);
    expect(first).toEqual(generateOpponent("fallback", "final", user, data));
    expect(first.strength).toBeLessThan(74);
  });

  test("has strictly increasing average strength from groups through finals over deterministic seeds", () => {
    const data = dataset(); const user = userLineup(data);
    const stages = ["group", "quarterfinal", "semifinal", "final"] as const;
    const averages = stages.map(stage => Array.from({ length: 1_000 }, (_, seed) => generateOpponent(`trend-${seed}`, stage, user, data).strength).reduce((sum, value) => sum + value, 0) / 1_000);
    expect(averages[0]).toBeLessThan(averages[1]);
    expect(averages[1]).toBeLessThan(averages[2]);
    expect(averages[2]).toBeLessThan(averages[3]);
  });

  test("scales stages on the shipped schema-valid fixture", () => {
    const data = parseDataset(minimalDataset);
    const user: Lineup = { slots: roles.map((role, index) => ({ role, cardId: data.cards[index].id })), iglCardId: data.cards[0].id };
    const stages = ["group", "quarterfinal", "semifinal", "final"] as const;
    const averages = stages.map(stage => Array.from({ length: 1_000 }, (_, seed) => generateOpponent(`fixture-${seed}`, stage, user, data).strength).reduce((sum, value) => sum + value, 0) / 1_000);
    expect(averages[0]).toBeLessThan(averages[1]);
    expect(averages[1]).toBeLessThan(averages[2]);
    expect(averages[2]).toBeLessThan(averages[3]);
  }, 15_000);

  test("chooses the highest-leadership IGL and deterministically breaks tied leaders", () => {
    const data = dataset([60, 64]); const user = userLineup(data);
    data.cards.forEach(card => { card.traits.leadership = card.id.endsWith("-64") ? 95 : 10; });
    const high = generateOpponent("leaders", "group", user, data);
    expect(data.cards.find(card => card.id === high.lineup.iglCardId)?.traits.leadership).toBe(95);
    data.cards.forEach(card => { card.traits.leadership = card.id.endsWith("-64") ? 95 : 10; });
    const tied = generateOpponent("leaders", "group", user, data);
    expect(tied).toEqual(generateOpponent("leaders", "group", user, data));
    expect(data.cards.find(card => card.id === tied.lineup.iglCardId)?.traits.leadership).toBe(95);
  });

  test("backtracks through a constrained multi-role pool instead of dead-ending greedily", () => {
    const data = dataset([40, 60]);
    const multi = data.cards.find(card => card.id === "smokes-60")!;
    const spare = { ...multi, id: "smokes-spare", playerId: "smokes-spare", eligibleRoles: ["smokes"] as Role[] };
    data.cards = data.cards.map(card => card.id === "smokes-60" ? { ...card, eligibleRoles: ["smokes", "duelist"] } : card.id === "duelist-60" ? { ...card, eligibleRoles: ["initiator"] } : card).concat(spare);
    data.players.push({ id: spare.playerId, canonicalHandle: spare.playerId, portrait: null, sourceIds: ["source"] });
    const user: Lineup = { slots: roles.map(role => ({ role, cardId: `${role}-40` })), iglCardId: "smokes-40" };
    const opponent = generateOpponent("backtrack", "group", user, data);
    expect(opponent.lineup.slots).toEqual(expect.arrayContaining([{ role: "smokes", cardId: "smokes-spare" }, { role: "duelist", cardId: "smokes-60" }]));
  });

  test("throws a useful deterministic error only when no valid lineup exists", () => {
    const data = dataset([60]);
    const user: Lineup = { slots: roles.map(role => ({ role, cardId: `${role}-60` })), iglCardId: "smokes-60" };
    expect(() => generateOpponent("impossible", "group", user, data)).toThrow(/no valid opponent lineup/i);
    expect(() => generateOpponent("impossible", "group", user, data)).toThrow(/no valid opponent lineup/i);
  });
});
