const source = { id: "source-1", url: "https://example.test/event", retrievedAt: "2026-09-04", usage: "facts" as const };
const teamNames = ["LOUD", "Fnatic", "PRX", "DRX", "Sentinels", "Paper Rex"] as const;
const teams = teamNames.map((name, index) => ({ id: `team-${index + 1}-2022`, name, shortName: name, year: 2022 as const, logo: null, sourceIds: [source.id] }));
const roles = [["smokes"], ["duelist"], ["initiator"], ["sentinel"], ["flex", "duelist"]] as const;
const players = Array.from({ length: 30 }, (_, index) => ({ id: `player-${index + 1}`, canonicalHandle: `player${index + 1}`, portrait: null, sourceIds: [source.id] }));
const cards = teams.flatMap((team, teamIndex) => Array.from({ length: 5 }, (_, slot) => {
  const index = teamIndex * 5 + slot;
  const playerId = index === 0 || index === 5 ? "aspas" : players[index].id;
  const eligibleRoles = teamIndex === 1 && slot === 0 ? ["duelist", "flex"] : [...roles[slot]];
  return { id: `${playerId}-${team.id}`, playerId, teamId: team.id, year: 2022 as const, displayHandle: playerId, mapsPlayed: 16, eligibleRoles, historicalIgl: slot === 0, traits: { firepower: 80, utility: 70, survival: 75, clutch: 70, consistency: 80, leadership: slot === 0 ? 80 : 40 }, sourceIds: [source.id] };
}));
export const minimalDataset = { version: 1, sources: [source], teams, players: [...players, { id: "aspas", canonicalHandle: "aspas", portrait: null, sourceIds: [source.id] }], cards };
