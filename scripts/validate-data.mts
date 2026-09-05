import { resolve } from "node:path";
import { parseDataset } from "../src/features/game/schema";
import { championsDataset } from "../src/data/champions";
import evidence from "../src/data/champions/evidence.json";
import { validateChampions } from "../src/data/champions/validation";
import { validateAssetPath } from "../src/features/game/asset-validation";

const root = resolve(import.meta.dirname, "..");
const diagnostics: string[] = [];

function checkAsset(owner: string, asset: string | null) {
  if (asset === null) return;
  if (!asset.startsWith("/assets/") || asset.includes("\\") || asset.split("/").includes("..")) {
    diagnostics.push(`${owner} has invalid asset path "${asset}" (must begin /assets/ and contain no traversal)`); return;
  }
  const error = validateAssetPath(asset, root);
  if (error) diagnostics.push(`${owner} ${error}`);
}

{
  try {
    const dataset = parseDataset(championsDataset);
    validateChampions(dataset, evidence);
    for (const year of [2021, 2022, 2023, 2024, 2025]) {
      const count = dataset.teams.filter(team => team.year === year).length;
      if (count !== 16) diagnostics.push(`Year ${year} has ${count} team appearances; expected exactly 16`);
    }
    dataset.teams.forEach(team => checkAsset(`team ${team.id}`, team.logo));
    dataset.players.forEach(player => checkAsset(`player ${player.id}`, player.portrait));
    if (!diagnostics.length) {
      const clearedAssets = [...dataset.teams.map(team => team.logo), ...dataset.players.map(player => player.portrait)].filter(Boolean).length;
      const fallbacks = dataset.teams.length + dataset.players.length - clearedAssets;
      console.log(`Validated Champions dataset: 5 years, 80 team appearances, ${dataset.cards.length} cards, ${clearedAssets} cleared assets, ${fallbacks} fallbacks`);
    }
  } catch (error) { diagnostics.push(error instanceof Error ? error.message : String(error)); }
}

if (diagnostics.length) { console.error(diagnostics.join("\n")); process.exitCode = 1; }
