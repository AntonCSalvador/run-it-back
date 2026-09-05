# Run It Back MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy the complete client-first Run It Back MVP with Champions 2021-2025 event cards, deterministic drafting, probabilistic tournaments, local persistence, responsive presentation, and dual static hosting.

**Architecture:** Next.js App Router renders one client-side game shell while pure TypeScript modules own data validation, seeded randomness, drafting, ratings, opponent generation, tournament simulation, narration, storage, and sharing. Local versioned JSON supplies historical content; React consumes domain APIs but never calculates hidden ratings directly. Static export serves Vercel and GitHub Pages now, while a `SimulationGateway` boundary supports future server authority.

**Tech Stack:** Next.js, React, TypeScript, Zod, Vitest, React Testing Library, Playwright, CSS Modules/global CSS, Lucide React, npm, GitHub Actions, Vercel.

---

## Current Repository State

- Public remote: `https://github.com/AntonCSalvador/run-it-back.git`
- Primary branch: `main`, tracking `origin/main`
- GitHub account: `AntonCSalvador`
- Commit identity: `Anton <antoncsalvador@gmail.com>`
- Worktree root: ignored project-local `.worktrees/`
- Vercel CLI: use `npx vercel@latest`; one-time user authorization may be required
- Preserve the configured author identity and never add AI attribution trailers

## Scope and Sequence

The approved spec contains several layers, but they are sequential rather than independent: UI requires a stable engine contract, and full historical data requires a stable schema. Keep one ordered plan so each task leaves the repository testable and later tasks do not invent parallel contracts.

Implementation order:

1. Static application and test foundation
2. Domain schema and validated fixture
3. Seeded randomness
4. Draft engine
5. Hidden rating and probability engine
6. Fantasy opponent generation
7. Tournament simulation
8. Fictional narration
9. Storage and sharing
10. Game controller and application shell
11. Draft interface
12. Tournament and result interface
13. Responsive styling, fire accents, and accessibility
14. Complete 2021-2025 historical dataset and assets
15. Browser journeys and visual verification
16. Static deployment automation
17. Release-candidate verification, integration, publication, and live checks

## File Map

### Application and Configuration

- `package.json`: dependencies and verification scripts
- `next.config.ts`: static export, root/project base paths, unoptimized assets
- `tsconfig.json`: strict TypeScript and `@/*` alias
- `eslint.config.mjs`: Next.js and TypeScript lint rules
- `vitest.config.mts`: jsdom unit/component test configuration
- `vitest.setup.ts`: Testing Library matchers and cleanup
- `playwright.config.ts`: desktop/mobile E2E projects and local static server
- `src/app/layout.tsx`: metadata, font setup, and document shell
- `src/app/page.tsx`: renders the game application immediately
- `src/app/globals.css`: tokens, layout, responsive behavior, animations
- `README.md`: setup, data credits, deploy steps, and mandatory security warning

### Domain and Data

- `src/features/game/domain.ts`: shared game types and constants
- `src/features/game/schema.ts`: Zod schemas for checked-in JSON and saved state
- `src/features/game/dataset.ts`: parsed dataset accessor and lookup indexes
- `src/data/champions/index.ts`: imports and combines year snapshots
- `src/data/champions/2021.json` through `2025.json`: reviewed event records
- `src/data/fixtures/minimal-dataset.ts`: small deterministic test dataset
- `src/data/sources.json`: source and license metadata
- `scripts/validate-data.mts`: build-time dataset and asset validator
- `public/assets/players/`: cleared portraits only
- `public/assets/teams/`: cleared logos only

### Game Engine

- `src/features/game/rng.ts`: stable seeded random generator and scoped seeds
- `src/features/game/draft.ts`: offers, rerolls, picks, role assignment, IGL tag
- `src/features/game/rating.ts`: hidden traits, lineup strength, map win odds
- `src/features/game/opponents.ts`: valid stage-scaled fantasy roster generation
- `src/features/game/tournament.ts`: BO3/BO5 map and series progression
- `src/features/game/narration.ts`: participant-correct fictional highlights
- `src/features/game/gateway.ts`: local simulation interface and implementation
- `src/features/game/machine.ts`: serializable application state and reducer
- `src/features/game/storage.ts`: versioned local persistence and recovery
- `src/features/game/share.ts`: Daily and Free Play share summaries

### Interface

- `src/features/game/components/game-app.tsx`: mode and phase coordinator
- `src/features/game/components/app-header.tsx`: wordmark, mode, streak, settings
- `src/features/game/components/team-offer.tsx`: three team-year choices
- `src/features/game/components/player-picker.tsx`: team roster selection
- `src/features/game/components/roster-bar.tsx`: five roles and reassignment
- `src/features/game/components/igl-picker.tsx`: final leadership assignment
- `src/features/game/components/tournament-view.tsx`: opponent and series flow
- `src/features/game/components/highlight-feed.tsx`: timed semifinal/final feed
- `src/features/game/components/results-view.tsx`: run summary and sharing
- `src/features/game/components/media-mark.tsx`: logo/portrait fallback
- `src/features/game/components/error-boundary.tsx`: run-level recovery

### Tests and Automation

- `src/features/game/*.test.ts`: engine unit/property tests
- `src/features/game/components/*.test.tsx`: component interaction tests
- `e2e/daily.spec.ts`: deterministic Daily journey
- `e2e/free-play.spec.ts`: variable Free Play and upset journey
- `e2e/responsive.spec.ts`: mobile scroll, reduced motion, and overlap checks
- `e2e/static-path.spec.ts`: GitHub project-base-path smoke test
- `.github/workflows/ci.yml`: lint, typecheck, unit tests, build, E2E
- `.github/workflows/pages.yml`: GitHub Pages artifact and deployment

## Task 1: Establish Static Next.js and Test Foundation

**Files:**
- Create: `package.json`
- Create: `next.config.ts`
- Create: `tsconfig.json`
- Create: `eslint.config.mjs`
- Create: `vitest.config.mts`
- Create: `vitest.setup.ts`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `src/app/globals.css`
- Create: `src/app/page.test.tsx`
- Create: `README.md`

- [ ] **Step 1: Verify runtime prerequisites**

Run:

```powershell
node --version
npm --version
```

Expected: a Playwright-supported Node line (`22.x`, `24.x`, or `26.x`) and npm available. Install current Node LTS before continuing if the requirement fails.

