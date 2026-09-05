import { describe, expect, test } from "vitest";
import { minimalDataset } from "../../data/fixtures/minimal-dataset";
import { parseDataset } from "./schema";
import { ROLES, type GameDataset, type Role } from "./domain";
import { assignPendingCard, chooseCard, chooseTeam, createDraft, createOffer, isLineupReady, moveCard, rerollOffer, selectableCards, tagIgl, toLineup } from "./draft";

const dataset = parseDataset(minimalDataset) as GameDataset;
const choose = (state: ReturnType<typeof createDraft>, role: Role = "flex") => {
  state = chooseTeam(state, state.offeredTeamIds[0]);
  const card = selectableCards(state, dataset).find(candidate => candidate.eligibleRoles.includes(role));
  if (!card) throw new Error(`no card for ${role}`);
  return assignPendingCard(chooseCard(state, card.id, dataset), role, dataset);
};

describe("draft engine", () => {
  test("offers contain three distinct teams", () => {
    const state = createDraft("alpha", dataset);
    expect(new Set(state.offeredTeamIds).size).toBe(3);
  });
  test("same seed and offer index reproduce choices", () => {
    expect(createDraft("alpha", dataset)).toEqual(createDraft("alpha", dataset));
  });
  test("teams can appear in later offers", () => {
    const state = createDraft("alpha", dataset);
    const next = createOffer(state, dataset);
    expect(next.offeredTeamIds.some(id => state.offeredTeamIds.includes(id))).toBe(true);
  });
  test("reroll replaces offer and decrements from three", () => {
    const state = createDraft("alpha", dataset);
    const rerolled = rerollOffer(state, dataset);
    expect(rerolled.rerollsRemaining).toBe(2);
    expect(rerolled.offeredTeamIds).not.toEqual(state.offeredTeamIds);
  });
  test("fourth reroll throws exact error", () => {
    let state = createDraft("alpha", dataset);
    state = rerollOffer(state, dataset); state = rerollOffer(state, dataset); state = rerollOffer(state, dataset);
    expect(() => rerollOffer(state, dataset)).toThrow("No rerolls remaining");
  });
  test("exact card cannot be selected twice", () => {
    let state = chooseTeam(createDraft("alpha", dataset), createDraft("alpha", dataset).offeredTeamIds[0]);
    const card = selectableCards(state, dataset)[0];
    state = assignPendingCard(chooseCard(state, card.id, dataset), card.eligibleRoles[0], dataset);
    expect(() => chooseCard({ ...state, selectedTeamId: card.teamId }, card.id, dataset)).toThrow();
  });
  test("historical versions of one player can coexist", () => {
    const cards = dataset.cards.filter(c => c.playerId === "aspas");
    expect(cards.length).toBeGreaterThanOrEqual(2);
  });
  test("every offered team has a card for an open role", () => {
    const state = createDraft("alpha", dataset);
    for (const team of state.offeredTeamIds) expect(dataset.cards.some(c => c.teamId === team && c.eligibleRoles.some(r => !state.slots[r]))).toBe(true);
  });
  test("multi-role card moves between compatible slots", () => {
    let state = createDraft("alpha", dataset); state = chooseTeam(state, state.offeredTeamIds[0]);
    const card = selectableCards(state, dataset).find(c => c.eligibleRoles.length > 1)!;
    state = assignPendingCard(chooseCard(state, card.id, dataset), card.eligibleRoles[0], dataset);
    expect(moveCard(state, card.id, card.eligibleRoles[1], dataset).slots[card.eligibleRoles[1]]).toBe(card.id);
  });
  test("lineup is not ready until five roles and IGL", () => {
    const state = createDraft("alpha", dataset);
    expect(isLineupReady(state)).toBe(false);
    expect(() => toLineup(state)).toThrow();
  });
  test("any drafted card can receive IGL tag", () => {
    let state = chooseTeam(createDraft("alpha", dataset), createDraft("alpha", dataset).offeredTeamIds[0]);
    const card = selectableCards(state, dataset)[0];
    state = assignPendingCard(chooseCard(state, card.id, dataset), card.eligibleRoles[0], dataset);
    expect(tagIgl(state, card.id).iglCardId).toBe(card.id);
  });
  test("lineup uses fixed role order", () => {
    let state = createDraft("alpha", dataset);
    for (const role of ROLES) { state = choose(state, role); }
    state = tagIgl(state, state.slots.smokes!);
    expect(toLineup(state).slots.map(s => s.role)).toEqual([...ROLES]);
  });
});
