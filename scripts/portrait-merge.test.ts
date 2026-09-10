// @vitest-environment node
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { importPortraits, buildPortraitOutputs, parsePortraitImportArgs, formatPortraitImportSummary, type PortraitOutcome } from "./portrait-import";
import { parsePortraitOverrides } from "../src/data/champions/portrait-overrides";

const player = { id: "player-817", canonicalHandle: "FiNESSE" };
const still = { playerId: player.id, sourceKind: "riot-portrait", sourcePageUrl: "https://valorantesports.com/news/finesse", mediaUrl: "https://cmsassets.rgpub.io/finesse.png", credit: "Riot Games", copyrightOwner: "Riot Games", reuseBasis: "riot-fan-policy", license: "Riot Legal", identityConfirmed: true };
async function fixture(existing = true) {
  const root = mkdtempSync(join(tmpdir(), "portrait-merge-"));
  const catalog = join(root, "src/data/champions");
  const directory = join(root, "public/assets/players");
  mkdirSync(catalog, { recursive: true }); mkdirSync(directory, { recursive: true });
  const bytes = await sharp({ create: { width: 256, height: 256, channels: 3, background: "red" } }).webp().toBuffer();
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const filename = `${player.id}.${sha256.slice(0, 12)}.webp`;
  const asset = { playerId: player.id, portrait: `/assets/players/${filename}`, sourceId: "liquipedia-portrait-817", sha256 };
  const source = { id: asset.sourceId, url: "https://liquipedia.net/commons/File:FiNESSE.jpg", originalUrl: "https://example.test/photo", retrievedAt: "2026-09-08", usage: "asset", credit: "Photographer", license: "cc-by-sa-4.0", sourceKind: "liquipedia", reuseBasis: "open-license", copyrightOwner: "Photographer" };
  writeFileSync(join(catalog, "portrait-assets.json"), JSON.stringify(existing ? [asset] : []));
  writeFileSync(join(catalog, "portrait-sources.json"), JSON.stringify(existing ? [source] : []));
  if (existing) writeFileSync(join(directory, filename), bytes);
  const snapshot = () => [readFileSync(join(catalog, "portrait-assets.json"), "utf8"), readFileSync(join(catalog, "portrait-sources.json"), "utf8"), ...readdirSync(directory).sort().map(name => `${name}:${readFileSync(join(directory, name)).toString("hex")}`)];
  return { root, catalog, bytes, snapshot };
}
describe("reviewed portrait merge", () => {
  it.each([[], ["--retrieved-at", "2026-02-30"], ["--retrieved-at", "2999-01-01"], ["--retrieved-at", "2026-09-09", "--retrieved-at", "2026-09-09"]].map(args => ({ args })))("CLI rejects invalid arguments $args before loading catalogs", ({ args }) => {
    const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/import-player-portraits.mts", ...args], { encoding: "utf8" });
    expect(result.status).toBe(1); expect(result.stderr.trim()).toBe("usage: npm run import:portraits -- --retrieved-at YYYY-MM-DD");
  });
  it("formats the required full-roster summary", () => {
    const kinds = [...Array(153).fill("preserved"), ...Array(6).fill("imported"), ...Array(80).fill("uncovered")];
    expect(formatPortraitImportSummary(kinds.map((kind, index) => ({ playerId: `player-${index}`, kind })) as PortraitOutcome[], 239)).toBe("portrait import summary: preserved=153 imported=6 replaced=0 uncovered=80 total=239");
  });
  it("keeps a reviewed Liquipedia still in its own source namespace", async () => {
    const f = await fixture(false);
    const override = { ...still, sourceKind: "liquipedia", sourcePageUrl: "https://liquipedia.net/commons/File:FiNESSE.jpg", mediaUrl: "https://liquipedia.net/commons/images/finesse.jpg", copyrightOwner: "Photographer", credit: "Photographer", reuseBasis: "open-license", license: "cc-by-sa-4.0" };
    await importPortraits({ root: f.root, players: [player], overrides: parsePortraitOverrides([override], [player]), retrievalDate: "2026-09-09", userAgent: "test", fetch: vi.fn(async () => new Response(new Uint8Array(f.bytes))) });
    expect(JSON.parse(f.snapshot()[1])[0]).toMatchObject({ id: "liquipedia-portrait-817", sourceKind: "liquipedia" });
  });
  it("rejects an existing checksum mismatch before any fetch or publication", async () => {
    const f = await fixture();
    const asset = JSON.parse(f.snapshot()[0])[0]; writeFileSync(join(f.root, "public", asset.portrait), "broken"); const before = f.snapshot(); const fetch = vi.fn();
    await expect(importPortraits({ root: f.root, players: [player], retrievalDate: "2026-09-09", userAgent: "test", fetch })).rejects.toThrow("checksum mismatch");
    expect(fetch).not.toHaveBeenCalled(); expect(f.snapshot()).toEqual(before);
  });
  it.each([[], ["--retrieved-at", "2026-02-30"], ["--retrieved-at", "tomorrow"], ["--retrieved-at", "2026-09-11"], ["--retrieved-at", "2026-09-09", "--retrieved-at", "2026-09-09"]].map(args => ({ args })))("rejects invalid retrieval date arguments $args", ({ args }) => {
    expect(() => parsePortraitImportArgs(args, "2026-09-10")).toThrow("usage: npm run import:portraits -- --retrieved-at YYYY-MM-DD");
  });
  it("rejects duplicate overrides before fetching", async () => {
    const f = await fixture(); const fetch = vi.fn(); const overrides = parsePortraitOverrides([still], [player]);
    await expect(importPortraits({ root: f.root, players: [player], overrides: [...overrides, ...overrides], retrievalDate: "2026-09-09", userAgent: "test", fetch })).rejects.toThrow("duplicate player"); expect(fetch).not.toHaveBeenCalled();
  });
  it("preserves valid existing portraits without fetching", async () => {
    const f = await fixture(); const fetch = vi.fn();
    const result = await importPortraits({ root: f.root, players: [player], retrievalDate: "2026-09-09", userAgent: "test", fetch });
    expect(result.outcomes).toEqual([{ playerId: player.id, kind: "preserved" }]); expect(fetch).not.toHaveBeenCalled();
  });
  it("replaces FiNESSE with the reviewed Riot still and is deterministic", async () => {
    const f = await fixture(); const fetch = vi.fn(async () => new Response(new Uint8Array(f.bytes)));
    const options = { root: f.root, players: [player], overrides: parsePortraitOverrides([still], [player]), retrievalDate: "2026-09-09", userAgent: "test", fetch };
    expect((await importPortraits(options)).outcomes).toEqual([{ playerId: player.id, kind: "replaced" }]);
    const first = f.snapshot(); await importPortraits(options); expect(f.snapshot()).toEqual(first);
    expect(JSON.parse(first[1])[0]).toMatchObject({ id: "riot-vct-portrait-817", sourceKind: "riot-portrait", retrievedAt: "2026-09-09" });
  });
  it("leaves every prior byte untouched when any player is uncovered", async () => {
    const f = await fixture(); const before = f.snapshot();
    const result = await importPortraits({ root: f.root, players: [player, { id: "player-9", canonicalHandle: "Nine" }], retrievalDate: "2026-09-09", userAgent: "test", fetch: vi.fn(async () => new Response(JSON.stringify({ query: { pages: {} } }))), wait: async () => {} });
    expect(result.outcomes).toContainEqual({ playerId: "player-9", kind: "uncovered", reason: "missing" }); expect(f.snapshot()).toEqual(before);
    expect(result).toMatchObject({ uncovered: ["player-9"], published: false });
  });
  it("rejects incomplete direct publication", async () => {
    const f = await fixture(); const before = f.snapshot();
    await expect(buildPortraitOutputs({ root: f.root, players: [player], discover: async () => null })).rejects.toThrow("incomplete"); expect(f.snapshot()).toEqual(before);
  });
  it("imports a contained broadcast capture with reviewed metadata", async () => {
    const f = await fixture(false); mkdirSync(join(f.root, "assets/portrait-sources"), { recursive: true }); writeFileSync(join(f.root, "assets/portrait-sources/player-817.png"), f.bytes);
    const { mediaUrl: _media, ...base } = still;
    void _media;
    const override = { ...base, sourceKind: "vct-broadcast-frame", videoUrl: "https://youtube.com/watch?v=reviewed", videoTimestampSeconds: 42, capturePath: "assets/portrait-sources/player-817.png", event: "Champions", sourcePublishedAt: "2025-09-01" };
    const fetch = vi.fn();
    expect((await importPortraits({ root: f.root, players: [player], overrides: parsePortraitOverrides([override], [player]), retrievalDate: "2026-09-09", userAgent: "test", fetch })).outcomes[0].kind).toBe("imported");
    expect(fetch).not.toHaveBeenCalled(); expect(JSON.parse(f.snapshot()[1])[0]).toMatchObject({ videoTimestampSeconds: 42, event: "Champions", sourcePublishedAt: "2025-09-01" });
  });
  it("does not fall back to an old portrait when curated conversion fails", async () => {
    const f = await fixture(); const before = f.snapshot();
    const result = await importPortraits({ root: f.root, players: [player], overrides: parsePortraitOverrides([still], [player]), retrievalDate: "2026-09-09", userAgent: "test", fetch: vi.fn(async () => new Response("corrupt")) });
    expect(result.outcomes).toEqual([{ playerId: player.id, kind: "uncovered", reason: "unsupported-image" }]); expect(f.snapshot()).toEqual(before);
  });
});
