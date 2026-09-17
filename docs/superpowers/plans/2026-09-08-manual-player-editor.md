# Manual Player Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local browser editor that safely manages the complete manual role, rating, IGL, and review data used by all 404 production player-event cards.

**Architecture:** A strict shared manual-catalog module validates and merges a committed JSON catalog over the generated Champions snapshots. A separate loopback-only Vite/React tool reads generated evidence and saves the catalog through a revision-checked, atomic local API; the Next.js static export imports only the catalog and shared merge code.

**Tech Stack:** TypeScript 5.9, React 19, Vite 8, Zod 4, Vitest 5, React Testing Library, Node.js 24 filesystem and HTTP APIs, Next.js 16 static export.

---

## File structure

### Production data

- Create `src/data/champions/manual-data.ts`: schema, catalog coverage checks, initial-catalog creation, and generated-card merge.
- Create `src/data/champions/manual-data.test.ts`: focused catalog and merge tests.
- Create `src/data/champions/manual-player-data.json`: complete, stable, committed 404-card manual catalog.
- Create `scripts/seed-manual-player-data.mts`: explicit first-time initializer that refuses to overwrite an existing catalog.
- Modify `src/data/champions/index.ts`: expose generated data for auditing and apply the manual catalog for the runtime dataset.
- Modify `src/data/champions/validation.ts`: validate historical derivation separately from the manual runtime fields.
- Modify `src/data/champions/validation.test.ts`: pass and exercise the manual catalog boundary.
- Modify `src/data/champions/dataset.test.ts`: remove assumptions that future manual edits must equal reviewed derivation.
- Modify `scripts/validate-data.mts`: provide the manual catalog to the audit validator.
- Modify `src/features/game/rating.ts`: export the existing trait weights as read-only editor context.

### Local editor

- Create `tools/player-editor/index.html`: Vite entry document.
- Create `tools/player-editor/vite.config.ts`: loopback-only editor server, React plugin, path aliases, and local API plugin.
- Create `tools/player-editor/server.ts`: fixed-path repository operations, content revisions, atomic saving, and API handler.
- Create `tools/player-editor/server.test.ts`: repository and API behavior tests.
- Create `tools/player-editor/src/types.ts`: editor document, filters, save state, and API contracts.
- Create `tools/player-editor/src/api.ts`: browser GET/PUT client.
- Create `tools/player-editor/src/test-fixtures.ts`: complete typed editor documents reused by UI/model tests.
- Create `tools/player-editor/src/model.ts`: filtering, equality, validation display, undo, and reset helpers.
- Create `tools/player-editor/src/model.test.ts`: pure editor-state tests.
- Create `tools/player-editor/src/app.tsx`: loading, draft ownership, save lifecycle, filtering, and page-exit warning.
- Create `tools/player-editor/src/app.test.tsx`: master-detail workflow tests using an injected in-memory API.
- Create `tools/player-editor/src/player-list.tsx`: search/filter controls and event-card list.
- Create `tools/player-editor/src/card-editor.tsx`: roles, ratings, IGL, review, deltas, and evidence controls.
- Create `tools/player-editor/src/main.tsx`: React mount.
- Create `tools/player-editor/src/editor.css`: approved master-detail presentation and responsive behavior.

### Tooling and documentation

- Modify `package.json` and `package-lock.json`: add direct Vite dependency and `edit:players`/`init:player-data` commands.
- Modify `docs/vct-algorithm-quick-guide.md`: make the manual editor the supported per-player workflow.
- Modify `docs/vct-sme-review-guide.md`: document the new source-of-truth boundary and release process.
- Modify `workflows.test.ts`: assert the editor is not a Next.js route or production artifact input.

## Task 1: Define and test the manual catalog contract

**Files:**

- Create: `src/data/champions/manual-data.test.ts`
- Create: `src/data/champions/manual-data.ts`

- [ ] **Step 1: Write failing contract and merge tests**

Create `src/data/champions/manual-data.test.ts` with small real `PlayerCard`
fixtures. Cover a valid catalog, exact ID ordering and coverage, duplicate roles,
integer/range checks, initial seeding, editable-field replacement, and
non-editable-field preservation:

```ts
import { describe, expect, it } from "vitest";
import type { PlayerCard } from "@/features/game/domain";
import {
  applyManualCatalog,
  createInitialManualCatalog,
  parseManualCatalog,
} from "./manual-data";

const makeCard = (id: string): PlayerCard => ({
  id,
  playerId: `player-${id}`,
  teamId: "team-2025",
  year: 2025,
  displayHandle: id,
  mapsPlayed: 10,
  eligibleRoles: ["smokes"],
  historicalIgl: false,
  traits: {
    firepower: 10,
    utility: 20,
    survival: 30,
    clutch: 40,
    consistency: 50,
    leadership: 60,
  },
  sourceIds: ["source"],
});

const generated = [makeCard("alpha-team-2025"), makeCard("beta-team-2025")];

describe("manual player catalog", () => {
  it("creates a complete stable catalog from generated cards", () => {
    expect(createInitialManualCatalog([...generated].reverse())).toEqual({
      version: 1,
      cards: [
        {
          cardId: "alpha-team-2025",
          eligibleRoles: ["smokes"],
          historicalIgl: false,
          traits: generated[0].traits,
          reviewed: false,
        },
        {
          cardId: "beta-team-2025",
          eligibleRoles: ["smokes"],
          historicalIgl: false,
          traits: generated[1].traits,
          reviewed: false,
        },
      ],
    });
  });

  it("replaces only editable game fields", () => {
    const catalog = createInitialManualCatalog(generated);
    catalog.cards[0] = {
      ...catalog.cards[0],
      eligibleRoles: ["initiator", "flex"],
      historicalIgl: true,
      traits: { firepower: 91, utility: 81, survival: 71, clutch: 61, consistency: 51, leadership: 88 },
      reviewed: true,
    };
    const result = applyManualCatalog(generated, parseManualCatalog(catalog, generated.map(card => card.id)));
    expect(result[0]).toMatchObject({
      id: generated[0].id,
      playerId: generated[0].playerId,
      teamId: generated[0].teamId,
      year: generated[0].year,
      mapsPlayed: generated[0].mapsPlayed,
      sourceIds: generated[0].sourceIds,
      eligibleRoles: ["initiator", "flex"],
      historicalIgl: true,
      traits: catalog.cards[0].traits,
    });
    expect("reviewed" in result[0]).toBe(false);
  });

  it.each([
    ["missing card", (catalog: ReturnType<typeof createInitialManualCatalog>) => { catalog.cards.pop(); }],
    ["unknown card", (catalog: ReturnType<typeof createInitialManualCatalog>) => { catalog.cards[0].cardId = "unknown"; }],
    ["wrong order", (catalog: ReturnType<typeof createInitialManualCatalog>) => { catalog.cards.reverse(); }],
    ["duplicate role", (catalog: ReturnType<typeof createInitialManualCatalog>) => { catalog.cards[0].eligibleRoles = ["smokes", "smokes"]; }],
    ["empty roles", (catalog: ReturnType<typeof createInitialManualCatalog>) => { catalog.cards[0].eligibleRoles = []; }],
    ["fractional trait", (catalog: ReturnType<typeof createInitialManualCatalog>) => { catalog.cards[0].traits.firepower = 10.5; }],
    ["low trait", (catalog: ReturnType<typeof createInitialManualCatalog>) => { catalog.cards[0].traits.firepower = -1; }],
    ["high trait", (catalog: ReturnType<typeof createInitialManualCatalog>) => { catalog.cards[0].traits.firepower = 101; }],
  ])("rejects %s", (_, mutate) => {
    const catalog = createInitialManualCatalog(generated);
    mutate(catalog);
    expect(() => parseManualCatalog(catalog, generated.map(card => card.id))).toThrow(/manual player catalog/i);
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npx vitest run src/data/champions/manual-data.test.ts
```

Expected: FAIL because `./manual-data` does not exist.

- [ ] **Step 3: Implement the strict catalog module**

Create `src/data/champions/manual-data.ts`:

