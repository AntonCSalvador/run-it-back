// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { CachedLiquipediaClient, buildPortraitOutputs, discoverLiquipediaPortrait, formatPortraitImportSummary, importPortraits, LiquipediaRequestScheduler, type GeneratedPortrait, type PortraitOutcome } from "./portrait-import";

describe("portrait importer", () => {
  it("downloads the requested 512px MediaWiki thumbnail instead of the original", async () => {
    const stageDir = mkdtempSync(join(tmpdir(), "portrait-stage-"));
    const jpeg = await sharp({ create: { width: 512, height: 512, channels: 3, background: "#445566" } }).jpeg().toBuffer();
    const thumbnailUrl = "https://liquipedia.net/commons/images/thumb/512px-TenZ.jpg";
    const sourceUrl = "https://www.flickr.com/photos/valorantesports/123/";
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ query: { pages: { "1": { images: [{ title: "File:TenZ.jpg" }] } } } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ query: { pages: { "2": {
        title: "File:TenZ.jpg",
        revisions: [{ slots: { main: { "*": `{{FileInfo|featured=TenZ|date=2024-03-01|license=permission|author=VCT Photo Team|copyright=Riot Games|source=${sourceUrl}}}` } } }],
        imageinfo: [{ url: "https://liquipedia.net/commons/images/original.jpg", thumburl: thumbnailUrl }],
      } } } })))
      .mockResolvedValueOnce(new Response(new Uint8Array(jpeg)));
    const client = new CachedLiquipediaClient({
      cacheDir: mkdtempSync(join(tmpdir(), "portrait-cache-")), fetch,
      wait: vi.fn().mockResolvedValue(undefined), scheduler: new LiquipediaRequestScheduler(), userAgent: "RunItBack/Test",
    });
    const outcomes: PortraitOutcome[] = [];
    const result = await discoverLiquipediaPortrait({ id: "player-9", canonicalHandle: "TenZ" }, stageDir, client, outcome => outcomes.push(outcome));
    expect(result).not.toBeNull();
    expect(fetch.mock.calls[2][0]).toBe(thumbnailUrl);
    expect(new URL(fetch.mock.calls[1][0]).searchParams.get("iiurlwidth")).toBe("512");
    expect(result?.source).toMatchObject({ originalUrl: sourceUrl, url: "https://liquipedia.net/commons/File:TenZ.jpg" });
    expect(outcomes).toEqual([{ playerId: "player-9", kind: "accepted" }]);
  });

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
    const fetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ query: { pages: {} } })));
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
    const firstFetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ query: { pages: {} } })));
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

  it.each([
    ["an extra source key", (source: Record<string, unknown>) => { source.injected = "unexpected"; }],
    ["a non-enumerable source key", (source: Record<string, unknown>) => { Object.defineProperty(source, "hidden", { value: "unexpected" }); }],
    ["a non-HTTPS description URL", (source: Record<string, unknown>) => { source.url = "http://liquipedia.net/commons/File:One.webp"; }],
    ["a non-HTTPS original URL", (source: Record<string, unknown>) => { source.originalUrl = "http://example.test/original.jpg"; }],
    ["an impossible retrieval date", (source: Record<string, unknown>) => { source.retrievedAt = "2026-02-30"; }],
    ["a non-asset usage", (source: Record<string, unknown>) => { source.usage = "facts"; }],
    ["blank credit", (source: Record<string, unknown>) => { source.credit = " "; }],
    ["blank license", (source: Record<string, unknown>) => { source.license = ""; }],
    ["a mismatched source id", (source: Record<string, unknown>) => { source.id = "liquipedia-portrait-2"; }],
  ])("rejects %s before replacing generated outputs", async (_label, mutate) => {
    const root = mkdtempSync(join(tmpdir(), "portrait-output-"));
    const catalog = join(root, "src", "data", "champions");
    mkdirSync(catalog, { recursive: true });
    const assets = join(catalog, "portrait-assets.json");
    const sources = join(catalog, "portrait-sources.json");
    writeFileSync(assets, "OLD-ASSETS");
    writeFileSync(sources, "OLD-SOURCES");
    const bytes = Buffer.from("webp");
    const checksum = createHash("sha256").update(bytes).digest("hex");
    await expect(buildPortraitOutputs({
      root,
      players: [{ id: "player-1", canonicalHandle: "One" }],
      discover: async (_player, stageDir) => {
        const filename = `player-1.${checksum.slice(0, 12)}.webp`;
        writeFileSync(join(stageDir, filename), bytes);
        const source: GeneratedPortrait["source"] & Record<string, unknown> = {
          id: "liquipedia-portrait-1", url: "https://liquipedia.net/commons/File:One.webp", originalUrl: "https://example.test/original.jpg", retrievedAt: "2026-09-08", usage: "asset", credit: "Photographer", license: "cc-by-sa-4.0",
        };
        mutate(source);
        return { playerId: "player-1", portrait: `/assets/players/${filename}`, sourceId: "liquipedia-portrait-1", sha256: checksum, source };
      },
    })).rejects.toThrow("invalid portrait source");
    expect(readFileSync(assets, "utf8")).toBe("OLD-ASSETS");
    expect(readFileSync(sources, "utf8")).toBe("OLD-SOURCES");
    expect(existsSync(join(root, "public", "assets", "players", `player-1.${checksum.slice(0, 12)}.webp`))).toBe(false);
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
    const oldPortrait = join(root, "public", "assets", "players", "player-2.aaaaaaaaaaaa.webp");
    mkdirSync(join(root, "public", "assets", "players"), { recursive: true });
    writeFileSync(oldPortrait, "old");
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
    expect(readFileSync(oldPortrait, "utf8")).toBe("old");
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
        fetch: vi.fn().mockImplementation(async () => new Response(JSON.stringify({ query: { pages: {} } }))),
        wait: vi.fn().mockResolvedValue(undefined),
        scheduler: new LiquipediaRequestScheduler(),
      });
      expect(log).toHaveBeenCalledWith("portrait import summary: accepted=0 missing=1 rights-rejected=0 ambiguous=0 total=1");
    } finally {
      log.mockRestore();
    }
  });

  it("removes obsolete managed portraits while preserving unrelated player files", async () => {
    const root = mkdtempSync(join(tmpdir(), "portrait-output-"));
    const playersDirectory = join(root, "public", "assets", "players");
    mkdirSync(playersDirectory, { recursive: true });
    writeFileSync(join(playersDirectory, "player-1.aaaaaaaaaaaa.webp"), "old");
    writeFileSync(join(playersDirectory, "readme.txt"), "keep");
    await buildPortraitOutputs({ root, players: [{ id: "player-1", canonicalHandle: "One" }], discover: async () => null });
    expect(existsSync(join(playersDirectory, "player-1.aaaaaaaaaaaa.webp"))).toBe(false);
    expect(readFileSync(join(playersDirectory, "readme.txt"), "utf8")).toBe("keep");
  });

  it("coalesces concurrent JSON cache misses", async () => {
    const fetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ query: { pages: {} } })));
    const client = new CachedLiquipediaClient({ cacheDir: mkdtempSync(join(tmpdir(), "portrait-cache-")), fetch, wait: vi.fn().mockResolvedValue(undefined), userAgent: "RunItBack/Test", scheduler: new LiquipediaRequestScheduler() });
    await Promise.all([client.json("https://liquipedia.test/one"), client.json("https://liquipedia.test/one")]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects oversized JSON before parsing or caching", async () => {
    const cache = mkdtempSync(join(tmpdir(), "portrait-cache-"));
    const client = new CachedLiquipediaClient({ cacheDir: cache, fetch: vi.fn().mockResolvedValue(new Response("{}", { headers: { "content-length": "100" } })), wait: vi.fn().mockResolvedValue(undefined), userAgent: "RunItBack/Test", scheduler: new LiquipediaRequestScheduler(), jsonMaxBytes: 16 });
    const url = "https://liquipedia.test/oversized";
    await expect(client.json(url)).rejects.toThrow("JSON response exceeds");
    expect(existsSync(client.cachePath(url))).toBe(false);
  });

  it("rejects streamed oversized and malformed JSON without caching either", async () => {
    const cache = mkdtempSync(join(tmpdir(), "portrait-cache-"));
    const streamed = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(32)); controller.close(); } });
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(streamed))
      .mockResolvedValueOnce(new Response("not-json"));
    const client = new CachedLiquipediaClient({ cacheDir: cache, fetch, wait: vi.fn().mockResolvedValue(undefined), userAgent: "RunItBack/Test", scheduler: new LiquipediaRequestScheduler(), jsonMaxBytes: 16 });
    await expect(client.json("https://liquipedia.test/streamed")).rejects.toThrow("JSON response exceeds");
    await expect(client.json("https://liquipedia.test/malformed")).rejects.toThrow();
    expect(existsSync(client.cachePath("https://liquipedia.test/streamed"))).toBe(false);
    expect(existsSync(client.cachePath("https://liquipedia.test/malformed"))).toBe(false);
  });

  it("rejects an unapproved media URL before fetching", async () => {
    const fetch = vi.fn();
    const client = new CachedLiquipediaClient({ cacheDir: mkdtempSync(join(tmpdir(), "portrait-cache-")), fetch, wait: vi.fn().mockResolvedValue(undefined), userAgent: "RunItBack/Test", scheduler: new LiquipediaRequestScheduler() });
    await expect(client.media("https://example.test/image.webp")).rejects.toThrow("unapproved Liquipedia media URL");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects an unapproved media redirect before a second request", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: "https://example.test/image.webp" } }));
    const client = new CachedLiquipediaClient({ cacheDir: mkdtempSync(join(tmpdir(), "portrait-cache-")), fetch, wait: vi.fn().mockResolvedValue(undefined), userAgent: "RunItBack/Test", scheduler: new LiquipediaRequestScheduler() });
    await expect(client.media("https://liquipedia.net/commons/images/test.webp")).rejects.toThrow("unapproved Liquipedia media URL");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("aborts a stalled request without blocking the scheduler", async () => {
    const fetch = vi.fn().mockImplementation((_url, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
    }));
    const client = new CachedLiquipediaClient({ cacheDir: mkdtempSync(join(tmpdir(), "portrait-cache-")), fetch, wait: vi.fn().mockResolvedValue(undefined), userAgent: "RunItBack/Test", scheduler: new LiquipediaRequestScheduler(), timeoutMs: 5 });
    const result = await Promise.race([client.request("https://liquipedia.test/stalled").then(() => "resolved", error => error.message), new Promise(resolve => setTimeout(() => resolve("still-stalled"), 100))]);
    expect(result).toBe("Liquipedia request timed out");
  });

  it("records corrupt selected images as missing and continues the import", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetch = vi.fn().mockImplementation(async (value: string) => {
      const url = new URL(value);
      if (url.pathname.endsWith("/valorant/api.php")) {
        const handle = url.searchParams.get("titles")!;
        return new Response(JSON.stringify({ query: { pages: { 1: { images: [{ title: `File:${handle}.jpg` }] } } } }));
      }
      if (url.pathname.endsWith("/commons/api.php")) {
        const handle = url.searchParams.get("titles")!.match(/^File:(.+)\.jpg$/)![1];
        const wikitext = `{{FileInfo|featured=${handle}|date=2026-01-01|license=cc-by-sa-4.0|author=Author|copyright=Author|source=https://example.test/original.jpg}}`;
        return new Response(JSON.stringify({ query: { pages: { 1: { title: `File:${handle}.jpg`, revisions: [{ slots: { main: { "*": wikitext } } }], imageinfo: [{ url: `https://liquipedia.net/commons/images/a/a/${handle}.jpg` }] } } } }));
      }
      return new Response("unsupported image bytes");
    });
    try {
      await importPortraits({
        root: mkdtempSync(join(tmpdir(), "portrait-output-")),
        players: [{ id: "player-1", canonicalHandle: "One" }, { id: "player-2", canonicalHandle: "Two" }],
        userAgent: "RunItBack/Test", fetch, wait: vi.fn().mockResolvedValue(undefined), scheduler: new LiquipediaRequestScheduler(),
      });
      expect(log).toHaveBeenCalledWith("portrait import summary: accepted=0 missing=2 rights-rejected=0 ambiguous=0 total=2");
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("unsupported-image"));
    } finally { log.mockRestore(); warn.mockRestore(); }
  });

  it("treats every converter failure as an unsupported-image fallback", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetch = vi.fn().mockImplementation(async (value: string) => {
      const url = new URL(value);
      if (url.pathname.endsWith("/valorant/api.php")) return new Response(JSON.stringify({ query: { pages: { 1: { images: [{ title: "File:One.jpg" }] } } } }));
      if (url.pathname.endsWith("/commons/api.php")) return new Response(JSON.stringify({ query: { pages: { 1: { title: "File:One.jpg", revisions: [{ slots: { main: { "*": "{{FileInfo|featured=One|date=2026-01-01|license=cc-by-sa-4.0|author=Author|copyright=Author|source=https://example.test/original.jpg}}" } } }], imageinfo: [{ url: "https://liquipedia.net/commons/images/a/a/One.jpg" }] } } } }));
      return new Response("corrupt image");
    });
    try {
      await importPortraits({ root: mkdtempSync(join(tmpdir(), "portrait-output-")), players: [{ id: "player-1", canonicalHandle: "One" }], userAgent: "RunItBack/Test", fetch, wait: vi.fn().mockResolvedValue(undefined), scheduler: new LiquipediaRequestScheduler(), converter: async () => { throw new Error("converter exploded"); } });
      expect(log).toHaveBeenCalledWith("portrait import summary: accepted=0 missing=1 rights-rejected=0 ambiguous=0 total=1");
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("unsupported-image"));
    } finally { log.mockRestore(); warn.mockRestore(); }
  });
});
