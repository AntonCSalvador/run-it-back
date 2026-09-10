# Complete Player Portrait Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship one verified, local portrait for each of the 239 canonical Champions player identities using Riot/VCT first and reusable Liquipedia media when needed.

**Architecture:** Preserve the current 153 content-addressed portraits, extend portrait provenance to distinguish Liquipedia and Riot/VCT sources, and add a strict reviewed override manifest for sources automatic discovery cannot find. The importer prefers an approved override, otherwise preserves a valid checked-in portrait, otherwise tries Liquipedia; it stages every change transactionally and reports uncovered players without damaging the last-known-good catalog. Source acquisition is completed in first-appearance year cohorts before a final 239/239 build invariant is enabled.

**Tech Stack:** TypeScript 5.9, Node.js 24, Zod 4, Sharp 0.34, Vitest 5, Next.js 16 static export

**Design:** `docs/superpowers/specs/2026-09-09-complete-player-portrait-coverage-design.md`

---

## File map

### New files

- `src/data/champions/portrait-source.ts` — shared source kinds, reuse bases, portrait source-ID parsing, and strict portrait provenance validation.
- `src/data/champions/portrait-overrides.ts` — strict parser and policy validator for reviewed official-source overrides.
- `src/data/champions/portrait-overrides.test.ts` — override schema, identity, URL, source-policy, and duplicate tests.
- `src/data/champions/portrait-overrides.json` — reviewed inputs for the 80 identities not recoverable through bounded Liquipedia thumbnails.
- `scripts/portrait-media.ts` — bounded HTTPS/local-capture loading and deterministic 256-by-256 WebP conversion.
- `scripts/portrait-media.test.ts` — redirect, containment, byte/pixel limit, crop, and conversion tests.
- `scripts/curated-portrait-import.ts` — turn one reviewed override into a staged generated portrait and source row.
- `assets/portrait-sources/` — non-public reviewed frame captures only when an official still image is unavailable.

### Modified files

- `src/features/game/domain.ts` — add optional structured metadata fields to `SourceRef` without changing factual-source records.
- `src/features/game/schema.ts` — parse the new optional source metadata.
- `src/data/champions/portrait-catalog.ts` — accept both Liquipedia and Riot/VCT portrait IDs and validate structured provenance.
- `src/data/champions/portrait-catalog.test.ts` — cover both namespaces, structured reuse bases, and complete coverage.
- `src/data/champions/source-policy.ts` — allow only recognized portrait asset source IDs.
- `src/data/champions/validation.ts` — validate both portrait namespaces and eventually require 239/239 coverage.
- `src/data/champions/validation.test.ts` — reject incomplete or mismatched portrait coverage.
- `src/data/champions/portrait-sources.json` — add structured metadata and 86 new source rows.
- `src/data/champions/portrait-assets.json` — add 86 new portrait rows.
- `scripts/portrait-import.ts` — use bounded thumbnails, reviewed overrides, preservation, deterministic dates, and richer outcomes.
- `scripts/portrait-import.test.ts` — test source precedence, preservation, thumbnail recovery, outcome reporting, and rollback.
- `scripts/import-player-portraits.mts` — parse the retrieval-date argument and load reviewed overrides.
- `scripts/validate-data.mts` — validate exact image format/dimensions, no orphan files, and 239 portraits.
- `scripts/smoke-static.mts` — include overlaid portrait catalog assets in static-output checks.
- `scripts/smoke-static.test.ts` — prove root and base-path exports include portrait catalog assets.
- `src/data/champions/dataset.test.ts` — require all canonical identities, including FiNESSE, to resolve portraits.
- `README.md` — document complete coverage, source tiers, refresh command, and fallback semantics.
- `docs/data-methodology.md` — document reviewed source and takedown workflow.

### Generated files

- `public/assets/players/player-*.webp` — 239 content-addressed 256-by-256 portraits after the final import.
- `out/assets/players/player-*.webp` — build output verified by the static smoke test; never commit `out/`.

---

### Task 1: Model structured portrait provenance

**Files:**
- Create: `src/data/champions/portrait-source.ts`
- Modify: `src/features/game/domain.ts:5`
- Modify: `src/features/game/schema.ts:9`
- Modify: `src/data/champions/portrait-catalog.ts:1-152`
- Modify: `src/data/champions/portrait-catalog.test.ts:8-105`
- Modify: `src/data/champions/source-policy.ts:33-36`
- Modify: `src/data/champions/validation.ts:9-40`
- Modify: `src/data/champions/portrait-sources.json`

- [ ] **Step 1: Write failing source-namespace and provenance tests**

Add fixtures for both source namespaces to `portrait-catalog.test.ts` and assert that an asset source must include structured metadata. Rename the existing `source` fixture to `liquipediaSource` and add its matching `sourceKind`, `reuseBasis`, and `copyrightOwner` fields before adding:

```ts
const riotRow = {
  ...row,
  sourceId: "riot-vct-portrait-1",
};
const riotSource = {
  id: riotRow.sourceId,
  url: "https://valorantesports.com/en-US/news/example",
  originalUrl: "https://cmsassets.rgpub.io/sanity/images/example.jpg",
  retrievedAt: "2026-09-09",
  usage: "asset" as const,
  credit: "VALORANT Esports / Riot Games",
  license: "Riot Legal Jibber Jabber — noncommercial fan project",
  sourceKind: "riot-portrait" as const,
  reuseBasis: "riot-fan-policy" as const,
  copyrightOwner: "Riot Games",
};

it("accepts matching Liquipedia and Riot/VCT portrait source namespaces", () => {
  expect(() => validatePortraitCatalog([player], [row], [liquipediaSource])).not.toThrow();
  expect(() => validatePortraitCatalog([player], [riotRow], [riotSource])).not.toThrow();
});

it("rejects a source namespace that disagrees with its source kind", () => {
  expect(() => validatePortraitCatalog([player], [riotRow], [{ ...riotSource, sourceKind: "liquipedia" }])).toThrow(/source namespace/);
});

it("requires structured provenance on every portrait source", () => {
  const { sourceKind: _kind, reuseBasis: _basis, copyrightOwner: _owner, ...legacy } = riotSource;
  expect(() => validatePortraitCatalog([player], [riotRow], [legacy])).toThrow(/structured portrait provenance/);
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npx vitest run src/data/champions/portrait-catalog.test.ts`

Expected: FAIL because `riot-vct-portrait-1` is rejected and `SourceRef` has no structured portrait fields.

- [ ] **Step 3: Add shared source types and ID helpers**

Create `portrait-source.ts`:

