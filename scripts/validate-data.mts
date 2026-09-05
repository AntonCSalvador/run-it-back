import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseDataset } from "../src/features/game/schema";
import { minimalDataset } from "../src/data/fixtures/minimal-dataset";
import { validateAssetPath } from "../src/features/game/asset-validation";

const root = resolve(import.meta.dirname, "..");
const mode = process.env.DATASET_MODE ?? "fixture";
const diagnostics: string[] = [];

async function loadDataset(): Promise<unknown> {
  if (mode === "fixture") return minimalDataset;
  if (mode !== "full") { diagnostics.push(`Unknown DATASET_MODE "${mode}" (expected fixture or full)`); return null; }
  const modulePath = resolve(root, "src/data/champions/index.ts");
  if (!existsSync(modulePath)) { diagnostics.push("Full dataset unavailable: src/data/champions/index.ts has not been added yet"); return null; }
  try {
    const loaded = await import(pathToFileURL(modulePath).href);
    const dataset = loaded.championsDataset ?? loaded.dataset ?? loaded.default;
    if (dataset === undefined) diagnostics.push("Full dataset module has no recognized export (expected championsDataset, dataset, or default)");
    return dataset;
  } catch (error) {
    diagnostics.push(`Unable to load full dataset module: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function checkAsset(owner: string, asset: string | null) {
  if (asset === null) return;
  if (!asset.startsWith("/assets/") || asset.includes("\\") || asset.split("/").includes("..")) {
    diagnostics.push(`${owner} has invalid asset path "${asset}" (must begin /assets/ and contain no traversal)`); return;
  }
  const error = validateAssetPath(asset, root);
  if (error) diagnostics.push(`${owner} ${error}`);
}

const raw = await loadDataset();
if (raw !== null) {
  try {
    const dataset = parseDataset(raw);
    if (mode === "full") {
      for (const year of [2021, 2022, 2023, 2024, 2025]) {
        const count = dataset.teams.filter(team => team.year === year).length;
        if (count !== 16) diagnostics.push(`Year ${year} has ${count} team appearances; expected exactly 16`);
      }
    }
    dataset.teams.forEach(team => checkAsset(`team ${team.id}`, team.logo));
    dataset.players.forEach(player => checkAsset(`player ${player.id}`, player.portrait));
    if (!diagnostics.length) console.log(`Validated ${mode} dataset: ${dataset.sources.length} source(s), ${dataset.teams.length} team(s), ${dataset.players.length} player(s), ${dataset.cards.length} card(s)`);
  } catch (error) { diagnostics.push(error instanceof Error ? error.message : String(error)); }
}

if (diagnostics.length) { console.error(diagnostics.join("\n")); process.exitCode = 1; }
