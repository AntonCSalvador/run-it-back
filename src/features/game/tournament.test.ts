import { describe, expect, test } from "vitest";
import type { GameDataset, Lineup, PlayerCard, Role } from "./domain";
import { generateOpponent, type GeneratedOpponent, type Stage } from "./opponents";
import { lineupStrength } from "./rating";
import { advanceTournament, MAP_POOL, playCurrentSeries, playSeries, startTournament } from "./tournament";

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
});
