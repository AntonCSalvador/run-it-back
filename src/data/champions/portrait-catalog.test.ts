import { describe, expect, it } from "vitest";
import { applyPortraitCatalog, parsePortraitCatalog, validatePortraitCatalog } from "./portrait-catalog";

const player = { id: "player-1", canonicalHandle: "BeYN", portrait: null, sourceIds: ["fact"] };
const row = { playerId: "player-1", portrait: "/assets/players/player-1.abcdef123456.webp", sourceId: "liquipedia-portrait-1", sha256: "a".repeat(64) };
const source = { id: row.sourceId, url: "https://liquipedia.net/commons/File:BeYN.jpg", originalUrl: "https://www.flickr.com/photos/valorantesports/54347821048/", retrievedAt: "2026-09-08", usage: "asset" as const, credit: "Liu YiCun / Riot Games", license: "Riot Legal Jibber Jabber — noncommercial fan project" };

describe("portrait catalog", () => {
  it("overlays portrait and appends only its asset source", () => {
    expect(applyPortraitCatalog([player], [row])).toEqual([{ ...player, portrait: row.portrait, sourceIds: ["fact", row.sourceId] }]);
  });

  it("rejects duplicate, orphaned, remote, or incomplete records", () => {
    expect(() => validatePortraitCatalog([player], [row, row], [source])).toThrow(/duplicate player/);
    expect(() => validatePortraitCatalog([player], [{ ...row, playerId: "missing" }], [source])).toThrow(/orphan player/);
    expect(() => validatePortraitCatalog([player], [{ ...row, portrait: "https://example.test/a.webp" }], [source])).toThrow(/local asset/);
    expect(() => validatePortraitCatalog([player], [row], [{ ...source, credit: "" }])).toThrow(/credit/);
  });

  it("rejects mismatched numeric identities during catalog parsing", () => {
    expect(() => parsePortraitCatalog([{ ...row, portrait: "/assets/players/player-2.abcdef123456.webp", sourceId: "liquipedia-portrait-3" }])).toThrow(/identity mismatch/);
  });

  it("requires every portrait-prefixed source to be an asset catalog record", () => {
    expect(() => validatePortraitCatalog([player], [row], [{ ...source, usage: "facts" }])).toThrow(/usage asset/);
    expect(() => validatePortraitCatalog([player], [], [{ ...source, id: "liquipedia-portrait-2", usage: "facts" }])).toThrow(/usage asset/);
  });
});
