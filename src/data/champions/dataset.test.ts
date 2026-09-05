import { describe, expect, it } from "vitest";
import { championsDataset } from "./index";
import { ROLES } from "@/features/game/domain";

describe("Champions 2021–2025 dataset", () => {
  it("contains one complete, sourced sixteen-team event for each year", () => {
    const teamAppearances = new Set(championsDataset.teams.map(team => team.year));
    expect([...teamAppearances].sort()).toEqual([2021, 2022, 2023, 2024, 2025]);
    expect(championsDataset.teams).toHaveLength(80);
    for (const year of teamAppearances) {
      expect(championsDataset.teams.filter(team => team.year === year)).toHaveLength(16);
      expect(championsDataset.cards.filter(card => card.year === year).length).toBeGreaterThan(0);
      expect(new Set(championsDataset.cards.filter(card => card.year === year).flatMap(card => card.eligibleRoles))).toEqual(new Set(ROLES));
    }
  });

  it("only includes sourced maps-played cards tied to their event team", () => {
    const teams = new Map(championsDataset.teams.map(team => [team.id, team]));
    const sourceIds = new Set(championsDataset.sources.map(source => source.id));
    for (const card of championsDataset.cards) {
      expect(card.mapsPlayed).toBeGreaterThanOrEqual(1);
      expect(teams.get(card.teamId)?.year).toBe(card.year);
      expect(card.sourceIds.length).toBeGreaterThan(0);
      expect(card.sourceIds.every(sourceId => sourceIds.has(sourceId))).toBe(true);
    }
    expect(new Set(championsDataset.cards.map(card => card.id)).size).toBe(championsDataset.cards.length);
  });

  it("keeps TenZ historical event cards distinct and represents event-specific multi-role play", () => {
    const tenZ2021 = championsDataset.cards.find(card => card.id === "tenz-sentinels-2021");
    const tenZ2024 = championsDataset.cards.find(card => card.id === "tenz-sentinels-2024");
    expect(tenZ2021).toBeDefined();
    expect(tenZ2024).toBeDefined();
    expect(tenZ2021?.id).not.toBe(tenZ2024?.id);
    expect(championsDataset.cards.some(card => card.eligibleRoles.length > 1)).toBe(true);
  });

  it("leaves uncertain assets null and requires complete asset provenance when present", () => {
    const assetSources = new Map(championsDataset.sources.filter(source => source.usage === "asset").map(source => [source.id, source]));
    for (const item of [...championsDataset.teams, ...championsDataset.players]) {
      const asset = "logo" in item ? item.logo : item.portrait;
      if (asset === null) continue;
      const references = item.sourceIds.map(id => assetSources.get(id)).filter(Boolean);
      expect(references.length).toBeGreaterThan(0);
      expect(references.every(reference => reference?.credit && reference.license)).toBe(true);
    }
  });

  it("exports a deeply frozen snapshot", () => {
    expect(Object.isFrozen(championsDataset)).toBe(true);
    expect(Object.isFrozen(championsDataset.cards)).toBe(true);
    expect(Object.isFrozen(championsDataset.cards[0])).toBe(true);
    expect(Object.isFrozen(championsDataset.cards[0].traits)).toBe(true);
    expect(Object.isFrozen(championsDataset.teams[0].sourceIds)).toBe(true);
  });
});
