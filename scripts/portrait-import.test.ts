// @vitest-environment node
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";
import { CachedLiquipediaClient, buildPortraitOutputs } from "./portrait-import";

describe("portrait importer", () => {
  it("reuses cached JSON without a network request", async () => {
    const cache = mkdtempSync(join(tmpdir(), "portrait-cache-"));
    const url = "https://liquipedia.test/api?action=query";
    const client = new CachedLiquipediaClient({ cacheDir: cache, fetch: vi.fn(), wait: vi.fn(), userAgent: "RunItBack/Test" });
    writeFileSync(client.cachePath(url), JSON.stringify({ query: { pages: {} } }));
    await expect(client.json(url)).resolves.toEqual({ query: { pages: {} } });
    expect(client.fetch).not.toHaveBeenCalled();
  });

  it("waits two seconds between uncached API requests", async () => {
    const wait = vi.fn().mockResolvedValue(undefined);
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ query: { pages: {} } }) });
    const client = new CachedLiquipediaClient({ cacheDir: mkdtempSync(join(tmpdir(), "portrait-cache-")), fetch, wait, userAgent: "RunItBack/Test" });
    await client.json("https://liquipedia.test/one");
    await client.json("https://liquipedia.test/two");
    expect(wait).toHaveBeenCalledWith(2000);
  });

  it("keeps existing generated catalogs when discovery fails", async () => {
    const root = mkdtempSync(join(tmpdir(), "portrait-output-"));
    const catalog = join(root, "src", "data", "champions");
    mkdirSync(catalog, { recursive: true });
    const assets = join(catalog, "portrait-assets.json");
    const sources = join(catalog, "portrait-sources.json");
    writeFileSync(assets, "OLD-ASSETS");
    writeFileSync(sources, "OLD-SOURCES");
    await expect(buildPortraitOutputs({ root, players: [{ id: "player-1", canonicalHandle: "BeYN" }], discover: async () => { throw new Error("HTTP 429"); } })).rejects.toThrow("HTTP 429");
    expect(readFileSync(assets, "utf8")).toBe("OLD-ASSETS");
    expect(readFileSync(sources, "utf8")).toBe("OLD-SOURCES");
  });

  it("publishes staged portraits with sorted, matching catalogs", async () => {
    const root = mkdtempSync(join(tmpdir(), "portrait-output-"));
    const source = (id: string) => ({
      id: `liquipedia-portrait-${id}`,
      url: `https://liquipedia.net/commons/File:${id}.webp`,
      originalUrl: "https://example.test/original.jpg",
      retrievedAt: "2026-09-08",
      usage: "asset" as const,
      credit: "Photographer",
      license: "cc-by-sa-4.0",
    });
    await buildPortraitOutputs({
      root,
      players: [{ id: "player-2", canonicalHandle: "Two" }, { id: "player-1", canonicalHandle: "One" }],
      discover: async (player, stageDir) => {
        const checksum = player.id === "player-1" ? "a".repeat(64) : "b".repeat(64);
        const filename = `${player.id}.${checksum.slice(0, 12)}.webp`;
        writeFileSync(join(stageDir, filename), "webp");
        return {
          playerId: player.id,
          portrait: `/assets/players/${filename}`,
          sourceId: `liquipedia-portrait-${player.id.slice(7)}`,
          sha256: checksum,
          source: source(player.id.slice(7)),
        };
      },
    });
    const catalog = join(root, "src", "data", "champions");
    expect(JSON.parse(readFileSync(join(catalog, "portrait-assets.json"), "utf8"))).toMatchObject([{ playerId: "player-1" }, { playerId: "player-2" }]);
    expect(JSON.parse(readFileSync(join(catalog, "portrait-sources.json"), "utf8"))).toHaveLength(2);
    expect(readFileSync(join(root, "public", "assets", "players", `player-1.${"a".repeat(12)}.webp`), "utf8")).toBe("webp");
  });

  it("does not replace catalogs when a discovered portrait is absent from staging", async () => {
    const root = mkdtempSync(join(tmpdir(), "portrait-output-"));
    const catalog = join(root, "src", "data", "champions");
    mkdirSync(catalog, { recursive: true });
    const assets = join(catalog, "portrait-assets.json");
    const sources = join(catalog, "portrait-sources.json");
    writeFileSync(assets, "OLD-ASSETS");
    writeFileSync(sources, "OLD-SOURCES");
    await expect(buildPortraitOutputs({
      root,
      players: [{ id: "player-1", canonicalHandle: "One" }],
      discover: async () => ({
        playerId: "player-1",
        portrait: "/assets/players/player-1.aaaaaaaaaaaa.webp",
        sourceId: "liquipedia-portrait-1",
        sha256: "a".repeat(64),
        source: { id: "liquipedia-portrait-1", url: "https://liquipedia.net/commons/File:One.webp", originalUrl: "https://example.test/original.jpg", retrievedAt: "2026-09-08", usage: "asset", credit: "Photographer", license: "cc-by-sa-4.0" },
      }),
    })).rejects.toThrow("staged portrait is missing");
    expect(readFileSync(assets, "utf8")).toBe("OLD-ASSETS");
    expect(readFileSync(sources, "utf8")).toBe("OLD-SOURCES");
  });
});
