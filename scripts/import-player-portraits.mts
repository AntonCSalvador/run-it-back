import { importPortraits, parsePortraitImportArgs } from "./portrait-import";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { parsePortraitOverrides } from "../src/data/champions/portrait-overrides";

try {
  const retrievalDate = parsePortraitImportArgs(process.argv.slice(2));
  const { championsDataset } = await import("../src/data/champions/index");
  const result = await importPortraits({
    root: fileURLToPath(new URL("..", import.meta.url)),
    players: championsDataset.players.map(({ id, canonicalHandle }) => ({ id, canonicalHandle })),
    userAgent: "RunItBack/0.1 (https://github.com/AntonCSalvador/run-it-back; contact via GitHub issues)",
    retrievalDate,
    overrides: parsePortraitOverrides(JSON.parse(readFileSync(new URL("../src/data/champions/portrait-overrides.json", import.meta.url), "utf8")), championsDataset.players),
  });
  if (!result.published) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