```ts
import { z } from "zod";
import { ROLES, type PlayerCard, type Role, type Traits } from "@/features/game/domain";

const integerTrait = z.number().int().min(0).max(100);
const manualTraitsSchema = z.object({
  firepower: integerTrait,
  utility: integerTrait,
  survival: integerTrait,
  clutch: integerTrait,
  consistency: integerTrait,
  leadership: integerTrait,
}).strict();

const rolesSchema = z.array(z.enum(ROLES)).min(1).superRefine((roles, context) => {
  if (new Set(roles).size !== roles.length) {
    context.addIssue({ code: "custom", message: "roles must be distinct" });
  }
});

export const manualPlayerEntrySchema = z.object({
  cardId: z.string().min(1),
  eligibleRoles: rolesSchema,
  historicalIgl: z.boolean(),
  traits: manualTraitsSchema,
  reviewed: z.boolean(),
}).strict();

export const manualPlayerCatalogSchema = z.object({
  version: z.literal(1),
  cards: z.array(manualPlayerEntrySchema),
}).strict();

export type ManualPlayerEntry = z.infer<typeof manualPlayerEntrySchema>;
export type ManualPlayerCatalog = z.infer<typeof manualPlayerCatalogSchema>;

function catalogError(message: string): Error {
  return new Error(`Invalid manual player catalog: ${message}`);
}

export function parseManualCatalog(input: unknown, expectedCardIds: string[]): ManualPlayerCatalog {
  const parsed = manualPlayerCatalogSchema.safeParse(input);
  if (!parsed.success) {
    throw catalogError(parsed.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join("; "));
  }
  if (parsed.data.cards.length !== expectedCardIds.length) {
    throw catalogError(`expected ${expectedCardIds.length} cards, received ${parsed.data.cards.length}`);
  }
  const actualIds = parsed.data.cards.map(card => card.cardId);
  const duplicates = actualIds.filter((id, index) => actualIds.indexOf(id) !== index);
  if (duplicates.length) throw catalogError(`duplicate card IDs: ${[...new Set(duplicates)].join(", ")}`);
  const mismatch = expectedCardIds.findIndex((id, index) => actualIds[index] !== id);
  if (mismatch !== -1) {
    throw catalogError(`card ${mismatch + 1} must be ${expectedCardIds[mismatch]}, received ${actualIds[mismatch] ?? "missing"}`);
  }
  return parsed.data;
}

export function createInitialManualCatalog(cards: PlayerCard[]): ManualPlayerCatalog {
  return {
    version: 1,
    cards: [...cards].sort((left, right) => left.id.localeCompare(right.id)).map(card => ({
      cardId: card.id,
      eligibleRoles: [...card.eligibleRoles] as Role[],
      historicalIgl: card.historicalIgl,
      traits: { ...card.traits } as Traits,
      reviewed: false,
    })),
  };
}

export function applyManualCatalog(cards: PlayerCard[], catalog: ManualPlayerCatalog): PlayerCard[] {
  const entries = new Map(catalog.cards.map(entry => [entry.cardId, entry]));
  return cards.map(card => {
    const entry = entries.get(card.id);
    if (!entry) throw catalogError(`missing card ${card.id}`);
    return {
      ...card,
      eligibleRoles: [...entry.eligibleRoles],
      historicalIgl: entry.historicalIgl,
      traits: { ...entry.traits },
      sourceIds: [...card.sourceIds],
    };
  });
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```powershell
npx vitest run src/data/champions/manual-data.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the catalog contract**

```powershell
git add src/data/champions/manual-data.ts src/data/champions/manual-data.test.ts
git commit -m "feat(data): define manual player catalog"
```

## Task 2: Seed all 404 entries and merge them into production

**Files:**

- Create: `scripts/seed-manual-player-data.mts`
- Create: `src/data/champions/manual-player-data.json`
- Modify: `src/data/champions/index.ts`
- Modify: `src/data/champions/dataset.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write a failing runtime integration test**

Add these imports and test to `src/data/champions/dataset.test.ts`:

```ts
import manualData from "./manual-player-data.json";
import { generatedChampionsDataset, manualPlayerCatalog } from "./index";