- [ ] **Step 2: Create package manifest and install dependencies**

Create `package.json`:

```json
{
  "name": "run-it-back",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "npm run validate:data && next build",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "validate:data": "tsx scripts/validate-data.mts",
    "verify": "npm run lint && npm run typecheck && npm run test && npm run build"
  }
}
```

Run:

```powershell
npm install next@latest react@latest react-dom@latest zod@latest lucide-react@latest
npm install --save-dev typescript@latest @types/node@latest @types/react@latest @types/react-dom@latest eslint@latest eslint-config-next@latest vitest@latest jsdom@latest @vitejs/plugin-react@latest vite-tsconfig-paths@latest @testing-library/react@latest @testing-library/dom@latest @testing-library/jest-dom@latest @testing-library/user-event@latest tsx@latest
```

Expected: `package-lock.json` created and audit exits successfully. Record unavoidable audit findings in README before proceeding; do not use forced upgrades.

- [ ] **Step 3: Write failing application-shell test**

Create `src/app/page.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "./page";

describe("home page", () => {
  it("opens directly into Run It Back", () => {
    render(<Home />);
    expect(screen.getByRole("heading", { name: "Run It Back" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Daily" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Free Play" })).toBeVisible();
  });
});
```

Create `vitest.config.mts` and `vitest.setup.ts`:

```ts
// vitest.config.mts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
  },
});
```

```ts
// vitest.setup.ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 4: Run test and confirm red state**

Run: `npm test -- src/app/page.test.tsx`

Expected: FAIL because `src/app/page.tsx` does not exist.

- [ ] **Step 5: Add minimal static application**

Create strict `tsconfig.json`, flat Next.js ESLint config, and `next.config.ts`:

```ts
// next.config.ts
import type { NextConfig } from "next";

const isGitHubPages = process.env.GITHUB_PAGES === "true";
const repository = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "run-it-back";
const basePath = isGitHubPages ? `/${repository}` : "";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath,
  assetPrefix: basePath || undefined,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  images: { unoptimized: true },
};

export default nextConfig;
```

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

```js
// eslint.config.mjs
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  globalIgnores([".next/**", "out/**", "coverage/**", "playwright-report/**"]),
]);
```

```tsx
// src/app/layout.tsx
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Run It Back",
  description: "Draft Champions players and run the bracket.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
```

```tsx
// src/app/page.tsx
export default function Home() {
  return (
    <main>
      <h1>Run It Back</h1>
      <button type="button">Daily</button>
      <button type="button">Free Play</button>
    </main>
  );
}
```

Create `globals.css` with this initial reset, foreground/background variables, and visible focus:

```css
:root { color-scheme: dark; --canvas: #0f1113; --text: #f4efe8; --action: #ff4d3d; }
* { box-sizing: border-box; }
html, body { margin: 0; min-height: 100%; background: var(--canvas); color: var(--text); }
button, input { font: inherit; }
:focus-visible { outline: 3px solid var(--action); outline-offset: 3px; }
```

Create README with setup commands, unofficial-project disclaimer, source policy, and this exact warning:

```md
## Security boundary

MVP ratings, chemistry, and simulation run in the browser and can be inspected
or modified by a determined user. Before adding accounts, competitive
leaderboards, prizes, or trusted public scores, move authoritative ratings,
random seeds, opponent generation, and match simulation to a server. Validate
every submitted Daily run server-side; never trust a client-computed result.
```

- [ ] **Step 6: Verify foundation**

Run:

```powershell
npm test -- src/app/page.test.tsx
npm run lint
npm run typecheck
```

Expected: all commands PASS.

- [ ] **Step 7: Commit**

```powershell
git add package.json package-lock.json next.config.ts tsconfig.json eslint.config.mjs vitest.config.mts vitest.setup.ts src/app README.md
git commit -m "chore: establish app foundation"
```

## Task 2: Define and Validate Historical Data Contracts

**Files:**
- Create: `src/features/game/domain.ts`
- Create: `src/features/game/schema.ts`
- Create: `src/features/game/dataset.ts`
- Create: `src/data/fixtures/minimal-dataset.ts`
- Create: `src/features/game/schema.test.ts`
- Create: `scripts/validate-data.mts`
- Modify: `package.json`

- [ ] **Step 1: Write schema tests first**

Create `src/features/game/schema.test.ts` covering one valid dataset and failures for duplicate card ID, maps played `0`, empty role list, rating outside `0..100`, missing source ID, and team with wrong event year. Use this valid fixture shape:

```ts
export const minimalDataset = {
  version: 1,
  sources: [{ id: "source-1", url: "https://example.test/event", retrievedAt: "2026-09-04", usage: "facts" }],
  teams: [{ id: "loud-2022", name: "LOUD", shortName: "LOUD", year: 2022, logo: null, sourceIds: ["source-1"] }],
  players: [{ id: "aspas", canonicalHandle: "aspas", portrait: null, sourceIds: ["source-1"] }],
  cards: [{
    id: "aspas-loud-2022",
    playerId: "aspas",
    teamId: "loud-2022",
    year: 2022,
    displayHandle: "aspas",
    mapsPlayed: 16,
    eligibleRoles: ["duelist"],
    historicalIgl: false,
    traits: { firepower: 91, utility: 61, survival: 84, clutch: 87, consistency: 89, leadership: 35 },
    sourceIds: ["source-1"]
  }]
} as const;
```

- [ ] **Step 2: Run tests and confirm red state**

Run: `npm test -- src/features/game/schema.test.ts`

Expected: FAIL because schema exports do not exist.

- [ ] **Step 3: Implement exact domain types and schemas**

Create `domain.ts` with:

```ts
export const ROLES = ["smokes", "duelist", "initiator", "sentinel", "flex"] as const;
export type Role = (typeof ROLES)[number];
export type ChampionsYear = 2021 | 2022 | 2023 | 2024 | 2025;

export interface Traits {
  firepower: number;
  utility: number;
  survival: number;
  clutch: number;
  consistency: number;
  leadership: number;
}

export interface SourceRef {
  id: string;
  url: string;
  retrievedAt: string;
  usage: "facts" | "asset";
  credit?: string;
  license?: string;
}

export interface TeamAppearance {
  id: string;
  name: string;
  shortName: string;
  year: ChampionsYear;
  logo: string | null;
  sourceIds: string[];
}

export interface PlayerIdentity {
  id: string;
  canonicalHandle: string;
  portrait: string | null;
  sourceIds: string[];
}

export interface PlayerCard {
  id: string;
  playerId: string;
  teamId: string;
  year: ChampionsYear;
  displayHandle: string;
  mapsPlayed: number;
  eligibleRoles: Role[];
  historicalIgl: boolean;
  traits: Traits;
  sourceIds: string[];
}

export interface GameDataset {
  version: number;
  sources: SourceRef[];
  teams: TeamAppearance[];
  players: PlayerIdentity[];
  cards: PlayerCard[];
}

export interface LineupSlot { role: Role; cardId: string }
export interface Lineup { slots: LineupSlot[]; iglCardId: string }
```

Create Zod schemas matching every field, then add a `parseDataset(input): GameDataset` refinement that checks all foreign keys, source IDs, team/card year equality, and uniqueness. Create `buildDatasetIndex` with maps for teams, players, and cards.

- [ ] **Step 4: Add build validator**

Run `npm install --save-dev cross-env@latest`. Create `scripts/validate-data.mts` to import `src/data/champions/index.ts` in full mode, call `parseDataset`, verify years each contain exactly 16 team appearances, ensure every local asset begins with `/assets/` and exists beneath `public`, and exit nonzero with joined diagnostic messages. In fixture mode, import `minimalDataset` and skip only the five-year/16-team coverage checks; all schema, foreign-key, role, rating, source, and asset checks still run. Until Task 14 adds full data, set the package script to `cross-env DATASET_MODE=fixture tsx scripts/validate-data.mts`.

- [ ] **Step 5: Verify green state**

Run:

```powershell
npm test -- src/features/game/schema.test.ts
npm run validate:data
npm run typecheck
```

Expected: tests PASS and validator prints fixture counts.

- [ ] **Step 6: Commit**

```powershell
git add src/features/game/domain.ts src/features/game/schema.ts src/features/game/dataset.ts src/data/fixtures scripts/validate-data.mts package.json package-lock.json
git commit -m "feat(data): define historical card schema"
```

## Task 3: Add Stable Seeded Randomness

**Files:**
- Create: `src/features/game/rng.ts`
- Create: `src/features/game/rng.test.ts`

- [ ] **Step 1: Write deterministic RNG tests**

Test that equal seed/scope yields equal ten-number sequences, different scopes differ, `int(3)` stays within `0..2`, `pick` returns a member, `shuffle` does not mutate input, and `dailySeed(new Date("2026-09-04T23:59:00Z"))` equals `run-it-back:daily:2026-09-04:v1`.

- [ ] **Step 2: Confirm tests fail**

Run: `npm test -- src/features/game/rng.test.ts`

Expected: FAIL because RNG module is missing.

- [ ] **Step 3: Implement stable RNG**

Implement FNV-1a 32-bit hashing plus Mulberry32 state:

```ts
export class SeededRng {
  private state: number;
  constructor(seed: string) { this.state = hashSeed(seed); }
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }
  int(maxExclusive: number): number {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) throw new RangeError("maxExclusive must be positive");
    return Math.floor(this.next() * maxExclusive);
  }
  pick<T>(values: readonly T[]): T {
    if (values.length === 0) throw new RangeError("cannot pick from empty list");
    return values[this.int(values.length)];
  }
  shuffle<T>(values: readonly T[]): T[] {
    const copy = [...values];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swap = this.int(index + 1);
      [copy[index], copy[swap]] = [copy[swap], copy[index]];
    }
    return copy;
  }
}

