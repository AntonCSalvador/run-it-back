const source = { id: "source-1", url: "https://example.test/event", retrievedAt: "2026-09-04", usage: "facts" as const };
const teamNames = ["LOUD", "Fnatic", "PRX", "DRX", "Sentinels", "Paper Rex"] as const;
const teams = teamNames.map((name, index) => ({ id: `team-${index + 1}-${index === 1 ? 2021 : 2022}`, name, shortName: name, year: (index === 1 ? 2021 : 2022) as 2021 | 2022, logo: null, sourceIds: [source.id] }));
const roles = [["smokes"], ["duelist"], ["initiator"], ["sentinel"], ["flex", "duelist"]] as const;
const players = Array.from({ length: 30 }, (_, index) => index + 1).filter(index => index !== 1 && index !== 6).map(index => ({ id: `player-${index}`, canonicalHandle: `player${index}`, portrait: null, sourceIds: [source.id] }));
const cards = teams.flatMap((team, teamIndex) => Array.from({ length: 5 }, (_, slot) => {
  const index = teamIndex * 5 + slot;
  const playerId = index === 0 || index === 5 ? "aspas" : `player-${index + 1}`;
  const eligibleRoles = teamIndex === 1 && slot === 0 ? ["duelist", "flex"] : [...roles[slot]];
  const rating = 42 + teamIndex * 10;
  return { id: `${playerId}-${team.id}`, playerId, teamId: team.id, year: team.year, displayHandle: playerId, mapsPlayed: 16, eligibleRoles, historicalIgl: slot === 0, traits: { firepower: rating, utility: rating, survival: rating, clutch: rating, consistency: rating, leadership: rating }, sourceIds: [source.id] };
}));
export const minimalDataset = { version: 1, sources: [source], teams, players: [...players, { id: "aspas", canonicalHandle: "aspas", portrait: null, sourceIds: [source.id] }], cards };