it("uses a complete manual catalog without changing the seeded game values", () => {
  expect(manualPlayerCatalog.cards).toHaveLength(generatedChampionsDataset.cards.length);
  expect(manualData.cards.map(card => card.cardId)).toEqual(
    [...generatedChampionsDataset.cards].sort((left, right) => left.id.localeCompare(right.id)).map(card => card.id),
  );
  for (const generated of generatedChampionsDataset.cards) {
    const runtime = championsDataset.cards.find(card => card.id === generated.id)!;
    expect(runtime.eligibleRoles).toEqual(generated.eligibleRoles);
    expect(runtime.historicalIgl).toBe(generated.historicalIgl);
    expect(runtime.traits).toEqual(generated.traits);
  }
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
npx vitest run src/data/champions/dataset.test.ts
```

Expected: FAIL because the manual JSON and new exports do not exist.

- [ ] **Step 3: Add the non-overwriting initializer**

Create `scripts/seed-manual-player-data.mts`:

```ts
import { writeFileSync } from "node:fs";
import year2021 from "../src/data/champions/2021.json";
import year2022 from "../src/data/champions/2022.json";
import year2023 from "../src/data/champions/2023.json";
import year2024 from "../src/data/champions/2024.json";
import year2025 from "../src/data/champions/2025.json";
import { createInitialManualCatalog } from "../src/data/champions/manual-data";
import type { PlayerCard } from "../src/features/game/domain";

const cards = [year2021, year2022, year2023, year2024, year2025]
  .flatMap(snapshot => snapshot.cards) as PlayerCard[];
const catalog = createInitialManualCatalog(cards);
const path = new URL("../src/data/champions/manual-player-data.json", import.meta.url);

writeFileSync(path, `${JSON.stringify(catalog, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
console.log(`Initialized ${catalog.cards.length} manual player cards`);
```

Add the script to `package.json`:

```json
"init:player-data": "tsx scripts/seed-manual-player-data.mts"
```

Run it once:

```powershell
npm run init:player-data
```

Expected: `Initialized 404 manual player cards`. Run it a second time and
confirm it refuses to overwrite the existing file with `EEXIST`.

- [ ] **Step 4: Apply the catalog during dataset assembly**

Refactor `src/data/champions/index.ts` so the generated and runtime datasets are
separate exports:

```ts
import manualPlayerData from "./manual-player-data.json";
import { applyManualCatalog, parseManualCatalog } from "./manual-data";

const generatedInput = {
  version: 1,
  sources: sourceRefs,
  teams: snapshots.flatMap(snapshot => snapshot.teams),
  players: deduplicatePlayers(),
  cards: snapshots.flatMap(snapshot => snapshot.cards),
};

export const generatedChampionsDataset = parseDataset(generatedInput);
const generatedIds = [...generatedChampionsDataset.cards]
  .sort((left, right) => left.id.localeCompare(right.id))
  .map(card => card.id);
export const manualPlayerCatalog = parseManualCatalog(manualPlayerData, generatedIds);

export const championsDataset = freezeDataset(parseDataset({
  ...generatedChampionsDataset,
  cards: applyManualCatalog(generatedChampionsDataset.cards, manualPlayerCatalog),
}));
```

Keep the existing `dataset` and default exports pointing to
`championsDataset`. Do not freeze `generatedChampionsDataset`; the runtime
freezer receives cloned card fields from `applyManualCatalog`.

- [ ] **Step 5: Run data and game integration tests**

Run:

```powershell
npx vitest run src/data/champions/manual-data.test.ts src/data/champions/dataset.test.ts src/features/game/rating.test.ts src/features/game/opponents.test.ts
```

Expected: PASS and the initial manual catalog produces no gameplay changes.

- [ ] **Step 6: Confirm derivation leaves the manual catalog untouched**

Run:

```powershell
$before = (Get-FileHash src/data/champions/manual-player-data.json -Algorithm SHA256).Hash
npm run derive:data
$after = (Get-FileHash src/data/champions/manual-player-data.json -Algorithm SHA256).Hash
if ($before -ne $after) { throw "derive:data changed manual player data" }
```

Expected: `Derived 404 card roles, evidence rows, and all six traits`, followed
by no PowerShell error.

- [ ] **Step 7: Commit the seeded production layer**

```powershell
git add package.json scripts/seed-manual-player-data.mts src/data/champions/index.ts src/data/champions/dataset.test.ts src/data/champions/manual-player-data.json src/data/champions/2021.json src/data/champions/2022.json src/data/champions/2023.json src/data/champions/2024.json src/data/champions/2025.json src/data/champions/evidence.json
git diff --cached --check
git commit -m "feat(data): use manual player values"
```

Before committing, omit any generated yearly/evidence file whose content did
not actually change.

## Task 3: Separate historical audit validation from manual authority

**Files:**

- Modify: `src/data/champions/validation.test.ts`
- Modify: `src/data/champions/validation.ts`
- Modify: `src/data/champions/dataset.test.ts`
- Modify: `scripts/validate-data.mts`

- [ ] **Step 1: Write failing validation-boundary tests**

Import `generatedChampionsDataset`, `manualPlayerCatalog`,
`applyManualCatalog`, and `parseManualCatalog`. Pass the catalog as the third
argument to every existing `validateChampions` call. Add these tests:

```ts
it("accepts valid manual values that differ from derived evidence", () => {
  const manual = structuredClone(manualPlayerCatalog);
  manual.cards[0].eligibleRoles = ["flex"];
  manual.cards[0].historicalIgl = true;
  manual.cards[0].traits = {
    firepower: 100,
    utility: 0,
    survival: 73,
    clutch: 22,
    consistency: 61,
    leadership: 91,
  };
  const parsed = parseManualCatalog(manual, manualPlayerCatalog.cards.map(card => card.cardId));
  const runtime = {
    ...structuredClone(generatedChampionsDataset),
    cards: applyManualCatalog(generatedChampionsDataset.cards, parsed),
  };
  expect(() => validateChampions(runtime, evidence as Evidence[], parsed)).not.toThrow();
});

it("rejects a runtime card that differs from its manual entry", () => {
  const runtime = structuredClone(championsDataset);
  runtime.cards[0].traits.firepower = runtime.cards[0].traits.firepower === 100 ? 99 : 100;
  expect(() => validateChampions(runtime, evidence as Evidence[], manualPlayerCatalog)).toThrow(/manual firepower/i);
});
```

Update the existing arbitrary-trait test to expect a `/manual/` mismatch. Change
derived role and leadership audit assertions to operate on the `derived` result
inside the validator, not on editable runtime card fields.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
npx vitest run src/data/champions/validation.test.ts
```

Expected: FAIL because `validateChampions` accepts only two arguments and still
requires runtime manual fields to equal derivation.

- [ ] **Step 3: Implement the three-input validation boundary**

Change the signature in `src/data/champions/validation.ts`:

```ts
import type { ManualPlayerCatalog } from "./manual-data";

export function validateChampions(
  dataset: GameDataset,
  evidence: Evidence[],
  manualCatalog: ManualPlayerCatalog,
): void {
```

After deriving expected cards, add:

```ts
const manualByCard = new Map(manualCatalog.cards.map(card => [card.cardId, card]));
if (manualByCard.size !== expectedCards.size) errors.push("manual catalog cardinality");
```

Inside the card loop, keep generated comparisons for `playerId`, `teamId`,
`year`, `displayHandle`, `mapsPlayed`, `sourceIds`, and every evidence field.
Replace the generated comparisons for editable runtime fields with:

```ts
const manual = manualByCard.get(card.id);
if (!manual) { errors.push(`manual card ${card.id}`); continue; }
if (card.historicalIgl !== manual.historicalIgl) errors.push(`manual historicalIgl ${card.id}`);
if (JSON.stringify(card.eligibleRoles) !== JSON.stringify(manual.eligibleRoles)) errors.push(`manual eligibleRoles ${card.id}`);
for (const trait of ["firepower", "utility", "survival", "clutch", "consistency", "leadership"] as const) {
  if (card.traits[trait] !== manual.traits[trait]) errors.push(`manual ${trait} ${card.id}`);
}
```

Use `expected.eligibleRoles`, `expected.historicalIgl`, and `expected.traits`
for all threshold, Flex, missing-coverage, and reviewed-leadership audit rules.
These rules must continue proving derivation integrity without restricting the
manual entry.

- [ ] **Step 4: Pass the catalog from the validation script**

Update `scripts/validate-data.mts`:

```ts
import { championsDataset, manualPlayerCatalog } from "../src/data/champions";

validateChampions(dataset, evidence, manualPlayerCatalog);
```

Update all test invocations to pass `manualPlayerCatalog` or the explicitly
modified parsed catalog used by that test.

- [ ] **Step 5: Make derivation-focused dataset assertions independent of manual edits**

In `src/data/champions/dataset.test.ts`, keep game-dataset schema, team, source,
and freeze assertions on `championsDataset`. Move exact six-IGL and derivation
role expectations to `generatedChampionsDataset`. Keep the new manual catalog
coverage test from Task 2.

- [ ] **Step 6: Run validation tests and the CLI validator**

Run:

```powershell
npx vitest run src/data/champions/manual-data.test.ts src/data/champions/dataset.test.ts src/data/champions/validation.test.ts
npm run validate:data
```

Expected: all tests PASS and the CLI prints `Validated Champions dataset` with
404 cards.

- [ ] **Step 7: Commit the validation boundary**

```powershell
git add src/data/champions/validation.ts src/data/champions/validation.test.ts src/data/champions/dataset.test.ts scripts/validate-data.mts
git commit -m "refactor(data): separate manual authority"
```

## Task 4: Build revisioned, atomic repository operations

**Files:**

- Create: `tools/player-editor/server.test.ts`
- Create: `tools/player-editor/server.ts`
- Modify: `src/features/game/rating.ts`

- [ ] **Step 1: Write failing repository and handler tests**

Create `tools/player-editor/server.test.ts`. Use `mkdtemp` under `tmpdir`, copy a
small valid catalog into it, and inject two generated fixture cards plus matching
evidence. Test:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createInitialManualCatalog } from "@/data/champions/manual-data";
import type { Evidence } from "@/data/champions/validation";
import type { PlayerCard, TeamAppearance } from "@/features/game/domain";
import {
  createPlayerDataHandler,
  fileRevision,
  readEditorDocument,
  saveManualCatalog,
} from "./server";

const makeCard = (id: string): PlayerCard => ({
  id,
  playerId: `player-${id}`,
  teamId: "team-2025",
  year: 2025,
  displayHandle: id,
  mapsPlayed: 10,
  eligibleRoles: ["smokes"],
  historicalIgl: false,
  traits: { firepower: 10, utility: 20, survival: 30, clutch: 40, consistency: 50, leadership: 60 },
  sourceIds: ["source"],
});

async function makeRepositoryFixture(registry: string[]) {
  const directory = await mkdtemp(join(tmpdir(), "run-it-back-player-editor-"));
  registry.push(directory);
  const generatedCards = [makeCard("alpha-team-2025"), makeCard("beta-team-2025")];
  const teams: TeamAppearance[] = [{
    id: "team-2025", name: "Team", shortName: "T", year: 2025, logo: null, sourceIds: ["source"],
  }];
  const evidence: Evidence[] = generatedCards.map(card => ({
    cardId: card.id,
    year: 2025,
    mapsPlayed: 10,
    agentClassMaps: { smokes: 10, duelist: 0, initiator: 0, sentinel: 0 },
    threshold: 2,
    suggestedRoles: ["smokes"],
    finalEligibleRoles: ["smokes"],
    override: null,
    sourceIds: ["source"],
    clutchCoverageMaps: 10,
    clutchWins: 2,
    clutchSourceIds: ["source"],
    performanceAvailableMaps: 10,
  }));
  const manualPath = join(directory, "manual-player-data.json");
  await writeFile(manualPath, `${JSON.stringify(createInitialManualCatalog(generatedCards), null, 2)}\n`);
  return { manualPath, generatedCards, teams, evidence };
}

const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(path => rm(path, { recursive: true, force: true })));
});

it("reads manual, generated, evidence, team, weight, and revision data", async () => {
  const fixture = await makeRepositoryFixture(temporaryDirectories);
  const document = await readEditorDocument(fixture);
  expect(document.revision).toMatch(/^[a-f0-9]{64}$/);
  expect(document.cards[0]).toMatchObject({ manual: { cardId: fixture.generatedCards[0].id }, generated: fixture.generatedCards[0] });
  expect(document.cards[0].evidence.cardId).toBe(fixture.generatedCards[0].id);
  expect(document.traitWeights.firepower).toBe(0.35);
});

it("saves formatted valid data only when the revision matches", async () => {
  const fixture = await makeRepositoryFixture(temporaryDirectories);
  const before = await readFile(fixture.manualPath, "utf8");
  const catalog = createInitialManualCatalog(fixture.generatedCards);
  catalog.cards[0].traits.leadership = 99;
  const result = await saveManualCatalog(fixture, fileRevision(before), catalog);
  const saved = await readFile(fixture.manualPath, "utf8");
  expect(saved).toBe(`${JSON.stringify(catalog, null, 2)}\n`);
  expect(result.revision).toBe(fileRevision(saved));
});

it("rejects stale and invalid saves without changing the target", async () => {
  const fixture = await makeRepositoryFixture(temporaryDirectories);
  const before = await readFile(fixture.manualPath, "utf8");
  await expect(saveManualCatalog(fixture, "0".repeat(64), createInitialManualCatalog(fixture.generatedCards)))
    .rejects.toMatchObject({ status: 409 });
  const invalid = createInitialManualCatalog(fixture.generatedCards);
  invalid.cards[0].traits.firepower = 101;
  await expect(saveManualCatalog(fixture, fileRevision(before), invalid)).rejects.toMatchObject({ status: 400 });
  expect(await readFile(fixture.manualPath, "utf8")).toBe(before);
});

it("preserves the target when replacement fails", async () => {
  const fixture = await makeRepositoryFixture(temporaryDirectories);
  const before = await readFile(fixture.manualPath, "utf8");
  await expect(saveManualCatalog(fixture, fileRevision(before), createInitialManualCatalog(fixture.generatedCards), {
    replace: async () => { throw new Error("replacement failed"); },
  })).rejects.toThrow("replacement failed");
  expect(await readFile(fixture.manualPath, "utf8")).toBe(before);
});

it("exposes only GET and PUT on the fixed player-data endpoint", async () => {
  const fixture = await makeRepositoryFixture(temporaryDirectories);
  const handler = createPlayerDataHandler(fixture);
  expect((await handler(new Request("http://localhost/api/player-data"))).status).toBe(200);
  expect((await handler(new Request("http://localhost/api/player-data", { method: "DELETE" }))).status).toBe(405);
  expect((await handler(new Request("http://localhost/api/anything-else"))).status).toBe(404);
});
```

Keep filesystem calls real.

- [ ] **Step 2: Run the server test and verify RED**

Run:

```powershell
npx vitest run tools/player-editor/server.test.ts
```

Expected: FAIL because `tools/player-editor/server.ts` does not exist.

- [ ] **Step 3: Export the current weights without changing scoring**

In `src/features/game/rating.ts`, change:

```ts
const TRAIT_WEIGHTS = {
```

to:

```ts
export const TRAIT_WEIGHTS = {
```

No numeric value changes.

- [ ] **Step 4: Implement fixed-path repository reads and safe saves**

Create `tools/player-editor/server.ts` with these public contracts:

```ts
import { createHash, randomUUID } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import type { PlayerCard, TeamAppearance } from "@/features/game/domain";
import type { Evidence } from "@/data/champions/validation";
import {
  parseManualCatalog,
  type ManualPlayerCatalog,
} from "@/data/champions/manual-data";
import { TRAIT_WEIGHTS } from "@/features/game/rating";

export interface PlayerEditorRepository {
  manualPath: string;
  generatedCards: PlayerCard[];
  teams: TeamAppearance[];
  evidence: Evidence[];
}

export class PlayerEditorHttpError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

export const fileRevision = (text: string): string =>
  createHash("sha256").update(text).digest("hex");

export async function readEditorDocument(repository: PlayerEditorRepository) {
  const text = await readFile(repository.manualPath, "utf8");
  const expectedIds = [...repository.generatedCards].sort((a, b) => a.id.localeCompare(b.id)).map(card => card.id);
  const catalog = parseManualCatalog(JSON.parse(text), expectedIds);
  const manual = new Map(catalog.cards.map(card => [card.cardId, card]));
  const evidence = new Map(repository.evidence.map(row => [row.cardId, row]));
  const teams = new Map(repository.teams.map(team => [team.id, team]));
  for (const card of repository.generatedCards) {
    if (!evidence.has(card.id)) throw new Error(`Missing evidence for ${card.id}`);
    if (!teams.has(card.teamId)) throw new Error(`Missing team for ${card.id}`);
  }
  return {
    revision: fileRevision(text),
    traitWeights: TRAIT_WEIGHTS,
    cards: [...repository.generatedCards].sort((a, b) => a.id.localeCompare(b.id)).map(card => ({
      generated: card,
      manual: manual.get(card.id)!,
      evidence: evidence.get(card.id)!,
      team: teams.get(card.teamId)!,
    })),
  };
}

export async function saveManualCatalog(
  repository: PlayerEditorRepository,
  expectedRevision: string,
  input: unknown,
  operations: { replace: typeof rename } = { replace: rename },
) {
  const current = await readFile(repository.manualPath, "utf8");
  if (fileRevision(current) !== expectedRevision) throw new PlayerEditorHttpError(409, "Player data changed on disk; reload before saving");
  const ids = [...repository.generatedCards].sort((a, b) => a.id.localeCompare(b.id)).map(card => card.id);
  let catalog: ManualPlayerCatalog;
  try { catalog = parseManualCatalog(input, ids); }
  catch (error) { throw new PlayerEditorHttpError(400, error instanceof Error ? error.message : String(error)); }
  const formatted = `${JSON.stringify(catalog, null, 2)}\n`;
  const temporaryPath = `${repository.manualPath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, formatted, { encoding: "utf8", flag: "wx" });
    await operations.replace(temporaryPath, repository.manualPath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
  return { revision: fileRevision(formatted) };
}
```

Also implement `createPlayerDataHandler(repository)` as a `(request: Request) =>
Promise<Response>` handler. Return the editor document for `GET
/api/player-data`; accept `{ revision, catalog }` for `PUT /api/player-data`;
return JSON errors with the `PlayerEditorHttpError` status; return 405 with an
`Allow: GET, PUT` header for other methods on that path; and return 404 for any
other path. Read PUT with `request.text()`, reject when
`Buffer.byteLength(text, "utf8") > 2 * 1024 * 1024`, then parse the JSON and
require exactly the `revision` and `catalog` properties before calling
`saveManualCatalog`.

- [ ] **Step 5: Run server and rating tests**

Run:

```powershell
npx vitest run tools/player-editor/server.test.ts src/features/game/rating.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit repository operations**

```powershell
git add tools/player-editor/server.ts tools/player-editor/server.test.ts src/features/game/rating.ts
git commit -m "feat(editor): add safe player data storage"
```

## Task 5: Add the loopback-only Vite entry point and API bridge

**Files:**

- Create: `tools/player-editor/index.html`
- Create: `tools/player-editor/vite.config.ts`
- Create: `tools/player-editor/startup.test.ts`
- Create: `tools/player-editor/src/main.tsx`
- Create: `tools/player-editor/src/api.ts`
- Create: `tools/player-editor/src/api.test.ts`
- Create: `tools/player-editor/src/types.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Add Vite as a direct development dependency**

Run:

```powershell
npm install --save-dev vite@^8.2.2
```

Expected: `package.json` lists `vite` directly and `package-lock.json` remains
internally consistent.

- [ ] **Step 2: Write failing startup and browser-client tests**

Create `tools/player-editor/startup.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Plugin, UserConfig } from "vite";
import config from "./vite.config";

describe("local player editor startup", () => {
  it("binds to loopback, opens the browser, and mounts the React entry", () => {
    const resolved = config as UserConfig;
    const pluginNames = (resolved.plugins ?? []).flat(Infinity).filter(Boolean).map(plugin => (plugin as Plugin).name);
    expect(resolved).toMatchObject({ root: expect.stringMatching(/tools[\\/]player-editor$/), server: { host: "127.0.0.1", port: 4310, strictPort: true, open: true } });
    expect(pluginNames).toContain("player-editor-api");
    expect(readFileSync("tools/player-editor/index.html", "utf8")).toContain('src="/src/main.tsx"');
  });
});
```

Create `tools/player-editor/src/api.test.ts` around an injected Fetch-compatible
transport:

```ts
import { describe, expect, it, vi } from "vitest";
import { createEditorApi } from "./api";

it("loads and saves through the fixed endpoint", async () => {
  const request = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(JSON.stringify({ revision: "a", cards: [], traitWeights: {} }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ revision: "b" }), { status: 200 }));
  const api = createEditorApi(request);
  await expect(api.load()).resolves.toMatchObject({ revision: "a" });
  await expect(api.save({ revision: "a", catalog: { version: 1, cards: [] } })).resolves.toEqual({ revision: "b" });
  expect(request.mock.calls[0][0]).toBe("/api/player-data");
  expect(request.mock.calls[1][1]).toMatchObject({ method: "PUT" });
});

it("surfaces the server message and status", async () => {
  const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ error: "reload before saving" }), { status: 409 }));
  await expect(createEditorApi(request).load()).rejects.toMatchObject({ message: "reload before saving", status: 409 });
});
```

- [ ] **Step 3: Run the startup and client tests and verify RED**

Run:

```powershell
npx vitest run tools/player-editor/startup.test.ts tools/player-editor/src/api.test.ts
```

Expected: FAIL because the Vite config, HTML entry, and browser API client do
not exist.

- [ ] **Step 4: Define editor API types and client**

Create `tools/player-editor/src/types.ts`:

```ts
import type { ManualPlayerCatalog, ManualPlayerEntry } from "@/data/champions/manual-data";
import type { Evidence } from "@/data/champions/validation";
import type { PlayerCard, Role, TeamAppearance } from "@/features/game/domain";
import type { TRAIT_WEIGHTS } from "@/features/game/rating";

