import { describe, expect, test } from "vitest";
import type { GameDataset, Lineup, PlayerCard, Role } from "./domain";
import { type GeneratedOpponent, type Stage } from "./opponents";
import { lineupStrength } from "./rating";
import { advanceTournament, MAP_POOL, playCurrentSeries, playSeries, STAGE_ORDER, startTournament } from "./tournament";

const roles: readonly Role[] = ["smokes", "duelist", "initiator", "sentinel", "flex"];
const traits = (rating: number): PlayerCard["traits"] => ({ firepower: rating, utility: rating, survival: rating, clutch: rating, consistency: rating, leadership: rating });
function dataset(): GameDataset {
  const cards = roles.flatMap((role, roleIndex) => [45, 55, 65, 75, 85].map((rating, index) => ({ id: `${role}-${rating}`, playerId: `${role}-${rating}`, teamId: `t-${roleIndex}-${index}`, year: 2025 as const, displayHandle: `${role}-${rating}`, mapsPlayed: 1, eligibleRoles: [role], historicalIgl: false, traits: traits(rating), sourceIds: ["s"] })));
  return { version: 1, sources: [{ id: "s", url: "https://example.test", retrievedAt: "2025-01-01", usage: "facts" }], teams: cards.map(card => ({ id: card.teamId, name: card.teamId, shortName: card.teamId, year: 2025 as const, logo: null, sourceIds: ["s"] })), players: cards.map(card => ({ id: card.playerId, canonicalHandle: card.playerId, portrait: null, sourceIds: ["s"] })), cards };
}
function lineup(data: GameDataset, rating = 55): Lineup { const slots = roles.map(role => ({ role, cardId: `${role}-${rating}` })); return { slots, iglCardId: slots[0].cardId }; }
function opponent(data: GameDataset, stage: Stage, rating = 75): GeneratedOpponent { const selected = lineup(data, rating); return { id: `test-${stage}-${rating}`, stage, lineup: selected, strength: lineupStrength(selected, data) }; }

