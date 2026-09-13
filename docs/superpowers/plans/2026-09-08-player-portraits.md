# Player Portraits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import legally usable Liquipedia player portraits into a provenance-checked local asset catalog and render them across every roster-oriented player surface.

**Architecture:** A pure portrait-policy module interprets Liquipedia Commons metadata; a throttled CLI caches API responses, downloads accepted images, converts them to WebP, and writes two generated catalogs only after a valid run. Dataset assembly overlays those catalogs onto the existing 239 deduplicated identities. A `PlayerPortrait` wrapper gives player photos context-aware sizing while reusing `MediaMark` fallback behavior.

**Tech Stack:** Next.js 16 static export, React 19, TypeScript 5.9, Zod 4, Vitest/Testing Library, Playwright, Sharp, Liquipedia MediaWiki APIs.

---

## File map

**Create**

- `src/data/champions/portrait-policy.ts` — parse Commons `FileInfo`, classify rights, rank candidates.
- `src/data/champions/portrait-policy.test.ts` — pure policy regression tests using inline wikitext fixtures.
- `scripts/portrait-import.ts` — cache-aware Liquipedia client, discovery, download, WebP conversion, generated-output transaction.
- `scripts/portrait-import.test.ts` — Node-environment importer tests with fake fetch and temporary directories.
- `scripts/import-player-portraits.mts` — small CLI entry point.
- `src/data/champions/portrait-assets.json` — generated player/path/source/checksum overlay; starts as `[]`.
- `src/data/champions/portrait-sources.json` — generated `SourceRef` asset catalog; starts as `[]`.
- `src/data/champions/portrait-catalog.ts` — catalog parsing and cross-record validation.
- `src/data/champions/portrait-catalog.test.ts` — overlay/provenance validation tests.
- `src/features/game/components/player-portrait.tsx` — player-specific photo/fallback wrapper.
- `src/features/game/components/player-portrait.test.tsx` — sizing, crop, accessibility, load-failure tests.
- `public/assets/players/*.webp` — generated, ID-based local portraits accepted by policy.

**Modify**

- `package.json`, `package-lock.json` — add Sharp and `import:portraits` command.
- `src/features/game/domain.ts` — add optional original asset URL to `SourceRef`.
- `src/features/game/schema.ts`, `src/features/game/schema.test.ts` — parse the optional URL without weakening strict records.
- `src/data/champions/index.ts` — merge portrait overlays and source records.
- `src/data/champions/source-policy.ts` — pin factual sources separately; validate asset-source namespace.
- `src/data/champions/validation.ts` — call portrait catalog validation and enforce exact asset provenance.
- `src/data/champions/dataset.test.ts` — assert overlay/source invariants and nonzero imported coverage.
- `scripts/validate-data.mts` — include portrait catalog/checksum diagnostics.
- `src/features/game/components/media-mark.tsx` — explicit size, fit, loading, and decoding props.
- `src/features/game/components/player-picker.tsx` — large choice portraits and grouped identity text.
- `src/features/game/components/roster-bar.tsx` — compact portraits in drafted slots.
- `src/features/game/components/igl-picker.tsx` — compact portrait radio cards.
- `src/features/game/components/tournament-view.tsx` — compact portraits in both lineups.
- `src/features/game/components/results-view.tsx` — compact portraits in final roster.
- `src/features/game/components/game-app.tsx` — pass portrait resolver into all child views and saved results.
- `src/features/game/components/draft-flow.test.tsx` — draft, roster, IGL portrait integration.
- `src/features/game/components/tournament-flow.test.tsx` — both tournament lineups use portraits.
- `src/features/game/components/results-view.test.tsx` — final roster portrait integration.
- `src/features/game/components/game-app.test.tsx` — saved-result portrait integration.
- `src/features/game/components/accessibility.test.tsx` — no duplicate image names; touch/keyboard semantics preserved.
- `src/data/fixtures/minimal-dataset.ts` — one real local-looking portrait path for mixed fixture coverage.
- `src/app/globals.css` — hybrid sizes, player-row hierarchy, responsive behavior, footer.
- `src/app/layout.tsx` — exported notice component and persistent Riot fan-project notice.
- `src/app/page.test.tsx` — notice regression.
- `README.md` — portrait import, attribution policy, required notice, noncommercial constraint.
- `e2e/responsive.spec.ts` — assert portrait layout at desktop and Pixel 7.
- `e2e/__screenshots__/{win32,linux}/{desktop,pixel-7}/*.png` — approved updated baselines for all six captured phases because the persistent footer affects every page.
- `visual-baselines.test.ts` — refreshed hashes and dimensions for both platform baseline sets.

## Task 1: Encode portrait rights policy

**Files:**

- Create: `src/data/champions/portrait-policy.ts`
- Create: `src/data/champions/portrait-policy.test.ts`

- [ ] **Step 1: Write failing policy tests**