export interface EditorCard {
  generated: PlayerCard;
  manual: ManualPlayerEntry;
  evidence: Evidence;
  team: TeamAppearance;
}
export interface EditorDocument {
  revision: string;
  traitWeights: typeof TRAIT_WEIGHTS;
  cards: EditorCard[];
}
export interface SaveRequest { revision: string; catalog: ManualPlayerCatalog }
export interface SaveResponse { revision: string }
export type ReviewFilter = "all" | "needs-review" | "reviewed" | "changed";
export interface EditorFilters { query: string; year: "all" | number; teamId: "all" | string; role: "all" | Role; review: ReviewFilter }
```

Create `tools/player-editor/src/api.ts`:

```ts
import type { EditorDocument, SaveRequest, SaveResponse } from "./types";

async function json<T>(response: Response): Promise<T> {
  const body = await response.json() as T | { error?: string };
  if (!response.ok) throw Object.assign(new Error("error" in body && body.error ? body.error : `Request failed (${response.status})`), { status: response.status });
  return body as T;
}

export interface EditorApi {
  load(): Promise<EditorDocument>;
  save(request: SaveRequest): Promise<SaveResponse>;
}

export function createEditorApi(request: typeof fetch = fetch): EditorApi {
  return {
    load: () => request("/api/player-data").then(response => json<EditorDocument>(response)),
    save: payload => request("/api/player-data", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }).then(response => json<SaveResponse>(response)),
  };
}

