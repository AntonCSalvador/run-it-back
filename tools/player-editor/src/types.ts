import type { ManualPlayerCatalog, ManualPlayerEntry } from "@/data/champions/manual-data";
import type { Evidence } from "@/data/champions/validation";
import type { PlayerCard, Role, TeamAppearance } from "@/features/game/domain";
import type { TRAIT_WEIGHTS } from "@/features/game/rating";

export interface EditorCard {
  generated: PlayerCard;
  manual: ManualPlayerEntry;
  evidence: Evidence;
  team: TeamAppearance;
}

export interface EditorDocument {
  revision: string;
  traitWeights: typeof TRAIT_WEIGHTS;
  cards: EditorCard[];
}

export interface SaveRequest {
  revision: string;
  catalog: ManualPlayerCatalog;
}

export interface SaveResponse {
  revision: string;
}

export type ReviewFilter = "all" | "needs-review" | "reviewed" | "changed";

export interface EditorFilters {
  query: string;
  year: "all" | number;
  teamId: "all" | string;
  role: "all" | Role;
  review: ReviewFilter;
}