```ts
import { describe, expect, it } from "vitest";
import { assessPortrait, choosePortrait, parseFileInfo } from "./portrait-policy";

const riot = `{{FileInfo
|featured=BeYN
|date=2025-02-24
|license=permission
|author=Liu YiCun
|copyright=[https://www.riotgames.com/ Riot Games]
|note=Used With Permission. All rights remain with Riot Games.
|source=https://www.flickr.com/photos/valorantesports/54347821048/
}}`;

describe("portrait source policy", () => {
  it("accepts a Riot-owned player portrait under the noncommercial fan policy", () => {
    expect(assessPortrait("BeYN", "File:DRX BeYN.jpg", riot)).toMatchObject({
      accepted: true,
      basis: "riot-fan-policy",
      featured: ["BeYN"],
      credit: "Liu YiCun / Riot Games",
    });
  });

  it.each([
    ["fairuse", "[https://www.riotgames.com/ Riot Games]"],
    ["permission", "[https://team.example/ Example Team]"],
    ["permission", ""],
    ["cc-by-nd-3.0", "Example Photographer"],
  ])("rejects license %s with owner %s", (license, copyright) => {
    const info = riot.replace("license=permission", `license=${license}`).replace("[https://www.riotgames.com/ Riot Games]", copyright);
    expect(assessPortrait("BeYN", "File:DRX BeYN.jpg", info).accepted).toBe(false);
  });

  it("accepts redistributable non-ND Creative Commons media", () => {
    const info = riot.replace("license=permission", "license=cc-by-sa-4.0").replace("[https://www.riotgames.com/ Riot Games]", "Example Photographer");
    expect(assessPortrait("BeYN", "File:BeYN.jpg", info)).toMatchObject({ accepted: true, basis: "open-license" });
  });

  it("requires FileInfo to feature the exact normalized player handle", () => {
    expect(assessPortrait("BeYN", "File:DRX BeYN.jpg", riot.replace("featured=BeYN", "featured=MaKo")).accepted).toBe(false);
  });

  it("parses fields case-insensitively and chooses the newest unambiguous image", () => {
    expect(parseFileInfo(riot).date).toBe("2025-02-24");
    const older = { ...assessPortrait("BeYN", "File:old.jpg", riot.replace("2025-02-24", "2024-01-01")), fileTitle: "File:old.jpg" };
    const newer = { ...assessPortrait("BeYN", "File:new.jpg", riot), fileTitle: "File:new.jpg" };
    expect(choosePortrait([older, newer])).toMatchObject({ kind: "selected", candidate: { fileTitle: "File:new.jpg" } });
    expect(choosePortrait([newer, { ...newer, fileTitle: "File:tied.jpg" }])).toEqual({ kind: "ambiguous", candidates: ["File:new.jpg", "File:tied.jpg"] });
  });
});
```

- [ ] **Step 2: Run test; verify RED**

Run: `npx vitest run src/data/champions/portrait-policy.test.ts`

Expected: FAIL because `./portrait-policy` does not exist.

- [ ] **Step 3: Implement parser, classifier, deterministic selector**

```ts
import { normalizeHandle } from "@/features/game/handle";

export interface FileInfo {
  featured: string[];
  date: string | null;
  license: string;
  author: string;
  copyright: string;
  note: string;
  source: string;
}
export type AcceptedBasis = "open-license" | "riot-fan-policy";
export type PortraitAssessment = FileInfo & {
  accepted: boolean;
  basis: AcceptedBasis | null;
  credit: string;
  reason: string;
  fileTitle?: string;
};

const OPEN = /^(?:cc0|public-domain|cc-by-(?:nc-)?(?:sa-)?(?:[1-4](?:\.0)?)?)$/i;
const FIELD = /^\|\s*([a-z0-9_-]+)\s*=\s*(.*?)\s*$/gim;
const plain = (value: string) => value.replace(/\[https?:\/\/[^\s\]]+\s+([^\]]+)\]/g, "$1").replace(/<[^>]+>/g, "").trim();

export function parseFileInfo(wikitext: string): FileInfo {
  const fields = new Map<string, string>();
  for (const match of wikitext.matchAll(FIELD)) fields.set(match[1].toLowerCase(), match[2].trim());
  const featured = [...fields.entries()].filter(([key]) => /^featured\d*$/.test(key)).map(([, value]) => plain(value)).filter(Boolean);
  return {
    featured,
    date: /^\d{4}-\d{2}-\d{2}$/.test(fields.get("date") ?? "") ? fields.get("date")! : null,
    license: plain(fields.get("license") ?? "").toLowerCase(),
    author: plain(fields.get("author") ?? ""),
    copyright: plain(fields.get("copyright") ?? ""),
    note: plain(fields.get("note") ?? ""),
    source: fields.get("source")?.trim() ?? "",
  };
}

export function assessPortrait(handle: string, _fileTitle: string, wikitext: string): PortraitAssessment {
  const info = parseFileInfo(wikitext);
  const identity = normalizeHandle(handle).toLocaleLowerCase("en-US");
  const featured = info.featured.some(value => normalizeHandle(value).toLocaleLowerCase("en-US") === identity);
  const riotOwned = /\briot games\b/i.test(info.copyright);
  const riotSource = /^https:\/\/(?:www\.)?(?:riotgames\.com|flickr\.com\/photos\/valorantesports)\//i.test(info.source);
  const basis = OPEN.test(info.license) ? "open-license" : info.license === "permission" && riotOwned && riotSource ? "riot-fan-policy" : null;
  const credit = [info.author, info.copyright].filter(Boolean).join(" / ");
  const accepted = featured && basis !== null && Boolean(info.source) && Boolean(credit);
  return { ...info, accepted, basis, credit, reason: accepted ? "accepted" : !featured ? "identity-mismatch" : !basis ? "rights-rejected" : "metadata-incomplete" };
}

export function choosePortrait(candidates: PortraitAssessment[]): { kind: "none" } | { kind: "ambiguous"; candidates: string[] } | { kind: "selected"; candidate: PortraitAssessment } {
  const accepted = candidates.filter(item => item.accepted && item.fileTitle).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || a.fileTitle!.localeCompare(b.fileTitle!));
  if (!accepted.length) return { kind: "none" };
  const latest = accepted[0].date;
  const tied = accepted.filter(item => item.date === latest);
  return tied.length === 1 ? { kind: "selected", candidate: tied[0] } : { kind: "ambiguous", candidates: tied.map(item => item.fileTitle!) };
}
```

- [ ] **Step 4: Run test; verify GREEN**

Run: `npx vitest run src/data/champions/portrait-policy.test.ts`

Expected: PASS, 8 policy cases.

- [ ] **Step 5: Commit**

```powershell
git add src/data/champions/portrait-policy.ts src/data/champions/portrait-policy.test.ts
git commit -m "feat(data): define portrait source policy"
```

## Task 2: Build cached Liquipedia importer

**Files:**

- Create: `scripts/portrait-import.ts`
- Create: `scripts/portrait-import.test.ts`
- Create: `scripts/import-player-portraits.mts`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Add Sharp as a development dependency**

Run: `npm install --save-dev sharp@^0.34.3`

Expected: `sharp` appears under `devDependencies`; lockfile updates.

- [ ] **Step 2: Write failing importer tests**

```ts
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
    writeFileSync(assets, "OLD-ASSETS"); writeFileSync(sources, "OLD-SOURCES");
    await expect(buildPortraitOutputs({ root, players: [{ id: "player-1", canonicalHandle: "BeYN" }], discover: async () => { throw new Error("HTTP 429"); } })).rejects.toThrow("HTTP 429");
    expect(readFileSync(assets, "utf8")).toBe("OLD-ASSETS");
    expect(readFileSync(sources, "utf8")).toBe("OLD-SOURCES");
  });
});
```

- [ ] **Step 3: Run tests; verify RED**

Run: `npx vitest run scripts/portrait-import.test.ts`

Expected: FAIL because `./portrait-import` does not exist.

- [ ] **Step 4: Implement importer boundaries**

Implement these exact exports in `scripts/portrait-import.ts`:

```ts
export interface ImportPlayer { id: string; canonicalHandle: string }
export interface ImportPaths { root: string; players: ImportPlayer[]; discover(player: ImportPlayer, stageDir: string): Promise<GeneratedPortrait | null> }
export interface GeneratedPortrait {
  playerId: string; portrait: string; sourceId: string; sha256: string;
  source: { id: string; url: string; originalUrl: string; retrievedAt: string; usage: "asset"; credit: string; license: string };
}
export interface ClientOptions {
  cacheDir: string;
  fetch: typeof globalThis.fetch;
  wait(ms: number): Promise<void>;
  userAgent: string;
}
```

`CachedLiquipediaClient` must expose `fetch`, `cachePath(url)`, and `json(url)`.
`json` computes `sha256(url).json`, reads valid cache first, waits 2,000 ms
between uncached calls, requests gzip JSON with the identifying user agent,
throws `Liquipedia <status> for <url>` on non-2xx, and writes cache through a
same-directory temporary file followed by `renameSync`.

`buildPortraitOutputs` resolves both catalog paths under
`<root>/src/data/champions/`, calls every `discover` before writing either catalog,
sort accepted results by `playerId`, validate unique player/source/path values,
then atomically rename complete `*.tmp` catalogs over:

```ts
const assetRows = results.map(({ playerId, portrait, sourceId, sha256 }) => ({ playerId, portrait, sourceId, sha256 }));
const sourceRows = results.map(result => result.source);
```

If discovery throws, remove only the run-owned staging directory and leave
existing catalogs/assets untouched. Newly generated portrait filenames include
the first 12 checksum characters (`player-123.<hash>.webp`), so copying a new
file cannot corrupt a path referenced by the previous manifest.

- [ ] **Step 5: Implement API discovery and CLI**

In `scripts/portrait-import.ts`, add `discoverLiquipediaPortrait` that:

1. Calls `https://liquipedia.net/valorant/api.php` with `action=query`,
   `format=json`, `redirects=1`, `prop=images`, `imlimit=max`, and the exact
   player handle; follow every `continue` object.
2. Batches returned file titles into groups of 50 against
   `https://liquipedia.net/commons/api.php` using `prop=revisions|imageinfo`,
   `rvprop=content`, `rvslots=main`, and `iiprop=url`.
3. Calls `assessPortrait`, adds the originating `fileTitle` to each assessment,
   then calls `choosePortrait`.
4. Reports `missing`, `rights-rejected`, or `ambiguous` without downloading.
5. Downloads a selected HTTPS image with the same user agent, limits the body
   to 15 MiB, and passes the bytes to Sharp:

```ts
const webp = await sharp(bytes, { failOn: "warning", limitInputPixels: 40_000_000 })
  .rotate()
  .resize(256, 256, { fit: "cover", position: "attention", withoutEnlargement: true })
  .webp({ quality: 82, effort: 5 })
  .toBuffer();
```

Reject output smaller than 96 by 96 pixels. Hash the final WebP, write it to the
run staging directory, and return a source ID
`liquipedia-portrait-<player-id-without-player-prefix>`.
Set the generated source `url` to the Liquipedia Commons description page and
`originalUrl` to the `FileInfo.source` value; preserve both as HTTPS URLs.

Create `scripts/import-player-portraits.mts` as orchestration only:

```ts
import { championsDataset } from "../src/data/champions";
import { importPortraits } from "./portrait-import";
import { fileURLToPath } from "node:url";

await importPortraits({
  root: fileURLToPath(new URL("..", import.meta.url)),
  players: championsDataset.players.map(({ id, canonicalHandle }) => ({ id, canonicalHandle })),
  userAgent: "RunItBack/0.1 (https://github.com/AntonCSalvador/run-it-back; contact via GitHub issues)",
});
```

Add package script:

```json
"import:portraits": "tsx scripts/import-player-portraits.mts"
```

- [ ] **Step 6: Run importer tests; verify GREEN**

Run: `npx vitest run scripts/portrait-import.test.ts src/data/champions/portrait-policy.test.ts`

Expected: PASS; no real network request.

- [ ] **Step 7: Commit**

```powershell
git add package.json package-lock.json scripts/portrait-import.ts scripts/portrait-import.test.ts scripts/import-player-portraits.mts
git commit -m "feat(data): add portrait import pipeline"
```

## Task 3: Overlay portraits with strict provenance

**Files:**

- Create: `src/data/champions/portrait-assets.json`
- Create: `src/data/champions/portrait-sources.json`
- Create: `src/data/champions/portrait-catalog.ts`
- Create: `src/data/champions/portrait-catalog.test.ts`
- Modify: `src/data/champions/index.ts`
- Modify: `src/data/champions/source-policy.ts`
- Modify: `src/data/champions/validation.ts`
- Modify: `src/features/game/domain.ts`
- Modify: `src/features/game/schema.ts`
- Modify: `src/features/game/schema.test.ts`
- Modify: `scripts/validate-data.mts`

- [ ] **Step 1: Create empty generated catalogs**

Both JSON files contain exactly:

```json
[]
```

- [ ] **Step 2: Write failing catalog tests**

```ts
import { describe, expect, it } from "vitest";
import { applyPortraitCatalog, validatePortraitCatalog } from "./portrait-catalog";

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
});
```

- [ ] **Step 3: Run tests; verify RED**

Run: `npx vitest run src/data/champions/portrait-catalog.test.ts`

Expected: FAIL because `./portrait-catalog` does not exist.

- [ ] **Step 4: Implement catalog schema, overlay, and invariants**

Extend `SourceRef` with `originalUrl?: string` and add
`originalUrl: z.string().url().optional()` to the strict source schema. Add a
schema test proving a well-formed optional URL parses and a malformed one fails.
Then use strict Zod portrait schemas:

```ts
const portraitAssetSchema = z.object({
  playerId: z.string().regex(/^player-\d+$/),
  portrait: z.string().regex(/^\/assets\/players\/player-\d+\.[a-f0-9]{12}\.webp$/),
  sourceId: z.string().regex(/^liquipedia-portrait-\d+$/),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export const portraitAssetsSchema = z.array(portraitAssetSchema);
```

Export `PortraitAsset`, `parsePortraitCatalog`, `applyPortraitCatalog`, and
`validatePortraitCatalog`. Validation enforces unique player/path/source IDs,
known players, a one-to-one asset source with `usage: "asset"`, HTTPS
Liquipedia Commons description URL, required HTTPS `originalUrl`, nonblank
credit/license, and no unused portrait source. `applyPortraitCatalog` preserves
order and immutable input objects.

- [ ] **Step 5: Merge generated catalogs in dataset assembly**

In `src/data/champions/index.ts`, import both JSON catalogs, parse them, apply
the overlay after player deduplication, and build sources as:

```ts
sources: [...sourceRefs, ...portraitSourceRefs],
players: applyPortraitCatalog(deduplicatePlayers(), portraitAssets),
```

Change the deduplicated player map type from `portrait: null` to
`portrait: string | null`.

In `source-policy.ts`, compare `REVIEWED_SOURCES` only against
`sources.filter(source => source.usage === "facts")`; reject an asset source
unless its ID matches `liquipedia-portrait-<digits>`. Do not relax exact factual
catalog keys or values.

Call `validatePortraitCatalog` from `validateChampions`. In
`scripts/validate-data.mts`, read every portrait file, hash it with SHA-256, and
compare it to the overlay row after `validateAssetPath` succeeds.

- [ ] **Step 6: Run catalog/data tests; verify GREEN**

Run: `npx vitest run src/data/champions/portrait-catalog.test.ts src/data/champions/dataset.test.ts src/data/champions/validation.test.ts src/features/game/schema.test.ts src/features/game/asset-validation.test.ts`

Expected: PASS with empty generated catalogs and all 239 identities on fallback.

- [ ] **Step 7: Commit**

```powershell
git add src/data/champions/portrait-assets.json src/data/champions/portrait-sources.json src/data/champions/portrait-catalog.ts src/data/champions/portrait-catalog.test.ts src/data/champions/index.ts src/data/champions/source-policy.ts src/data/champions/validation.ts src/features/game/domain.ts src/features/game/schema.ts src/features/game/schema.test.ts scripts/validate-data.mts
git commit -m "feat(data): validate portrait provenance"
```

## Task 4: Import accepted portraits

**Files:**

- Modify: `src/data/champions/portrait-assets.json`
- Modify: `src/data/champions/portrait-sources.json`
- Create: `public/assets/players/*.webp`
- Modify: `src/data/champions/dataset.test.ts`

- [ ] **Step 1: Add a failing coverage/invariant test**

Append to `src/data/champions/dataset.test.ts`:

```ts
it("ships policy-cleared local player portraits", () => {
  const pictured = championsDataset.players.filter(player => player.portrait !== null);
  expect(pictured.length).toBeGreaterThan(0);
  expect(pictured.every(player => /^\/assets\/players\/player-\d+\.[a-f0-9]{12}\.webp$/.test(player.portrait!))).toBe(true);
  expect(pictured.every(player => player.sourceIds.some(id => id.startsWith("liquipedia-portrait-")))).toBe(true);
});
```

- [ ] **Step 2: Run the test; verify RED**

Run: `npx vitest run src/data/champions/dataset.test.ts`

Expected: FAIL because the empty generated catalog produces zero pictured
players.

- [ ] **Step 3: Run the real cached importer**

Run: `npm run import:portraits`

Expected: summary totals exactly 239 identities; each identity appears in one
of `accepted`, `missing`, `rights-rejected`, or `ambiguous`; accepted is greater
than zero. Re-run the same command after a network interruption; cached API
responses prevent duplicate calls.

- [ ] **Step 4: Inspect the generated review summary**

Verify every accepted entry has exact handle match, author/copyright credit,
Commons page, original source URL, retrieval date, policy basis, and checksum.
Open at least five accepted WebPs spanning multiple years and confirm they show
the named player, have a sensible face crop, and contain no obvious corruption.

- [ ] **Step 5: Verify generated data and local files; verify GREEN**

Run: `npm run validate:data && npx vitest run src/data/champions/dataset.test.ts`

Expected: PASS; validator reports a nonzero cleared-asset count and remaining
fallback count without missing files or checksum errors.

- [ ] **Step 6: Commit**

```powershell
git add src/data/champions/portrait-assets.json src/data/champions/portrait-sources.json src/data/champions/dataset.test.ts public/assets/players
git commit -m "feat(data): add cleared player portraits"
```

## Task 5: Create stable player portrait primitive

**Files:**

- Create: `src/features/game/components/player-portrait.tsx`
- Create: `src/features/game/components/player-portrait.test.tsx`
- Modify: `src/features/game/components/media-mark.tsx`
- Modify: `src/features/game/components/draft-flow.test.tsx`

- [ ] **Step 1: Write failing component tests**

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PlayerPortrait } from "./player-portrait";