export const browserEditorApi = createEditorApi();
```

- [ ] **Step 5: Add the Vite HTML and React mount**

Create `tools/player-editor/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Run It Back · Local Player Editor</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Create `tools/player-editor/src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import "./editor.css";

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
```

- [ ] **Step 6: Bridge Vite middleware to the fixed Request handler**

Create `tools/player-editor/vite.config.ts`. Import the five generated snapshots,
teams, evidence, `createPlayerDataHandler`, React, and `vite-tsconfig-paths`.
Create one repository object with this fixed path:

```ts
const manualPath = fileURLToPath(new URL("../../src/data/champions/manual-player-data.json", import.meta.url));
```

Add a Vite plugin whose `configureServer` hook registers only
`/api/player-data`. Convert the incoming Node method, headers, and PUT body to a
Web `Request`, call `createPlayerDataHandler`, then copy status, headers, and
body to the Node response. The body reader must stop and return 413 after 2 MiB.

Configure Vite exactly as a local tool:

```ts
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [tsconfigPaths(), react(), playerEditorApiPlugin()],
  server: { host: "127.0.0.1", port: 4310, strictPort: true, open: true },
});
```

Add to `package.json`:

```json
"edit:players": "vite --config tools/player-editor/vite.config.ts"
```

- [ ] **Step 7: Add a temporary minimal `App` and stylesheet to smoke-test startup**

Create `tools/player-editor/src/app.tsx`:

```tsx
export function App() {
  return <main><h1>Run It Back · Local Player Editor</h1></main>;
}
```

Create `tools/player-editor/src/editor.css`:

```css
:root { color: #181816; background: #f3f1ec; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
* { box-sizing: border-box; }
body { margin: 0; min-width: 320px; }
button, input, select { font: inherit; }
```

- [ ] **Step 8: Run the startup/client tests and verify GREEN**

Run:

```powershell
npx vitest run tools/player-editor/startup.test.ts tools/player-editor/src/api.test.ts
```

Expected: PASS.

- [ ] **Step 9: Run the editor and verify the real API manually**

Run:

```powershell
npm run edit:players
```

Expected: the browser opens `http://127.0.0.1:4310`, the heading renders, and
`http://127.0.0.1:4310/api/player-data` returns a revision plus 404 cards. Stop
the server with Ctrl+C.

- [ ] **Step 10: Run type checking and server tests**

Run:

```powershell
npm run typecheck
npx vitest run tools/player-editor/server.test.ts tools/player-editor/startup.test.ts tools/player-editor/src/api.test.ts
```

Expected: PASS.

- [ ] **Step 11: Commit local-tool startup**

```powershell
git add package.json package-lock.json tools/player-editor/index.html tools/player-editor/vite.config.ts tools/player-editor/startup.test.ts tools/player-editor/src/main.tsx tools/player-editor/src/api.ts tools/player-editor/src/api.test.ts tools/player-editor/src/types.ts tools/player-editor/src/app.tsx tools/player-editor/src/editor.css
git commit -m "feat(editor): start local player editor"
```

## Task 6: Implement filtering and draft-state behavior

**Files:**

- Create: `tools/player-editor/src/model.test.ts`
- Create: `tools/player-editor/src/model.ts`
- Create: `tools/player-editor/src/test-fixtures.ts`

- [ ] **Step 1: Create a complete typed editor fixture**

Create `tools/player-editor/src/test-fixtures.ts`. Export
`makeEditorDocument(): EditorDocument` with two cards: Boaster/FNATIC 2023 and
`2024 Player`/Example Team 2024. Give each card a complete `generated`
`PlayerCard`, copied `manual` entry, complete `Evidence`, and `TeamAppearance`.
Use this exact document-level data:

```ts
return {
  revision: "a".repeat(64),
  traitWeights: { firepower: 0.35, utility: 0.2, survival: 0.15, clutch: 0.15, consistency: 0.15 },
  cards: [
    makeEditorCard({
      id: "boaster-fnatic-2023", handle: "Boaster", teamId: "fnatic-2023",
      teamName: "FNATIC", teamShortName: "FNC", year: 2023,
      roles: ["smokes"], historicalIgl: true,
      traits: { firepower: 47, utility: 69, survival: 97, clutch: 94, consistency: 13, leadership: 75 },
    }),
    makeEditorCard({
      id: "2024-card-id", handle: "2024 Player", teamId: "example-2024",
      teamName: "Example Team", teamShortName: "EX", year: 2024,
      roles: ["initiator"], historicalIgl: false,
      traits: { firepower: 60, utility: 70, survival: 50, clutch: 40, consistency: 80, leadership: 50 },
    }),
  ],
};
```

