import { describe, expect, it } from "vitest";
import type { PlayerCard } from "@/features/game/domain";
import {
  applyManualCatalog,
  createInitialManualCatalog,
  parseManualCatalog,
} from "./manual-data";

const makeCard = (id: string): PlayerCard => ({
  id,
  playerId: `player-${id}`,
  teamId: "team-2025",
  year: 2025,
  displayHandle: id,
  mapsPlayed: 10,
  eligibleRoles: ["smokes"],
  historicalIgl: false,
  traits: {
    firepower: 10,
    utility: 20,
    survival: 30,
    clutch: 40,
    consistency: 50,
    leadership: 60,
  },
  sourceIds: ["source"],
});

const generated = [makeCard("alpha-team-2025"), makeCard("beta-team-2025")];

describe("manual player catalog", () => {
  it("creates a complete stable catalog from generated cards", () => {
    expect(createInitialManualCatalog([...generated].reverse())).toEqual({
      version: 1,
      cards: [
        {
          cardId: "alpha-team-2025",
          eligibleRoles: ["smokes"],
          historicalIgl: false,
          traits: generated[0].traits,
          reviewed: false,
        },
        {
          cardId: "beta-team-2025",
          eligibleRoles: ["smokes"],
          historicalIgl: false,
          traits: generated[1].traits,
          reviewed: false,
        },
      ],
    });
  });

  it("replaces only editable game fields", () => {
    const catalog = createInitialManualCatalog(generated);
    catalog.cards[0] = {
      ...catalog.cards[0],
      eligibleRoles: ["initiator", "flex"],
      historicalIgl: true,
      traits: { firepower: 91, utility: 81, survival: 71, clutch: 61, consistency: 51, leadership: 88 },
      reviewed: true,
    };
    const result = applyManualCatalog(generated, parseManualCatalog(catalog, generated.map(card => card.id)));
    expect(result[0]).toMatchObject({
      id: generated[0].id,
      playerId: generated[0].playerId,
      teamId: generated[0].teamId,
      year: generated[0].year,
      mapsPlayed: generated[0].mapsPlayed,
      sourceIds: generated[0].sourceIds,
      eligibleRoles: ["initiator", "flex"],
      historicalIgl: true,
      traits: catalog.cards[0].traits,
    });
    expect("reviewed" in result[0]).toBe(false);
  });

  it.each([
    ["missing card", (catalog: ReturnType<typeof createInitialManualCatalog>) => { catalog.cards.pop(); }],
    ["unknown card", (catalog: ReturnType<typeof createInitialManualCatalog>) => { catalog.cards[0].cardId = "unknown"; }],
    ["wrong order", (catalog: ReturnType<typeof createInitialManualCatalog>) => { catalog.cards.reverse(); }],
    ["duplicate role", (catalog: ReturnType<typeof createInitialManualCatalog>) => { catalog.cards[0].eligibleRoles = ["smokes", "smokes"]; }],
    ["empty roles", (catalog: ReturnType<typeof createInitialManualCatalog>) => { catalog.cards[0].eligibleRoles = []; }],
    ["fractional trait", (catalog: ReturnType<typeof createInitialManualCatalog>) => { catalog.cards[0].traits.firepower = 10.5; }],
    ["low trait", (catalog: ReturnType<typeof createInitialManualCatalog>) => { catalog.cards[0].traits.firepower = -1; }],
    ["high trait", (catalog: ReturnType<typeof createInitialManualCatalog>) => { catalog.cards[0].traits.firepower = 101; }],
  ])("rejects %s", (_, mutate) => {
    const catalog = createInitialManualCatalog(generated);
    mutate(catalog);
    expect(() => parseManualCatalog(catalog, generated.map(card => card.id))).toThrow(/manual player catalog/i);
  });
});
