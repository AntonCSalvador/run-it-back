import { writeFile } from "node:fs/promises";
import year2021 from "../src/data/champions/2021.json";
import year2022 from "../src/data/champions/2022.json";
import year2023 from "../src/data/champions/2023.json";
import year2024 from "../src/data/champions/2024.json";
import year2025 from "../src/data/champions/2025.json";
import { createInitialManualCatalog } from "../src/data/champions/manual-data";
import type { PlayerCard } from "../src/features/game/domain";

const snapshots = [year2021, year2022, year2023, year2024, year2025];
const catalog = createInitialManualCatalog(snapshots.flatMap(snapshot => snapshot.cards) as PlayerCard[]);
const outputUrl = new URL("../src/data/champions/manual-player-data.json", import.meta.url);

await writeFile(outputUrl, `${JSON.stringify(catalog, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
console.log(`Initialized ${catalog.cards.length} manual player cards.`);
