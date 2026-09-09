import { championsDataset } from "../src/data/champions";
import { importPortraits } from "./portrait-import";
import { fileURLToPath } from "node:url";

await importPortraits({
  root: fileURLToPath(new URL("..", import.meta.url)),
  players: championsDataset.players.map(({ id, canonicalHandle }) => ({ id, canonicalHandle })),
  userAgent: "RunItBack/0.1 (https://github.com/AntonCSalvador/run-it-back; contact via GitHub issues)",
});