```ts
import { z } from "zod";
import {
  PORTRAIT_REUSE_BASES,
  PORTRAIT_SOURCE_KINDS,
  type PortraitSourceKind,
  type SourceRef,
} from "@/features/game/domain";

export const portraitSourceIdPattern = /^(liquipedia|riot-vct)-portrait-(\d+)$/;

export function portraitSourceId(playerId: string, kind: PortraitSourceKind): string {
  const match = /^player-(\d+)$/.exec(playerId);
  if (!match) throw new Error(`invalid portrait playerId ${playerId}`);
  return `${kind === "liquipedia" ? "liquipedia" : "riot-vct"}-portrait-${match[1]}`;
}

export function portraitSourceIdentity(sourceId: string): string | null {
  return portraitSourceIdPattern.exec(sourceId)?.[2] ?? null;
}

export function isApprovedRiotSourcePage(url: string): boolean;
export function isApprovedPortraitMediaUrl(url: string): boolean;

export const portraitSourceMetadataSchema = z.object({
  sourceKind: z.enum(PORTRAIT_SOURCE_KINDS),
  reuseBasis: z.enum(PORTRAIT_REUSE_BASES),
  copyrightOwner: z.string().trim().min(1),
  sourcePublishedAt: z.string().date().optional(),
  event: z.string().trim().min(1).optional(),
  videoUrl: z.string().url().startsWith("https://").optional(),
  videoTimestampSeconds: z.number().nonnegative().optional(),
  permissionUrl: z.string().url().startsWith("https://").optional(),
}).strict();

export function validatePortraitSourceMetadata(source: SourceRef): void {
  const parsed = portraitSourceMetadataSchema.safeParse({
    sourceKind: source.sourceKind,
    reuseBasis: source.reuseBasis,
    copyrightOwner: source.copyrightOwner,
    sourcePublishedAt: source.sourcePublishedAt,
    event: source.event,
    videoUrl: source.videoUrl,
    videoTimestampSeconds: source.videoTimestampSeconds,
    permissionUrl: source.permissionUrl,
  });
  if (!parsed.success) throw new Error(`structured portrait provenance ${source.id}`);
  const expectedNamespace = parsed.data.sourceKind === "liquipedia" ? "liquipedia" : "riot-vct";
  if (!source.id.startsWith(`${expectedNamespace}-portrait-`)) throw new Error(`portrait source namespace ${source.id}`);
  const hasFrame = parsed.data.sourceKind === "vct-broadcast-frame";
  if (hasFrame !== Boolean(parsed.data.videoUrl && parsed.data.videoTimestampSeconds !== undefined)) {
    throw new Error(`broadcast provenance ${source.id}`);
  }
}
```

Define the constants and types in `domain.ts`, then extend `SourceRef`:

```ts
export const PORTRAIT_SOURCE_KINDS = ["liquipedia", "riot-portrait", "vct-event-photo", "vct-roster-graphic", "vct-broadcast-frame"] as const;
export const PORTRAIT_REUSE_BASES = ["open-license", "riot-fan-policy", "explicit-permission"] as const;
export type PortraitSourceKind = (typeof PORTRAIT_SOURCE_KINDS)[number];
export type PortraitReuseBasis = (typeof PORTRAIT_REUSE_BASES)[number];

export interface SourceRef {
  id: string;
  url: string;
  originalUrl?: string;
  retrievedAt: string;
  usage: "facts" | "asset";
  credit?: string;
  license?: string;
  sourceKind?: PortraitSourceKind;
  reuseBasis?: PortraitReuseBasis;
  copyrightOwner?: string;
  sourcePublishedAt?: string;
  event?: string;
  videoUrl?: string;
  videoTimestampSeconds?: number;
  permissionUrl?: string;
}
```

Extend `sourceRefSchema` with the matching optional Zod fields. Keep them optional at the generic dataset layer because factual sources intentionally omit asset-only metadata.

- [ ] **Step 4: Replace Liquipedia-only ID checks with the shared helper**

In `portrait-catalog.ts`, compare the numeric identity from `playerId`, portrait path, and `portraitSourceIdentity(sourceId)`. Call `validatePortraitSourceMetadata` for every portrait source. In `source-policy.ts` and `validation.ts`, replace `/^liquipedia-portrait-\d+$/` with `portraitSourceIdPattern`.

For `sourceKind: "liquipedia"`, retain the HTTPS Liquipedia Commons description-page requirement. For Riot/VCT kinds, require an official Riot/VCT source page and an approved HTTPS media URL using `isApprovedRiotSourcePage` and `isApprovedPortraitMediaUrl`. Permit only exact hosts or subdomains of `riotgames.com`, `valorantesports.com`, `playvalorant.com`, and `riotcdn.net`, plus exact CDN hosts `cmsassets.rgpub.io`, `images.contentstack.io`, and `static.developer.riotgames.com`; an official article may not point the importer at an arbitrary download host.

Replace the old single `approvedPermission` branch with source-kind-aware checks. A Liquipedia Riot-policy row still requires the existing FileInfo-derived Riot credit and approved Riot/Flickr origin. A Riot/VCT row requires `copyrightOwner: "Riot Games"`, a nonblank credit, an official source page, and an approved media origin. Require every result to match `reuseBasis`:

```ts
if (source.reuseBasis === "open-license" && !isApprovedOpenPortraitLicense(source.license ?? "")) {
  throw new Error(`portrait open-license basis is invalid ${source.id}`);
}
if (source.reuseBasis === "riot-fan-policy" && source.copyrightOwner !== "Riot Games") {
  throw new Error(`portrait Riot ownership is invalid ${source.id}`);
}
if (source.reuseBasis === "explicit-permission" && source.license?.trim().toLowerCase() !== "permission") {
  throw new Error(`portrait permission basis is invalid ${source.id}`);
}
if (source.reuseBasis === "explicit-permission" && !source.permissionUrl) {
  throw new Error(`portrait permission evidence is missing ${source.id}`);
}
```

- [ ] **Step 5: Migrate the 153 existing source rows**

Add `sourceKind: "liquipedia"` to every existing row. Set `reuseBasis` to
`open-license` for approved open licenses and `riot-fan-policy` for the
existing Riot-owned permission rows. Record `copyrightOwner: "Riot Games"`
for policy rows; for open-license rows, review the existing FileInfo credit and
record its named author/owner without changing the original credit, URL,
license, retrieval date, checksum, or asset.

- [ ] **Step 6: Run focused tests**

Run: `npx vitest run src/data/champions/portrait-catalog.test.ts src/data/champions/validation.test.ts src/features/game/schema.test.ts`

Expected: PASS after test fixtures and all production portrait source rows include matching structured metadata.

