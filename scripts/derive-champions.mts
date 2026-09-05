/** Deterministic mechanical regeneration; raw DB artifact and reviewed metadata remain untouched. */
import { readFileSync, writeFileSync } from "node:fs";
import { deriveChampions, type Overlays, type RawExtraction } from "../src/data/champions/derivation";
import raw from "../src/data/champions/raw-extraction.json";
import overlays from "../src/data/champions/reviewed-overlays.json";
import type { PlayerCard } from "../src/features/game/domain";

const root = new URL("../src/data/champions/", import.meta.url);
const derived = deriveChampions(raw as RawExtraction, overlays as Overlays);
const expected = new Map(derived.map(row => [row.id, row]));
for (const year of [2021, 2022, 2023, 2024, 2025]) {
  const path = new URL(`${year}.json`, root);
  const snapshot = JSON.parse(readFileSync(path, "utf8")) as { cards: PlayerCard[] };
  for (const card of snapshot.cards) {
    const row = expected.get(card.id);
    if (!row) throw new Error(`unknown card ${card.id}`);
    card.traits = row.traits;
    card.eligibleRoles = row.eligibleRoles;
    card.historicalIgl = row.historicalIgl;
    card.sourceIds = row.sourceIds;
  }
  writeFileSync(path, JSON.stringify(snapshot, null, 2) + "\n");
}
const evidence = derived.sort((a, b) => a.year - b.year || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map(row => ({
  cardId: row.id, year: row.year, mapsPlayed: row.mapsPlayed, agentClassMaps: row.agentClassMaps,
  threshold: row.threshold, suggestedRoles: row.suggestedRoles, finalEligibleRoles: row.eligibleRoles,
  override: row.override, sourceIds: row.sourceIds,
  clutchCoverageMaps: row.performanceAvailableMaps, clutchWins: row.clutchWins,
  clutchSourceIds: ["vct-reference-dataset"], performanceAvailableMaps: row.performanceAvailableMaps,
}));
writeFileSync(new URL("evidence.json", root), JSON.stringify(evidence, null, 2) + "\n");
console.log(`Derived ${derived.length} card roles, evidence rows, and all six traits`);