Implement the local `makeEditorCard` helper with `mapsPlayed: 10`, generated
and manual copies of the supplied roles/traits, `reviewed: false`, and matching
evidence. Evidence uses one agent-class count of 10 for the supplied normal role
(Smokes for Boaster, Initiator for the second card), threshold 2, complete
performance coverage, zero clutch wins, and no override.

- [ ] **Step 2: Write failing model tests**

Create `tools/player-editor/src/model.test.ts` with three representative editor
cards and assertions for:

```ts
import { describe, expect, it } from "vitest";
import {
  changedCardIds,
  filterCards,
  resetEntryToDerived,
  undoEntry,
  validateDraft,
} from "./model";
import { makeEditorDocument } from "./test-fixtures";

const cards = makeEditorDocument().cards;
const saved = Object.fromEntries(cards.map(card => [card.manual.cardId, structuredClone(card.manual)]));
const draft = structuredClone(saved);

it("searches handle, card ID, and team case-insensitively and combines filters", () => {
  expect(filterCards(cards, draft, { query: "fnatic", year: 2023, teamId: "all", role: "smokes", review: "needs-review" }, saved))
    .toEqual([cards[0]]);
});

it("finds changes and restores saved or derived values", () => {
  const edited = structuredClone(draft);
  edited[cards[0].manual.cardId].traits.firepower = 99;
  expect(changedCardIds(edited, saved)).toEqual(new Set([cards[0].manual.cardId]));
  expect(undoEntry(cards[0].manual.cardId, edited, saved)).toEqual(saved[cards[0].manual.cardId]);
  expect(resetEntryToDerived(cards[0], edited)).toMatchObject({
    cardId: cards[0].generated.id,
    eligibleRoles: cards[0].generated.eligibleRoles,
    historicalIgl: cards[0].generated.historicalIgl,
    traits: cards[0].generated.traits,
  });
});

it("reports invalid cards before save", () => {
  const edited = structuredClone(draft);
  edited[cards[0].manual.cardId].eligibleRoles = [];
  edited[cards[1].manual.cardId].traits.leadership = 101;
  expect(validateDraft(edited, cards.map(card => card.generated.id))).toEqual(new Map([
    [cards[0].manual.cardId, expect.stringMatching(/role/i)],
    [cards[1].manual.cardId, expect.stringMatching(/leadership/i)],
  ]));
});
```

Use typed fixture helpers in the test rather than `as unknown as` casts.

- [ ] **Step 3: Run the model test and verify RED**

Run:

```powershell
npx vitest run tools/player-editor/src/model.test.ts
```

Expected: FAIL because `model.ts` does not exist.

- [ ] **Step 4: Implement pure model helpers**

Create `tools/player-editor/src/model.ts` with:

```ts
import { parseManualCatalog, type ManualPlayerCatalog, type ManualPlayerEntry } from "@/data/champions/manual-data";
import type { EditorCard, EditorFilters } from "./types";

export type DraftById = Record<string, ManualPlayerEntry>;

export const entriesById = (cards: ManualPlayerEntry[]): DraftById =>
  Object.fromEntries(cards.map(card => [card.cardId, structuredClone(card)]));

export const entryEqual = (left: ManualPlayerEntry, right: ManualPlayerEntry): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

export function changedCardIds(draft: DraftById, saved: DraftById): Set<string> {
  return new Set(Object.keys(saved).filter(id => !entryEqual(draft[id], saved[id])));
}

export function catalogFromDraft(draft: DraftById, orderedIds: string[]): ManualPlayerCatalog {
  return { version: 1, cards: orderedIds.map(id => structuredClone(draft[id])) };
}

export function validateDraft(draft: DraftById, orderedIds: string[]): Map<string, string> {
  const errors = new Map<string, string>();
  for (const id of orderedIds) {
    try { parseManualCatalog({ version: 1, cards: [draft[id]] }, [id]); }
    catch (error) { errors.set(id, error instanceof Error ? error.message : String(error)); }
  }
  return errors;
}

export function undoEntry(id: string, draft: DraftById, saved: DraftById): ManualPlayerEntry {
  return structuredClone(saved[id]);
}

export function resetEntryToDerived(card: EditorCard, draft: DraftById): ManualPlayerEntry {
  return {
    ...structuredClone(draft[card.generated.id]),
    eligibleRoles: [...card.generated.eligibleRoles],
    historicalIgl: card.generated.historicalIgl,
    traits: { ...card.generated.traits },
  };
}
```

Implement `filterCards` by normalizing the query with `trim().toLocaleLowerCase()`
and matching handle, card ID, full team name, or short team name. Apply year,
team, manual-role, and review filters together. The `changed` filter uses
`changedCardIds(draft, saved)`; the other review filters use `draft[id].reviewed`.

- [ ] **Step 5: Run model tests and verify GREEN**

Run:

```powershell
npx vitest run tools/player-editor/src/model.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the state model**

```powershell
git add tools/player-editor/src/model.ts tools/player-editor/src/model.test.ts tools/player-editor/src/test-fixtures.ts
git commit -m "feat(editor): add player review model"
```

## Task 7: Build the approved master-detail editing workflow

**Files:**

- Create: `tools/player-editor/src/app.test.tsx`
- Modify: `tools/player-editor/src/app.tsx`
- Create: `tools/player-editor/src/player-list.tsx`
- Create: `tools/player-editor/src/card-editor.tsx`
- Modify: `tools/player-editor/src/editor.css`

- [ ] **Step 1: Write failing component workflow tests**

Create `tools/player-editor/src/app.test.tsx` using `userEvent` and an injected
`EditorApi`. The in-memory API returns a two-card `EditorDocument`. Add separate
tests that prove:

```tsx
import { beforeEach, describe, expect, it, vi, type MockedFunction } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ROLES } from "@/features/game/domain";
import { App } from "./app";
import type { EditorApi } from "./api";
import { makeEditorDocument } from "./test-fixtures";

const document = makeEditorDocument();
const generatedFirepower = document.cards[0].generated.traits.firepower;
let load: MockedFunction<EditorApi["load"]>;
let save: MockedFunction<EditorApi["save"]>;
let api: EditorApi;

beforeEach(() => {
  load = vi.fn<EditorApi["load"]>().mockResolvedValue(structuredClone(document));
  save = vi.fn<EditorApi["save"]>().mockResolvedValue({ revision: "b".repeat(64) });
  api = { load, save };
});

async function editFirepowerTo52() {
  await screen.findByRole("heading", { name: /Boaster/i });
  const input = screen.getByRole("spinbutton", { name: /Firepower/i });
  await userEvent.clear(input);
  await userEvent.type(input, "52");
}

async function clearEveryRole() {
  await screen.findByRole("heading", { name: /Boaster/i });
  for (const role of ROLES) {
    const checkbox = screen.getByRole("checkbox", { name: new RegExp(`^${role}$`, "i") });
    if ((checkbox as HTMLInputElement).checked) await userEvent.click(checkbox);
  }
}

it("loads, searches, filters, and selects event-specific cards", async () => {
  render(<App api={api} />);
  expect(await screen.findByRole("heading", { name: /Boaster/i })).toBeInTheDocument();
  await userEvent.type(screen.getByRole("searchbox"), "2024-card-id");
  expect(screen.getByRole("button", { name: /2024 player/i })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Boaster/i })).not.toBeInTheDocument();
});

it("edits roles, ratings, IGL status, and review status while showing deltas", async () => {
  render(<App api={api} />);
  await screen.findByRole("heading", { name: /Boaster/i });
  await userEvent.click(screen.getByRole("checkbox", { name: "Initiator" }));
  await userEvent.clear(screen.getByRole("spinbutton", { name: /Firepower/i }));
  await userEvent.type(screen.getByRole("spinbutton", { name: /Firepower/i }), "52");
  await userEvent.click(screen.getByRole("checkbox", { name: /Historical IGL/i }));
  await userEvent.click(screen.getByRole("checkbox", { name: /Mark this card reviewed/i }));
  expect(screen.getByText("+5")).toBeInTheDocument();
  expect(screen.getByText(/1 unsaved change/i)).toBeInTheDocument();
});