describe("PlayerPortrait", () => {
  it.each([["choice", "player-portrait--choice"], ["compact", "player-portrait--compact"]] as const)("renders %s portrait as decorative cover media", (variant, className) => {
    render(<PlayerPortrait portrait="/assets/players/player-1.abcdef123456.webp" handle="BeYN" variant={variant} />);
    const image = screen.getByRole("presentation");
    expect(image).toHaveAttribute("src", "/assets/players/player-1.abcdef123456.webp");
    expect(image).toHaveAttribute("loading", variant === "choice" ? "eager" : "lazy");
    expect(image).toHaveAttribute("decoding", "async");
    expect(image).toHaveStyle({ objectFit: "cover" });
    expect(image.parentElement).toHaveClass("player-portrait", className);
  });

  it("keeps decorative initials fallback out of the accessibility tree", () => {
    render(<PlayerPortrait portrait="/assets/players/player-1.abcdef123456.webp" handle="BeYN" variant="compact" />);
    fireEvent.error(screen.getByRole("presentation"));
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("BE")).toHaveAttribute("aria-hidden", "true");
  });
});
```

- [ ] **Step 2: Run test; verify RED**

Run: `npx vitest run src/features/game/components/player-portrait.test.tsx`

Expected: FAIL because `PlayerPortrait` does not exist.

- [ ] **Step 3: Generalize MediaMark without changing logo defaults**

Change `MediaMark` props to:

```ts
export interface MediaMarkProps {
  src: string | null;
  alt: string;
  label?: string;
  className?: string;
  fit?: "contain" | "cover";
  loading?: "eager" | "lazy";
  testId?: string;
}
```

Move the existing 48-pixel wrapper dimensions to `.media-mark` in global CSS
so player variants override them without `!important`. Apply `className` and
`data-testid={testId}` to the wrapper; apply `objectFit: fit`, `width={48}`,
`height={48}`, `loading={loading}`, and `decoding="async"` to the native image. Preserve
`failedSrc !== safeSrc`, same-node fallback sizing, and decorative behavior
when `alt=""`.

In the existing `MediaMark` sizing test, replace inline wrapper width/height
assertions with `expect(wrapper).toHaveClass("media-mark")`; keep assertions
that image and fallback fill the wrapper and remain the same wrapper node.

- [ ] **Step 4: Implement PlayerPortrait**

```tsx
import { MediaMark } from "./media-mark";

