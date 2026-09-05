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
const findOfferWithTeam = (state: ReturnType<typeof createDraft>, teamId: string) => {
  let next = state;
  for (let attempt = 0; attempt < 20 && !next.offeredTeamIds.includes(teamId); attempt += 1) next = createOffer(next, dataset);
  if (!next.offeredTeamIds.includes(teamId)) throw new Error(`team ${teamId} not offered`);
  return next;
};
const draftSpecific = (state: ReturnType<typeof createDraft>, teamId: string, cardId: string, role: Role) => {
  state = chooseTeam(state, teamId);
  return assignPendingCard(chooseCard(state, cardId, dataset), role, dataset);
};

describe("draft engine", () => {
  test("offers contain three distinct teams", () => {
    const state = createDraft("alpha", dataset);
    expect(state.offeredTeamIds).toHaveLength(3);
    expect(new Set(state.offeredTeamIds).size).toBe(3);
  });
  test("same seed and offer index reproduce choices", () => {
    const state = createOffer(createDraft("alpha", dataset), dataset);
    expect(state.offerIndex).toBeGreaterThan(1);
    expect(createOffer(state, dataset)).toEqual(createOffer({ ...state }, dataset));
  });
  test("teams can appear in later offers", () => {
    const initial = createDraft("alpha", dataset);
    const chosenTeam = initial.offeredTeamIds[0];
    const card = dataset.cards.find(candidate => candidate.teamId === chosenTeam)!;
    const afterDraft = draftSpecific(initial, chosenTeam, card.id, card.eligibleRoles[0]);
    const later = findOfferWithTeam(afterDraft, chosenTeam);
    expect(later.offeredTeamIds).toContain(chosenTeam);
    expect(dataset.cards.some(candidate => candidate.teamId === chosenTeam && !Object.values(later.slots).includes(candidate.id) && candidate.eligibleRoles.some(role => !later.slots[role]))).toBe(true);
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
    const [first, second] = dataset.cards.filter(c => c.playerId === "aspas");
    let state = findOfferWithTeam(createDraft("history", dataset), first.teamId);
    state = draftSpecific(state, first.teamId, first.id, "smokes");
    state = findOfferWithTeam(state, second.teamId);
    state = draftSpecific(state, second.teamId, second.id, "duelist");
    expect(Object.values(state.slots)).toEqual(expect.arrayContaining([first.id, second.id]));
  });
  test("every offered team has a card for an open role", () => {
    const initial = createDraft("alpha", dataset);
    const chosenTeam = initial.offeredTeamIds[0];
    const card = dataset.cards.find(candidate => candidate.teamId === chosenTeam)!;
    const state = draftSpecific(initial, chosenTeam, card.id, card.eligibleRoles[0]);
    for (const team of state.offeredTeamIds) expect(dataset.cards.some(c => c.teamId === team && !Object.values(state.slots).includes(c.id) && c.eligibleRoles.some(r => !state.slots[r]))).toBe(true);
  });
  test("multi-role card moves between compatible slots", () => {
    let state = createDraft("alpha", dataset); state = chooseTeam(state, state.offeredTeamIds[0]);
    const card = selectableCards(state, dataset).find(c => c.eligibleRoles.length > 1)!;
    state = assignPendingCard(chooseCard(state, card.id, dataset), card.eligibleRoles[0], dataset);
    expect(moveCard(state, card.id, card.eligibleRoles[1], dataset).slots[card.eligibleRoles[1]]).toBe(card.id);
  });
  test("lineup readiness requires all five roles and an IGL", () => {
    let four = createDraft("ready", dataset);
    for (const role of ROLES.slice(0, 4)) four = choose(four, role);
    expect(isLineupReady(four)).toBe(false);
    let five = choose(four, "flex");
    expect(isLineupReady(five)).toBe(false);
    five = tagIgl(five, five.slots.smokes!);
    expect(isLineupReady(five)).toBe(true);
    expect(toLineup(five).slots).toHaveLength(5);
  });
  test("any drafted card can receive IGL tag", () => {
    let state = createDraft("alpha", dataset);
    state = chooseTeam(state, state.offeredTeamIds[0]);
    const card = selectableCards(state, dataset).find(candidate => !candidate.historicalIgl)!;
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
