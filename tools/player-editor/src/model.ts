import {
  parseManualCatalog,
  type ManualPlayerCatalog,
  type ManualPlayerEntry,
} from "@/data/champions/manual-data";
import type { EditorCard, EditorFilters } from "./types";

export type DraftById = Record<string, ManualPlayerEntry>;

export const entriesById = (cards: ManualPlayerEntry[]): DraftById =>
  Object.fromEntries(cards.map(card => [card.cardId, structuredClone(card)]));

export const entryEqual = (left: ManualPlayerEntry, right: ManualPlayerEntry): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

export function changedCardIds(draft: DraftById, saved: DraftById): Set<string> {
  return new Set(Object.keys(saved).filter(id => !entryEqual(draft[id], saved[id])));
}

export function catalogFromDraft(draft: DraftById, orderedIds: string[]): ManualPlayerCatalog {
  return { version: 1, cards: orderedIds.map(id => structuredClone(draft[id])) };
}

export function validateDraft(draft: DraftById, orderedIds: string[]): Map<string, string> {
  const errors = new Map<string, string>();
  for (const id of orderedIds) {
    try {
      parseManualCatalog({ version: 1, cards: [draft[id]] }, [id]);
    } catch (error) {
      errors.set(id, error instanceof Error ? error.message : String(error));
    }
  }
  return errors;
}

export function undoEntry(id: string, _draft: DraftById, saved: DraftById): ManualPlayerEntry {
  return structuredClone(saved[id]);
}

export function resetEntryToDerived(card: EditorCard, draft: DraftById): ManualPlayerEntry {
  return {
    ...structuredClone(draft[card.generated.id]),
    eligibleRoles: [...card.generated.eligibleRoles],
    historicalIgl: card.generated.historicalIgl,
    traits: { ...card.generated.traits },
  };
}

export function filterCards(
  cards: EditorCard[],
  draft: DraftById,
  filters: EditorFilters,
  saved: DraftById,
): EditorCard[] {
  const query = filters.query.trim().toLowerCase();
  const changed = filters.review === "changed" ? changedCardIds(draft, saved) : new Set<string>();

  return cards.filter(card => {
    const id = card.generated.id;
    const entry = draft[id];
    if (!entry) return false;
    const searchable = [id, card.generated.displayHandle, card.team.name, card.team.shortName]
      .map(value => value.toLowerCase());
    const queryMatches = query.length === 0 || searchable.some(value => value.includes(query));
    const yearMatches = filters.year === "all" || card.generated.year === filters.year;
    const teamMatches = filters.teamId === "all" || card.generated.teamId === filters.teamId;
    const roleMatches = filters.role === "all" || entry.eligibleRoles.includes(filters.role);
    const reviewMatches = filters.review === "all"
      || (filters.review === "changed" ? changed.has(id) : filters.review === "reviewed" ? entry.reviewed : !entry.reviewed);
    return queryMatches && yearMatches && teamMatches && roleMatches && reviewMatches;
  });
}