export function PlayerPortrait({ portrait, handle, variant, testId }: {
  portrait: string | null;
  handle: string;
  variant: "choice" | "compact";
  testId?: string;
}) {
  return <MediaMark
    src={portrait}
    alt=""
    label={handle}
    className={`player-portrait player-portrait--${variant}`}
    fit="cover"
    loading={variant === "choice" ? "eager" : "lazy"}
    testId={testId}
  />;
}
```

- [ ] **Step 5: Run focused tests; verify GREEN and logo compatibility**

Run: `npx vitest run src/features/game/components/player-portrait.test.tsx src/features/game/components/draft-flow.test.tsx`

Expected: PASS; existing logo retry still asserts `objectFit: contain`.

- [ ] **Step 6: Commit**

```powershell
git add src/features/game/components/media-mark.tsx src/features/game/components/player-portrait.tsx src/features/game/components/player-portrait.test.tsx src/features/game/components/draft-flow.test.tsx
git commit -m "feat(ui): add player portrait primitive"
```

## Task 6: Add portraits to draft and lineup surfaces

**Files:**

- Modify: `src/features/game/components/player-picker.tsx`
- Modify: `src/features/game/components/roster-bar.tsx`
- Modify: `src/features/game/components/igl-picker.tsx`
- Modify: `src/features/game/components/game-app.tsx`
- Modify: `src/features/game/components/draft-flow.test.tsx`
- Modify: `src/features/game/components/accessibility.test.tsx`

- [ ] **Step 1: Write failing draft-surface integration assertions**

Extend the complete-draft test so the fixture dataset has one portrait and
mixed fallback coverage. After each phase, assert:

```tsx
expect(within(screen.getByTestId(`player-card-${selectedCard.id}`)).getByRole("presentation")).toHaveClass("media-mark__image");
expect(within(screen.getByLabelText(`${role} slot`)).getByTestId(`portrait-${card.playerId}`)).toHaveClass("player-portrait--compact");
expect(within(screen.getByRole("radiogroup", { name: "Choose in-game leader" })).getAllByTestId(/^portrait-/)).toHaveLength(5);
expect(screen.getByRole("radio", { name: `${card.displayHandle} ${card.year}` })).toBeVisible();
```

Add an accessibility assertion that no draft choice gains a second accessible
image name and every radio remains labeled by handle/year.

- [ ] **Step 2: Run tests; verify RED**

Run: `npx vitest run src/features/game/components/draft-flow.test.tsx src/features/game/components/accessibility.test.tsx`

Expected: FAIL because roster/IGL portraits and portrait test IDs are absent.

- [ ] **Step 3: Thread one resolver through draft components**

Use this shared prop shape:

```ts
export type PortraitForPlayer = (playerId: string) => string | null;
```

Move it to `player-portrait.tsx` and add optional `portraitForPlayer` props to
`PlayerPicker`, `RosterBar`, and `IglPicker`; absence resolves to `null` so
isolated consumers retain initials fallback. In `GameAppCore`, keep the existing
`players` map and always pass:

```ts
const portraitForPlayer: PortraitForPlayer = playerId => players.get(playerId)?.portrait ?? null;
```

Render `PlayerPortrait` with `choice` in each player button and `compact` in
each occupied roster slot and IGL label. Add
`data-testid={`portrait-${card.playerId}`}` to `PlayerPortrait`'s wrapper.
Preserve button/radio accessible names,
move buttons, role order, and callbacks.

- [ ] **Step 4: Run tests; verify GREEN**

Run: `npx vitest run src/features/game/components/draft-flow.test.tsx src/features/game/components/accessibility.test.tsx`

Expected: PASS; draft behavior and accessible names remain unchanged.

- [ ] **Step 5: Commit**

```powershell
git add src/features/game/components/player-picker.tsx src/features/game/components/roster-bar.tsx src/features/game/components/igl-picker.tsx src/features/game/components/game-app.tsx src/features/game/components/draft-flow.test.tsx src/features/game/components/accessibility.test.tsx src/features/game/components/player-portrait.tsx
git commit -m "feat(ui): show portraits through draft"
```

## Task 7: Add portraits to tournament and result surfaces

**Files:**

- Modify: `src/features/game/components/tournament-view.tsx`
- Modify: `src/features/game/components/results-view.tsx`
- Modify: `src/features/game/components/game-app.tsx`
- Modify: `src/features/game/components/tournament-flow.test.tsx`
- Modify: `src/features/game/components/results-view.test.tsx`
- Modify: `src/features/game/components/game-app.test.tsx`

- [ ] **Step 1: Write failing terminal-surface tests**

Add `portraitForPlayer={() => "/assets/players/player-1.abcdef123456.webp"}`
to direct component renders, then assert:

```tsx
expect(within(screen.getByRole("region", { name: "Your roster" })).getAllByTestId(/^portrait-/)).toHaveLength(5);
expect(within(screen.getByRole("region", { name: "Opponent roster" })).getAllByTestId(/^portrait-/)).toHaveLength(5);
expect(within(screen.getByRole("region", { name: "Drafted roster" })).getAllByTestId(/^portrait-/)).toHaveLength(5);
```

In `game-app.test.tsx`, open a saved result and expect five compact portrait
wrappers inside `Daily result details`.

- [ ] **Step 2: Run tests; verify RED**

Run: `npx vitest run src/features/game/components/tournament-flow.test.tsx src/features/game/components/results-view.test.tsx src/features/game/components/game-app.test.tsx`

Expected: FAIL because terminal and saved-result rosters are text-only.

- [ ] **Step 3: Render compact portrait rows**

Add optional `portraitForPlayer?: PortraitForPlayer` to `TournamentView` and
`ResultsView`, resolving absence to `null`; pass the concrete resolver into
private `Roster` and `RecentResults`. Convert each
player line from text-only markup into:

```tsx
<div className="player-row">
  <PlayerPortrait portrait={portraitForPlayer(card.playerId)} handle={card.displayHandle} variant="compact" testId={`portrait-${card.playerId}`} />
  <span><strong>{role}</strong><span>{card.displayHandle} {card.year}{isIgl ? " · IGL" : ""}</span></span>
