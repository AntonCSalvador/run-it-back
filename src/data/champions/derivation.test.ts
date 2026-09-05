import { describe, expect, it } from "vitest";
import { deriveChampions, percentile, progression, type Overlays, type RawExtraction } from "./derivation";
import raw from "./raw-extraction.json";
import overlays from "./reviewed-overlays.json";

describe("Champions pure derivation", () => {
  it("uses midrank percentiles including self and ties", () => {
    expect(percentile(1, [1, 1, 3, 4])).toBe(25);
    expect(percentile(3, [1, 1, 3, 4])).toBe(62.5);
    expect(percentile(4, [1, 1, 3, 4])).toBe(87.5);
    expect(percentile(8, [8])).toBe(50);
  });

  it("pins Ade's complete raw inputs and exact derived traits", () => {
    const ade = deriveChampions(raw as RawExtraction, overlays as Overlays).find(row => row.id === "ade-crazy-raccoon-2021")!;
    expect(ade.performanceAvailableMaps).toBe(4);
    expect(ade.clutchWins).toBe(2);
    // Mean rating .56, mean ACS 101.75, population variance .00855.
    expect(ade.scores).toEqual({ firepower: 0.5420625, utility: 6.25, survival: -15.75, clutch: 0.5, consistency: -0.09246621 });
    expect(ade.traits).toEqual({ firepower: 3, utility: 48, survival: 23, clutch: 70, consistency: 98, leadership: 50 });
  });

  it("averages each non-Flex role percentile equally for a multi-role card", () => {
    const input: RawExtraction = { databaseSha256: "", teams: [], matches: [
      { year: 2021, matchId: "m", team0: 1, team1: 2, stage: "Group Stage", round: "Opening (A)", score0: 2, score1: 0 },
    ], cards: [1, 2, 0].map((rating, index) => ({ year: 2021, playerId: index, playerName: `p${index}`, teamId: 1, clutchWins: 0,
      maps: [0, 1, 2, 3].map(map => ["m", `${map}`, 0, index === 2 || (index === 0 && map >= 2) ? "jett" : "omen", true, rating, rating * 200, 5, 10]),
    })) };
    const review: Overlays = { teams: [{ databaseTeamId: 1, id: "team-2021", year: 2021, name: "Team", shortName: "T", sourceIds: ["source"] }], roleOverrides: [], leadership: [] };
    const cards = deriveChampions(input, review);
    expect(cards[0].eligibleRoles).toEqual(["smokes", "duelist", "flex"]);
    expect(cards.map(card => card.traits.firepower)).toEqual([50, 75, 25]);
    expect(cards.map(card => card.traits.consistency)).toEqual([50, 50, 50]);
  });

  it("makes only unavailable metrics neutral and excludes them from cohorts", () => {
    const input = structuredClone(raw) as RawExtraction;
    const ade = input.cards.find(row => row.year === 2021 && row.playerId === 1026)!;
    ade.maps[0][7] = null;
    let result = deriveChampions(input, overlays as Overlays).find(row => row.id === "ade-crazy-raccoon-2021")!;
    expect(result.scores.utility).toBeNull();
    expect(result.traits.utility).toBe(50);
    expect(result.traits.clutch).toBe(70);
    ade.maps[0][4] = false;
    result = deriveChampions(input, overlays as Overlays).find(row => row.id === "ade-crazy-raccoon-2021")!;
    expect(result.performanceAvailableMaps).toBe(3);
    expect(result.traits).toEqual({ firepower: 50, utility: 50, survival: 50, clutch: 50, consistency: 50, leadership: 50 });
  });

  it("derives bounded bracket progression from team membership, round, and final score", () => {
    const input = { cards: [], teams: [], databaseSha256: "", matches: [] } as RawExtraction;
    const match = { year: 2021, matchId: "test", team0: 1, team1: 2, stage: "Group Stage", round: "Opening (A)", score0: 3, score1: 1 };
    input.matches.push(match);
    expect(progression(input, 2021, 1)).toBe(0);
    match.stage = "Playoffs"; match.round = "Upper Quarterfinals";
    expect(progression(input, 2021, 1)).toBe(1);
    match.round = "Upper Semifinals";
    expect(progression(input, 2021, 1)).toBe(2);
    match.round = "Grand Final";
    expect(progression(input, 2021, 2)).toBe(3);
    expect(progression(input, 2021, 1)).toBe(4);
    expect(progression(input, 2022, 1)).toBe(0);
  });
});
