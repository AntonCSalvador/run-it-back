// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";
import { CachedLiquipediaClient, buildPortraitOutputs, formatPortraitImportSummary, importPortraits, LiquipediaRequestScheduler } from "./portrait-import";

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
        const checksum = createHash("sha256").update("webp").digest("hex");
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
    expect(readFileSync(join(root, "public", "assets", "players", `player-1.${createHash("sha256").update("webp").digest("hex").slice(0, 12)}.webp`), "utf8")).toBe("webp");
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

  it("uses one shared scheduler and gzip identity headers for JSON and binary requests", async () => {
    const scheduler = new LiquipediaRequestScheduler();
    const firstWait = vi.fn().mockResolvedValue(undefined);
    const secondWait = vi.fn().mockResolvedValue(undefined);
    const firstFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ query: { pages: {} } }) });
    const secondFetch = vi.fn().mockResolvedValue({ ok: true });
    const first = new CachedLiquipediaClient({ cacheDir: mkdtempSync(join(tmpdir(), "portrait-cache-")), fetch: firstFetch, wait: firstWait, userAgent: "RunItBack/Test", scheduler });
    const second = new CachedLiquipediaClient({ cacheDir: mkdtempSync(join(tmpdir(), "portrait-cache-")), fetch: secondFetch, wait: secondWait, userAgent: "RunItBack/Test", scheduler });
    await first.json("https://liquipedia.test/one");
    await second.request("https://liquipedia.test/portrait.webp");
    expect(secondWait).toHaveBeenCalledWith(2000);
    expect(secondFetch).toHaveBeenCalledWith("https://liquipedia.test/portrait.webp", expect.anything());
    const request = secondFetch.mock.calls[0][1] as RequestInit;
    expect(new Headers(request.headers).get("Accept-Encoding")).toBe("gzip");
    expect(new Headers(request.headers).get("User-Agent")).toBe("RunItBack/Test");
  });

  it("rejects a generated row whose path does not match its player and checksum", async () => {
    const root = mkdtempSync(join(tmpdir(), "portrait-output-"));
    const catalog = join(root, "src", "data", "champions");
    mkdirSync(catalog, { recursive: true });
    const assets = join(catalog, "portrait-assets.json");
    const sources = join(catalog, "portrait-sources.json");
    writeFileSync(assets, "OLD-ASSETS");
    writeFileSync(sources, "OLD-SOURCES");
    const checksum = "a".repeat(64);
    await expect(buildPortraitOutputs({
      root,
      players: [{ id: "player-1", canonicalHandle: "One" }],
      discover: async (_player, stageDir) => {
        writeFileSync(join(stageDir, `player-2.${checksum.slice(0, 12)}.webp`), "bytes");
        return {
          playerId: "player-1", portrait: `/assets/players/player-2.${checksum.slice(0, 12)}.webp`, sourceId: "liquipedia-portrait-1", sha256: checksum,
          source: { id: "liquipedia-portrait-1", url: "https://liquipedia.net/commons/File:One.webp", originalUrl: "https://example.test/original.jpg", retrievedAt: "2026-09-08", usage: "asset", credit: "Photographer", license: "cc-by-sa-4.0" },
        };
      },
    })).rejects.toThrow("portrait path");
    expect(readFileSync(assets, "utf8")).toBe("OLD-ASSETS");
    expect(readFileSync(sources, "utf8")).toBe("OLD-SOURCES");
  });

  it("rolls back previously published assets and catalogs when source publication fails", async () => {
    const root = mkdtempSync(join(tmpdir(), "portrait-output-"));
    const catalog = join(root, "src", "data", "champions");
    mkdirSync(catalog, { recursive: true });
    const assets = join(catalog, "portrait-assets.json");
    const sources = join(catalog, "portrait-sources.json");
    writeFileSync(assets, "OLD-ASSETS");
    mkdirSync(sources);
    writeFileSync(join(sources, "keep"), "OLD-SOURCES");
    const bytes = Buffer.from("webp");
    const checksum = createHash("sha256").update(bytes).digest("hex");
    await expect(buildPortraitOutputs({
      root,
      players: [{ id: "player-1", canonicalHandle: "One" }],
      discover: async (_player, stageDir) => {
        const filename = `player-1.${checksum.slice(0, 12)}.webp`;
        writeFileSync(join(stageDir, filename), bytes);
        return {
          playerId: "player-1", portrait: `/assets/players/${filename}`, sourceId: "liquipedia-portrait-1", sha256: checksum,
          source: { id: "liquipedia-portrait-1", url: "https://liquipedia.net/commons/File:One.webp", originalUrl: "https://example.test/original.jpg", retrievedAt: "2026-09-08", usage: "asset", credit: "Photographer", license: "cc-by-sa-4.0" },
        };
      },
    })).rejects.toThrow();
    expect(readFileSync(assets, "utf8")).toBe("OLD-ASSETS");
    expect(readFileSync(join(sources, "keep"), "utf8")).toBe("OLD-SOURCES");
    expect(existsSync(join(root, "public", "assets", "players", `player-1.${checksum.slice(0, 12)}.webp`))).toBe(false);
  });

  it("formats a complete traceable outcome summary", () => {
    expect(formatPortraitImportSummary([
      { playerId: "player-1", kind: "accepted" },
      { playerId: "player-2", kind: "missing" },
      { playerId: "player-3", kind: "rights-rejected" },
      { playerId: "player-4", kind: "ambiguous" },
    ], 4)).toBe("portrait import summary: accepted=1 missing=1 rights-rejected=1 ambiguous=1 total=4");
  });

  it("prints the final import summary from its per-player outcomes", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      await importPortraits({
        root: mkdtempSync(join(tmpdir(), "portrait-output-")),
        players: [{ id: "player-1", canonicalHandle: "One" }],
        userAgent: "RunItBack/Test",
        fetch: vi.fn().mockResolvedValue({ ok: true, json: async () => ({ query: { pages: {} } }) }),
        wait: vi.fn().mockResolvedValue(undefined),
        scheduler: new LiquipediaRequestScheduler(),
      });
      expect(log).toHaveBeenCalledWith("portrait import summary: accepted=0 missing=1 rights-rejected=0 ambiguous=0 total=1");
    } finally {
      log.mockRestore();
    }
  });
});
