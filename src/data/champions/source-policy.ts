import type { SourceRef } from "@/features/game/domain";

// Independently reviewed catalog policy for the 2026-09-05 snapshot.
// Never import sources.json here: that application catalog is the input being checked.
// All twelve sources are factual references; credit/license must be absent.
const REVIEWED_SOURCES = Object.freeze([
  ["liquipedia-champions-2021", "https://liquipedia.net/valorant/VALORANT_Champions_Tour/2021/Champions"],
  ["liquipedia-champions-2022", "https://liquipedia.net/valorant/VCT/2022/Champions"],
  ["liquipedia-champions-2023", "https://liquipedia.net/valorant/VCT/2023/Champions"],
  ["liquipedia-champions-2024", "https://liquipedia.net/valorant/VCT/2024/Champions"],
  ["liquipedia-champions-2025", "https://liquipedia.net/valorant/VCT/2025/Champions"],
  ["riot-champions-2022", "https://valorantesports.com/en-US/news/valorant-champions-2022-everything-you-need-to-know"],
  ["riot-champions-2023", "https://valorantesports.com/en-GB/news/valorant-champions-2023-recap-evil-geniuses-end-their-roller-coaster-year-in-glory/"],
  ["riot-champions-2024", "https://valorantesports.com/es-MX/news/everything-you-need-to-know-champions-seoul"],
  ["riot-champions-2025", "https://playvalorant.com/en-us/news/esports/everything-you-need-to-know-champions-paris/"],
  ["vct-reference-dataset", "https://vct-reference.com/dataset"],
  ["liquipedia-champions-2021-player-information", "https://liquipedia.net/valorant/VALORANT_Champions_Tour/2021/Champions/Player_Information"],
  ["riot-vct-2023-awards", "https://valorantesports.com/en-US/news/valorant-champions-tour-2023-end-of-season-awards/"],
].map(([id, url]) => Object.freeze({ id, url, retrievedAt: "2026-09-05", usage: "facts" as const })));

export function validateSourceCatalog(sources: readonly SourceRef[]): void {
  if (sources.length !== REVIEWED_SOURCES.length || new Set(sources.map(source => source.id)).size !== REVIEWED_SOURCES.length) {
    throw new Error("source catalog cardinality: missing, extra, or duplicate records");
  }
  for (const expected of REVIEWED_SOURCES) {
    const source = sources.find(source => source.id === expected.id);
    // Compare own keys as well as values: omitted optional fields differ from present undefined.
    if (!source || Object.keys(source).sort().join() !== Object.keys(expected).sort().join()
      || Object.entries(expected).some(([key, value]) => source[key as keyof SourceRef] !== value)) {
      throw new Error(`source catalog metadata ${expected.id}`);
    }
  }
}
