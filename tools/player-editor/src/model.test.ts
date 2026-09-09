import { describe, expect, it, vi } from "vitest";
import type { DraftById } from "./model";
import {
  changedCardIds,
  entriesById,
  filterCards,
  resetEntryToDerived,
  undoEntry,
  validateDraft,
} from "./model";
import { makeEditorDocument } from "./test-fixtures";

const cards = makeEditorDocument().cards;
const saved = entriesById(cards.map(card => card.manual));
const draft: DraftById = structuredClone(saved);

describe("player editor model", () => {
  it("searches handle, card ID, and team case-insensitively and combines filters", () => {
    expect(filterCards(cards, draft, { query: " fnAtIc ", year: 2023, teamId: "all", role: "smokes", review: "needs-review" }, saved))
      .toEqual([cards[0]]);
    expect(filterCards(cards, draft, { query: "2024 PLAYER", year: "all", teamId: "all", role: "all", review: "all" }, saved))
      .toEqual([cards[1]]);
    expect(filterCards(cards, draft, { query: "BOASTER-FNATIC-2023", year: "all", teamId: "all", role: "all", review: "all" }, saved))
      .toEqual([cards[0]]);
    expect(filterCards(cards, draft, { query: "2024-card-id", year: 2024, teamId: "example-2024", role: "initiator", review: "all" }, saved))
      .toEqual([cards[1]]);
    expect(filterCards(cards, draft, { query: "ex", year: "all", teamId: "example-2024", role: "initiator", review: "all" }, saved))
      .toEqual([cards[1]]);
  });

  it("finds changes and restores saved or derived values", () => {
    const edited: DraftById = structuredClone(draft);
    edited[cards[0].manual.cardId].traits.firepower = 99;
    edited[cards[0].manual.cardId].reviewed = true;
    expect(changedCardIds(edited, saved)).toEqual(new Set([cards[0].manual.cardId]));
    expect(filterCards(cards, edited, { query: "", year: "all", teamId: "all", role: "all", review: "changed" }, saved))
      .toEqual([cards[0]]);
    expect(undoEntry(cards[0].manual.cardId, edited, saved)).toEqual(saved[cards[0].manual.cardId]);
    expect(resetEntryToDerived(cards[0], edited)).toMatchObject({
      cardId: cards[0].generated.id,
      eligibleRoles: cards[0].generated.eligibleRoles,
      historicalIgl: cards[0].generated.historicalIgl,
      traits: cards[0].generated.traits,
      reviewed: true,
    });
  });

  it("reports invalid cards before save", () => {
    const edited: DraftById = structuredClone(draft);
    edited[cards[0].manual.cardId].eligibleRoles = [];
    edited[cards[1].manual.cardId].traits.leadership = 101;
    expect(validateDraft(edited, cards.map(card => card.generated.id))).toEqual(new Map([
      [cards[0].manual.cardId, expect.stringMatching(/role/i)],
      [cards[1].manual.cardId, expect.stringMatching(/leadership/i)],
    ]));
  });

  it("fails closed when a draft entry is missing", () => {
    const partialDraft: DraftById = structuredClone(draft);
    const missingId = cards[1].manual.cardId;
    Reflect.deleteProperty(partialDraft, missingId);

    expect(validateDraft(partialDraft, cards.map(card => card.generated.id))).toEqual(new Map([
      [missingId, expect.stringMatching(/invalid|card/i)],
    ]));
    expect(filterCards(cards, partialDraft, { query: "", year: "all", teamId: "all", role: "initiator", review: "all" }, saved))
      .toEqual([]);
    expect(filterCards(cards, partialDraft, { query: "", year: "all", teamId: "all", role: "all", review: "reviewed" }, saved))
      .toEqual([]);
  });

  it("matches identifiers with deterministic case folding", () => {
    const localeCard = structuredClone(cards[0]);
    localeCard.generated.id = "2023-card";
    localeCard.manual.cardId = "2023-card";
    const localeSaved = entriesById([localeCard.manual]);
    const localeDraft: DraftById = structuredClone(localeSaved);
    const original = String.prototype.toLocaleLowerCase;
    const localeLowerCase = vi.spyOn(String.prototype, "toLocaleLowerCase").mockImplementation(function (this: string) {
      return original.call(this, "tr");
    });
    try {
      expect(filterCards([localeCard], localeDraft, { query: "i", year: 2023, teamId: "all", role: "all", review: "all" }, localeSaved))
        .toEqual([localeCard]);
    } finally {
      localeLowerCase.mockRestore();
    }
  });
});