</div>
```

Keep current region headings, score lists, result controls, and storage shapes.
Pass the existing resolver from `GameAppCore` into tournament, results, and
saved results.

- [ ] **Step 4: Run tests; verify GREEN**

Run: `npx vitest run src/features/game/components/tournament-flow.test.tsx src/features/game/components/results-view.test.tsx src/features/game/components/game-app.test.tsx`

Expected: PASS with 10 tournament lineup portraits and 5 portraits per result.

- [ ] **Step 5: Commit**

```powershell
git add src/features/game/components/tournament-view.tsx src/features/game/components/results-view.tsx src/features/game/components/game-app.tsx src/features/game/components/tournament-flow.test.tsx src/features/game/components/results-view.test.tsx src/features/game/components/game-app.test.tsx
git commit -m "feat(ui): show portraits in tournament results"
```

## Task 8: Apply responsive visual hierarchy and legal notice

**Files:**

- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/page.test.tsx`
- Modify: `README.md`
- Modify: `e2e/responsive.spec.ts`

- [ ] **Step 1: Write failing legal-notice test**

Append to `src/app/page.test.tsx`:

```tsx
it("shows the required Riot fan-project notice", () => {
  render(<LegalNotice />);
  expect(screen.getByText(/created under Riot Games' “Legal Jibber Jabber” policy/)).toBeVisible();
  expect(screen.getByText(/does not endorse or sponsor this project/)).toBeVisible();
});
```