describe("tournament simulation", () => {
  test("uses unique map names within each series", () => {
    const data = dataset(); const result = playSeries("maps", "group", lineup(data), opponent(data, "group"), data);
    expect(result.maps).toHaveLength(result.userWins + result.opponentWins);
    expect(new Set(result.maps.map(map => map.map)).size).toBe(result.maps.length);
    expect(result.maps.every(map => MAP_POOL.includes(map.map))).toBe(true);
  });

  test("stops BO3 immediately when either side reaches two wins", () => {
    const data = dataset();
    for (const seed of ["bo3-a", "bo3-b", "bo3-c", "bo3-d"]) { const result = playSeries(seed, "group", lineup(data), opponent(data, "group"), data); expect(result.bestOf).toBe(3); expect(result.maps.length).toBeGreaterThanOrEqual(2); expect(result.maps.length).toBeLessThanOrEqual(3); expect(Math.max(result.userWins, result.opponentWins)).toBe(2); }
  });

  test("stops the final BO5 when either side reaches three wins", () => {
    const data = dataset(); const result = playSeries("bo5", "final", lineup(data), opponent(data, "final"), data);
    expect(result.bestOf).toBe(5); expect(result.maps.length).toBeGreaterThanOrEqual(3); expect(result.maps.length).toBeLessThanOrEqual(5); expect(Math.max(result.userWins, result.opponentWins)).toBe(3);
  });

  test("eliminates a run on a series loss and preserves the losing stage", () => {
    const data = dataset(); const user = lineup(data); const foe = opponent(data, "group", 85);
    const seed = Array.from({ length: 100 }, (_, index) => `loss-${index}`).find(candidate => playSeries(candidate, "group", user, foe, data).opponentWins === 2)!;
    const state = startTournament(seed, user); const played = playCurrentSeries(state, data, foe); const next = advanceTournament(played);
    expect(next.status).toBe("eliminated"); expect(next.currentStage).toBe("group"); expect(next.completedSeries).toHaveLength(1);
  });

  test("advances exact stages and crowns a final winner", () => {
    const data = dataset(); let state = startTournament("progress", lineup(data, 85));
    for (const stage of ["group", "quarterfinal", "semifinal"] as const) { state = advanceTournament(playCurrentSeries(state, data, opponent(data, stage, 45))); expect(state.status).toBe("active"); }
    expect(state.currentStage).toBe("final"); state = advanceTournament(playCurrentSeries(state, data, opponent(data, "final", 45)));
    expect(state.status).toBe("champion"); expect(state.completedSeries.map(series => series.stage)).toEqual(["group", "quarterfinal", "semifinal", "final"]);
  });

  test("records scores oriented to every map winner", () => {
    const data = dataset(); const result = playSeries("scores", "final", lineup(data), opponent(data, "final"), data);
    result.maps.forEach(map => expect(map.winner === "user" ? map.userScore > map.opponentScore : map.opponentScore > map.userScore).toBe(true));
  });

  test("uses regulation and deterministically reachable overtime scores", () => {
    const data = dataset(); let overtime = false; let regulation = false;
    for (let index = 0; index < 500 && !overtime; index += 1) for (const map of playSeries(`ot-${index}`, "group", lineup(data), opponent(data, "group", 55), data).maps) { overtime ||= ["14-12", "15-13", "16-14"].includes(`${Math.max(map.userScore, map.opponentScore)}-${Math.min(map.userScore, map.opponentScore)}`); regulation ||= Math.max(map.userScore, map.opponentScore) === 13 && map.userScore !== 12 && map.opponentScore !== 12; }
    expect(regulation).toBe(true); expect(overtime).toBe(true);
  });

  test("reproduces map names, probabilities, rolls, and scores for identical inputs", () => {
    const data = dataset(); const user = lineup(data); const foe = opponent(data, "semifinal"); expect(playSeries("repeat", "semifinal", user, foe, data)).toEqual(playSeries("repeat", "semifinal", user, foe, data));
  });

  test("rejects stage or opponent mismatches and terminal advances cleanly", () => {
    const data = dataset(); const state = startTournament("bad", lineup(data)); expect(() => playCurrentSeries(state, data, opponent(data, "quarterfinal"))).toThrow(/stage/i); expect(() => playSeries("bad", "group", lineup(data), opponent(data, "quarterfinal"), data)).toThrow(/stage/i); expect(() => advanceTournament({ ...state, status: "champion" })).toThrow(/terminal/i);
  });

  test("rejects corrupt opponent strength and invalid opponent lineups", () => {
    const data = dataset(); const foe = opponent(data, "group");
    expect(() => playSeries("bad-strength", "group", lineup(data), { ...foe, strength: Number.NaN }, data)).toThrow(/strength/i);
    expect(() => playSeries("bad-lineup", "group", lineup(data), { ...foe, lineup: { ...foe.lineup, slots: foe.lineup.slots.slice(0, 4) } }, data)).toThrow(/lineup/i);
  });

  test("rejects replayed, double-advanced, and terminal tournament states", () => {
    const data = dataset(); const user = lineup(data, 85); const foe = opponent(data, "group", 45); const seed = Array.from({ length: 100 }, (_, index) => `state-guards-${index}`).find(candidate => playSeries(candidate, "group", user, foe, data).userWins === 2)!; const state = startTournament(seed, user); const played = playCurrentSeries(state, data, foe);
    expect(() => playCurrentSeries(played, data, opponent(data, "group"))).toThrow(/resolved/i);
    const advanced = advanceTournament(played);
    expect(advanced).toMatchObject({ status: "active", currentStage: "quarterfinal" });
    expect(() => advanceTournament(advanced)).toThrow(/stage|current/i);
    expect(() => playCurrentSeries({ ...advanced, status: "champion" }, data, opponent(data, "quarterfinal"))).toThrow(/terminal/i);
  });

  test("rejects forged serialized series at the advancement boundary", () => {
    const data = dataset(); const played = playCurrentSeries(startTournament("forged", lineup(data)), data, opponent(data, "group")); const valid = played.completedSeries[0];
    const forged = (series: unknown) => ({ ...played, completedSeries: [series] } as never);
    expect(() => advanceTournament(forged({ ...valid, userWins: 0, opponentWins: 0 }))).toThrow(/series|wins/i);
    expect(() => advanceTournament(forged({ ...valid, stage: "final", bestOf: 5 }))).toThrow(/stage/i);
    expect(() => advanceTournament(forged({ ...valid, bestOf: 5 }))).toThrow(/best/i);
    expect(() => advanceTournament(forged({ ...valid, maps: valid.maps.slice(1) }))).toThrow(/maps|wins/i);
    expect(() => advanceTournament(forged({ ...valid, maps: [{ ...valid.maps[0], winner: valid.maps[0].winner === "user" ? "opponent" : "user" }, ...valid.maps.slice(1)] }))).toThrow(/wins|winner/i);
    expect(() => advanceTournament(forged({ ...valid, maps: [{ ...valid.maps[0], userScore: 13, opponentScore: 13 }, ...valid.maps.slice(1)] }))).toThrow(/score/i);
    expect(() => advanceTournament(forged({ ...valid, maps: [{ ...valid.maps[0], probability: 2 }, ...valid.maps.slice(1)] }))).toThrow(/probability/i);
    expect(() => advanceTournament(forged({ ...valid, maps: [{ ...valid.maps[0], roll: 1 }, ...valid.maps.slice(1)] }))).toThrow(/roll/i);
  });

  test("freezes stage order and deep tournament snapshots", () => {
    const data = dataset(); const user = lineup(data, 85); const foe = opponent(data, "group", 45); const seed = Array.from({ length: 100 }, (_, index) => `frozen-${index}`).find(candidate => playSeries(candidate, "group", user, foe, data).userWins === 2)!; const initial = startTournament(seed, user);
    expect(Object.isFrozen(STAGE_ORDER)).toBe(true); expect(() => ((STAGE_ORDER as unknown as Stage[])[0] = "final")).toThrow();
    expect(Object.isFrozen(initial)).toBe(true); expect(Object.isFrozen(initial.userLineup)).toBe(true); expect(Object.isFrozen(initial.userLineup.slots)).toBe(true);
    expect(() => ((initial.userLineup.slots as unknown as { cardId: string }[])[0].cardId = "changed")).toThrow();
    const played = playCurrentSeries(initial, data, foe);
    expect(Object.isFrozen(played.completedSeries)).toBe(true); expect(Object.isFrozen(played.completedSeries[0])).toBe(true); expect(Object.isFrozen(played.completedSeries[0].maps[0])).toBe(true);
    expect(() => ((played.completedSeries as unknown as unknown[]).push({}))).toThrow();
    expect(advanceTournament(played).currentStage).toBe("quarterfinal");
  });

  test("canonicalizes reordered lineup slots and disambiguates delimiter-bearing IDs", () => {
    const data = dataset(); const user = lineup(data); const foe = opponent(data, "group", 65);
    expect(playSeries("canonical", "group", user, foe, data)).toEqual(playSeries("canonical", "group", { ...user, slots: [...user.slots].reverse() }, { ...foe, lineup: { ...foe.lineup, slots: [...foe.lineup.slots].reverse() } }, data));
    const special = dataset(); const smoke = special.cards.find(card => card.id === "smokes-55")!; const duelist = special.cards.find(card => card.id === "duelist-55")!;
    special.cards.push({ ...smoke, id: "x" }, { ...smoke, id: "x,duelist:y" }, { ...duelist, id: "z" }, { ...duelist, id: "y,duelist:z" });
    const rest = roles.slice(2).map(role => ({ role, cardId: `${role}-55` })); const first: Lineup = { slots: [{ role: "smokes", cardId: "x,duelist:y" }, { role: "duelist", cardId: "z" }, ...rest], iglCardId: "x,duelist:y" }; const second: Lineup = { slots: [{ role: "smokes", cardId: "x" }, { role: "duelist", cardId: "y,duelist:z" }, ...rest], iglCardId: "x" };
    const specialFoe = opponent(special, "group", 75); const project = (value: ReturnType<typeof playSeries>) => value.maps.map(map => [map.map, map.roll, map.userScore, map.opponentScore]);
    expect(project(playSeries("delimiters", "group", first, specialFoe, special))).not.toEqual(project(playSeries("delimiters", "group", second, specialFoe, special)));
  });

  test("uses distinct RNG projections for different matchups and pins a golden result", () => {
    const data = dataset(); const user = lineup(data); const first = playSeries("golden", "group", user, opponent(data, "group", 65), data); const second = playSeries("golden", "group", user, opponent(data, "group", 75), data);
    const project = (value: ReturnType<typeof playSeries>) => value.maps.map(map => [map.map, map.roll, map.userScore, map.opponentScore]);
    expect(project(first)).not.toEqual(project(second));
    expect(first.maps).toEqual([
      { map: "Ascent", userScore: 7, opponentScore: 13, winner: "opponent", probability: 0.28905049737499594, roll: 0.4055811050347984 },
      { map: "Breeze", userScore: 6, opponentScore: 13, winner: "opponent", probability: 0.28905049737499594, roll: 0.4386219778098166 },
    ]);
  });
});