- [ ] **Step 7: Commit**

```bash
git add src/features/game/domain.ts src/features/game/schema.ts src/data/champions/portrait-source.ts src/data/champions/portrait-catalog.ts src/data/champions/portrait-catalog.test.ts src/data/champions/source-policy.ts src/data/champions/validation.ts src/data/champions/portrait-sources.json
git commit -m "feat(data): model portrait provenance"
```

---

### Task 2: Define the reviewed override manifest

**Files:**
- Create: `src/data/champions/portrait-overrides.ts`
- Create: `src/data/champions/portrait-overrides.test.ts`
- Create: `src/data/champions/portrait-overrides.json`

- [ ] **Step 1: Write failing override parser tests**

Test one official still, one broadcast frame, and the invalid cases:

```ts
const players = [{ id: "player-817", canonicalHandle: "FiNESSE" }];
const still = {
  playerId: "player-817",
  sourceKind: "riot-portrait",
  sourcePageUrl: "https://valorantesports.com/en-US/news/example",
  mediaUrl: "https://cmsassets.rgpub.io/sanity/images/example.jpg",
  credit: "VALORANT Esports / Riot Games",
  copyrightOwner: "Riot Games",
  reuseBasis: "riot-fan-policy",
  license: "Riot Legal Jibber Jabber — noncommercial fan project",
  identityConfirmed: true,
  cropFocus: { x: 0.5, y: 0.35 },
};

it("parses reviewed official stills", () => {
  expect(parsePortraitOverrides([still], players)).toEqual([still]);
});

it("requires a contained capture and timestamp for broadcast frames", () => {
  const { mediaUrl: _mediaUrl, ...frameBase } = still;
  const frame = {
    ...frameBase,
    sourceKind: "vct-broadcast-frame",
    sourcePageUrl: "https://valorantesports.com/en-US/news/champions",
    videoUrl: "https://www.youtube.com/watch?v=official",
    videoTimestampSeconds: 123.5,
    capturePath: "assets/portrait-sources/player-817.png",
  };
  expect(parsePortraitOverrides([frame], players)).toEqual([frame]);
});

it.each([
  [{ ...still, playerId: "missing" }, /unknown player/],
  [[still, still], /duplicate player/],
  [{ ...still, identityConfirmed: false }, /identity confirmation/],
  [{ ...still, sourcePageUrl: "http://example.test" }, /HTTPS/],
  [{ ...still, reuseBasis: "riot-fan-policy", copyrightOwner: "Example Photographer" }, /Riot ownership/],
  [{ ...still, capturePath: "../escape.png" }, /capture path/],
])("rejects an invalid reviewed override", (input, error) => {
  expect(() => parsePortraitOverrides(Array.isArray(input) ? input : [input], players)).toThrow(error);
});
```

- [ ] **Step 2: Run the new test to verify it fails**

Run: `npx vitest run src/data/champions/portrait-overrides.test.ts`

Expected: FAIL because `portrait-overrides.ts` does not exist.

- [ ] **Step 3: Implement discriminated still/frame schemas**

Export these interfaces and parser:

```ts
export type CropFocus = { x: number; y: number };
export type PortraitStillOverride = ReviewedPortraitBase & { mediaUrl: string };
export type PortraitFrameOverride = ReviewedPortraitBase & {
  sourceKind: "vct-broadcast-frame";
  videoUrl: string;
  videoTimestampSeconds: number;
  capturePath: string;
};
export type PortraitOverride = PortraitStillOverride | PortraitFrameOverride;

export function parsePortraitOverrides(input: unknown, players: readonly { id: string; canonicalHandle: string }[]): PortraitOverride[];
```

Use strict Zod schemas. Require `cropFocus.x` and `.y` in `[0, 1]`, HTTPS URLs, literal `identityConfirmed: true`, unique known player IDs, and `assets/portrait-sources/player-<same-id>.(png|jpg|jpeg|webp)` for captures. Accept `riot-fan-policy` only with owner `Riot Games`; accept `open-license` only with an approved license marker; accept `explicit-permission` only with license `permission` and an HTTPS `permissionUrl` recording the transferable grant.

- [ ] **Step 4: Seed an empty production manifest and run tests**

Create `portrait-overrides.json` containing:

```json
[]
```

Run: `npx vitest run src/data/champions/portrait-overrides.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/champions/portrait-overrides.ts src/data/champions/portrait-overrides.test.ts src/data/champions/portrait-overrides.json
git commit -m "feat(data): validate portrait overrides"
```

---

### Task 3: Add bounded portrait media processing

**Files:**
- Create: `scripts/portrait-media.ts`
- Create: `scripts/portrait-media.test.ts`
- Modify: `scripts/portrait-import.ts:1-170,401-410`

- [ ] **Step 1: Write failing media security and conversion tests**

Use Sharp to generate test inputs in memory and assert exact output:

```ts
it("creates a deterministic 256px WebP with a reviewed crop focus", async () => {
  const input = await sharp({
    create: { width: 640, height: 480, channels: 3, background: "#ff4655" },
  }).jpeg().toBuffer();
  const first = await convertPortrait(input, { x: 0.5, y: 0.35 });
  const second = await convertPortrait(input, { x: 0.5, y: 0.35 });
  expect(first.equals(second)).toBe(true);
  await expect(sharp(first).metadata()).resolves.toMatchObject({ width: 256, height: 256, format: "webp" });
});

it("rejects an oversized direct input without disabling pixel safety", async () => {
  const input = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10000" height="8001"><rect width="100%" height="100%"/></svg>');
  await expect(convertPortrait(input)).rejects.toThrow(/80 megapixels/);
});

it("rejects unapproved hosts and redirected hosts", async () => {
  const unusedFetch = vi.fn();
  await expect(loadRemotePortrait("https://example.test/a.jpg", unusedFetch)).rejects.toThrow(/unapproved portrait media URL/);
  expect(unusedFetch).not.toHaveBeenCalled();
  const redirect = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: "https://example.test/a.jpg" } }));
  await expect(loadRemotePortrait("https://cmsassets.rgpub.io/a.jpg", redirect)).rejects.toThrow(/redirect/);
});

it("rejects capture traversal and symlinks", async () => {
  const root = mkdtempSync(join(tmpdir(), "portrait-media-"));
  expect(() => loadPortraitCapture(root, "../escape.png")).toThrow(/capture path/);
});
```

- [ ] **Step 2: Run the new test to verify it fails**

Run: `npx vitest run scripts/portrait-media.test.ts`

Expected: FAIL because `portrait-media.ts` does not exist.

- [ ] **Step 3: Implement bounded loaders and converter**