export function scopedRng(seed: string, scope: string): SeededRng {
  return new SeededRng(`${seed}:${scope}`);
}

export function dailySeed(date: Date): string {
  return `run-it-back:daily:${date.toISOString().slice(0, 10)}:v1`;
}
```

Implement `hashSeed` with `Math.imul(hash ^ charCode, 16777619)` beginning at `2166136261`.

- [ ] **Step 4: Verify and commit**

Run: `npm test -- src/features/game/rng.test.ts`

Expected: PASS.

```powershell
git add src/features/game/rng.ts src/features/game/rng.test.ts
git commit -m "feat(engine): add seeded randomness"
```

## Task 4: Build Draft Engine

**Files:**
- Create: `src/features/game/draft.ts`
- Create: `src/features/game/draft.test.ts`

- [ ] **Step 1: Write draft behavior tests**

Use an expanded fixture with at least six team appearances and enough multi-role cards. Cover:

- one offer contains three distinct teams
- equal seed and offer index reproduce choices
- chosen team may appear in a later offer
- reroll replaces offer and decrements from three
- fourth reroll throws `No rerolls remaining`
- exact card cannot be selected twice
- two event versions of one player may coexist
- offered teams always contain a card for a remaining role
- selected multi-role card can move between compatible slots
- lineup cannot start until all roles and one IGL are assigned
- any drafted card can receive IGL tag

- [ ] **Step 2: Confirm red state**

Run: `npm test -- src/features/game/draft.test.ts`

Expected: FAIL because draft functions are missing.

- [ ] **Step 3: Implement serializable draft state**

Create these exports:

```ts
export interface DraftState {
  seed: string;
  offerIndex: number;
  rerollsRemaining: number;
  offeredTeamIds: string[];
  selectedTeamId: string | null;
  pendingCardId: string | null;
  slots: Partial<Record<Role, string>>;
  iglCardId: string | null;
}