Import the named `LegalNotice` export from `./layout`, plus `render` and
`screen` from Testing Library.

- [ ] **Step 2: Run test; verify RED**

Run: `npx vitest run src/app/page.test.tsx`

Expected: FAIL because the legal notice is absent.

- [ ] **Step 3: Add persistent notice and documentation**

Export this component and render it after `{children}` in `RootLayout`:

```tsx
export function LegalNotice() {
  return <footer className="legal-notice">
    Run It Back was created under Riot Games&apos; “Legal Jibber Jabber” policy using assets owned by Riot Games. Riot Games does not endorse or sponsor this project.
  </footer>;
}
```

Replace README statements saying all portraits use fallbacks with exact current
behavior. Document `npm run import:portraits`, local caching, license filtering,
per-image source catalogs, fallback coverage, and the rule that Riot-policy
assets must be removed if the project becomes commercial. Include the same
required notice verbatim.

- [ ] **Step 4: Implement approved hybrid CSS**

Add semantic rules using existing color tokens:

```css
.media-mark { display:inline-flex; width:48px; height:48px; aspect-ratio:1; }
.player-portrait { overflow:hidden; flex:none; background:#292d31; }
.player-portrait--choice { width:68px; height:68px; border-radius:7px; }
.player-portrait--compact { width:36px; height:36px; border-radius:50%; }
.player-portrait .media-mark__image { object-fit:cover; }
.player-row { display:flex; align-items:center; gap:.5rem; min-width:0; }
.player-row > span { display:grid; min-width:0; }
.player-picker__identity { display:flex; align-items:center; gap:.75rem; min-width:0; }
.legal-notice { width:min(100%,80rem); margin:2rem auto 0; padding:1rem; border-top:1px solid var(--border); color:var(--muted); font-size:.875rem; line-height:1.5; }
@media (max-width:44rem) {
  .player-portrait--choice { width:64px; height:64px; }
}
```