Export:

```ts
export const MAX_PORTRAIT_BYTES = 15 * 1024 * 1024;
export const MAX_PORTRAIT_PIXELS = 80_000_000;

export async function loadRemotePortrait(url: string, fetch: typeof globalThis.fetch): Promise<Buffer>;
export function loadPortraitCapture(root: string, capturePath: string): Buffer;
export async function convertPortrait(bytes: Buffer, focus?: CropFocus): Promise<Buffer>;
```

`loadRemotePortrait` allows HTTPS media only from exact Liquipedia/Riot hosts or their subdomains: `liquipedia.net`, `riotgames.com`, `valorantesports.com`, `playvalorant.com`, `riotcdn.net`, `rgpub.io`, `contentstack.io`, and `static.developer.riotgames.com`. Validate every redirect manually, cap redirects at four, stream at most 15 MiB, and retain the existing request timeout behavior.

`loadPortraitCapture` resolves only inside `<root>/assets/portrait-sources`, rejects symlinks and non-files, and checks 15 MiB before reading.

`convertPortrait` reads metadata with the 80-megapixel limit and rejects width × height above that same bound. For a reviewed focus, calculate the largest centered square around the normalized point, clamp its `left` and `top` to the input bounds, call `extract`, and then resize to exactly 256 × 256. Without a focus, use Sharp's `attention` crop. Allow enlargement for valid smaller inputs and encode WebP at quality 82/effort 5.

- [ ] **Step 4: Replace the private converter in `portrait-import.ts`**

Import `convertPortrait` from `./portrait-media`. Keep `PortraitConverter` injectable for tests, but set the production default to the shared function. Remove the duplicated byte-limit and Sharp conversion implementation only after existing importer tests use the shared helper.

- [ ] **Step 5: Run media and importer tests**

Run: `npx vitest run scripts/portrait-media.test.ts scripts/portrait-import.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/portrait-media.ts scripts/portrait-media.test.ts scripts/portrait-import.ts scripts/portrait-import.test.ts
git commit -m "feat(data): bound portrait conversion"
```

---

### Task 4: Recover oversized Liquipedia portraits with thumbnails

**Files:**
- Modify: `scripts/portrait-import.ts:320-488`
- Modify: `scripts/portrait-import.test.ts:208-338`

- [ ] **Step 1: Write a failing thumbnail-selection regression test**

Add an importer test whose Commons response supplies a huge original and a bounded thumbnail:

```ts
it("downloads the requested 512px MediaWiki thumbnail instead of the original", async () => {
  const stage = mkdtempSync(join(tmpdir(), "portrait-stage-"));
  const validJpeg = await sharp({ create: { width: 512, height: 512, channels: 3, background: "#111827" } }).jpeg().toBuffer();
  const jsonResponse = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
  const player = { id: "player-9", canonicalHandle: "TenZ" };
  const fetch = vi.fn()
    .mockResolvedValueOnce(jsonResponse({ query: { pages: { 1: { images: [{ title: "File:TenZ.jpg" }] } } } }))
    .mockResolvedValueOnce(jsonResponse({ query: { pages: { 2: {
      title: "File:TenZ.jpg",
      revisions: [{ slots: { main: { "*": "{{FileInfo|featured=TenZ|date=2024-03-01|license=permission|author=VCT Photo Team|copyright=Riot Games|source=https://www.flickr.com/photos/valorantesports/123/}}" } } }],
      imageinfo: [{ url: "https://liquipedia.net/commons/images/original.jpg", thumburl: "https://liquipedia.net/commons/images/thumb/512px-TenZ.jpg" }],
    } } } }))
    .mockResolvedValueOnce(new Response(validJpeg, { status: 200 }));
  const client = new CachedLiquipediaClient({ cacheDir: mkdtempSync(join(tmpdir(), "portrait-cache-")), fetch, wait: vi.fn().mockResolvedValue(undefined), userAgent: "RunItBack/Test", scheduler: new LiquipediaRequestScheduler() });
  const outcomes: PortraitOutcome[] = [];
  const result = await discoverLiquipediaPortrait(player, stage, client, outcome => outcomes.push(outcome));
  expect(result).not.toBeNull();
  expect(fetch.mock.calls[2][0]).toBe("https://liquipedia.net/commons/images/thumb/512px-TenZ.jpg");
  expect(String(fetch.mock.calls[1][0])).toContain("iiurlwidth=512");
  expect(outcomes).toEqual([{ playerId: "player-9", kind: "accepted" }]);
});
```

Extend the existing test imports with `sharp`, `discoverLiquipediaPortrait`, and `type PortraitOutcome`; reuse its existing Node temporary-directory imports.

- [ ] **Step 2: Run the regression test to verify it fails**

Run: `npx vitest run scripts/portrait-import.test.ts -t "512px MediaWiki thumbnail"`

Expected: FAIL because the API query does not request `iiurlwidth` and the importer downloads `url`.

- [ ] **Step 3: Request and select the bounded thumbnail**

Extend the response type and query:

```ts
type WikiPage = {
  // existing fields
  imageinfo?: Array<{ url?: string; thumburl?: string }>;
};

// queryFilePages parameters
iiprop: "url",
iiurlwidth: "512",
```

Use `thumburl ?? url` only for the download URL. Continue recording the FileInfo `source` as provenance and the Liquipedia Commons description page as the human-reviewable source URL.

- [ ] **Step 4: Run focused tests**

Run: `npx vitest run scripts/portrait-import.test.ts scripts/portrait-media.test.ts`

Expected: PASS, including the TenZ-sized regression fixture.

- [ ] **Step 5: Commit**

```bash
git add scripts/portrait-import.ts scripts/portrait-import.test.ts
git commit -m "fix(data): resize Liquipedia portraits"
```

---

### Task 5: Merge overrides, preservation, and deterministic import outcomes

**Files:**
- Create: `scripts/curated-portrait-import.ts`
- Modify: `scripts/portrait-import.ts:17-38,190-383,384-515`
- Modify: `scripts/portrait-import.test.ts:28-245`
- Modify: `scripts/import-player-portraits.mts:1-9`
- Modify: `src/data/champions/portrait-overrides.json`

- [ ] **Step 1: Write failing precedence and preservation tests**

Add tests for the exact resolution order:

```ts
const player = { id: "player-817", canonicalHandle: "FiNESSE" };
const override = parsePortraitOverrides([{
  playerId: "player-817",
  sourceKind: "riot-portrait",
  sourcePageUrl: "https://valorantesports.com/en-US/news/finesse",
  mediaUrl: "https://cmsassets.rgpub.io/finesse.jpg",
  credit: "VALORANT Esports / Riot Games",
  copyrightOwner: "Riot Games",
  reuseBasis: "riot-fan-policy",
  license: "Riot Legal Jibber Jabber — noncommercial fan project",
  identityConfirmed: true,
}], [player])[0];

it("prefers a reviewed override over an existing or discovered portrait", async () => {
  const result = await resolvePortrait(resolutionOptions({ player, override, existing, retrievalDate: "2026-09-09" }));
  expect(result.outcome).toMatchObject({ kind: "replaced", playerId: player.id });
  expect(result.portrait?.source.sourceKind).toBe("riot-portrait");
});

it("preserves an existing validated portrait without a network request", async () => {
  const fetch = vi.fn();
  const result = await resolvePortrait(resolutionOptions({ player, existing, fetch, retrievalDate: "2026-09-09" }));
  expect(result.outcome.kind).toBe("preserved");
  expect(fetch).not.toHaveBeenCalled();
});

it("reports an uncovered player without replacing the last-known-good catalogs", async () => {
  await expect(importPortraits(incompleteOptions)).resolves.toMatchObject({ uncovered: ["player-817"] });
  expect(readFileSync(assetsPath, "utf8")).toBe(previousAssets);
  expect(readFileSync(sourcesPath, "utf8")).toBe(previousSources);
});

it("produces identical files and catalogs for identical inputs and retrieval date", async () => {
  await importPortraits(completeOptions);
  const first = snapshotManagedPortraitOutputs(completeOptions.root);
  await importPortraits(completeOptions);
  expect(snapshotManagedPortraitOutputs(completeOptions.root)).toEqual(first);
});
```

Define `existingPortraitFixture`, `resolutionOptions`, `snapshotManagedPortraitOutputs`, `completeOptions`, and `incompleteOptions` beside the existing temporary-project helpers. Each helper must create real temporary catalog/source files and use injected fake fetch responses; no test may read the production portrait catalog. Also test a remote still override, a contained broadcast capture, duplicate override rejection, a curated conversion failure, and an invalid `--retrieved-at` argument.

- [ ] **Step 2: Run focused tests to verify they fail**

Run: `npx vitest run scripts/portrait-import.test.ts src/data/champions/portrait-overrides.test.ts`

Expected: FAIL because the importer does not load overrides, preserve existing rows, or expose the richer outcome.

- [ ] **Step 3: Implement curated portrait discovery**

Update `scripts/portrait-import.ts` with the outcome types:

```ts
export type PortraitOutcomeKind = "preserved" | "imported" | "replaced" | "uncovered";
export interface PortraitOutcome {
  playerId: string;
  kind: PortraitOutcomeKind;
  reason?: "missing" | "rights-rejected" | "ambiguous" | "unsupported-image";
}
```

Create `scripts/curated-portrait-import.ts` with:

```ts
export async function discoverCuratedPortrait(
  player: ImportPlayer,
  override: PortraitOverride,
  root: string,
  stageDir: string,
  fetch: typeof globalThis.fetch,
  retrievalDate: string,
): Promise<GeneratedPortrait>;
```

For stills, call `loadRemotePortrait(override.mediaUrl, fetch)`. For frames, call `loadPortraitCapture(root, override.capturePath)`. Convert with the optional crop focus, derive `riot-vct-portrait-<numeric-id>`, and generate a structured source record from the reviewed fields. Never infer owner, reuse basis, identity, event, or timestamp during import.

Export the orchestrator boundary from `portrait-import.ts`:

```ts
export async function resolvePortrait(options: {
  player: ImportPlayer;
  override?: PortraitOverride;
  existing?: GeneratedPortrait;
  root: string;
  stageDir: string;
  client: CachedLiquipediaClient;
  fetch: typeof globalThis.fetch;
  retrievalDate: string;
}): Promise<{ portrait: GeneratedPortrait | null; outcome: PortraitOutcome }>;
```

- [ ] **Step 4: Implement resolution precedence and last-known-good preservation**

Load and validate existing asset/source rows at the start. For every player:

```ts
if (override) return curated(override, existing ? "replaced" : "imported");
if (existing) return preserveAndStage(existing, "preserved");
const discovered = await discoverLiquipediaPortrait(/* ... */);
return discovered
  ? { portrait: discovered, outcome: { playerId: player.id, kind: "imported" } }
  : { portrait: null, outcome: { playerId: player.id, kind: "uncovered", reason } };
```

Only call `buildPortraitOutputs` when there are no uncovered players. While coverage is being populated, return and print the uncovered report without publishing partial catalogs. The CLI exits nonzero after reporting gaps; there is no incomplete-publication mode.

Format the summary exactly as:

```text
portrait import summary: preserved=153 imported=6 replaced=0 uncovered=80 total=239
```

Then print one deterministic line per uncovered player:

```text
portrait uncovered: player-817 (FiNESSE) reason=missing next=riot-vct
```

- [ ] **Step 5: Require an explicit retrieval date in the CLI**

Parse `--retrieved-at YYYY-MM-DD` in `import-player-portraits.mts`, load `portrait-overrides.json`, and pass both to `importPortraits`. Reject missing, duplicate, malformed, or future dates with usage:

```text
usage: npm run import:portraits -- --retrieved-at YYYY-MM-DD
```

- [ ] **Step 6: Run importer tests**

Run: `npx vitest run scripts/portrait-import.test.ts src/data/champions/portrait-overrides.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/curated-portrait-import.ts scripts/portrait-import.ts scripts/portrait-import.test.ts scripts/import-player-portraits.mts src/data/champions/portrait-overrides.json
git commit -m "feat(data): merge reviewed portraits"
```

---

## Source review checklist for Tasks 6–10

Apply this checklist to every reviewed override. A row is not ready until every item passes:

1. Search Riot Games, `valorantesports.com`, `playvalorant.com`, and official VCT event material using both canonical and common handles.
2. Prefer a standalone headshot. If absent, use an official event photo or roster graphic. Use an official broadcast frame only when no acceptable still exists.
3. Verify the source itself names the player or the frame/graphic makes the identity unambiguous in event context.
4. Inspect page credits. If a third-party photographer or owner is named, record compatible permission; do not label it Riot-owned.
5. Use Liquipedia only when its FileInfo grants an approved open license, names Riot as owner under the fan policy, or records explicit permission transferable to this project.
6. Reject fair use, unknown ownership, Liquipedia-only permission, unverified social reposts, VLR scraping, and search-result thumbnails.
7. Record the real source page, direct media or capture path, credit, copyright owner, reuse basis, license, publication date when present, event when present, and `identityConfirmed: true`.
8. Inspect local frame captures during source review. Inspect all generated 256-pixel portraits after the complete import in Task 10 and add normalized crop focus only when attention crop misses the face.
9. Never enter placeholder URLs, credits, dates, owner names, or licenses.