export function createDraft(seed: string, dataset: GameDataset): DraftState;
export function createOffer(state: DraftState, dataset: GameDataset): DraftState;
export function rerollOffer(state: DraftState, dataset: GameDataset): DraftState;
export function chooseTeam(state: DraftState, teamId: string): DraftState;
export function selectableCards(state: DraftState, dataset: GameDataset): PlayerCard[];
export function chooseCard(state: DraftState, cardId: string, dataset: GameDataset): DraftState;
export function assignPendingCard(state: DraftState, role: Role, dataset: GameDataset): DraftState;
export function moveCard(state: DraftState, cardId: string, role: Role, dataset: GameDataset): DraftState;
export function tagIgl(state: DraftState, cardId: string): DraftState;
export function isLineupReady(state: DraftState): boolean;
export function toLineup(state: DraftState): Lineup;
```

Offers use `scopedRng(state.seed, `offer:${state.offerIndex}`)`. A team is eligible only when an undrafted card can fill a currently open role. Increment `offerIndex` whenever a new offer is created. Keep chosen cards in `slots`; derive drafted IDs from slot values instead of maintaining duplicate state.

- [ ] **Step 4: Verify and commit**

Run:

```powershell
npm test -- src/features/game/draft.test.ts
npm run typecheck
```

Expected: PASS.

```powershell
git add src/features/game/draft.ts src/features/game/draft.test.ts src/data/fixtures/minimal-dataset.ts
git commit -m "feat(engine): add roster draft rules"
```

## Task 5: Implement Hidden Ratings and Upset Odds

**Files:**
- Create: `src/features/game/rating.ts`
- Create: `src/features/game/rating.test.ts`

- [ ] **Step 1: Write rating tests**

Assert:

- card baseline weights equal `35/20/15/15/15`
- same event-team pairs add chemistry while cross-team pairs do not
- historically strong IGL tagged as IGL beats same lineup with low-leadership tag
- wrong role cannot be scored
- map probability equals `0.5` at zero delta
- probability clamps at `0.08` and `0.92`
- over 20,000 scoped seeds, stronger lineup wins more often but weaker lineup wins at least once

- [ ] **Step 2: Confirm red state**

Run: `npm test -- src/features/game/rating.test.ts`

Expected: FAIL because rating module is missing.

- [ ] **Step 3: Implement rating formulas**

```ts
const TRAIT_WEIGHTS = {
  firepower: 0.35,
  utility: 0.20,
  survival: 0.15,
  clutch: 0.15,
  consistency: 0.15,
} as const;

export function cardBaseline(card: PlayerCard): number {
  return Object.entries(TRAIT_WEIGHTS).reduce(
    (total, [trait, weight]) => total + card.traits[trait as keyof typeof TRAIT_WEIGHTS] * weight,
    0,
  );
}

export function mapWinProbability(strengthDelta: number): number {
  const raw = 1 / (1 + Math.exp(-strengthDelta / 12));
  return Math.min(0.92, Math.max(0.08, raw));
}
```

Implement `lineupStrength(lineup, dataset)` as average card baseline plus `2` per same-team-year pair capped at `8`, plus `(tagged leadership - 50) * 0.08`, with role eligibility asserted before scoring. Implement `rollMap(userStrength, opponentStrength, rng)` returning probability, roll, and winner.

- [ ] **Step 4: Verify statistical properties and commit**

Run: `npm test -- src/features/game/rating.test.ts`

Expected: PASS, including repeatable statistical sample.

```powershell
git add src/features/game/rating.ts src/features/game/rating.test.ts
git commit -m "feat(engine): model probabilistic match odds"
```

## Task 6: Generate Stage-Scaled Fantasy Opponents

**Files:**
- Create: `src/features/game/opponents.ts`
- Create: `src/features/game/opponents.test.ts`

- [ ] **Step 1: Write opponent tests**

Cover deterministic output by seed/stage, all five roles filled, IGL belongs to lineup, user card IDs excluded, alternate years of same person allowed, bounded generation, and average strength increasing across 1,000 seeds in order `group < quarterfinal < semifinal < final`.

- [ ] **Step 2: Confirm red state**

Run: `npm test -- src/features/game/opponents.test.ts`

Expected: FAIL because generator is missing.

- [ ] **Step 3: Implement generator**

Create:

```ts
export type Stage = "group" | "quarterfinal" | "semifinal" | "final";

const STAGE_TARGETS: Record<Stage, readonly [number, number]> = {
  group: [50, 62],
  quarterfinal: [58, 70],
  semifinal: [66, 78],
  final: [74, 90],
};

export interface GeneratedOpponent {
  id: string;
  stage: Stage;
  lineup: Lineup;
  strength: number;
}
```

For attempts `0..249`, use `scopedRng(seed, `opponent:${stage}:${attempt}`)`, shuffle candidates per role, backtrack across the five roles without duplicate card IDs, choose IGL by highest leadership with seeded tie break, and score the lineup. Return first lineup inside stage range. When none lands inside range, return the valid candidate with minimum distance to range midpoint. Throw only when no valid lineup exists at all.

- [ ] **Step 4: Verify and commit**

Run: `npm test -- src/features/game/opponents.test.ts`

Expected: PASS.

```powershell
git add src/features/game/opponents.ts src/features/game/opponents.test.ts
git commit -m "feat(engine): generate fantasy opponents"
```

## Task 7: Simulate BO3 and BO5 Tournament Progression

**Files:**
- Create: `src/features/game/tournament.ts`
- Create: `src/features/game/tournament.test.ts`

- [ ] **Step 1: Write series and bracket tests**

Test map uniqueness within a series, BO3 stopping at two wins, final BO5 stopping at three wins, loss ending run, win advancing through exact stage order, map scores matching winner, overtime possible, and equal seed/lineups reproducing every roll and score.

- [ ] **Step 2: Confirm red state**

Run: `npm test -- src/features/game/tournament.test.ts`

Expected: FAIL because tournament module is missing.

- [ ] **Step 3: Implement tournament state**

Use historical map names:

```ts
export const MAP_POOL = ["Ascent", "Bind", "Haven", "Split", "Icebox", "Breeze", "Fracture", "Pearl", "Lotus", "Sunset", "Abyss", "Corrode"] as const;
export const STAGE_ORDER: Stage[] = ["group", "quarterfinal", "semifinal", "final"];

export interface MapResult {
  map: (typeof MAP_POOL)[number];
  userScore: number;
  opponentScore: number;
  winner: "user" | "opponent";
  probability: number;
  roll: number;
}

export interface SeriesResult {
  stage: Stage;
  bestOf: 3 | 5;
  userWins: number;
  opponentWins: number;
  maps: MapResult[];
}
```

Generate unique map order from scoped seed. Roll maps until required wins. Draw regulation loser score from `3..11`, biased upward when strengths are close; reserve a seeded branch for overtime scores `14-12`, `15-13`, or `16-14`. Add `startTournament`, `playCurrentSeries`, and `advanceTournament` pure functions. Final win sets `champion`; any loss sets `eliminated` and preserves stage.

- [ ] **Step 4: Verify and commit**

Run: `npm test -- src/features/game/tournament.test.ts`

Expected: PASS.

```powershell
git add src/features/game/tournament.ts src/features/game/tournament.test.ts
git commit -m "feat(engine): simulate tournament series"
```

## Task 8: Generate Participant-Correct Fictional Highlights

**Files:**
- Create: `src/features/game/narration.ts`
- Create: `src/features/game/narration.test.ts`

- [ ] **Step 1: Write narration tests**

Assert group/QF return no detailed feed, semifinal/final return `4..6` highlights per map, every named handle belongs to one of the two lineups, winning-map feed ends with winner-positive event, templates reproduce by seed, and both user/opponent players can ace, clutch, defuse, or fail a clutch.

- [ ] **Step 2: Confirm red state**

Run: `npm test -- src/features/game/narration.test.ts`

Expected: FAIL because narration module is missing.

- [ ] **Step 3: Implement typed highlight templates**

```ts
export type HighlightKind = "ace" | "clutch" | "ninja-defuse" | "retake" | "eco" | "failed-clutch" | "throw";

