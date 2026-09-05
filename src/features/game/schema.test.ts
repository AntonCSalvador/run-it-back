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
  it("accepts the valid minimal dataset", () => expect(parseDataset(minimalDataset).cards).toHaveLength(1));
  it("rejects duplicate card ID", () => rejects(d => d.cards.push({ ...d.cards[0] }), "duplicate cards id"));
  it("rejects mapsPlayed 0", () => rejects(d => d.cards[0].mapsPlayed = 0, "mapsPlayed"));
  it("rejects empty eligible role list", () => rejects(d => d.cards[0].eligibleRoles = [], "eligibleRoles"));
  it("rejects rating outside 0..100", () => rejects(d => d.cards[0].traits.firepower = 101, "firepower"));
  it("rejects missing source ID", () => rejects(d => d.cards[0].sourceIds = ["missing"], "source ID"));
  it("rejects team/card wrong event year", () => rejects(d => d.cards[0].year = 2023, "year"));
});