Adjust roster/tournament/result grids only enough to fit the new `player-row`.
Do not reduce 44-pixel controls, hide labels, change DOM order, add hover-only
information, or make compact rows horizontally scroll outside the existing
roster carousel.

- [ ] **Step 5: Add responsive assertions**

In `e2e/responsive.spec.ts`, at desktop and Pixel 7 widths, assert choice
portrait bounding boxes are 68 and 64 pixels respectively, compact portraits
are 36 pixels, every image lies within its containing card/row, and body
`scrollWidth === clientWidth`. Keep screenshot assertions for player picker,
complete roster, tournament, and results.

- [ ] **Step 6: Run focused tests; verify GREEN**

Run: `npx vitest run src/app/page.test.tsx src/features/game/components/accessibility.test.tsx && npx playwright test e2e/responsive.spec.ts`

Expected: PASS; no horizontal page overflow at either viewport.

- [ ] **Step 7: Run Impeccable mechanical detector once**

Run:

```powershell
& 'C:\Users\anton\.codex\skills\impeccable\scripts\impeccable.cmd' detect --json src/app/globals.css src/app/layout.tsx src/features/game/components/player-portrait.tsx src/features/game/components/player-picker.tsx src/features/game/components/roster-bar.tsx src/features/game/components/igl-picker.tsx src/features/game/components/tournament-view.tsx src/features/game/components/results-view.tsx
```

