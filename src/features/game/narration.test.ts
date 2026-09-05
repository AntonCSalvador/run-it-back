import { describe, expect, test } from "vitest";
import { minimalDataset } from "../../data/fixtures/minimal-dataset";
import type { GameDataset, Lineup } from "./domain";
import { createHighlights, type HighlightKind } from "./narration";
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
const participants = new Map(dataset.cards.map(card => [card.id, card.displayHandle]));

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

  test("only resolves actors, targets, and handles from the two current lineups", () => {
    const allowedIds = new Set([...userLineup.slots, ...opponentLineup.slots].map(slot => slot.cardId));
    const allowedHandles = [...allowedIds].map(id => participants.get(id)!);
    for (const highlight of createHighlights("participants", series("semifinal", ["user", "opponent", "user"]), userLineup, opponentLineup, dataset)) {
      expect(allowedIds.has(highlight.actorCardId)).toBe(true);
      expect(highlight.targetCardId === undefined || allowedIds.has(highlight.targetCardId)).toBe(true);
      expect(highlight.targetCardId).not.toBe(highlight.actorCardId);
      for (const handle of [...highlight.text.matchAll(/\b(?:aspas|player\d+)\b/g)].map(match => match[0])) expect(allowedHandles).toContain(handle);
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