it("undoes saved state and resets game fields to derived state", async () => {
  render(<App api={api} />);
  await editFirepowerTo52();
  await userEvent.click(screen.getByRole("button", { name: /Undo changes/i }));
  expect(screen.getByRole("spinbutton", { name: /Firepower/i })).toHaveValue(47);
  await editFirepowerTo52();
  await userEvent.click(screen.getByRole("button", { name: /Reset to derived/i }));
  expect(screen.getByRole("spinbutton", { name: /Firepower/i })).toHaveValue(generatedFirepower);
});

it("blocks saving an invalid card and focuses it from the error list", async () => {
  render(<App api={api} />);
  await clearEveryRole();
  expect(screen.getByRole("button", { name: /Save all changes/i })).toBeDisabled();
  expect(screen.getByText(/select at least one role/i)).toBeInTheDocument();
});
```

Add a loading-error test by making `load` reject with `new Error("cannot load
catalog")` and asserting a blocking alert plus Retry button. Add an
empty-filter-result test by searching for `no-such-player` and asserting `No
player cards match these filters`. Keep API behavior at the public `EditorApi`
boundary; do not mock global `fetch`.

- [ ] **Step 2: Run the component tests and verify RED**

Run:

```powershell
npx vitest run tools/player-editor/src/app.test.tsx
```

Expected: FAIL because the minimal `App` has none of the required controls.

- [ ] **Step 3: Implement the player list**

Create `tools/player-editor/src/player-list.tsx` with a controlled API:

```ts
interface PlayerListProps {
  cards: EditorCard[];
  allCards: EditorCard[];
  selectedId: string | null;
  filters: EditorFilters;
  changedIds: Set<string>;
  invalidIds: Set<string>;
  onFiltersChange(filters: EditorFilters): void;
  onSelect(cardId: string): void;
}
```

Render a labeled search input; year, team, role, and review selects; result
count; and one button per filtered event card. Each row includes handle, team,
year, manual roles, historical-IGL label, reviewed label, changed label, and an
invalid label. Use semantic labels and buttons so the tests and keyboard users
operate the same interface.

- [ ] **Step 4: Implement the card detail editor**

Create `tools/player-editor/src/card-editor.tsx` with:

```ts
interface CardEditorProps {
  card: EditorCard;
  draft: ManualPlayerEntry;
  saved: ManualPlayerEntry;
  error?: string;
  traitWeights: EditorDocument["traitWeights"];
  onChange(entry: ManualPlayerEntry): void;
  onUndo(): void;
  onReset(): void;
}
```

Render one checkbox for each `ROLES` value. Render six labeled numeric inputs
with `min={0}`, `max={100}`, and `step={1}`. Parse a non-empty input with
`Number(value)` and retain `Number.NaN` for an invalid/empty draft so validation
can block saving and display the error without silently converting it to zero.
Render the derived value and signed delta for every trait. Render the exported
weight for the five non-leadership traits. Render independent historical-IGL and
reviewed checkboxes, Undo, Reset to derived, and a `<details>` evidence block.

- [ ] **Step 5: Implement `App` state ownership**

Replace the temporary App with `App({ api = browserEditorApi })`. On load:

1. Store the document and revision.
2. Create independent `saved` and `draft` maps with `entriesById`.
3. Select the first card.
4. Derive changed IDs, validation errors, filtered cards, and review counts on
   every render.
5. Preserve the selected ID when filters allow it; otherwise select the first
   filtered card without deleting draft changes.
6. Register `beforeunload` only while changed IDs are non-empty.

The header renders `reviewed / 404`, unsaved count, save state, and the Save all
button. A blocking load error renders the error plus a Retry button. A filter
with no results renders `No player cards match these filters`.

- [ ] **Step 6: Implement the approved layout CSS**

Expand `tools/player-editor/src/editor.css` with:

```css
:root { color: #181816; background: #ece9e2; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
* { box-sizing: border-box; }
body { margin: 0; min-width: 320px; }
button, input, select { font: inherit; }
button:focus-visible, input:focus-visible, select:focus-visible, summary:focus-visible { outline: 3px solid #d38b2c; outline-offset: 2px; }
.editor-shell { min-height: 100vh; display: grid; grid-template-rows: auto 1fr; }
.editor-header { position: sticky; top: 0; z-index: 10; display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 12px 18px; color: white; background: #1c1c1a; }
.editor-workspace { display: grid; grid-template-columns: minmax(270px, 340px) minmax(0, 1fr); min-height: 0; }
.player-pane { border-right: 1px solid #c8c4ba; background: #f5f3ee; overflow: auto; }
.filter-panel { position: sticky; top: 0; padding: 14px; border-bottom: 1px solid #c8c4ba; background: #f5f3ee; }
.filter-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.player-row { width: 100%; padding: 12px 14px; text-align: left; border: 0; border-bottom: 1px solid #ddd8ce; background: transparent; }
.player-row[aria-current="true"] { color: white; background: #292927; box-shadow: inset 4px 0 #d38b2c; }
.detail-pane { padding: 20px clamp(18px, 4vw, 52px); overflow: auto; }
.role-grid { display: flex; flex-wrap: wrap; gap: 8px; }
.role-control { padding: 8px 10px; border: 1px solid #aaa69d; border-radius: 6px; background: white; }
.trait-grid { display: grid; grid-template-columns: minmax(130px, 1fr) 100px 100px 70px; border: 1px solid #cbc6bc; }
.trait-grid > * { padding: 8px; border-bottom: 1px solid #dedad1; }
.error { color: #9d241d; }
.changed { color: #8b5b00; }
@media (max-width: 800px) {
  .editor-workspace { grid-template-columns: 1fr; }
  .player-pane { max-height: 42vh; border-right: 0; border-bottom: 1px solid #c8c4ba; }
  .trait-grid { grid-template-columns: 1fr 82px 72px 52px; }
}
```

Add only class rules used by the semantic JSX; do not introduce animation or
production game styles.

- [ ] **Step 7: Run component, model, and accessibility-focused tests**

Run:

```powershell
npx vitest run tools/player-editor/src/model.test.ts tools/player-editor/src/app.test.tsx
npm run typecheck
```

Expected: PASS with no React act warnings or accessibility query workarounds.

- [ ] **Step 8: Commit the editing workflow**

```powershell
git add tools/player-editor/src/app.tsx tools/player-editor/src/app.test.tsx tools/player-editor/src/player-list.tsx tools/player-editor/src/card-editor.tsx tools/player-editor/src/editor.css
git commit -m "feat(editor): build player review workspace"
```

## Task 8: Add save lifecycle, conflict recovery, and exit protection

**Files:**

- Modify: `tools/player-editor/src/app.test.tsx`
- Modify: `tools/player-editor/src/app.tsx`

- [ ] **Step 1: Write failing save-lifecycle tests**

Add tests with deferred in-memory API promises:

```tsx
it("saves the complete ordered catalog and adopts the returned revision", async () => {
  render(<App api={api} />);
  await editFirepowerTo52();
  await userEvent.click(screen.getByRole("button", { name: /Save all changes/i }));
  await waitFor(() => expect(save).toHaveBeenCalledOnce());
  expect(save.mock.calls[0][0]).toMatchObject({ revision: document.revision });
  expect(save.mock.calls[0][0].catalog.cards).toHaveLength(2);
  expect(await screen.findByText(/All changes saved/i)).toBeInTheDocument();
  expect(screen.getByText(/0 unsaved changes/i)).toBeInTheDocument();
});

it("keeps the dirty draft when saving fails", async () => {
  save.mockRejectedValueOnce(new Error("disk full"));
  render(<App api={api} />);
  await editFirepowerTo52();
  await userEvent.click(screen.getByRole("button", { name: /Save all changes/i }));
  expect(await screen.findByRole("alert")).toHaveTextContent("disk full");
  expect(screen.getByText(/1 unsaved change/i)).toBeInTheDocument();
});

it("requires reload after a stale-file conflict", async () => {
  save.mockRejectedValueOnce(Object.assign(new Error("Player data changed on disk; reload before saving"), { status: 409 }));
  render(<App api={api} />);
  await editFirepowerTo52();
  await userEvent.click(screen.getByRole("button", { name: /Save all changes/i }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/reload before saving/i);
  expect(screen.getByRole("button", { name: /Reload player data/i })).toBeInTheDocument();
});

it("warns before page exit only with unsaved changes", async () => {
  render(<App api={api} />);
  await screen.findByRole("heading", { name: /Boaster/i });
  const clean = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(clean);
  expect(clean.defaultPrevented).toBe(false);
  await editFirepowerTo52();
  const dirty = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(dirty);
  expect(dirty.defaultPrevented).toBe(true);
});
```

- [ ] **Step 2: Run the component test and verify RED**

Run:

```powershell
npx vitest run tools/player-editor/src/app.test.tsx
```

Expected: FAIL because save state and conflict recovery are not implemented.

- [ ] **Step 3: Implement the save state machine**

Use an explicit union in `App`:

```ts
type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved" }
  | { status: "error"; message: string; conflict: boolean };
```

On Save all:

1. Re-run `validateDraft`; return without a request if errors exist.
2. Set `saving` and disable Save.
3. Call `api.save({ revision, catalog: catalogFromDraft(draft, orderedIds) })`.
4. On success, adopt the returned revision, deep-copy draft into saved, and set
   `saved`.
5. On failure, preserve both draft and saved, store the message, and mark a 409
   as a conflict.
6. For conflicts, render Reload player data. Reload discards the stale draft
   only after `window.confirm("Discard unsaved changes and reload player data?")`
   returns true.

Register this handler while dirty:

```ts
useEffect(() => {
  if (!changedIds.size) return;
  const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
  window.addEventListener("beforeunload", warn);
  return () => window.removeEventListener("beforeunload", warn);
}, [changedIds.size]);
```

- [ ] **Step 4: Run editor and server tests**

Run:

```powershell
npx vitest run tools/player-editor/src/app.test.tsx tools/player-editor/src/model.test.ts tools/player-editor/server.test.ts
```

Expected: PASS.

- [ ] **Step 5: Manually verify one reversible save**

Run `npm run edit:players`, change one card's reviewed checkbox, press Save,
confirm the JSON diff contains only that boolean, then change it back and save
again. Confirm the file returns to its committed content with:

```powershell
git diff --exit-code -- src/data/champions/manual-player-data.json
```

Expected: exit code 0 after the reversal.

- [ ] **Step 6: Commit save lifecycle behavior**

```powershell
git add tools/player-editor/src/app.tsx tools/player-editor/src/app.test.tsx
git commit -m "feat(editor): save player reviews safely"
```

## Task 9: Document the workflow and protect the production boundary

**Files:**

- Modify: `docs/vct-algorithm-quick-guide.md`
- Modify: `docs/vct-sme-review-guide.md`
- Modify: `workflows.test.ts`

- [ ] **Step 1: Write a failing documented-production-boundary test**

Change the filesystem import in `workflows.test.ts` and add a test that reads
`next.config.ts`, `package.json`, the quick guide, and the `src/app` file list:

```ts
import { readdirSync, readFileSync } from "node:fs";

it("documents the local editor while keeping it outside the static production app", () => {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
  const quickGuide = readFileSync("docs/vct-algorithm-quick-guide.md", "utf8");
  expect(packageJson.scripts["edit:players"]).toBe("vite --config tools/player-editor/vite.config.ts");
  expect(readFileSync("next.config.ts", "utf8")).toContain('output: "export"');
  expect(readdirSync("src/app", { recursive: true }).map(String).some(path => /player-editor/i.test(path))).toBe(false);
  expect(quickGuide).toContain("npm run edit:players");
  expect(quickGuide).toContain("manual-player-data.json");
});
```

Replace the existing `readFileSync`-only import rather than adding a duplicate
import declaration.

- [ ] **Step 2: Run the workflow test and verify RED if the script assertion is not present yet**

Run:

```powershell
npx vitest run workflows.test.ts
```

Expected: FAIL because the quick guide does not yet document `npm run
edit:players` or `manual-player-data.json`. The script and route-boundary
assertions already pass because Task 5 established them.

- [ ] **Step 3: Rewrite the quick guide's manual-edit section**

Update `docs/vct-algorithm-quick-guide.md` to state:

```markdown
### Manually review and change every player card

Run `npm run edit:players`. The local browser editor is the supported place to
change eligible roles, firepower, utility, survival, clutch, consistency,
leadership, historical-IGL status, and review status. Saving writes
`src/data/champions/manual-player-data.json`.

The generated yearly cards and `evidence.json` remain read-only comparison
evidence. `npm run derive:data` updates that evidence but never overwrites the
manual catalog. The production game uses the validated manual values.

After saving, run `npm run validate:data`, `npm test`, and `npm run build`.
Commit the manual JSON change on a branch and merge it into `main` to trigger
the existing Vercel and GitHub Pages deployments.
```

Replace warnings that claim all direct per-player balance changes are
unsupported. Preserve the distinction between factual evidence and subjective
manual balance decisions.

- [ ] **Step 4: Update the full SME guide's file map and workflows**

In `docs/vct-sme-review-guide.md`, add the manual catalog as **game-facing
manual authority**, the local tool as **development-only editor**, and exact
save/validate/commit/deploy instructions. Rewrite statements that validation
requires runtime roles, traits, and IGL values to equal derivation. Keep all raw
extraction, reviewed overlay, checksum, and citation protections intact.

- [ ] **Step 5: Run documentation and workflow checks**

Run:

```powershell
npx vitest run workflows.test.ts
rg -n "no simple manual|not an accepted|rejected by validation|overwritten by regeneration" docs/vct-algorithm-quick-guide.md docs/vct-sme-review-guide.md
git diff --check
```

Expected: workflow tests PASS. Every remaining warning found by `rg` applies
only to generated/raw files and points the reader to the manual editor.

- [ ] **Step 6: Commit documentation and boundary protection**

```powershell
git add docs/vct-algorithm-quick-guide.md docs/vct-sme-review-guide.md workflows.test.ts
git commit -m "docs: explain manual player workflow"
```

## Task 10: Full verification and production handoff

**Files:**

- Verify all files changed by Tasks 1–9.

- [ ] **Step 1: Run focused feature tests**

```powershell
npx vitest run src/data/champions/manual-data.test.ts src/data/champions/dataset.test.ts src/data/champions/validation.test.ts tools/player-editor/server.test.ts tools/player-editor/src/model.test.ts tools/player-editor/src/app.test.tsx workflows.test.ts
```

Expected: all focused tests PASS with no warnings.

- [ ] **Step 2: Run the complete repository verification**

```powershell
npm run verify
```

Expected: lint, type checking, Vitest, Python extraction regression tests, data
validation, and the static production build all PASS.

- [ ] **Step 3: Prove the editor is absent from the static export**

```powershell
if (Test-Path 'out/player-editor') { throw 'Player editor shipped in out/' }
if (rg -l "Save all changes|api/player-data|Local Player Editor" out) { throw 'Player editor code shipped in out/' }
```

Expected: no PowerShell error and no matching production files.

- [ ] **Step 4: Perform the complete local owner journey**

Run:

```powershell
npm run edit:players
```

In the browser:

1. Search for Boaster and choose the 2023 FNATIC card.
2. Toggle Initiator, change firepower by one point, change leadership by one
   point, toggle Historical IGL, and mark the card reviewed.
3. Confirm derived values and deltas remain visible.
4. Undo and confirm the saved values return.
5. Repeat the edits, Reset to derived, and confirm review status remains as it
   was because Reset affects only game-facing derived fields.
6. Save, confirm a clean status, inspect the JSON diff, then restore the original
   values and save again.
7. Stop the server with Ctrl+C.

Confirm the reversible journey left no data diff:

```powershell
git diff --exit-code -- src/data/champions/manual-player-data.json
```

Expected: exit code 0.

- [ ] **Step 5: Review the final diff**

```powershell
git status --short
git diff --check
git log --oneline --decorate -10
```

Expected: no unrelated files, no whitespace errors, and one focused commit per
completed task group. Preserve the pre-existing untracked
`docs/superpowers/plans/2026-09-08-player-portraits.md` file without staging or
modifying it.

- [ ] **Step 6: Request code review before integration**

Use the `superpowers:requesting-code-review` skill. Resolve findings through the
`superpowers:receiving-code-review` workflow, rerun the affected focused tests,
then rerun `npm run verify` before claiming completion.