---

### Task 6: Review the 2021 first-appearance cohort

**Files:**
- Modify: `src/data/champions/portrait-overrides.json`
- Add as needed: `assets/portrait-sources/player-*.{png,jpg,jpeg,webp}`
- Modify: `src/data/champions/portrait-overrides.test.ts`

The cohort is: Witz, v1xen, doma, sheydos, gtn, MAGNUM, dispenser, Patiphan, d3ffo, Klaus, Sushiboys, SuperBusS, SantaGolf, SicK, dapr, Chronicle, ShahZaM, zombs, stax, mitch, frz, xand, nzr, saadhak, k1Ng, Lakia, murizzz, FiNESSE, mazin, and TenZ. The bounded Liquipedia path from Task 4 supplies stax and TenZ; add reviewed overrides for the other 28.

- [ ] **Step 1: Add a failing cohort assertion**

```ts
import overridesInput from "./portrait-overrides.json";
import { championsDataset } from "./index";

const productionOverrides = parsePortraitOverrides(overridesInput, championsDataset.players);
const overridePlayerIds = new Set(productionOverrides.map(override => override.playerId));
const missingOverrideHandles = (handles: string[]) => handles.filter(handle => {
  const player = championsDataset.players.find(candidate => candidate.canonicalHandle === handle);
  return !player || !overridePlayerIds.has(player.id);
});

const cohort2021Overrides = ["Witz", "v1xen", "doma", "sheydos", "gtn", "MAGNUM", "dispenser", "Patiphan", "d3ffo", "Klaus", "Sushiboys", "SuperBusS", "SantaGolf", "SicK", "dapr", "Chronicle", "ShahZaM", "zombs", "mitch", "frz", "xand", "nzr", "saadhak", "k1Ng", "Lakia", "murizzz", "FiNESSE", "mazin"];
expect(missingOverrideHandles(cohort2021Overrides)).toEqual([]);
```

- [ ] **Step 2: Run the cohort test to verify it fails**

Run: `npx vitest run src/data/champions/portrait-overrides.test.ts -t "2021 portrait cohort"`

Expected: FAIL and list the 28 unresolved handles.

- [ ] **Step 3: Research and record all 28 reviewed sources**

Follow the source review checklist. For FiNESSE, begin with official VCT 2023 awards and NRG/OpTic event coverage; accept the first source that provides a clearly identifiable official portrait or roster crop with valid ownership evidence. If only an official broadcast frame qualifies, save it as `assets/portrait-sources/player-817.<ext>` and record the official video URL plus exact timestamp.

- [ ] **Step 4: Run cohort manifest verification**

Run: `npx vitest run src/data/champions/portrait-overrides.test.ts`

Expected: PASS with 28 unique, policy-valid 2021 override rows. No generated catalog changes occur yet.

- [ ] **Step 5: Commit**

```bash
git add assets/portrait-sources src/data/champions/portrait-overrides.json src/data/champions/portrait-overrides.test.ts
git commit -m "feat(data): review 2021 portrait sources"
```

---

### Task 7: Review the 2022 first-appearance cohort

**Files:**
- Modify: `src/data/champions/portrait-overrides.json`
- Add as needed: `assets/portrait-sources/player-*.{png,jpg,jpeg,webp}`
- Modify: `src/data/champions/portrait-overrides.test.ts`

The cohort is Enzo, Famouz, Smoggy, xffero, and mindfreak. The bounded Liquipedia path from Task 4 supplies Smoggy; add reviewed overrides for the other four.

- [ ] **Step 1: Add and fail the cohort assertion**

```ts
const cohort2022Overrides = ["Enzo", "Famouz", "xffero", "mindfreak"];
expect(missingOverrideHandles(cohort2022Overrides)).toEqual([]);
```

Run: `npx vitest run src/data/champions/portrait-overrides.test.ts -t "2022 portrait cohort"`

Expected: FAIL with Enzo, Famouz, xffero, and mindfreak.

- [ ] **Step 2: Research and record the four sources**

Follow the source review checklist and add four real reviewed manifest rows. Add a contained official broadcast capture only when no qualifying still exists.

- [ ] **Step 3: Run cohort verification**

Run: `npx vitest run src/data/champions/portrait-overrides.test.ts`

Expected: PASS with 32 cumulative unique, policy-valid override rows.

- [ ] **Step 4: Commit**

```bash
git add assets/portrait-sources src/data/champions/portrait-overrides.json src/data/champions/portrait-overrides.test.ts
git commit -m "feat(data): review 2022 portrait sources"
```

---

### Task 8: Review the 2023 first-appearance cohort

**Files:**
- Modify: `src/data/champions/portrait-overrides.json`
- Add as needed: `assets/portrait-sources/player-*.{png,jpg,jpeg,webp}`
- Modify: `src/data/champions/portrait-overrides.test.ts`

The cohort is something, Demon1, DaveeyS, DK, Sayf, carpe, MOJJ, nizhaoTZH, ban, AtaKaptan, and MrFaliN. Add 11 reviewed overrides.

- [ ] **Step 1: Add and fail the cohort assertion**

```ts
const cohort2023Overrides = ["something", "Demon1", "DaveeyS", "DK", "Sayf", "carpe", "MOJJ", "nizhaoTZH", "ban", "AtaKaptan", "MrFaliN"];
expect(missingOverrideHandles(cohort2023Overrides)).toEqual([]);
```

Run: `npx vitest run src/data/champions/portrait-overrides.test.ts -t "2023 portrait cohort"`

Expected: FAIL with all 11 handles.

- [ ] **Step 2: Research and record all 11 sources**

Follow the source review checklist and add 11 real reviewed manifest rows. Add contained official broadcast captures only when no qualifying still exists.

- [ ] **Step 3: Run cohort verification**

Run: `npx vitest run src/data/champions/portrait-overrides.test.ts`

Expected: PASS with 43 cumulative unique, policy-valid override rows.

- [ ] **Step 4: Commit**

```bash
git add assets/portrait-sources src/data/champions/portrait-overrides.json src/data/champions/portrait-overrides.test.ts
git commit -m "feat(data): review 2023 portrait sources"
```

---

### Task 9: Review the 2024 first-appearance cohort

**Files:**
- Modify: `src/data/champions/portrait-overrides.json`
- Add as needed: `assets/portrait-sources/player-*.{png,jpg,jpeg,webp}`
- Modify: `src/data/champions/portrait-overrides.test.ts`

