import type { GameDataset, PlayerCard, PlayerIdentity, TeamAppearance } from "./domain";
export function buildDatasetIndex(dataset: GameDataset) {
  return {
    teams: new Map<string, TeamAppearance>(dataset.teams.map(team => [team.id, team])),
    players: new Map<string, PlayerIdentity>(dataset.players.map(player => [player.id, player])),
    cards: new Map<string, PlayerCard>(dataset.cards.map(card => [card.id, card]))
  };
}
