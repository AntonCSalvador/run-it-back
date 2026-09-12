import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { parseDataset } from "../src/features/game/schema";
import { championsDataset } from "../src/data/champions";
import evidence from "../src/data/champions/evidence.json";
import { validateChampions, type Evidence } from "../src/data/champions/validation";
import { validateAssetPath } from "../src/features/game/asset-validation";
import portraitAssets from "../src/data/champions/portrait-assets.json";
import { parsePortraitCatalog } from "../src/data/champions/portrait-catalog";

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

type PortraitFileRow = { playerId: string; portrait: string; sha256: string };

export async function validatePortraitFiles(projectRoot: string, catalog: readonly PortraitFileRow[], expectedCount = 239): Promise<string[]> {
  const errors: string[] = [];
  const managedDirectory = resolve(projectRoot, "public", "assets", "players");
  const managedFiles = readdirSync(managedDirectory).filter(file => /^player-\d+\.[a-f0-9]{12}\.webp$/.test(file));
  const catalogFiles = catalog.map(asset => basename(asset.portrait));
  if (catalog.length !== expectedCount) errors.push(`portrait catalog has ${catalog.length} rows; expected ${expectedCount}`);
  if (managedFiles.length !== expectedCount) errors.push(`managed portrait directory has ${managedFiles.length} files; expected ${expectedCount}`);
  for (const file of catalogFiles.filter(file => !managedFiles.includes(file))) errors.push(`portrait catalog file missing ${file}`);
  for (const file of managedFiles.filter(file => !catalogFiles.includes(file))) errors.push(`orphan public portrait ${file}`);
  const rowDiagnostics = await Promise.all(catalog.map(async ({ playerId, portrait, sha256: expectedSha256 }) => {
    const rowErrors: string[] = [];
    const error = validateAssetPath(portrait, projectRoot);
    if (error) return [`portrait ${playerId} ${error}`];
    const file = resolve(projectRoot, "public", `.${portrait}`);
    const bytes = readFileSync(file);
    const checksum = createHash("sha256").update(bytes).digest("hex");
    if (checksum !== expectedSha256) rowErrors.push(`portrait ${playerId} checksum mismatch`);
    try {
      const metadata = await sharp(bytes, { failOn: "warning" }).metadata();
      if (metadata.format !== "webp" || metadata.width !== 256 || metadata.height !== 256) rowErrors.push(`portrait ${playerId} must be a 256x256 WebP`);
    } catch { rowErrors.push(`portrait ${playerId} must be a 256x256 WebP`); }
    return rowErrors;
  }));
  errors.push(...rowDiagnostics.flat());
  return errors;
}

async function main() {
  try {
    const dataset = parseDataset(championsDataset);
    validateChampions(dataset, evidence as Evidence[]);
    for (const year of [2021, 2022, 2023, 2024, 2025]) {
      const count = dataset.teams.filter(team => team.year === year).length;
      if (count !== 16) diagnostics.push(`Year ${year} has ${count} team appearances; expected exactly 16`);
    }
    dataset.teams.forEach(team => checkAsset(`team ${team.id}`, team.logo));
    dataset.players.forEach(player => checkAsset(`player ${player.id}`, player.portrait));
    const catalog = parsePortraitCatalog(portraitAssets);
    diagnostics.push(...await validatePortraitFiles(root, catalog));
    if (!diagnostics.length) {
      const clearedAssets = [...dataset.teams.map(team => team.logo), ...dataset.players.map(player => player.portrait)].filter(Boolean).length;
      const fallbacks = dataset.teams.length + dataset.players.length - clearedAssets;
      console.log(`Validated Champions dataset: 5 years, 80 team appearances, ${dataset.cards.length} cards, ${clearedAssets} cleared assets, ${fallbacks} fallbacks`);
    }
  } catch (error) { diagnostics.push(error instanceof Error ? error.message : String(error)); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
  if (diagnostics.length) { console.error(diagnostics.join("\n")); process.exitCode = 1; }
}
