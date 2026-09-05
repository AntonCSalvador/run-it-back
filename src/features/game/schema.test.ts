import { describe, expect, it } from "vitest";
import { minimalDataset } from "@/data/fixtures/minimal-dataset";
import { parseDataset } from "./schema";

type MutableDataset = { cards: Array<{ id: string; mapsPlayed: number; eligibleRoles: string[]; traits: Record<string, number>; sourceIds: string[]; year: number }> };
const clone = () => structuredClone(minimalDataset) as unknown as MutableDataset;
const rejects = (mutate: (data: MutableDataset) => void, text: string) => {
  const data = clone(); mutate(data);
  expect(() => parseDataset(data)).toThrow(text);
};

describe("game dataset schema", () => {
  it("accepts the valid minimal dataset", () => {
    const parsed = parseDataset(minimalDataset);
    expect(parsed.teams).toHaveLength(6);
    expect(parsed.cards).toHaveLength(30);
  });
  it("rejects duplicate card ID", () => rejects(d => d.cards.push({ ...d.cards[0] }), "duplicate cards id"));
  it("rejects mapsPlayed 0", () => rejects(d => d.cards[0].mapsPlayed = 0, "mapsPlayed"));
  it("rejects empty eligible role list", () => rejects(d => d.cards[0].eligibleRoles = [], "eligibleRoles"));
  it("rejects rating outside 0..100", () => rejects(d => d.cards[0].traits.firepower = 101, "firepower"));
  it("rejects missing source ID", () => rejects(d => d.cards[0].sourceIds = ["missing"], "source ID"));
  it("rejects team/card wrong event year", () => rejects(d => d.cards[0].year = 2023, "year"));
  it("rejects unknown fields", () => rejects(d => Object.assign(d.cards[0], { unexpected: true }), "Unrecognized key"));
  it("rejects invalid role", () => rejects(d => d.cards[0].eligibleRoles = ["controller"], "Invalid option"));
  it("rejects missing player FK", () => rejects(d => Object.assign(d.cards[0], { playerId: "missing" }), "player ID"));
  it("rejects missing team FK", () => rejects(d => Object.assign(d.cards[0], { teamId: "missing" }), "team ID"));
  it("rejects duplicate source IDs", () => {
    const data = structuredClone(minimalDataset) as unknown as { sources: unknown[]; teams: unknown[]; players: unknown[] };
    data.sources.push(data.sources[0]);
    expect(() => parseDataset(data)).toThrow("duplicate sources id");
  });
  it("rejects duplicate team IDs", () => { const data = structuredClone(minimalDataset) as unknown as { teams: unknown[] }; data.teams.push(data.teams[0]); expect(() => parseDataset(data)).toThrow("duplicate teams id"); });
  it("rejects duplicate player IDs", () => { const data = structuredClone(minimalDataset) as unknown as { players: unknown[] }; data.players.push(data.players[0]); expect(() => parseDataset(data)).toThrow("duplicate players id"); });
});
