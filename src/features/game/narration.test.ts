import { describe, expect, test } from "vitest";
import { minimalDataset } from "../../data/fixtures/minimal-dataset";
import type { GameDataset, Lineup } from "./domain";
import { createHighlights, type Highlight, type HighlightKind } from "./narration";
import type { SeriesResult } from "./tournament";

const roles = ["smokes", "duelist", "initiator", "sentinel", "flex"] as const;
const dataset = minimalDataset as unknown as GameDataset;
const userLineup: Lineup = { slots: roles.map((role, index) => ({ role, cardId: minimalDataset.cards[index].id })), iglCardId: minimalDataset.cards[0].id };
const opponentLineup: Lineup = { slots: roles.map((role, index) => ({ role, cardId: minimalDataset.cards[index + 10].id })), iglCardId: minimalDataset.cards[10].id };
function map(map: "Ascent" | "Bind" | "Haven" | "Split" | "Icebox", winner: "user" | "opponent") {
  return winner === "user"
    ? { map, userScore: 13, opponentScore: 8, winner, probability: 0.6, roll: 0.2 }
    : { map, userScore: 8, opponentScore: 13, winner, probability: 0.4, roll: 0.8 };
}
function series(stage: "group" | "quarterfinal" | "semifinal" | "final", winners: Array<"user" | "opponent">): SeriesResult {
  const maps = winners.map((winner, index) => map((["Ascent", "Bind", "Haven", "Split", "Icebox"] as const)[index], winner));
  return { stage, bestOf: stage === "final" ? 5 : 3, userWins: winners.filter(winner => winner === "user").length, opponentWins: winners.filter(winner => winner === "opponent").length, maps };
}
const idsFor = (lineup: Lineup) => new Set(lineup.slots.map(slot => slot.cardId));
function expectedText(kind: HighlightKind, actor: string, target?: string): string {
  switch (kind) {
    case "ace": return `${actor} closes the simulated round with an ace.`;
    case "clutch": return `${actor} wins a simulated late-round clutch over ${target!}.`;
    case "ninja-defuse": return `${actor} slips in a simulated ninja defuse against ${target!}.`;
    case "retake": return `${actor} leads a simulated retake past ${target!}.`;
    case "eco": return `${actor} turns a simulated eco round against ${target!}.`;
    case "failed-clutch": return `${actor}'s simulated clutch attempt falls short against ${target!}.`;
    case "throw": return `${actor} lets a simulated advantage slip to ${target!}.`;
  }
}