export interface Highlight {
  id: string;
  kind: HighlightKind;
  actorCardId: string;
  targetCardId?: string;
  side: "user" | "opponent";
  text: string;
  emphasis: "normal" | "clutch" | "decisive";
}
```

Implement template functions that accept handles as arguments rather than interpolating unchecked strings. Weight `ace` by firepower, `clutch` by clutch trait, `ninja-defuse` by utility, and `throw`/`failed-clutch` inversely by consistency. Select only participants from the current map context. Prefix the feed with visible `SIMULATED` labeling in UI, not inside every line.

- [ ] **Step 4: Verify and commit**

Run: `npm test -- src/features/game/narration.test.ts`

Expected: PASS.

```powershell
git add src/features/game/narration.ts src/features/game/narration.test.ts
git commit -m "feat(engine): add fictional match highlights"
```

## Task 9: Add Gateway, Local Storage, and Sharing

**Files:**
- Create: `src/features/game/gateway.ts`
- Create: `src/features/game/storage.ts`
- Create: `src/features/game/share.ts`
- Create: `src/features/game/storage.test.ts`
- Create: `src/features/game/share.test.ts`

- [ ] **Step 1: Write persistence and share tests**

Test namespaced schema version, valid round-trip, one corrupt record not deleting others, unavailable storage returning an in-memory result, one Daily completion per UTC date, recent Free Play cap of `20`, Daily share omitting cards/offers, and Free Play share including roster handles.

- [ ] **Step 2: Confirm red state**

Run: `npm test -- src/features/game/storage.test.ts src/features/game/share.test.ts`

Expected: FAIL because modules are missing.

- [ ] **Step 3: Implement gateway and storage contracts**

```ts
export interface SimulationGateway {
  generateOpponent(seed: string, stage: Stage, userLineup: Lineup): GeneratedOpponent;
  playSeries(seed: string, stage: Stage, userLineup: Lineup, opponent: GeneratedOpponent): SeriesResult;
  createHighlights(seed: string, series: SeriesResult, userLineup: Lineup, opponent: Lineup): Highlight[];
}

export const STORAGE_KEYS = {
  settings: "run-it-back:settings:v1",
  daily: "run-it-back:daily:v1",
  history: "run-it-back:history:v1",
} as const;
```

Implement `LocalSimulationGateway` by composing Tasks 6-8. Implement `readRecord`, `writeRecord`, and `removeRecord` with injected `Storage | null`, Zod parsing, and per-key recovery. Return `{ value, recovered, persistent }` so UI can announce recovery/storage failure.

Implement compact share lines: Daily includes UTC date, stage, series score symbols, rerolls used, and `Run It Back`; Free Play additionally includes five `handle (role)` entries. Do not include hidden traits, probability, seed, offered teams, or opponent generation data.

- [ ] **Step 4: Verify and commit**

Run: `npm test -- src/features/game/storage.test.ts src/features/game/share.test.ts`

Expected: PASS.

```powershell
git add src/features/game/gateway.ts src/features/game/storage.ts src/features/game/share.ts src/features/game/storage.test.ts src/features/game/share.test.ts
git commit -m "feat: persist and share local runs"
```

## Task 10: Create Game State Machine and Shell

**Files:**
- Create: `src/features/game/machine.ts`
- Create: `src/features/game/machine.test.ts`
- Create: `src/features/game/components/game-app.tsx`
- Create: `src/features/game/components/app-header.tsx`
- Create: `src/features/game/components/error-boundary.tsx`
- Create: `src/features/game/components/game-app.test.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Write reducer and shell tests**

Test phase order `mode -> team -> player -> role -> lineup -> tournament -> results`, invalid event rejection, Daily seed creation, Free Play unique seed creation through injected seed factory, and immediate page rendering of Daily/Free Play controls.

- [ ] **Step 2: Confirm red state**

Run: `npm test -- src/features/game/machine.test.ts src/features/game/components/game-app.test.tsx`

Expected: FAIL because machine and components are missing.

- [ ] **Step 3: Implement state machine**

Create a discriminated union:

```ts
export type GameState =
  | { phase: "mode" }
  | { phase: "team"; mode: "daily" | "free-play"; draft: DraftState }
  | { phase: "player"; mode: "daily" | "free-play"; draft: DraftState }
  | { phase: "role"; mode: "daily" | "free-play"; draft: DraftState }
  | { phase: "lineup"; mode: "daily" | "free-play"; draft: DraftState }
  | { phase: "tournament"; mode: "daily" | "free-play"; draft: DraftState; tournament: TournamentState }
  | { phase: "results"; mode: "daily" | "free-play"; draft: DraftState; tournament: TournamentState };
```

Use typed actions for starting mode, rerolling, choosing team/card/role, moving card, tagging IGL, entering tournament, resolving series, changing speed, skipping reveal, and restarting. Reducer delegates rules to pure modules and returns unchanged state for UI timing actions that do not change domain state.

- [ ] **Step 4: Implement shell and boundary**

`GameApp` owns `useReducer`, gateway instance, storage adapter, and dataset. `AppHeader` renders the wordmark, Daily/Free Play segmented control, streak, and reset-current-run action. Error boundary offers `Restart run` without clearing history. Update `page.tsx` to render `<GameApp />` and keep `<h1>` accessible even when visually styled as wordmark.

- [ ] **Step 5: Verify and commit**

Run: `npm test -- src/features/game/machine.test.ts src/features/game/components/game-app.test.tsx`

Expected: PASS.

```powershell
git add src/app/page.tsx src/features/game/machine.ts src/features/game/machine.test.ts src/features/game/components/game-app.tsx src/features/game/components/app-header.tsx src/features/game/components/error-boundary.tsx src/features/game/components/game-app.test.tsx
git commit -m "feat(ui): add game state shell"
```