The cohort is Kicks, Foxy9, johnqt, JitBoyS, MiniBoo, Wo0t, runneR, primmie, hiro, benjyfishy, Karon, Flashback, Governor, Flex1n, heybay, yetujey, Autumn, and t3xture. The bounded Liquipedia path from Task 4 supplies Flashback; add reviewed overrides for the other 17.

- [ ] **Step 1: Add and fail the cohort assertion**

```ts
const cohort2024Overrides = ["Kicks", "Foxy9", "johnqt", "JitBoyS", "MiniBoo", "Wo0t", "runneR", "primmie", "hiro", "benjyfishy", "Karon", "Governor", "Flex1n", "heybay", "yetujey", "Autumn", "t3xture"];
expect(missingOverrideHandles(cohort2024Overrides)).toEqual([]);
```

Run: `npx vitest run src/data/champions/portrait-overrides.test.ts -t "2024 portrait cohort"`

Expected: FAIL with the 17 unresolved handles.

- [ ] **Step 2: Research and record the 17 sources**

Follow the source review checklist and add 17 real reviewed manifest rows. Add contained official broadcast captures only when no qualifying still exists.

- [ ] **Step 3: Run cohort verification**

Run: `npx vitest run src/data/champions/portrait-overrides.test.ts`

Expected: PASS with 60 cumulative unique, policy-valid override rows.

- [ ] **Step 4: Commit**

```bash
git add assets/portrait-sources src/data/champions/portrait-overrides.json src/data/champions/portrait-overrides.test.ts
git commit -m "feat(data): review 2024 portrait sources"
```

---

### Task 10: Review 2025 sources and generate all portraits

**Files:**
- Modify: `src/data/champions/portrait-overrides.json`
- Add as needed: `assets/portrait-sources/player-*.{png,jpg,jpeg,webp}`
- Modify: `src/data/champions/portrait-overrides.test.ts`
- Modify: `src/data/champions/portrait-assets.json`
- Modify: `src/data/champions/portrait-sources.json`
- Add: `public/assets/players/player-*.webp`
- Modify: `src/data/champions/dataset.test.ts`

The cohort is skuba, ara, keiko, Nicc, PatMen, crazyguy, kamo, free1ng, brawk, Jemkin, HYUNMIN, iZu, paTiTek, SpiritZ1, DH, Kushy, mada, Akeman, grubinho, artzin, Monyet, and kaajak. The bounded Liquipedia path from Task 4 supplies free1ng and HYUNMIN; add reviewed overrides for the other 20.

- [ ] **Step 1: Add and fail the cohort assertion**

```ts
const cohort2025Overrides = ["skuba", "ara", "keiko", "Nicc", "PatMen", "crazyguy", "kamo", "brawk", "Jemkin", "iZu", "paTiTek", "SpiritZ1", "DH", "Kushy", "mada", "Akeman", "grubinho", "artzin", "Monyet", "kaajak"];
expect(missingOverrideHandles(cohort2025Overrides)).toEqual([]);
```

Run: `npx vitest run src/data/champions/portrait-overrides.test.ts -t "2025 portrait cohort"`

Expected: FAIL with the 20 unresolved handles.

- [ ] **Step 2: Research and record the 20 sources**

Follow the source review checklist and add 20 real reviewed manifest rows. Add contained official broadcast captures only when no qualifying still exists.

- [ ] **Step 3: Verify all 80 reviewed overrides**

Run: `npx vitest run src/data/champions/portrait-overrides.test.ts`

Expected: PASS with 80 unique, policy-valid overrides across the five cohorts.

- [ ] **Step 4: Write the failing final dataset assertions**

```ts
it("ships one portrait for every canonical player", () => {
  expect(championsDataset.players).toHaveLength(239);
  expect(championsDataset.players.filter(player => player.portrait !== null)).toHaveLength(239);
});

it("covers FiNESSE and the formerly oversized portrait sources", () => {
  for (const handle of ["FiNESSE", "TenZ", "stax", "Smoggy", "Flashback", "free1ng", "HYUNMIN"]) {
    expect(championsDataset.players.find(player => player.canonicalHandle === handle)?.portrait).toMatch(/^\/assets\/players\/player-/);
  }
});
```

Run: `npx vitest run src/data/champions/dataset.test.ts -t "every canonical|FiNESSE"`

Expected: FAIL because the generated catalog still contains 153 portraits.

- [ ] **Step 5: Generate the complete catalog transactionally**

Run: `npm run import:portraits -- --retrieved-at 2026-09-09`

Expected summary: `preserved=153 imported=86 replaced=0 uncovered=0 total=239`.

Confirm the six automatically recovered rows correspond to player IDs `9`, `485`, `4742`, `35013`, `1916`, and `28400`, use `sourceKind: "liquipedia"`, and were downloaded through bounded thumbnail URLs.

- [ ] **Step 6: Inspect all 86 new portraits**

Open each new `public/assets/players/player-*.webp` and compare its player ID with `portrait-overrides.json` or the six automatic records. Verify the intended person is visible, the face is not clipped, and no roster graphic text dominates the crop. For a bad crop, change only that override's normalized `cropFocus`, rerun the complete import, and inspect the replacement.

- [ ] **Step 7: Run cohort and catalog verification**

Run: `npm run validate:data && npx vitest run src/data/champions/dataset.test.ts src/data/champions/portrait-overrides.test.ts src/data/champions/portrait-catalog.test.ts`

Expected: PASS with 239 pictured players and 239 structured portrait sources.

- [ ] **Step 8: Commit**

```bash
git add assets/portrait-sources src/data/champions/portrait-overrides.json src/data/champions/portrait-assets.json src/data/champions/portrait-sources.json src/data/champions/dataset.test.ts public/assets/players
git commit -m "feat(data): complete portrait coverage"
```

---

### Task 11: Enforce 239/239 coverage and static export integrity

**Files:**
- Modify: `src/data/champions/portrait-catalog.ts:61-139`
- Modify: `src/data/champions/portrait-catalog.test.ts`
- Modify: `src/data/champions/validation.ts:25-42`
- Modify: `src/data/champions/validation.test.ts`
- Modify: `scripts/validate-data.mts:15-46`
- Modify: `scripts/smoke-static.mts:68-100`
- Modify: `scripts/smoke-static.test.ts`
- Modify: `scripts/portrait-import.ts`
- Modify: `scripts/portrait-import.test.ts`

- [ ] **Step 1: Write failing complete-coverage and image-integrity tests**