describe("createHighlights", () => {
  test("returns no detailed highlights for group and quarterfinal series", () => {
    expect(createHighlights("seed", series("group", ["user", "user"]), userLineup, opponentLineup, dataset)).toEqual([]);
    expect(createHighlights("seed", series("quarterfinal", ["opponent", "opponent"]), userLineup, opponentLineup, dataset)).toEqual([]);
  });

  test("creates four to six highlights for every semifinal and final map in map order", () => {
    for (const input of [series("semifinal", ["user", "opponent", "user"]), series("final", ["opponent", "user", "opponent", "user", "opponent"])]) {
      const highlights = createHighlights("order", input, userLineup, opponentLineup, dataset);
      expect(highlights.length).toBeGreaterThanOrEqual(input.maps.length * 4);
      for (const [index, result] of input.maps.entries()) {
        const feed = highlights.filter(highlight => highlight.mapIndex === index);
        expect(feed.length).toBeGreaterThanOrEqual(4);
        expect(feed.length).toBeLessThanOrEqual(6);
        expect(feed.every(highlight => highlight.map === result.map)).toBe(true);
      }
      expect(highlights.map(highlight => highlight.mapIndex)).toEqual([...highlights.map(highlight => highlight.mapIndex)].sort((left, right) => left - right));
    }
  });

  test("uses exact templates and card-resolved participant handles despite overlapping names", () => {
    const textDataset = structuredClone(dataset); textDataset.cards.find(card => card.id === userLineup.slots[1].cardId)!.displayHandle = "player-1";
    textDataset.cards.find(card => card.id === userLineup.slots[2].cardId)!.displayHandle = "player-1";
    const textParticipants = new Map(textDataset.cards.map(card => [card.id, card.displayHandle]));
    const userIds = idsFor(userLineup); const opponentIds = idsFor(opponentLineup); const allowedIds = new Set([...userIds, ...opponentIds]);
    for (const highlight of createHighlights("participants", series("semifinal", ["user", "opponent", "user"]), userLineup, opponentLineup, textDataset)) {
      const actorIds = highlight.side === "user" ? userIds : opponentIds; const targetIds = highlight.side === "user" ? opponentIds : userIds;
      expect(actorIds.has(highlight.actorCardId)).toBe(true);
      expect(highlight.targetCardId === undefined || targetIds.has(highlight.targetCardId)).toBe(true);
      expect(highlight.targetCardId).not.toBe(highlight.actorCardId);
      expect(highlight.text).toBe(expectedText(highlight.kind, textParticipants.get(highlight.actorCardId)!, highlight.targetCardId ? textParticipants.get(highlight.targetCardId) : undefined));
      expect(allowedIds.has(highlight.actorCardId)).toBe(true);
    }
  });

  test("ends every map feed with a decisive winner-positive event", () => {
    const input = series("final", ["opponent", "user", "opponent", "user", "opponent"]);
    const positive = new Set<HighlightKind>(["ace", "clutch", "ninja-defuse", "retake", "eco"]);
    const highlights = createHighlights("finish", input, userLineup, opponentLineup, dataset);
    for (const [index, result] of input.maps.entries()) {
      const finalEvent = highlights.filter(highlight => highlight.mapIndex === index).at(-1)!;
      expect(finalEvent.side).toBe(result.winner);
      expect(finalEvent.emphasis).toBe("decisive");
      expect(positive.has(finalEvent.kind)).toBe(true);
    }
  });

  test("is exactly reproducible for the same seed, series, and lineups", () => {
    const input = series("semifinal", ["user", "opponent", "user"]);
    expect(createHighlights("repeatable", input, userLineup, opponentLineup, dataset)).toEqual(createHighlights("repeatable", input, userLineup, opponentLineup, dataset));
  });

  test("canonicalizes permuted lineup slots and freezes a readonly feed", () => {
    const input = series("semifinal", ["user", "opponent", "user"]);
    const feed: readonly Highlight[] = createHighlights("canonical", input, userLineup, opponentLineup, dataset);
    // @ts-expect-error highlights are immutable at the API boundary
    if (false) feed.push(feed[0]);
    expect(feed).toEqual(createHighlights("canonical", input, { ...userLineup, slots: [...userLineup.slots].reverse() }, { ...opponentLineup, slots: [...opponentLineup.slots].reverse() }, dataset));
    expect(Object.isFrozen(feed)).toBe(true); expect(feed.every(Object.isFrozen)).toBe(true);
    expect(() => (feed as unknown as Highlight[]).push(feed[0])).toThrow();
    expect(() => ((feed[0] as unknown as { text: string }).text = "changed")).toThrow();
  });

  test("uses collision-resistant opaque IDs unique across feeds and falls back for invalid weights", () => {
    const input = series("semifinal", ["user", "opponent", "user"]); const ids = new Set<string>();
    const alternateUser: Lineup = { slots: roles.map((role, index) => ({ role, cardId: dataset.cards[index + 15].id })), iglCardId: dataset.cards[15].id };
    const alternateOpponent: Lineup = { slots: roles.map((role, index) => ({ role, cardId: dataset.cards[index + 20].id })), iglCardId: dataset.cards[20].id };
    for (let index = 0; index < 80; index += 1) for (const highlight of createHighlights(`id-${index}`, input, index % 2 ? alternateUser : userLineup, index % 2 ? alternateOpponent : opponentLineup, dataset)) { expect(highlight.id).toMatch(/^hl-[0-9a-f]{32}$/); expect(ids.has(highlight.id)).toBe(false); ids.add(highlight.id); }
    const broken = structuredClone(dataset); for (const card of broken.cards) card.traits = { firepower: Number.NaN, utility: Number.NaN, survival: Number.NaN, clutch: Number.NaN, consistency: Number.NaN, leadership: Number.NaN };
    expect(createHighlights("fallback", input, userLineup, opponentLineup, broken).length).toBeGreaterThan(0);
  });

  test("pins a complete deterministic feed", () => {
    expect(createHighlights("golden-narration", series("semifinal", ["user", "opponent", "user"]), userLineup, opponentLineup, dataset)).toEqual([
      { id: "hl-1ac55fef8ab4500103c5b55bc5297619", kind: "clutch", actorCardId: "player-12-team-3-2022", targetCardId: "player-2-team-1-2022", side: "opponent", text: "player-12 wins a simulated late-round clutch over player-2.", emphasis: "clutch", map: "Ascent", mapIndex: 0 },
      { id: "hl-2131c4494604698f0370e49f1bd737af", kind: "retake", actorCardId: "player-14-team-3-2022", targetCardId: "player-2-team-1-2022", side: "opponent", text: "player-14 leads a simulated retake past player-2.", emphasis: "normal", map: "Ascent", mapIndex: 0 },
      { id: "hl-2c2d786d54f74e372a1633a5f505510f", kind: "eco", actorCardId: "player-2-team-1-2022", targetCardId: "player-14-team-3-2022", side: "user", text: "player-2 turns a simulated eco round against player-14.", emphasis: "normal", map: "Ascent", mapIndex: 0 },
      { id: "hl-a1950d8170f5277381e7a4eb332972f3", kind: "throw", actorCardId: "player-11-team-3-2022", targetCardId: "player-3-team-1-2022", side: "opponent", text: "player-11 lets a simulated advantage slip to player-3.", emphasis: "normal", map: "Ascent", mapIndex: 0 },
      { id: "hl-3255c32383b69ab1de98d9adb7e1f211", kind: "ace", actorCardId: "aspas-team-1-2022", side: "user", text: "aspas closes the simulated round with an ace.", emphasis: "decisive", map: "Ascent", mapIndex: 0 },
      { id: "hl-71fd3aa5ae3ffbd76a8ab067cf6aa4e7", kind: "ace", actorCardId: "player-14-team-3-2022", side: "opponent", text: "player-14 closes the simulated round with an ace.", emphasis: "normal", map: "Bind", mapIndex: 1 },
      { id: "hl-7f21cac08e8e022241142694d81afd0a", kind: "ace", actorCardId: "player-12-team-3-2022", side: "opponent", text: "player-12 closes the simulated round with an ace.", emphasis: "normal", map: "Bind", mapIndex: 1 },
      { id: "hl-79548a5f8b6a38f16aeb7247a3a3f8a9", kind: "clutch", actorCardId: "player-5-team-1-2022", targetCardId: "player-15-team-3-2022", side: "user", text: "player-5 wins a simulated late-round clutch over player-15.", emphasis: "clutch", map: "Bind", mapIndex: 1 },
      { id: "hl-a3931a77bfe62f45dc041e5f9ba0335d", kind: "ace", actorCardId: "player-12-team-3-2022", side: "opponent", text: "player-12 closes the simulated round with an ace.", emphasis: "decisive", map: "Bind", mapIndex: 1 },
      { id: "hl-b20f1aa3870f1ffd52b29a4be5c3c5f5", kind: "eco", actorCardId: "player-3-team-1-2022", targetCardId: "player-11-team-3-2022", side: "user", text: "player-3 turns a simulated eco round against player-11.", emphasis: "normal", map: "Haven", mapIndex: 2 },
      { id: "hl-b91d9c4fb0dbfb75dd9416d3b47ebc2d", kind: "clutch", actorCardId: "player-3-team-1-2022", targetCardId: "player-12-team-3-2022", side: "user", text: "player-3 wins a simulated late-round clutch over player-12.", emphasis: "clutch", map: "Haven", mapIndex: 2 },
      { id: "hl-14ee4944a80d69867c9b04dc3663fe9e", kind: "ninja-defuse", actorCardId: "player-4-team-1-2022", targetCardId: "player-11-team-3-2022", side: "user", text: "player-4 slips in a simulated ninja defuse against player-11.", emphasis: "normal", map: "Haven", mapIndex: 2 },
      { id: "hl-97876392c463cb7490a959d84b21d314", kind: "retake", actorCardId: "player-15-team-3-2022", targetCardId: "aspas-team-1-2022", side: "opponent", text: "player-15 leads a simulated retake past aspas.", emphasis: "normal", map: "Haven", mapIndex: 2 },
      { id: "hl-6a53aa6bcdcf92f12d7647cb083f8b99", kind: "ace", actorCardId: "player-4-team-1-2022", side: "user", text: "player-4 closes the simulated round with an ace.", emphasis: "decisive", map: "Haven", mapIndex: 2 },
    ]);
  });

  test("makes every eligible kind and both sides reachable across deterministic seeds", () => {
    const observed = new Map<HighlightKind, Set<"user" | "opponent">>();
    for (let index = 0; index < 500; index += 1) {
      for (const highlight of createHighlights(`coverage-${index}`, series("semifinal", ["user", "opponent", "user"]), userLineup, opponentLineup, dataset)) {
        const sides = observed.get(highlight.kind) ?? new Set<"user" | "opponent">();
        sides.add(highlight.side); observed.set(highlight.kind, sides);
      }
    }
    for (const kind of ["ace", "clutch", "ninja-defuse", "retake", "eco", "failed-clutch", "throw"] as const) expect(observed.get(kind)).toEqual(new Set(["user", "opponent"]));
  });

  test("rejects malformed detailed series and lineups before resolving participant text", () => {
    expect(() => createHighlights("bad", { ...series("semifinal", ["user", "user"]), maps: [{ ...map("Ascent", "user"), winner: "opponent" }] }, userLineup, opponentLineup, dataset)).toThrow();
    expect(() => createHighlights("bad", { ...series("semifinal", ["user", "user"]), maps: [{ ...map("Ascent", "user"), userScore: 1, opponentScore: 0 }, map("Bind", "user")] }, userLineup, opponentLineup, dataset)).toThrow();
    expect(() => createHighlights("bad", series("semifinal", ["user", "user"]), { ...userLineup, slots: [...userLineup.slots.slice(0, 4), { role: "flex", cardId: "not-a-card" }] }, opponentLineup, dataset)).toThrow();
  });
});