## Task 11: Build Draft Interface

**Files:**
- Create: `src/features/game/components/team-offer.tsx`
- Create: `src/features/game/components/player-picker.tsx`
- Create: `src/features/game/components/roster-bar.tsx`
- Create: `src/features/game/components/igl-picker.tsx`
- Create: `src/features/game/components/media-mark.tsx`
- Create: `src/features/game/asset-url.ts`
- Create: `src/features/game/components/draft-flow.test.tsx`
- Modify: `src/features/game/components/game-app.tsx`

- [ ] **Step 1: Write complete draft component test**

Render `GameApp` with fixture dataset and fixed seed. Click Daily, assert three distinct team buttons, reroll once and see `2 rerolls`, choose team, choose card, choose eligible role, repeat five times, reassign a multi-role card, tag any player as IGL, and assert `Start tournament` enabled. Also dispatch an image error and assert initials fallback remains. Set `NEXT_PUBLIC_BASE_PATH=/run-it-back` in an asset utility test and assert `/assets/teams/loud.webp` becomes `/run-it-back/assets/teams/loud.webp`.

- [ ] **Step 2: Confirm red state**

Run: `npm test -- src/features/game/components/draft-flow.test.tsx`

Expected: FAIL because draft components are missing.

- [ ] **Step 3: Implement accessible draft controls**

Use native buttons for team/player choices, Lucide `RefreshCw` for reroll, role buttons within a labeled group, and radio semantics for IGL. `TeamOffer` takes exactly three `TeamAppearance` values. `PlayerPicker` displays portrait, handle, event year, and eligible-role chips but no traits or raw stats. `RosterBar` renders roles in fixed order, supports compatible reassignment, and uses horizontal scroll only below the stable-width breakpoint. `MediaMark` tracks load failure and switches to sanitized initials. `assetUrl(path)` prepends `process.env.NEXT_PUBLIC_BASE_PATH ?? ""` to local `/assets/` paths so public files work at both deployment roots.

Required component contracts:

```ts
export interface TeamOfferProps { teams: TeamAppearance[]; rerolls: number; onChoose(id: string): void; onReroll(): void }
export interface PlayerPickerProps { team: TeamAppearance; cards: PlayerCard[]; onChoose(id: string): void; onBack(): void }
export interface RosterBarProps { slots: Partial<Record<Role, PlayerCard>>; onMove(cardId: string, role: Role): void }
export interface IglPickerProps { cards: PlayerCard[]; selectedId: string | null; onSelect(id: string): void; onStart(): void }
```

- [ ] **Step 4: Verify and commit**

Run: `npm test -- src/features/game/components/draft-flow.test.tsx`

Expected: PASS.

```powershell
git add src/features/game/components src/features/game/components/game-app.tsx
git commit -m "feat(ui): build roster draft flow"
```

## Task 12: Build Tournament, Highlights, and Results Interface

**Files:**
- Create: `src/features/game/components/tournament-view.tsx`
- Create: `src/features/game/components/highlight-feed.tsx`
- Create: `src/features/game/components/results-view.tsx`
- Create: `src/features/game/components/tournament-flow.test.tsx`
- Modify: `src/features/game/components/game-app.tsx`

- [ ] **Step 1: Write tournament UI tests with fake timers**

Cover opponent lineup reveal, `Play series`, group/QF map-by-map output, semifinal/final highlight timing, `1x`, `2x`, and `Skip` controls, eliminated result, champion result, copy/share fallback, and no numeric strength/probability rendered anywhere.

- [ ] **Step 2: Confirm red state**

Run: `npm test -- src/features/game/components/tournament-flow.test.tsx`

Expected: FAIL because tournament components are missing.

- [ ] **Step 3: Implement reveal views**

`TournamentView` renders stage label, both five-card rosters, BO marker, map strip, and one clear `Play series` command. `HighlightFeed` uses a queue index and timeout derived from speed: `1600ms` at `1x`, `800ms` at `2x`, and immediate completion for Skip. Clear timers on unmount and speed change. Render `SIMULATED HIGHLIGHTS` before fictional copy. Delay only presentation; simulation result already exists.

`ResultsView` renders stage reached, series/map scores, player roster, rerolls used, `Share`, `Run again`, and mode switch. Use `navigator.share` when available, otherwise `navigator.clipboard.writeText`, otherwise select a read-only text field.

- [ ] **Step 4: Verify and commit**

Run: `npm test -- src/features/game/components/tournament-flow.test.tsx`

Expected: PASS.

```powershell
git add src/features/game/components/tournament-view.tsx src/features/game/components/highlight-feed.tsx src/features/game/components/results-view.tsx src/features/game/components/tournament-flow.test.tsx src/features/game/components/game-app.tsx
git commit -m "feat(ui): reveal tournament results"
```

