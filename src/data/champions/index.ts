import sourceRefs from "../sources.json";
import portraitAssets from "./portrait-assets.json";
import portraitSourceRefs from "./portrait-sources.json";
import year2021 from "./2021.json";
import year2022 from "./2022.json";
import year2023 from "./2023.json";
import year2024 from "./2024.json";
import year2025 from "./2025.json";
import { parseDataset } from "@/features/game/schema";
import type { GameDataset, PlayerIdentity } from "@/features/game/domain";
import { applyPortraitCatalog, parsePortraitCatalog, validatePortraitCatalog } from "./portrait-catalog";

const snapshots = [year2021, year2022, year2023, year2024, year2025];

function deduplicatePlayers(): PlayerIdentity[] {
  const players = new Map<string, PlayerIdentity>();
  for (const snapshot of snapshots) {
    for (const player of snapshot.players) {
      const current = players.get(player.id);
      if (!current) players.set(player.id, { ...player, sourceIds: [...player.sourceIds] });
      else current.sourceIds = [...new Set([...current.sourceIds, ...player.sourceIds])];
    }
  }
  return [...players.values()];
}

const deduplicatedPlayers = deduplicatePlayers();
const parsedPortraitAssets = parsePortraitCatalog(portraitAssets);
validatePortraitCatalog(deduplicatedPlayers, parsedPortraitAssets, portraitSourceRefs);

function freezeDataset(dataset: GameDataset): GameDataset {
  for (const source of dataset.sources) Object.freeze(source);
  for (const team of dataset.teams) { Object.freeze(team.sourceIds); Object.freeze(team); }
  for (const player of dataset.players) { Object.freeze(player.sourceIds); Object.freeze(player); }
  for (const card of dataset.cards) { Object.freeze(card.eligibleRoles); Object.freeze(card.sourceIds); Object.freeze(card.traits); Object.freeze(card); }
  Object.freeze(dataset.sources); Object.freeze(dataset.teams); Object.freeze(dataset.players); Object.freeze(dataset.cards);
  return Object.freeze(dataset);
}

export const championsDataset = freezeDataset(parseDataset({
  version: 1,
  sources: [...sourceRefs, ...portraitSourceRefs],
  teams: snapshots.flatMap(snapshot => snapshot.teams),
  players: applyPortraitCatalog(deduplicatedPlayers, parsedPortraitAssets),
  cards: snapshots.flatMap(snapshot => snapshot.cards),
}));

export const dataset = championsDataset;
export default championsDataset;