```ts
it("requires exactly one portrait for every canonical player", () => {
  expect(championsDataset.players).toHaveLength(239);
  expect(championsDataset.players.filter(player => player.portrait !== null)).toHaveLength(239);
  expect(new Set(portraitAssets.map(asset => asset.playerId))).toEqual(new Set(championsDataset.players.map(player => player.id)));
});

it("rejects a catalog with one player omitted", () => {
  expect(() => validatePortraitCatalog([player], [], [], { requireCompleteCoverage: true })).toThrow(/portrait coverage.*player-1/);
});

it("includes portrait overlay assets in static smoke checks", () => {
  writePortraitCatalog(root, [{ portrait: "/assets/players/player-1.hash.webp" }]);
  expect(() => smokeStatic(join(root, "out"), { projectRoot: root })).toThrow("player-1.hash.webp");
});
```

In `smoke-static.test.ts`, define the helper used above:

```ts
function writePortraitCatalog(root: string, rows: Array<{ portrait: string }>) {
  const directory = join(root, "src", "data", "champions");
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "portrait-assets.json"), JSON.stringify(rows));
}
```

Add validator cases for wrong format, non-256 dimensions, checksum mismatch, orphan public portrait, missing static-export portrait, and base-path export placement.

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `npx vitest run src/data/champions/portrait-catalog.test.ts src/data/champions/validation.test.ts scripts/smoke-static.test.ts`

Expected: FAIL because complete coverage, dimensions, orphan detection, and overlaid static assets are not enforced.

- [ ] **Step 3: Enable complete catalog validation**

Add `requireCompleteCoverage?: boolean` to validation options. When true, require the asset player-ID set to equal the canonical player-ID set and include every missing handle/ID in the error. Call it with `true` from `validateChampions`.

Confirm the importer continues to exit nonzero without publishing when any player is uncovered.

- [ ] **Step 4: Validate exact files and image metadata**

Make `validate-data.mts` async and inspect each portrait with Sharp:

```ts
const metadata = await sharp(file, { failOn: "warning" }).metadata();
if (metadata.format !== "webp" || metadata.width !== 256 || metadata.height !== 256) {
  diagnostics.push(`portrait ${playerId} must be a 256x256 WebP`);
}
```

Compare the managed filenames under `public/assets/players` with catalog paths in both directions. Require 239 catalog rows and 239 managed files.

- [ ] **Step 5: Include portrait catalog overlays in static smoke**

Update `datasetAssets` to read `portrait-assets.json` in addition to yearly files:

```ts
const portraits = JSON.parse(readFileSync(resolve(dataDirectory, "portrait-assets.json"), "utf8")) as Array<{ portrait: string }>;
assets.push(...portraits.map(row => row.portrait));
```

Update the `temporaryProject` test helper to create `portrait-assets.json` containing `[]`, then let individual tests replace it through `writePortraitCatalog`. The existing `outputPath` logic verifies root and configured base-path exports without network access.

- [ ] **Step 6: Run focused verification**

Run: `npm run validate:data && npx vitest run src/data/champions/portrait-catalog.test.ts src/data/champions/validation.test.ts scripts/smoke-static.test.ts src/data/champions/dataset.test.ts`

Expected: PASS with 239 unique, valid portraits and no managed orphans.

- [ ] **Step 7: Commit**

```bash
git add src/data/champions/portrait-catalog.ts src/data/champions/portrait-catalog.test.ts src/data/champions/validation.ts src/data/champions/validation.test.ts scripts/validate-data.mts scripts/smoke-static.mts scripts/smoke-static.test.ts scripts/portrait-import.ts scripts/portrait-import.test.ts
git commit -m "test(data): require complete portraits"
```

---

### Task 12: Document and verify the release

**Files:**
- Modify: `README.md:67-105`
- Modify: `docs/data-methodology.md`
- Modify: `docs/RELEASING.md:108-124`

- [ ] **Step 1: Update portrait documentation**

State that all 239 canonical identities have local portraits, explain Riot/VCT-first and Liquipedia-second sourcing, document the explicit command:

```bash
npm run import:portraits -- --retrieved-at YYYY-MM-DD
```

Explain that initials now indicate a runtime/deployment failure rather than expected dataset coverage. Retain the noncommercial fan-project notice, source-credit explanation, takedown replacement workflow, and the rule against fair-use or Liquipedia-only-permission files.

- [ ] **Step 2: Run the complete verification suite**

Run: `npm run verify`

Expected: lint, typecheck, Vitest, Python extraction tests, data validation, and production build all PASS.

- [ ] **Step 3: Verify root static output**

Run: `npm run smoke:static`

Expected: `Static smoke passed: out` and an asset count including all 239 portraits.

- [ ] **Step 4: Verify GitHub Pages base-path output**

PowerShell:

```powershell
$env:GITHUB_PAGES='true'
$env:GITHUB_REPOSITORY='AntonCSalvador/run-it-back'
npm run build
npm run smoke:static -- out --base-path /run-it-back
Remove-Item Env:GITHUB_PAGES
Remove-Item Env:GITHUB_REPOSITORY
```

Expected: build and static smoke PASS with every portrait under the base path.

- [ ] **Step 5: Audit the final catalogs**

Run:

```powershell
node -e "const a=require('./src/data/champions/portrait-assets.json'),s=require('./src/data/champions/portrait-sources.json'); console.log({assets:a.length,sources:s.length,players:new Set(a.map(x=>x.playerId)).size,paths:new Set(a.map(x=>x.portrait)).size})"
```

Expected:

```text
{ assets: 239, sources: 239, players: 239, paths: 239 }
```

Inspect `git status --short` and confirm only intended documentation changes remain before committing.

- [ ] **Step 6: Commit**

```bash
git add README.md docs/data-methodology.md docs/RELEASING.md
git commit -m "docs: explain complete portrait coverage"
```

---

## Final acceptance checklist

- [ ] Exactly 239 canonical players, portrait rows, portrait sources, and managed public WebPs exist.
- [ ] Every WebP is 256 by 256, checksum-valid, and present in root and base-path static exports.
- [ ] FiNESSE/FNS has one canonical portrait used by his 2021, 2022, and 2023 cards.
- [ ] TenZ, stax, Smoggy, Flashback, free1ng, and HYUNMIN import from bounded thumbnails rather than oversized originals.
- [ ] Every Riot/VCT override has reviewed identity and ownership metadata.
- [ ] No fair-use, Liquipedia-only permission, VLR-scraped, unverified social, or hotlinked asset ships.
- [ ] Runtime initials fallback tests still pass.
- [ ] An incomplete import cannot replace the last-known-good complete catalog.
- [ ] `npm run verify` and both static smoke configurations pass.
