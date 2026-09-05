export const minimalDataset = {
  version: 1,
  sources: [{ id: "source-1", url: "https://example.test/event", retrievedAt: "2026-09-04", usage: "facts" }],
  teams: [{ id: "loud-2022", name: "LOUD", shortName: "LOUD", year: 2022, logo: null, sourceIds: ["source-1"] }],
  players: [{ id: "aspas", canonicalHandle: "aspas", portrait: null, sourceIds: ["source-1"] }],
  cards: [{
    id: "aspas-loud-2022", playerId: "aspas", teamId: "loud-2022", year: 2022, displayHandle: "aspas",
    mapsPlayed: 16, eligibleRoles: ["duelist"], historicalIgl: false,
    traits: { firepower: 91, utility: 61, survival: 84, clutch: 87, consistency: 89, leadership: 35 }, sourceIds: ["source-1"]
  }]
} as const;