Expected: no unexplained accessibility, responsive, or craft-floor findings.
Fix any concrete finding in one batch, rerun focused tests once, then stop the
polish loop.

- [ ] **Step 8: Commit**

```powershell
git add src/app/globals.css src/app/layout.tsx src/app/page.test.tsx README.md e2e/responsive.spec.ts
git commit -m "feat(ui): finish portrait presentation"
```

## Task 9: Refresh visual baselines and verify release gates

**Files:**

- Modify: all 12 files under `e2e/__screenshots__/win32/{desktop,pixel-7}/`
- Modify: all 12 files under `e2e/__screenshots__/linux/{desktop,pixel-7}/`
- Modify: `visual-baselines.test.ts`

- [ ] **Step 1: Run full nonvisual verification**

Run: `npm run lint && npm run typecheck && npm run test && npm run test:audit-cli && npm run validate:data && npm run build`

Expected: every command exits 0; Vitest reports zero failures; build completes
as a static export with no missing portrait asset.

- [ ] **Step 2: Generate Windows visual snapshots**

Run: `npm run test:e2e:update`

Expected: Playwright completes every journey and updates all six captures at
both Windows viewports because the persistent footer is present throughout.

- [ ] **Step 3: Generate Linux visual snapshots on the repository's Linux CI image**

Run in the Linux visual-baseline job/container: `npm ci && npx playwright install --with-deps chromium && npm run test:e2e:update`

Expected: Playwright updates the 12 files under
`e2e/__screenshots__/linux/`; no Windows baseline changes occur.

- [ ] **Step 4: Refresh the audited baseline manifest**

Generate Windows blob IDs with:

```powershell
Get-ChildItem 'e2e\__screenshots__\win32' -Recurse -Filter '*.png' | Sort-Object FullName | ForEach-Object { "$($_.FullName.Replace((Resolve-Path 'e2e\__screenshots__\win32').Path + '\','').Replace('\','/')) $(git hash-object $_.FullName)" }
```

Generate Linux SHA-256/dimensions with:

```powershell
node -e "const fs=require('fs'),crypto=require('crypto'),path=require('path');for(const f of fs.readdirSync('e2e/__screenshots__/linux',{recursive:true}).filter(x=>x.endsWith('.png')).sort()){const b=fs.readFileSync(path.join('e2e/__screenshots__/linux',f));console.log(f.replaceAll('\\','/'),crypto.createHash('sha256').update(b).digest('hex'),b.readUInt32BE(16)+'x'+b.readUInt32BE(20))}"
```

Replace each changed value in `approvedWindowsBlobs` and
`approvedLinuxBaselines`. Keep exactly 12 entries in each object and preserve
sorted relative paths.

Run: `npx vitest run visual-baselines.test.ts`

Expected: PASS; every checked-in baseline matches its explicit platform hash
and dimensions.

- [ ] **Step 5: Inspect desktop and mobile images in one bounded pass**

Inspect player picker, complete roster, tournament, and results at desktop and
Pixel 7 together. Verify identity is primary in picker, compact rows scan in
role order, fallback/photo mixtures keep equal dimensions, long handles wrap
without covering portraits, footer does not compete with the game action, and
no crop shows the wrong player. If defects exist, record all of them, apply one
batched correction, regenerate both platform baseline sets, and refresh hashes.

- [ ] **Step 6: Confirm visuals once**

Run: `npm run test:e2e`

Expected: all screenshots match on the current platform. Do not start another
open-ended polish loop after this confirmation.

- [ ] **Step 7: Run final complete verification**

Run: `npm run verify && npm run test:e2e`

Expected: both commands exit 0 with no failures or warnings requiring action.

- [ ] **Step 8: Commit verified baselines**

```powershell
git add e2e/__screenshots__ visual-baselines.test.ts
git commit -m "test(e2e): approve portrait visuals"
```

- [ ] **Step 9: Check final diff and history**

Run: `git status --short && git log --oneline -8`

Expected: clean status; task commits show policy, importer, provenance, imported
assets, portrait primitive, draft surfaces, terminal surfaces, presentation,
and visual baselines.