## Task 13: Apply Responsive Broadcast Styling and Fire Accents

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/features/game/components/*.tsx`
- Create: `src/features/game/components/accessibility.test.tsx`

- [ ] **Step 1: Write semantic and motion tests**

Assert visible focus classes, current mode via `aria-pressed`, current phase via live region, reroll/lock/win elements receive finite `fire-accent` class, and reduced-motion media query exists without hiding state changes.

- [ ] **Step 2: Confirm red state**

Run: `npm test -- src/features/game/components/accessibility.test.tsx`

Expected: FAIL until semantic attributes and styles exist.

- [ ] **Step 3: Implement approved visual system**

Define tokens for `#0f1113` canvas, `#191c1f` surface, `#f4efe8` text, `#ff4d3d` action, `#ffbf3f` heat, and neutral borders. Keep cards at `6px`, buttons at `4px`, stable aspect ratios, zero negative letter spacing, and no viewport-scaled font sizes.

Desktop team cards use three equal tracks. At narrow width, team and roster tracks use:

```css
.scroll-track {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(15rem, 82vw);
  overflow-x: auto;
  scroll-behavior: smooth;
  scroll-snap-type: x mandatory;
  overscroll-behavior-inline: contain;
  scrollbar-color: #62686d #191c1f;
  scrollbar-width: thin;
  -webkit-overflow-scrolling: touch;
}

.scroll-track > * { scroll-snap-align: start; }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
  }
}
```

Implement fire as a short pseudo-element ignition on `.fire-accent`, not a continuous page background. Use solid red/gold shapes, maximum `650ms`, and remove the class after `animationend`.

- [ ] **Step 4: Verify and commit**

Run:

```powershell
npm test -- src/features/game/components/accessibility.test.tsx
npm run lint
npm run typecheck
```

Expected: PASS.

```powershell
git add src/app/globals.css src/features/game/components
git commit -m "style: add broadcast game presentation"
```

## Task 14: Add Complete Champions 2021-2025 Dataset and Cleared Assets

**Files:**
- Create: `src/data/champions/2021.json`
- Create: `src/data/champions/2022.json`
- Create: `src/data/champions/2023.json`
- Create: `src/data/champions/2024.json`
- Create: `src/data/champions/2025.json`
- Create: `src/data/champions/index.ts`
- Create: `src/data/sources.json`
- Create: `docs/data-methodology.md`
- Add: `public/assets/players/*`
- Add: `public/assets/teams/*`
- Modify: `scripts/validate-data.mts`
- Modify: `package.json`
- Create: `src/data/champions/dataset.test.ts`

- [ ] **Step 1: Write full-dataset acceptance test**

Test exactly five years, exactly 16 team appearances per year, every card maps to that year's team, every card has `mapsPlayed >= 1`, all roles supported across every year, every card has source references, every non-null asset has an asset source with credit/license note, and no duplicate card IDs. Add explicit regression assertions for TenZ 2021 and TenZ 2024 as separate cards and for at least one event-specific multi-role card.

- [ ] **Step 2: Confirm red state**

Run: `npm test -- src/data/champions/dataset.test.ts`

Expected: FAIL because year snapshots are absent.

- [ ] **Step 3: Build reviewed event snapshots**

For each Champions year, record all 16 team appearances from the cited Liquipedia event page and cross-check the team list against Riot's event article when available. Add one card for every roster member who played at least one map. Store observed agent-class map counts in the methodology working table, derive suggested roles using the approved threshold, then review every multi-role or override case manually. Record the exact source ID on each team, identity, and card.

Each JSON file must use the same complete structure:

```json
{
  "year": 2022,
  "teams": [],
  "players": [],
  "cards": []
}
```

Arrays must contain final reviewed records before commit; the validator rejects empty arrays, fewer or more than 16 teams, zero-map cards, and uncited overrides. `docs/data-methodology.md` documents normalization, identity aliases, role evidence, IGL evidence, rating calculation, review date, and corrections process.

- [ ] **Step 4: Add only cleared local assets**

For each team/player record, use a local asset only when its source record contains URL, retrieval date, credit, and permission/license basis. Store optimized WebP/PNG at stable ID-based paths. Set asset field to `null` when rights are unclear; UI fallback is intentional. Do not hotlink Riot, Liquipedia, or VLR media. Run image metadata and broken-path validation.

- [ ] **Step 5: Switch build to full dataset**

Remove fixture mode from `build`. Keep fixture support only for unit tests. `src/data/champions/index.ts` combines year files, deduplicates player identities, imports `sources.json`, parses through `parseDataset`, and exports frozen `dataset`.

- [ ] **Step 6: Verify dataset and commit**

Run:

```powershell
npm test -- src/data/champions/dataset.test.ts
npm run validate:data
npm run typecheck
```

Expected: PASS and validator prints `5 years`, `80 team appearances`, card count, cleared asset count, and fallback count.

```powershell
git add src/data scripts/validate-data.mts docs/data-methodology.md public/assets package.json package-lock.json
git commit -m "feat(data): add Champions 2021-2025 cards"
```

## Task 15: Add Browser Journeys and Visual Verification

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/daily.spec.ts`
- Create: `e2e/free-play.spec.ts`
- Create: `e2e/responsive.spec.ts`
- Create: `e2e/static-path.spec.ts`
- Modify: `package.json`

- [ ] **Step 1: Install Playwright and add scripts**

Run:

```powershell
npm install --save-dev @playwright/test@latest serve@latest
npx playwright install chromium
```

Add scripts `test:e2e`, `test:e2e:update`, and `serve:static`. Configure Playwright web server as `npm run build && npx serve out -l 4173`, base URL `http://127.0.0.1:4173`, and projects for Desktop Chrome plus Pixel 7.

- [ ] **Step 2: Write failing full-flow tests**

Daily test fixes clock to one UTC date, completes a run, reloads, verifies completion/history, opens a second isolated context, repeats identical choices, and compares series results. Free Play test injects known test seeds through a build-only query hook, covers both favorite win and underdog upset, and verifies no rating/probability text. Static-path test builds with `GITHUB_PAGES=true` and repository name, serves output, and verifies scripts/data/assets under project prefix.

Responsive test checks `document.documentElement.scrollWidth === innerWidth`, every visible control bounding box stays inside viewport, team track changes `scrollLeft` smoothly and snaps near a card boundary, keyboard can reach every action, and reduced-motion computed styles suppress animations.

- [ ] **Step 3: Run tests and fix only exposed behavior**

Run: `npm run test:e2e`

Expected: initial failures expose missing test hooks or browser-only edge handling. Add deterministic query seed only when `process.env.NODE_ENV !== "production"`; do not expose hidden ratings.

- [ ] **Step 4: Capture and inspect screenshots**

Capture desktop and Pixel 7 screenshots for mode selection, three-team offer, player picker, complete roster, semifinal highlights, and results. Inspect each image plus canvas/pixel content for blank output, clipping, overlap, broken assets, and unreadable long handles. Store approved baselines under `e2e/__screenshots__/`.

- [ ] **Step 5: Verify and commit**

Run:

```powershell
npm run verify
npm run test:e2e
```

Expected: all checks PASS.

```powershell
git add playwright.config.ts e2e package.json package-lock.json src
git commit -m "test: cover complete browser journeys"
```

## Task 16: Automate CI, Vercel Build, and GitHub Pages

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/pages.yml`
- Create: `scripts/smoke-static.mts`
- Modify: `package.json`
- Modify: `README.md`

- [ ] **Step 1: Write static smoke script**

Run `npm install --save-dev parse5@latest`. Create a script accepting output directory and optional base path. It reads `index.html`, extracts local script/style URLs through `parse5`, verifies each referenced file exists, checks all dataset asset references, and exits nonzero with explicit missing paths. Add `smoke:static` script.

- [ ] **Step 2: Confirm smoke catches failure**

Run smoke against an empty temporary directory created with `New-Item -ItemType Directory`.

Expected: FAIL with `index.html missing`.

- [ ] **Step 3: Add CI workflow**

`ci.yml` triggers pull requests and pushes to `main`, uses current Node LTS, `npm ci`, Playwright Chromium cache/install, then runs `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run smoke:static`, and `npm run test:e2e`. Upload Playwright report only on failure.

- [ ] **Step 4: Add Pages workflow**

`pages.yml` uses Pages permissions, concurrency cancellation, and official `actions/configure-pages`, `actions/upload-pages-artifact`, and `actions/deploy-pages`. Build with:

```yaml
env:
  GITHUB_PAGES: "true"
  GITHUB_REPOSITORY: ${{ github.repository }}
```

Upload `./out`. Trigger only on `main` and manual dispatch.

- [ ] **Step 5: Document deployment**

README documents Vercel import as primary, GitHub Pages Actions as secondary, static-export limitations, data credits, local verification, and future removal of `output: "export"` before server features. Keep mandatory security note unchanged.

- [ ] **Step 6: Verify and commit**

Run:

```powershell
npm run build
npm run smoke:static
$env:GITHUB_PAGES='true'; $env:GITHUB_REPOSITORY='owner/run-it-back'; npm run build; npm run smoke:static -- --base-path '/run-it-back'; Remove-Item Env:GITHUB_PAGES; Remove-Item Env:GITHUB_REPOSITORY
```

Expected: both root and project-path builds PASS.

```powershell
git add .github scripts/smoke-static.mts package.json README.md
git commit -m "ci: deploy static builds"
```

## Task 17: Verify, Integrate, and Publish Production MVP

**Files:**
- Modify only when final review or deployment exposes a verified issue

- [ ] **Step 1: Verify feature-branch release candidate**

Run:

```powershell
git status --short --branch
npm run verify
npm run test:e2e
git log --oneline -10
```

Expected: all checks PASS, worktree clean, and every implementation task has a focused commit on `feature/run-it-back-mvp`.

- [ ] **Step 2: Run final independent review**

Dispatch one fresh final reviewer with the approved design, complete implementation diff, and verification output. Fix every spec or quality finding through the responsible implementation agent, rerun the relevant tests, then rerun final review until approved.

- [ ] **Step 3: Integrate through branch-finishing workflow**

Invoke `superpowers:finishing-a-development-branch`. Present its integration choices to the user. Do not publish from `feature/run-it-back-mvp`. After the user chooses local merge or pull-request integration and the primary branch contains the approved work, switch execution to the primary repository checkout and verify:

```powershell
git status --short --branch
git log --oneline -5
```

Expected: clean integrated primary branch containing the MVP commits. Remove the feature worktree only through the finishing skill after integration is confirmed.

- [ ] **Step 4: Confirm integrated primary checkout and remote**

Run from the primary checkout, not the feature worktree:

```powershell
git branch --show-current
git remote get-url origin
git status --short --branch
```

Expected: branch `main`, remote `https://github.com/AntonCSalvador/run-it-back.git`, and clean tree containing design, plan, and MVP implementation.

- [ ] **Step 5: Authenticate external CLIs**

Run:

```powershell
gh auth status
npx --yes vercel@latest whoami
```

Expected: GitHub authenticated as `AntonCSalvador` and a Vercel username returned. If Vercel is unauthenticated, stop and ask the user to complete `npx vercel@latest login`; do not request tokens in chat.

- [ ] **Step 6: Push integrated main to existing GitHub repository**

Run:

```powershell
git push -u origin main
gh repo view AntonCSalvador/run-it-back --json nameWithOwner,isPrivate,defaultBranchRef,url
```

Expected: public `AntonCSalvador/run-it-back`, default branch `main`, and integrated commits pushed with author `Anton`.

- [ ] **Step 7: Enable GitHub Pages Actions source**

Run:

```powershell
gh api --method POST "repos/AntonCSalvador/run-it-back/pages" -f build_type=workflow
gh run watch --workflow pages.yml --exit-status
```

Expected: Pages workflow succeeds and returns project URL. If Pages already exists, use the corresponding PUT endpoint to set `build_type=workflow`.

- [ ] **Step 8: Link and deploy Vercel**

Run:

```powershell
npx --yes vercel@latest link
npx --yes vercel@latest --prod
```

Expected: production deployment URL. Connect GitHub repository in Vercel dashboard so future `main` pushes deploy production and pull requests receive previews.

- [ ] **Step 9: Perform production smoke tests**

Against both live URLs, verify HTTP 200, first screen, one complete Free Play run, local history after reload, asset fallback, mobile viewport, and reduced motion. Verify no source map or visible UI reveals hidden rating labels. Client logic remains inspectable by design; README warning must be present.

- [ ] **Step 10: Confirm local and remote state**

Run:

```powershell
npm run verify
npm run test:e2e
git status --short --branch
git log --oneline -10
```

Expected: all tests PASS, repository clean, local `main` tracks `origin/main`, and both live URLs remain healthy.

- [ ] **Step 11: Tag MVP release**

Run:

```powershell
git tag -a v0.1.0 -m "Run It Back MVP"
git push origin v0.1.0
```

Expected: annotated `v0.1.0` visible on GitHub.

## Final Acceptance Checklist

- [ ] Daily and Free Play complete successfully on desktop and mobile.
- [ ] Dataset covers all Champions 2021-2025 map participants with source evidence.
- [ ] Five roles, three rerolls, card uniqueness, historical duplicates, and IGL rules hold.
- [ ] Fantasy opponents grow stronger by stage and never copy exact user cards.
- [ ] Every map remains probabilistic with tested upset chances.
- [ ] Semifinal/final narration is deterministic, fictional, and participant-correct.
- [ ] No hidden rating, chemistry, probability, or seed appears in UI/share output.
- [ ] Local history, Daily completion, streak, and record-level recovery work.
- [ ] Fire remains finite interaction feedback and reduced-motion users get static feedback.
- [ ] Smooth mobile tracks snap correctly without layout overflow.
- [ ] README contains server-authority warning and unofficial-project disclaimer.
- [ ] Lint, typecheck, unit tests, build, static smoke, and Playwright pass.
- [ ] Vercel and GitHub Pages URLs pass production smoke tests.
- [ ] GitHub repository and `v0.1.0` tag exist.
