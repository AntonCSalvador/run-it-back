# Run It Back UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign Run It Back into a polished, accessible Broadcast Tactical fantasy-esports drafting experience while preserving every existing game mechanic, deterministic simulation rule, historical source, localStorage boundary, static deployment path, valid journey, and useful test hook.

**Architecture:** Keep `machine.ts`, drafting, rating, opponent, tournament, narration, and sharing logic authoritative and presentation-agnostic. `GameAppCore` remains the UI orchestrator; focused components own mode introduction, progress, drafting decisions, roster context, tournament reveal, and recap presentation. A versioned active-run record stores only validated public state and reconstructs private deterministic series details through the existing gateway when a run is restored.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.9, Zod 4, Vitest, React Testing Library, Playwright, global CSS, Lucide React, static export, browser localStorage.

**Status:** Self-reviewed and independently approved on 2026-09-07.

---

## Source of Truth

- Product constraints: `PRODUCT.md`
- Visual system: `DESIGN.md`
- UX evidence: `docs/ux/run-it-back-ux-audit.md`
- Screen/state/copy specification: `docs/ux/run-it-back-redesign-brief.md`
- Approved design: `docs/superpowers/specs/2026-09-06-run-it-back-ux-redesign-design.md`
- Selected critique reference: `.impeccable/mocks/decision/run-it-back-live-results-desk-v2.webp`
- Approved direction foundation: `987c2fb` (`docs(ux): define redesign direction`); each implementation dispatch records the then-current `git rev-parse HEAD` as its stage baseline.

The selected direction is **Live Results Desk**, implemented code-first. The comp defines ambition, hierarchy, density, and composition; it is not a pixel-copy target and does not authorize fabricated content or copied brand assets.

## Non-Negotiable Invariants

- Do not change draft eligibility, reroll counts, role constraints, IGL validity, hidden ratings, opponent generation, BO3/BO5 logic, map scoring, Daily seeds, Free Play seeds, narration inputs, result persistence, or share formatting.
- Never render or persist hidden traits, strengths, probabilities, or rolls.
- Do not add accounts, backend services, runtime font requests, analytics, leaderboards, or unauthorized Riot/Phoenix/team/broadcast assets.
- Keep `data-team-id`, `data-testid^="player-card-"`, accessible names, and existing E2E journeys unless a planned semantic label replacement is updated in the same commit.
- Preserve static export and project-base-path asset behavior.
- Treat all generated direction comps as non-shipping review artifacts.

## File and Responsibility Map

### Application shell and shared presentation

- Modify `src/app/layout.tsx`: metadata and local font declarations only.
- Create `src/app/layout.test.tsx`: local-font and document-shell assertions.
- Create `src/app/fonts/Barlow-Regular.ttf`: OFL-licensed UI face from the official Google Fonts repository.
- Create `src/app/fonts/Barlow-Medium.ttf`: OFL-licensed UI face from the official Google Fonts repository.
- Create `src/app/fonts/Barlow-SemiBold.ttf`: OFL-licensed UI face from the official Google Fonts repository.
- Create `src/app/fonts/BarlowCondensed-SemiBold.ttf`: OFL-licensed display face from the official Google Fonts repository.
- Create `src/app/fonts/BarlowCondensed-Bold.ttf`: OFL-licensed display face from the official Google Fonts repository.
- Create `src/app/fonts/OFL.txt`: bundled license copied from the official Barlow family directory.
- Preserve `src/app/page.tsx`: it continues to render `GameApp` directly.
- Modify `src/app/globals.css`: design tokens, typography, geometry, components, responsive rules, focus, forced colors, and reduced motion.
- Modify `src/app/globals.test.ts`: parse and assert critical token, responsive, focus, and motion rules.
- Modify `src/app/page.test.tsx`: assert document-level product entry copy and landmark behavior.
- Modify `src/features/game/components/app-header.tsx`: compact wordmark, macro progress, run status, and safe exit trigger.
- Create `src/features/game/components/run-progress.tsx`: present `Draft`, `IGL`, `Tournament`, `Recap` plus detailed current-step text.
- Create `src/features/game/components/mode-selection.tsx`: Daily-first introduction and Free Play explanation.
- Create `src/features/game/components/recent-results.tsx`: subordinate saved-history disclosure removed from `game-app.tsx`.
- Create `src/features/game/components/exit-run-dialog.tsx`: semantic confirmation with Cancel-first focus and focus return.

### Drafting and lineup decisions

- Modify `src/features/game/components/team-offer.tsx`: scannable three-team offer and explicit reroll states.
- Modify `src/features/game/components/player-picker.tsx`: team-year heading, eligible-role context, and distinct selection controls.
- Modify `src/features/game/components/roster-bar.tsx`: persistent all-five-role summary and contextual compatible swaps.
- Create `src/features/game/components/role-picker.tsx`: valid and unavailable role decisions plus a real Back action.
- Modify `src/features/game/components/igl-picker.tsx`: meaningful leadership explanation and 44px native radio cards.
- Modify `src/features/game/components/draft-flow.test.tsx`: end-to-end component assertions for team, player, role, roster, and IGL states.
- Modify `src/features/game/components/accessibility.test.tsx`: progress semantics, focus behavior, and redundant state cues.

### Tournament and recap

- Modify `src/features/game/components/tournament-view.tsx`: round/opponent/state hierarchy, withheld score, stage rail, retry, and reveal handoff.
- Modify `src/features/game/components/highlight-feed.tsx`: Pause/Resume, 1x/2x/Skip, accessible current moment, and deterministic timer cleanup.
- Modify `src/features/game/components/results-view.tsx`: outcome-first recap, route summary, lineup/IGL, highlights, replay hierarchy, and secondary share/history actions.
- Modify `src/features/game/components/tournament-flow.test.tsx`: suspense order, retry, focus, interrupted work, and stage progression.
- Modify `src/features/game/components/highlight-feed.test.tsx`: pause/resume and announcement timing.
- Modify `src/features/game/components/results-view.test.tsx`: champion/elimination hierarchy and unchanged share behavior.

### Orchestration, restoration, and resilience

- Modify `src/features/game/components/game-app.tsx`: derived progress/copy, focus destinations, safe exit, active-run hydration, retry, reveal state, and component composition.
- Modify `src/features/game/components/game-app.test.tsx`: mode states, daily completion, confirmation, recovery, invalid branches, and active-run lifecycle.
- Modify `src/features/game/components/game-app.hydration.test.tsx`: server/client-stable restoration shell and post-mount active-run restore.
- Modify `src/features/game/components/error-boundary.tsx`: recovery copy that distinguishes resume from restart.
- Modify `src/features/game/storage.ts`: namespaced `run-it-back:active:v1` public record and schema.
- Modify `src/features/game/storage.test.ts`: active record isolation, corruption recovery, write/remove failure, and no-private-field assertions.
- Create `src/features/game/active-run.ts`: serialize, validate against the dataset, and deterministically reconstruct a resumable `GameState` without storing private simulation fields.
- Create `src/features/game/active-run.test.ts`: draft/tournament restoration, tamper rejection, and deterministic reconstruction.

### Browser coverage

- Modify `e2e/support/journey.ts`: use intentional labels while retaining stable role/test hooks.
- Modify `e2e/daily.spec.ts`: completion availability and Daily replay behavior.
- Modify `e2e/free-play.spec.ts`: unchanged mechanics plus no-private-field serialization.
- Modify `e2e/history.spec.ts`: subordinate result history and result-detail ordering.
- Modify `e2e/responsive.spec.ts`: exact 390px, 320px reflow, zoom/long text, keyboard completion, touch targets, reduced motion, and forced colors.
- Create `e2e/restoration.spec.ts`: reload during draft and tournament, explicit exit, corrupt record, and storage-unavailable recovery.
- Preserve `e2e/static-path.spec.ts`: static-path smoke and every discovered asset.
- Intentionally update only the current platform's reviewed desktop/Pixel 7 images under `e2e/__screenshots__/` during Task 8. Never synthesize another operating system's baselines; record cross-platform capture as a follow-up if no matching runner is available.

## Required Per-Stage Orchestration

For each numbered task below, the lead agent must perform this exact sequence:

1. Dispatch one fresh implementation subagent with the entire task, source-of-truth links, invariants, and current commit.
2. Require the implementer to follow `superpowers:test-driven-development`: add the named failing tests, run them red, implement minimally, run them green, run focused regression tests, inspect `git diff`, and report self-review findings.
3. Dispatch a fresh read-only spec-compliance reviewer. The reviewer reports file-and-line findings and never edits.
4. Return every valid spec gap to the same implementer. Re-run spec review with a fresh reviewer until approved.
5. Dispatch a fresh read-only code-quality reviewer. The reviewer checks correctness, accessibility, maintainability, unnecessary abstraction, and regression risk without editing.
6. Return every important quality issue to the same implementer. Re-run quality review with a fresh reviewer until approved.
7. The lead runs the task’s focused verification plus `npm run verify` where specified, reviews the diff, and creates only the named focused commit.
8. Never allow a second implementation agent to edit this worktree during an active stage.

## Task 1: Design Foundations and Application Shell

**Files:**

- Modify: `src/app/globals.css`
- Modify: `src/app/globals.test.ts`
- Modify: `src/app/layout.tsx`
- Create: `src/app/layout.test.tsx`
- Create: `src/app/fonts/Barlow-Regular.ttf`
- Create: `src/app/fonts/Barlow-Medium.ttf`
- Create: `src/app/fonts/Barlow-SemiBold.ttf`
- Create: `src/app/fonts/BarlowCondensed-SemiBold.ttf`
- Create: `src/app/fonts/BarlowCondensed-Bold.ttf`
- Create: `src/app/fonts/OFL.txt`
- Modify: `src/app/page.test.tsx`
- Modify: `src/features/game/components/app-header.tsx`
- Modify: `src/features/game/components/game-app.tsx`
- Create: `src/features/game/components/run-progress.tsx`
- Modify: `src/features/game/components/accessibility.test.tsx`

- [ ] **Step 1: Add failing stylesheet and shell-contract tests**

Extend `globals.test.ts` to require the documented token names and behavior, and create `layout.test.tsx` to assert the rendered body receives both local-font variables:

```ts
expect(root.style.getPropertyValue("--rib-canvas")).toBe("#0B0D10");
expect(root.style.getPropertyValue("--rib-red")).toBe("#E84B42");
expect(root.style.getPropertyValue("--rib-gold")).toBe("#D8A84E");
expect(css).toMatch(/@media \(forced-colors: active\)/);
expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
expect(css).toMatch(/min-height:\s*44px/);
expect(body.className).toContain("rib-ui");
expect(body.className).toContain("rib-display");
```

Extend `accessibility.test.tsx` with a failing `RunProgress` test that expects an ordered `Draft`, `IGL`, `Tournament`, `Recap` list, `aria-current="step"`, and detailed text `Pick 2 of 5`.

Add a shell test that tabs first to `Skip to current decision`, verifies its `href` is `#game-content`, finds exactly one `<main id="game-content">`, and proves the `banner` is outside that main.

Add a small WCAG contrast helper to `globals.test.ts` and assert the full token matrix: primary/secondary/dim/danger text on canvas and both surfaces at 4.5:1; red, strong boundary, focus ring, and gold outcome against adjacent surfaces at 3:1; near-black action text on red at 4.5:1.

Write and observe these failures one at a time:

- [ ] CSS token values and minimum control size.
- [ ] Reduced-motion and forced-colors media rules.
- [ ] Local font variables on the document body.
- [ ] Ordered progress semantics and detailed live text.
- [ ] First-focusable skip link, one main target, and external banner.
- [ ] Documented text, action, boundary, focus, disabled, selection, error, and outcome contrast pairs.

- [ ] **Step 2: Run the focused tests and confirm red**

Run:

```powershell
npx vitest run src/app/globals.test.ts src/app/layout.test.tsx src/app/page.test.tsx src/features/game/components/accessibility.test.tsx
```

Expected: FAIL because the `--rib-*` tokens, bundled font declarations, forced-colors rules, and `RunProgress` component do not exist.

- [ ] **Step 3: Download each approved font file and its license**

Download Barlow only from the official `google/fonts` OFL directories, copy the accompanying `OFL.txt`, and import the committed files through `next/font/local`. No runtime request may leave the static application. Use these exact upstream paths:

```text
https://github.com/google/fonts/raw/main/ofl/barlow/Barlow-Regular.ttf
https://github.com/google/fonts/raw/main/ofl/barlow/Barlow-Medium.ttf
https://github.com/google/fonts/raw/main/ofl/barlow/Barlow-SemiBold.ttf
https://github.com/google/fonts/raw/main/ofl/barlowcondensed/BarlowCondensed-SemiBold.ttf
https://github.com/google/fonts/raw/main/ofl/barlowcondensed/BarlowCondensed-Bold.ttf
https://github.com/google/fonts/raw/main/ofl/barlow/OFL.txt
```

Acquire and verify each artifact as its own small step:

- [ ] Create `src/app/fonts/`.
- [ ] Download `Barlow-Regular.ttf` and confirm the file is non-empty.
- [ ] Download `Barlow-Medium.ttf` and confirm the file is non-empty.
- [ ] Download `Barlow-SemiBold.ttf` and confirm the file is non-empty.
- [ ] Download `BarlowCondensed-SemiBold.ttf` and confirm the file is non-empty.
- [ ] Download `BarlowCondensed-Bold.ttf` and confirm the file is non-empty.
- [ ] Download `OFL.txt` and confirm it names the SIL Open Font License.

- [ ] **Step 4: Configure the two local font families in `layout.tsx`**

Use this exact configuration:

```tsx
const uiFont = localFont({
  src: [
    { path: "./fonts/Barlow-Regular.ttf", weight: "400" },
    { path: "./fonts/Barlow-Medium.ttf", weight: "500" },
    { path: "./fonts/Barlow-SemiBold.ttf", weight: "600" },
  ],
  variable: "--font-rib-ui",
  display: "swap",
});
const displayFont = localFont({
  src: [
    { path: "./fonts/BarlowCondensed-SemiBold.ttf", weight: "600" },
    { path: "./fonts/BarlowCondensed-Bold.ttf", weight: "700" },
  ],
  variable: "--font-rib-display",
  display: "swap",
});
```

- [ ] **Step 5: Implement the documented CSS tokens and base element rules**

Define the documented color, spacing, radius, type, and timing tokens in `:root`. Use local/system fonts only. Keep the existing responsive component rules functional until later tasks replace them.

Use `#626A74` for `--rib-line-strong` and near-black text on filled red actions; the former exceeds 3:1 against `#171B20`, and the latter exceeds 4.5:1 against `#E84B42`.

- [ ] **Step 6: Create and test the progress component**

The component API is fixed as:

```tsx
export type MacroStage = "draft" | "igl" | "tournament" | "recap";

export function RunProgress({ stage, detail }: {
  stage: MacroStage;
  detail: string;
}) {
  const stages = [["draft", "Draft"], ["igl", "IGL"], ["tournament", "Tournament"], ["recap", "Recap"]] as const;
  return <nav aria-label="Run progress">
    <ol>{stages.map(([id, label]) => <li key={id} aria-current={id === stage ? "step" : undefined}>{label}</li>)}</ol>
    <p role="status" aria-live="polite">{detail}</p>
  </nav>;
}
```

Keep the `AppHeader` prop contract unchanged in Task 1 so the intermediate commit remains runnable. Add only stable shell classes and landmarks. In `GameAppCore`, move the first-focusable skip link and `AppHeader` before `<main id="game-content">`, leaving exactly one main around phase content. `RunProgress` remains independently tested until Task 2 can mount it at the same time that `ModeSelection` takes over mode-start actions. Update metadata description to the approved premise without changing static behavior.

- [ ] **Step 7: Run focused tests and shell regressions**

Run:

```powershell
npx vitest run src/app/globals.test.ts src/app/layout.test.tsx src/app/page.test.tsx src/features/game/components/accessibility.test.tsx src/features/game/components/game-app.test.tsx
```

Expected: PASS with the existing game mechanics still exercised; no snapshot updates.

- [ ] **Step 8: Complete stage reviews and verification**

Run the required spec and quality review loops, then:

```powershell
npm run lint
npm run typecheck
npx vitest run src/app/globals.test.ts src/app/layout.test.tsx src/app/page.test.tsx src/features/game/components/accessibility.test.tsx
npm run build
npm run verify
git diff --check
```

Expected: every command exits 0 and static export completes.

- [ ] **Step 9: Commit the foundations stage**

```powershell
git add -- src/app/globals.css src/app/globals.test.ts src/app/layout.tsx src/app/layout.test.tsx src/app/page.test.tsx src/app/fonts src/features/game/components/app-header.tsx src/features/game/components/game-app.tsx src/features/game/components/run-progress.tsx src/features/game/components/accessibility.test.tsx
git commit -m "feat(ui): establish broadcast shell"
```

## Task 2: Mode Selection and Onboarding

**Files:**

- Create: `src/features/game/components/mode-selection.tsx`
- Create: `src/features/game/components/recent-results.tsx`
- Create: `src/features/game/components/exit-run-dialog.tsx`
- Modify: `src/features/game/components/app-header.tsx`
- Modify: `src/features/game/components/game-app.tsx`
- Modify: `src/features/game/components/game-app.test.tsx`
- Modify: `src/features/game/components/accessibility.test.tsx`
- Modify: `e2e/support/journey.ts`
- Modify: `e2e/daily.spec.ts`

- [ ] **Step 1: Write failing mode, Daily-state, and safe-exit tests**

Add assertions for these exact user-facing contracts:

```tsx
expect(screen.getByRole("heading", { name: "Draft history. Rewrite the bracket." })).toBeVisible();
expect(screen.getByRole("button", { name: "Start today's Daily" })).toBeVisible();
expect(screen.getByText("One shared draft each UTC day.")).toBeVisible();
expect(screen.getByRole("button", { name: "Start Free Play" })).toBeVisible();
expect(screen.queryByText(/Current phase:/)).not.toBeInTheDocument();
```

Use injected `now` and Daily storage to assert `Available today`, `Completed today`, `Replay today's Daily`, and `View today's result`. Start a run, request exit, assert a semantic dialog named `Exit this run?`, Cancel-first focus, Escape close, trigger focus return, and confirmation before state loss.

Write these as separate tests and run each red before implementing it:

- [ ] Opening premise and Daily/Free Play hierarchy.
- [ ] Available versus completed Daily state from injected UTC time.
- [ ] Raw phase text replaced by macro/detail progress.
- [ ] Exit cancellation, Escape, focus return, and confirmed state loss.

- [ ] **Step 2: Run the focused tests and confirm red**

```powershell
npx vitest run src/features/game/components/game-app.test.tsx src/features/game/components/accessibility.test.tsx
```

Expected: FAIL on missing premise, Daily availability, intentional progress language, and exit dialog.

- [ ] **Step 3: Create `ModeSelection` with the Daily-first contract**

Use these component contracts:

```ts
export interface ModeSelectionProps {
  dailyState: "available" | "completed";
  streak: number;
  onStart(mode: GameMode): void;
  onViewDailyResult(): void;
}

export interface ExitRunDialogProps {
  open: boolean;
  onCancel(): void;
  onConfirm(): void;
}
```

`ModeSelection` must place Daily first and dominant, explain Free Play in one sentence, and expose the four-stage format without raw enum text.

Replace the transitional Task 1 header contract only when `ModeSelection` is ready:

```ts
export interface AppHeaderProps {
  mode: GameMode;
  stage: MacroStage;
  detail: string;
  onExit(): void;
}
```

- [ ] **Step 4: Run the mode-selection test green before integration**

```powershell
npx vitest run src/features/game/components/game-app.test.tsx -t "explains Daily and Free Play"
```

Expected: PASS for the isolated mode content while integration tests remain red.

- [ ] **Step 5: Move `RecentResults` into its own component**

Move the existing outcome inference and legacy result rendering without changing it. Give the disclosure the same `Recent results` region label and keep it collapsed by default. Make disclosure and selection controlled so `View today's result` can reveal the exact saved Daily run:

```ts
export interface RecentResultsProps {
  daily: readonly DailyRun[];
  free: readonly FreePlayRun[];
  cards: readonly PlayerCard[];
  open: boolean;
  selectedKey: string | null;
  onOpenChange(open: boolean): void;
  onSelectedKeyChange(key: string | null): void;
}
```

`GameAppCore` derives today's key as `daily-${dailyDateFromSeed(dailySeed(now?.() ?? new Date()))}`. `View today's result` sets `open` and `selectedKey` together, then focus moves to the revealed result heading.

- [ ] **Step 6: Create `ExitRunDialog` and make its focus test green**

Use native `<dialog>`, focus Cancel on open, close on Escape, call only `onConfirm` for destructive exit, and return focus to `Exit run` after cancel.

- [ ] **Step 7: Integrate the new opening and in-run shell in `GameAppCore`**

When `state.phase === "mode"`, render `ModeSelection` followed by `RecentResults`. During a run, render `AppHeader` with `RunProgress`, the derived macro stage/detail, and `Exit run`. Remove the old raw phase paragraph. When Daily is completed, keep replay behavior unchanged and provide a separate result-history disclosure.

- [ ] **Step 8: Update E2E helpers without weakening assertions**

Change `start()` to click `Start today's Daily` or `Start Free Play`, then wait for `Choose a team to scout`. Preserve `.team-card` and player-card hooks.

- [ ] **Step 9: Run focused unit and browser tests**

```powershell
npx vitest run src/features/game/components/game-app.test.tsx src/features/game/components/accessibility.test.tsx
npx playwright test e2e/daily.spec.ts e2e/history.spec.ts --project=desktop
```

Expected: PASS; Daily remains deterministic and saved history remains bounded/collapsed.

- [ ] **Step 10: Complete reviews, verify, and commit**

```powershell
npm run verify
git diff --check
git add -- src/features/game/components/mode-selection.tsx src/features/game/components/recent-results.tsx src/features/game/components/exit-run-dialog.tsx src/features/game/components/app-header.tsx src/features/game/components/game-app.tsx src/features/game/components/game-app.test.tsx src/features/game/components/accessibility.test.tsx e2e/support/journey.ts e2e/daily.spec.ts
git commit -m "feat(ui): clarify run entry"
```

Expected: reviews approved, verification exits 0, and the commit contains no domain-mechanics changes.

## Task 3: Team and Player Drafting

**Files:**

- Modify: `src/features/game/components/team-offer.tsx`
- Modify: `src/features/game/components/player-picker.tsx`
- Modify: `src/features/game/components/roster-bar.tsx`
- Modify: `src/features/game/components/game-app.tsx`
- Modify: `src/features/game/components/draft-flow.test.tsx`
- Modify: `src/features/game/components/accessibility.test.tsx`
- Modify: `src/app/globals.css`
- Modify: `e2e/support/journey.ts`

- [ ] **Step 1: Write failing decision-clarity tests**

Assert the exact headings and explanations:

```tsx
expect(screen.getByRole("heading", { name: "Choose a team to scout" })).toBeVisible();
expect(screen.getByText("Open an event roster, then draft one eligible player.")).toBeVisible();
expect(screen.getByRole("button", { name: "Replace all 3 teams · 3 left" })).toBeEnabled();
expect(screen.getByText("Only players who can fill an open role are shown.")).toBeVisible();
expect(screen.getByRole("region", { name: "Roster · 1 of 5 filled" })).toBeVisible();
```

Add cases for `No rerolls left`, `No other eligible team offers are available`, team logo fallback, portrait fallback, long handle wrapping, and a mobile-friendly position label such as `Team 1 of 3` that does not require hover.

Write and observe each focused failure separately:

- [ ] Team heading, instruction, and repository-backed year/name order.
- [ ] Available, exhausted, and no-alternative reroll states.
- [ ] Player filter explanation and open-role labels.
- [ ] Logo/portrait fallback and long-handle wrapping.
- [ ] Roster fill count and mobile card position text.

- [ ] **Step 2: Run draft tests and confirm red**

```powershell
npx vitest run src/features/game/components/draft-flow.test.tsx src/features/game/components/accessibility.test.tsx
```

Expected: FAIL on the new labels, reroll reason, roster summary, and card-state descriptions.

- [ ] **Step 3: Implement the explicit `TeamOffer` contract**

Use explicit integration props rather than calculating domain rules in the components:

```ts
export interface TeamOfferProps {
  teams: TeamAppearance[];
  rerolls: number;
  canReroll: boolean;
  rerollReason?: string;
  onChoose(id: string): void;
  onReroll(): void;
}

```

Keep each team card a native button with `data-team-id`. Render exact team name/year and a `Scout roster` cue. Give the reroll button a persistent description for disabled reasons.

- [ ] **Step 4: Run the team-offer tests green**

```powershell
npx vitest run src/features/game/components/draft-flow.test.tsx -t "team offer"
```

Expected: PASS for the three-card offer, position labels, fallbacks, and reroll states.

- [ ] **Step 5: Implement the explicit `PlayerPicker` contract**

```ts
export interface PlayerPickerProps {
  team: TeamAppearance;
  cards: PlayerCard[];
  openRoles: readonly Role[];
  portraitForPlayer?(playerId: string): string | null;
  onChoose(id: string): void;
  onBack(): void;
}
```

Keep each player choice discoverable through `data-testid="player-card-${card.id}"`. Render only repository-backed name, year, media, and eligible open roles—never ratings, tiers, placement, or historical claims.

- [ ] **Step 6: Make `RosterBar` show all five roles beside every draft decision**

Derive `filledCount` from `ROLES` and label the region `Roster · ${filledCount} of 5 filled`. Keep movement disabled until lineup review and do not place the roster inside a horizontal track.

- [ ] **Step 7: Implement the desktop grid and mobile decision track CSS**

Desktop shows all three team cards. At 390px, cards use 86–90% track width with a visible next-card edge and textual position. Roster context remains outside the horizontal track.

- [ ] **Step 8: Run focused regressions**

```powershell
npx vitest run src/features/game/components/draft-flow.test.tsx src/features/game/components/game-app.test.tsx src/features/game/components/accessibility.test.tsx src/features/game/draft.test.ts
npx playwright test e2e/free-play.spec.ts --project=desktop
```

Expected: PASS; five distinct cards are still drafted through existing domain APIs and private model fields stay absent.

- [ ] **Step 9: Complete reviews, verify, and commit**

```powershell
npm run verify
git diff --check
git add -- src/features/game/components/team-offer.tsx src/features/game/components/player-picker.tsx src/features/game/components/roster-bar.tsx src/features/game/components/game-app.tsx src/features/game/components/draft-flow.test.tsx src/features/game/components/accessibility.test.tsx src/app/globals.css e2e/support/journey.ts
git commit -m "feat(draft): sharpen player decisions"
```

## Task 4: Roster, Role, and IGL Decisions

**Files:**

- Create: `src/features/game/components/role-picker.tsx`
- Modify: `src/features/game/components/roster-bar.tsx`
- Modify: `src/features/game/components/igl-picker.tsx`
- Modify: `src/features/game/components/game-app.tsx`
- Modify: `src/features/game/components/draft-flow.test.tsx`
- Modify: `src/features/game/components/accessibility.test.tsx`
- Modify: `src/app/globals.css`
- Modify: `e2e/support/journey.ts`

- [ ] **Step 1: Add failing role, roster, and IGL tests**

Cover the required decision semantics:

```tsx
expect(screen.getByRole("heading", { name: /Where should .* play\?/ })).toBeVisible();
expect(screen.getByRole("button", { name: /Back to .* players/ })).toBeVisible();
expect(screen.getByRole("list", { name: "Five-player roster" }).children).toHaveLength(5);
expect(screen.getByRole("group", { name: "Choose your IGL" })).toBeVisible();
expect(screen.getByText("Any drafted player can lead. Your choice affects the simulation.")).toBeVisible();
```

Add assertions that unavailable roles remain visible with their reason, a committed role announces `${handle} added as ${role}. ${count} of 5 drafted.`, selected IGL uses checked state plus `Selected`, radio labels meet a 44px class contract, and compatible swaps remain keyboard-operable.

Write and observe each focused failure separately:

- [ ] Valid role Back action and all-five-role visibility.
- [ ] Unavailable-role reasons and assignment announcement.
- [ ] Ordered roster slots, Open labels, and compatible swaps.
- [ ] IGL consequence copy, selected state, and touch-target class.

- [ ] **Step 2: Run the focused tests and confirm red**

```powershell
npx vitest run src/features/game/components/draft-flow.test.tsx src/features/game/components/accessibility.test.tsx
```

Expected: FAIL because role selection is inline, Back is missing on valid role state, and IGL consequences are unexplained.

- [ ] **Step 3: Extract `RolePicker` with the fixed boundary**

Use this boundary:

```ts
export interface RolePickerProps {
  card: PlayerCard;
  roles: readonly { role: Role; available: boolean; reason?: string }[];
  teamName: string;
  onAssign(role: Role): void;
  onBack(): void;
}
```

Render all five official roles in `ROLES` order. Available roles are native buttons; unavailable roles remain textually explained and disabled. `GameAppCore` derives availability from the current draft without mutating `draft.ts`.

- [ ] **Step 4: Wire Role Back and announcement behavior in `GameAppCore`**

Pass `onBack={() => dispatch({ type: "back-to-player" })}` in every valid role state. After an assignment, announce `${handle} added as ${role}. ${count} of 5 drafted.` once through the shared polite status.

- [ ] **Step 5: Convert `RosterBar` to the ordered all-role contract**

Use `ROLES.map` inside `<ol aria-label="Five-player roster">`; show `Open` or `${handle} ${year}`, visible IGL state, and contextual compatible-swap disclosure. On mobile use a compact five-role grid, never a carousel.

- [ ] **Step 6: Convert `IglPicker` to native radio cards**

Use a `fieldset` with legend `Choose your IGL`, include the exact simulation consequence text, mark the selected label with text and checked state, and keep exactly one primary `Start tournament` action.

- [ ] **Step 7: Make each isolated component test green**

```powershell
npx vitest run src/features/game/components/draft-flow.test.tsx -t "role|roster|IGL"
```

Expected: PASS for Back, unavailable reasons, five-role visibility, swaps, and IGL selection.

- [ ] **Step 8: Run component and machine regressions**

```powershell
npx vitest run src/features/game/components/draft-flow.test.tsx src/features/game/components/game-app.test.tsx src/features/game/components/accessibility.test.tsx src/features/game/draft.test.ts src/features/game/machine.test.ts
npx playwright test e2e/free-play.spec.ts e2e/responsive.spec.ts --project=desktop
```

Expected: PASS; Back returns to the same team roster, spent rerolls remain spent, and IGL/role mechanics are unchanged.

- [ ] **Step 9: Complete reviews, verify, and commit**

```powershell
npm run verify
git diff --check
git add -- src/features/game/components/role-picker.tsx src/features/game/components/roster-bar.tsx src/features/game/components/igl-picker.tsx src/features/game/components/game-app.tsx src/features/game/components/draft-flow.test.tsx src/features/game/components/accessibility.test.tsx src/app/globals.css e2e/support/journey.ts
git commit -m "feat(draft): clarify lineup roles"
```

## Task 5: Tournament Progression

**Files:**

- Modify: `src/features/game/components/tournament-view.tsx`
- Modify: `src/features/game/components/highlight-feed.tsx`
- Modify: `src/features/game/components/game-app.tsx`
- Modify: `src/features/game/components/tournament-flow.test.tsx`
- Modify: `src/features/game/components/highlight-feed.test.tsx`
- Modify: `src/features/game/components/accessibility.test.tsx`
- Modify: `src/app/globals.css`
- Modify: `e2e/support/journey.ts`

- [ ] **Step 1: Write failing suspense, control, and failure-state tests**

Add tests proving that semifinal/final scores are absent while moments remain, then appear after the final moment or Skip. Require `Pause highlights`, `Resume highlights`, `1x`, `2x`, and `Skip to result`; while paused, advancing fake timers must not append a moment.

Assert tournament hierarchy and recovery:

```tsx
expect(screen.getByText("Semifinal · Round 3 of 4")).toBeVisible();
expect(screen.getByRole("heading", { name: /Your roster vs\./ })).toBeVisible();
expect(screen.getByRole("button", { name: "Play semifinal" })).toBeEnabled();
expect(screen.getByRole("button", { name: "Retry semifinal" })).toBeVisible();
expect(screen.queryByRole("heading", { name: /Series result:/ })).not.toBeInTheDocument();
```

Keep the duplicate-series lock test and add unmount/retry coverage so interrupted work cannot apply a stale result.

Write and observe each focused failure separately:

- [ ] Four-stage completed/current/future rail.
- [ ] Opponent-unavailable Retry without an opponent object.
- [ ] Series-failure Retry with the same seed/stage/opponent.
- [ ] Semifinal/final score withheld during narration.
- [ ] Pause, Resume, speed, Skip, and one completion callback.
- [ ] Unmount invalidates stale series application.

- [ ] **Step 2: Run focused tests and confirm red**

```powershell
npx vitest run src/features/game/components/tournament-flow.test.tsx src/features/game/components/highlight-feed.test.tsx src/features/game/components/accessibility.test.tsx
```

Expected: FAIL because the score is currently rendered before highlights, Pause/Resume is absent, and failure only offers restart.

- [ ] **Step 3: Make `TournamentView` own the complete round composition**

Do not alter `playSeries`, `advanceTournament`, ratings, or narration. Change the view contract to make reveal state explicit:

```ts
export interface TournamentViewProps {
  tournament: TournamentState;
  opponent: GeneratedOpponent | null;
  cards: readonly PlayerCard[];
  result: SeriesResult | null;
  revealComplete: boolean;
  resolving: boolean;
  error: string | null;
  onPlay(): void;
  onRetryOpponent(): void;
  onRetrySeries(): void;
  onContinue(): void;
}
```

Use `tournament.currentStage` and `tournament.completedSeries` to render all four stages as completed/current/future. The component must mount when `opponent` is `null`, preserve the current round label and roster, and offer `Retry opponent` without requiring an opponent object.

- [ ] **Step 4: Add retryable opponent generation in `GameAppCore`**

Add an `opponentRevision` counter to the opponent memo dependencies. `onRetryOpponent` clears the generation error and increments that counter; `onRetrySeries` clears the series error and invokes the same locked `playSeries` path. Neither action changes seed, draft, current stage, or gateway logic.

- [ ] **Step 5: Withhold the terminal score until narration completes**

`GameAppCore` retains `presentedSeries` privately, passes `result={highlightsComplete ? presentedSeries : null}`, and mounts `HighlightFeed` for detailed semifinal/final narration. Group and quarterfinal reveal their already-resolved maps immediately without an artificial timer. Failure clears only the current presentation lock and enables Retry for the same stage/opponent.

No round advances automatically: the user explicitly activates `Play ${stage}`, then `Continue to ${nextStage}` after the reveal. Disabled/busy copy must state what is happening; no hidden timer starts a series or changes stages.

- [ ] **Step 6: Retain important repository-generated moments for the recap**

Keep `runHighlights` in `GameAppCore`, keyed by stage to prevent duplicates. When semifinal/final highlights are created, retain only items whose existing `kind` or `emphasis` is `clutch` or `decisive`; clear them on confirmed exit/restart/new run and pass them to `ResultsView` in Task 6. Do not invent new text or analysis.

- [ ] **Step 7: Add Pause/Resume to `HighlightFeed`**

Keep pause state internal to the component. Preserve one completion callback, timer cleanup, StrictMode behavior, stable polite log semantics, and immediate reduced-motion completion where requested by the caller.

- [ ] **Step 8: Make the focused timer and retry tests green**

```powershell
npx vitest run src/features/game/components/highlight-feed.test.tsx -t "Pause|Resume|Skip"
npx vitest run src/features/game/components/tournament-flow.test.tsx -t "withholds|retry|opponent|stage rail"
```

Expected: PASS; paused timers do not advance, Skip completes once, opponent retry remounts the same stage, and the score is withheld until reveal completion.

- [ ] **Step 9: Run focused tests and E2E tournament journeys**

```powershell
npx vitest run src/features/game/components/tournament-flow.test.tsx src/features/game/components/highlight-feed.test.tsx src/features/game/components/game-app.test.tsx src/features/game/tournament.test.ts src/features/game/narration.test.ts
npx playwright test e2e/free-play.spec.ts e2e/responsive.spec.ts --project=desktop
```

Expected: PASS; results remain deterministic, scores no longer spoil semifinal/final highlights, and Skip never delays Continue.

- [ ] **Step 10: Complete reviews, verify, and commit**

```powershell
npm run verify
git diff --check
git add -- src/features/game/components/tournament-view.tsx src/features/game/components/highlight-feed.tsx src/features/game/components/game-app.tsx src/features/game/components/tournament-flow.test.tsx src/features/game/components/highlight-feed.test.tsx src/features/game/components/accessibility.test.tsx src/app/globals.css e2e/support/journey.ts
git commit -m "feat(tournament): stage suspenseful reveals"
```

## Task 6: Results and Replay Experience

**Files:**

- Modify: `src/features/game/components/results-view.tsx`
- Modify: `src/features/game/components/recent-results.tsx`
- Modify: `src/features/game/components/game-app.tsx`
- Modify: `src/features/game/components/results-view.test.tsx`
- Modify: `src/features/game/components/game-app.test.tsx`
- Modify: `src/app/globals.css`
- Modify: `e2e/free-play.spec.ts`
- Modify: `e2e/history.spec.ts`

- [ ] **Step 1: Write failing champion and elimination recap tests**

For both outcomes assert the first heading, stage summary, series record, five-slot lineup, one IGL, and action order:

```tsx
expect(screen.getByRole("heading", { name: "Tournament champion" })).toBeVisible();
expect(screen.getByRole("button", { name: "Run another Daily" })).toBeVisible();
expect(screen.getByRole("region", { name: "Drafted lineup" })).toBeVisible();
expect(screen.getByRole("region", { name: "Tournament path" })).toBeVisible();
expect(screen.getByRole("region", { name: "Key moments" })).toBeVisible();
expect(screen.getByRole("button", { name: "Share result" })).toBeVisible();
```

The elimination case must say `Eliminated in the semifinal` or the repository-backed stage, never celebratory copy. Assert maps are inside a disclosure after the route summary and saved history follows the current recap. Keep every native-share, clipboard, cancellation, fallback textarea, and synchronous lock test.

Write and observe each focused failure separately:

- [ ] Champion outcome, record, replay-first ordering, and achievement-only gold class.
- [ ] Elimination outcome, reached stage, replay-first ordering, and non-celebratory class.
- [ ] Five-slot drafted lineup with one IGL.
- [ ] Retained key moments and no-moments recovery copy.
- [ ] Collapsed map details and subordinate saved history.
- [ ] Existing native/clipboard/fallback sharing behavior under the renamed action.

- [ ] **Step 2: Run focused tests and confirm red**

```powershell
npx vitest run src/features/game/components/results-view.test.tsx src/features/game/components/game-app.test.tsx
```

Expected: FAIL because the current results view is a raw nested list with equal actions.

- [ ] **Step 3: Extend the results contract with truthful retained highlights**

```ts
export interface ResultsViewProps {
  mode: GameMode;
  tournament: TournamentState;
  cards: readonly PlayerCard[];
  highlights: readonly Highlight[];
  rerollsUsed: number;
  shareText: string;
  onRunAgain(): void;
  onModeChange(mode: GameMode): void;
}
```

Pass the stage-keyed `runHighlights` retained in Task 5. Render their existing text verbatim under `Key moments`; if none were generated before elimination, render `No narrated moments before elimination.` without manufacturing analysis.

- [ ] **Step 4: Implement outcome-first recap composition**

Derive only truthful values already present in `TournamentState`:

```ts
const wins = tournament.completedSeries.filter(series => series.userWins > series.opponentWins).length;
const losses = tournament.completedSeries.length - wins;
const stage = tournament.completedSeries.at(-1)?.stage ?? tournament.currentStage;
```

Use `Tournament champion` for a champion and `Eliminated in the ${stageLabel}` otherwise. Place stage/record directly below, then the primary replay action, tournament path, drafted lineup/IGL, map-detail disclosure, rerolls used, and secondary Share/mode actions. Do not generate analysis, MVP labels, ratings, odds, or causal claims.

- [ ] **Step 5: Keep saved history subordinate and legacy-compatible**

Keep `RecentResults` collapsed and below the active recap; stored legacy runs without outcome or maps must remain readable.

- [ ] **Step 6: Make champion, elimination, and sharing tests green**

```powershell
npx vitest run src/features/game/components/results-view.test.tsx -t "champion|eliminated|Share|clipboard|cancellation"
```

Expected: PASS with outcome-first ordering, retained highlight text, empty-highlight recovery, and unchanged share fallbacks.

- [ ] **Step 7: Run result and browser regressions**

```powershell
npx vitest run src/features/game/components/results-view.test.tsx src/features/game/components/game-app.test.tsx src/features/game/share.test.ts src/features/game/storage.test.ts
npx playwright test e2e/free-play.spec.ts e2e/history.spec.ts --project=desktop
```

Expected: PASS; both strong and poor outcomes read immediately and share strings remain byte-for-byte governed by existing formatters.

- [ ] **Step 8: Complete reviews, verify, and commit**

```powershell
npm run verify
git diff --check
git add -- src/features/game/components/results-view.tsx src/features/game/components/recent-results.tsx src/features/game/components/game-app.tsx src/features/game/components/results-view.test.tsx src/features/game/components/game-app.test.tsx src/app/globals.css e2e/free-play.spec.ts e2e/history.spec.ts
git commit -m "feat(results): build tournament recap"
```

## Task 7: Responsive Behavior, Accessibility, and Resilience

**Files:**

- Modify: `src/features/game/storage.ts`
- Modify: `src/features/game/storage.test.ts`
- Create: `src/features/game/active-run.ts`
- Create: `src/features/game/active-run.test.ts`
- Modify: `src/features/game/components/game-app.tsx`
- Modify: `src/features/game/components/game-app.test.tsx`
- Modify: `src/features/game/components/game-app.hydration.test.tsx`
- Modify: `src/features/game/components/error-boundary.tsx`
- Modify: `src/features/game/components/accessibility.test.tsx`
- Modify: `src/app/globals.css`
- Modify: `src/app/globals.test.ts`
- Modify: `e2e/support/audit.ts`
- Modify: `e2e/responsive.spec.ts`
- Create: `e2e/restoration.spec.ts`

- [ ] **Step 1: Write failing active-record and reconstruction tests**

Add `STORAGE_KEYS.active = "run-it-back:active:v1"` and define a record whose public value is:

```ts
export interface ActiveRunStorage {
  readonly run: null | {
    readonly mode: GameMode;
    readonly phase: "team" | "player" | "role" | "lineup" | "tournament";
    readonly draft: DraftState;
    readonly tournament?: {
      readonly currentStage: Stage;
      readonly completedSeries: readonly {
        readonly stage: Stage;
        readonly userWins: number;
        readonly opponentWins: number;
        readonly maps: readonly { readonly map: (typeof MAP_POOL)[number]; readonly userScore: number; readonly opponentScore: number }[];
      }[];
    };
  };
}
```

Tests must prove `JSON.stringify` contains none of `traits`, `strength`, `probability`, or `roll`; malformed IDs, duplicate cards, invalid phases, impossible completed stages, and mismatched deterministic summaries are rejected without touching Daily/history records.

Write and observe each focused failure separately:

- [ ] Active key/schema round trip and record isolation.
- [ ] Public-only serialization field scan.
- [ ] Draft ID/role/reroll/IGL tamper rejection.
- [ ] Tournament stage/summary tamper rejection.
- [ ] Storage read/write/remove failure degradation.

- [ ] **Step 2: Run storage tests and confirm red**

```powershell
npx vitest run src/features/game/storage.test.ts src/features/game/active-run.test.ts
```

Expected: FAIL because the active record and serializer do not exist.

- [ ] **Step 3: Implement public serialization and deterministic restoration**

Expose these APIs from `active-run.ts`:

```ts
export function serializeActiveRun(state: GameState): ActiveRunStorage["run"];
export interface RestoredActiveRun {
  readonly state: GameState;
  readonly highlights: readonly Highlight[];
}
export function restoreActiveRun(
  stored: ActiveRunStorage["run"],
  dataset: GameDataset,
  gateway: SimulationGateway,
): RestoredActiveRun | null;
```

For draft phases, validate offer IDs, selected team, pending card, unique slot cards, role eligibility, reroll bounds, and IGL membership against the current dataset. For tournament restore, start from `startTournament`, regenerate each prior opponent/series through the injected gateway, compare only the stored public summaries, and advance through the exact stored stage. Recreate retained clutch/decisive semifinal/final narration through `gateway.createHighlights` so a later recap remains complete after reload. Return `null` on any mismatch. Never persist or accept `results`; completed results continue through existing Daily/history records.

- [ ] **Step 4: Make draft-phase serializer and validation tests green**

Implement `serializeActiveRun` for `team`, `player`, `role`, and `lineup`; return `null` for `mode` and `results`. Strip unknown keys through the Zod record before writing.

```powershell
npx vitest run src/features/game/active-run.test.ts -t "draft|private|invalid"
```

Expected: PASS for public-only draft records and dataset tamper rejection.

- [ ] **Step 5: Make tournament reconstruction tests green**

Regenerate completed stages in `STAGE_ORDER`, compare stage/wins/map names/scores, rebuild `TournamentState`, and collect only existing clutch/decisive narration.

```powershell
npx vitest run src/features/game/active-run.test.ts -t "tournament|highlight|mismatch"
```

Expected: PASS for deterministic state/highlight restoration and summary mismatch rejection.

- [ ] **Step 6: Add failing hydration and lifecycle tests**

Test a server/client-stable `Restoring saved run…` shell, then post-mount focus on the restored task heading. Assert writes after committed draft actions, no overwrite before hydration, clearing on confirmed exit/results, in-memory continuation when storage throws, invalid active-record recovery messaging, and error-boundary remount restoration.

Write and observe each focused failure separately:

- [ ] SSR/first-client restoration shell parity.
- [ ] Draft restore and restored-heading focus.
- [ ] Tournament restore with fresh presentation state and retained key moments.
- [ ] Confirmed exit/results clearing and no premature clear.
- [ ] Invalid/throwing storage recovery and error-boundary remount.

- [ ] **Step 7: Implement hydration without exposing a forged reducer action**

Keep `GameAction` unchanged. Inside `GameAppCore`, wrap the domain reducer with a private UI-only action:

```ts
type AppAction = GameAction | { type: "restore-active"; state: GameState };
const appReducer = (state: GameState, action: AppAction) =>
  action.type === "restore-active" ? action.state : reducer(state, action);
```

Read and validate the active record in an effect, render the stable restoration shell until complete, then dispatch only `restored.state` and seed recap state from `restored.highlights`. Persist subsequent committed states; clear on mode/results/confirmed exit. Presented highlights and uncommitted series are intentionally not persisted, so a reload restarts that stage’s deterministic presentation.

- [ ] **Step 8: Make active-run hydration lifecycle tests green**

```powershell
npx vitest run src/features/game/components/game-app.hydration.test.tsx src/features/game/components/game-app.test.tsx -t "restore|active run|storage|exit"
```

Expected: PASS without hydration warnings, premature active-record clearing, or cross-record recovery.

- [ ] **Step 9: Add exact viewport, keyboard, and assistive-technology browser tests**

Add Playwright coverage for:

```ts
await page.setViewportSize({ width: 390, height: 844 });
await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth === innerWidth)).toBe(true);
await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
```

Use a 320 CSS-pixel viewport as the explicit WCAG 400%-zoom equivalent for a 1280 CSS-pixel desktop layout, and manually repeat the critical journey at browser zoom 400% during Task 8. At 320px assert no two-dimensional page scrolling, all enabled controls are reachable by Tab, all pointer controls have at least a 44×44 CSS pixel hit area, long repository names wrap, the full roster remains visible, focus is visible, and every route-like phase change focuses its task heading. `restoration.spec.ts` reloads during player selection and semifinal presentation, verifies deterministic state, tests confirmed exit, injects corrupt active JSON, and simulates throwing storage.

Extend `e2e/support/audit.ts` with a computed-style contrast helper. On representative text, primary action, secondary action, disabled control, selected card, focused control, error alert, champion outcome, and elimination outcome elements, assert normal text is at least 4.5:1 and component boundary/focus/selection indicators are at least 3:1 against their adjacent rendered background. Record the measured matrix in the test failure message so a token regression identifies the exact pair.

- [ ] **Step 10: Run focused and full browser verification**

```powershell
npx vitest run src/features/game/storage.test.ts src/features/game/active-run.test.ts src/features/game/components/game-app.test.tsx src/features/game/components/game-app.hydration.test.tsx src/features/game/components/accessibility.test.tsx src/app/globals.test.ts
npx playwright test e2e/restoration.spec.ts e2e/responsive.spec.ts
npm run verify
```

Expected: PASS on desktop and Pixel 7; exact 390px and 320px contexts have no page-level horizontal overflow; no snapshots are updated.

- [ ] **Step 11: Complete reviews and commit**

```powershell
git diff --check
git add -- src/features/game/storage.ts src/features/game/storage.test.ts src/features/game/active-run.ts src/features/game/active-run.test.ts src/features/game/components/game-app.tsx src/features/game/components/game-app.test.tsx src/features/game/components/game-app.hydration.test.tsx src/features/game/components/error-boundary.tsx src/features/game/components/accessibility.test.tsx src/app/globals.css src/app/globals.test.ts e2e/support/audit.ts e2e/responsive.spec.ts e2e/restoration.spec.ts
git commit -m "feat(app): restore active runs safely"
```

## Task 8: Integrated Visual Polish and Regression Verification

**Files:**

- Modify within this bounded polish surface: `src/app/globals.css`
- Modify within this bounded polish surface: `src/features/game/components/app-header.tsx`
- Modify within this bounded polish surface: `src/features/game/components/mode-selection.tsx`
- Modify within this bounded polish surface: `src/features/game/components/team-offer.tsx`
- Modify within this bounded polish surface: `src/features/game/components/player-picker.tsx`
- Modify within this bounded polish surface: `src/features/game/components/role-picker.tsx`
- Modify within this bounded polish surface: `src/features/game/components/roster-bar.tsx`
- Modify within this bounded polish surface: `src/features/game/components/igl-picker.tsx`
- Modify within this bounded polish surface: `src/features/game/components/tournament-view.tsx`
- Modify within this bounded polish surface: `src/features/game/components/highlight-feed.tsx`
- Modify within this bounded polish surface: `src/features/game/components/results-view.tsx`
- Modify corresponding semantics only in: `src/features/game/components/accessibility.test.tsx`
- Modify corresponding semantics only in: `src/features/game/components/draft-flow.test.tsx`
- Modify corresponding semantics only in: `src/features/game/components/tournament-flow.test.tsx`
- Modify corresponding semantics only in: `src/features/game/components/results-view.test.tsx`
- Modify after manual approval: current-platform `e2e/__screenshots__/*/{desktop,pixel-7}/results-eliminated.png`
- Modify after manual approval: current-platform `e2e/__screenshots__/*/{desktop,pixel-7}/results-champion.png`
- Remove after replacement review: current-platform `e2e/__screenshots__/*/{desktop,pixel-7}/results.png`
- Modify: `e2e/free-play.spec.ts`
- Modify: `e2e/responsive.spec.ts`
- Modify: `docs/ux/run-it-back-redesign-brief.md`
- Modify: `DESIGN.md`

- [ ] **Step 1: Run Impeccable critique before changing polish**

Review every screen against `.impeccable/mocks/decision/run-it-back-live-results-desk-v2.webp` and `DESIGN.md`. Record concrete findings for spacing, hierarchy, typography, alignment, repeated containers, interaction clarity, decoration, transitions, and responsive continuity. Do not change mechanics.

- [ ] **Step 2: Capture the first integrated screenshot set without updating baselines**

```powershell
npm run build
npx playwright test e2e/free-play.spec.ts --grep "captures the complete Free Play journey|captures champion recap"
```

The complete journey uses deterministic `e2e-164` and writes `results-eliminated.png`; add a focused recap capture using deterministic `e2e-560` and write `results-champion.png`. Both seeds use the same first-valid-choice drafting path and are pinned by the current simulation (`e2e-164` loses the final 1–3; `e2e-560` wins the final 3–1). Expected: screenshot assertions fail where the redesign intentionally differs. Open every desktop and Pixel 7 actual/diff image; classify each difference as intentional, regression, or platform rendering noise.

- [ ] **Step 3: Execute polish round one with tests alongside changes**

Fix only observed cross-screen inconsistencies. For every semantic/interaction correction, first add or tighten the corresponding component/E2E assertion and prove it fails. Keep CSS-only spacing/alignment corrections within documented tokens. Re-run:

```powershell
npx vitest run src/app/globals.test.ts src/features/game/components
npx playwright test e2e/responsive.spec.ts e2e/restoration.spec.ts
```

Expected: PASS with no mechanics or snapshot changes.

- [ ] **Step 4: Execute polish round two and stop subjective iteration**

Perform one final connected-experience critique at desktop and 390px. Serve the static build and manually complete the critical journey at browser zoom 400%, confirming one-axis reflow, visible focus, readable controls, and no clipped roster/action content. Fix only remaining P0/P1 or clear consistency defects. Do not begin a third subjective polish round.

- [ ] **Step 5: Review and update screenshot baselines intentionally**

After manually confirming each mode, team offer, player picker, complete roster/IGL, semifinal highlight, champion/eliminated result difference:

```powershell
npm run test:e2e:update
git diff --stat -- e2e/__screenshots__
```

Expected: only the reviewed Run It Back desktop and Pixel 7 baselines for the current operating system change, including separate champion and eliminated recaps. Never accept an image solely because the assertion failed. Preserve other platform baseline folders and report them as uncaptured rather than fabricating them.

- [ ] **Step 6: Run complete final verification**

Run each command separately and retain its exit result:

```powershell
npm run lint
npm run typecheck
npm run test
npm run test:audit-cli
npm run build
npm run test:e2e
git diff --check
git status --short
```

Expected: lint/typecheck exit 0; all unit/component tests pass with only previously documented skips; audit CLI reports all checks OK; static export succeeds; every desktop and Pixel 7 E2E journey and screenshot passes; no unintended file is modified.

- [ ] **Step 7: Dispatch the final integrated reviewer**

The fresh read-only reviewer must examine spec compliance, journey consistency, accessibility, code quality, regressions, unnecessary scope, screenshot intent, and residual risk. Return every important finding to the Task 8 implementer, add a failing regression test where practical, fix, and repeat the complete verification command set until approved.

- [ ] **Step 8: Update durable design documentation**

Record implemented deviations, final component patterns, screenshot inventory, and known limitations in `DESIGN.md` and `docs/ux/run-it-back-redesign-brief.md`. Do not rewrite historical audit findings as though the original interface never existed.

- [ ] **Step 9: Commit the integrated finish**

```powershell
git add -- src/app/globals.css src/features/game/components e2e DESIGN.md docs/ux/run-it-back-redesign-brief.md
git commit -m "feat(ui): polish complete draft journey"
```

Expected: the commit contains only reviewed polish, screenshot baselines, test adjustments, and final documentation.

## Completion and Branch Finish

- [ ] Use `superpowers:verification-before-completion` and cite fresh outputs rather than earlier stage runs.
- [ ] Confirm commits for all eight implementation tasks plus the approved-design commit.
- [ ] Report stages completed, commit hashes/messages, exact test totals/results, screenshot files changed, notable UX improvements, intentionally unchanged mechanics, and remaining limitations.
- [ ] Use `superpowers:finishing-a-development-branch` to present merge, PR, keep-branch, or cleanup choices. Do not merge, push, open a PR, or remove the worktree without the user’s explicit selection.

## Plan Self-Review Checklist

- [x] Every Objective improvement maps to at least one task and automated or manual acceptance check.
- [x] Every Preserve constraint appears in the invariants and focused regressions.
- [x] Daily completed, reroll exhausted, missing media, invalid assignment, loading, error, retry, reload, storage failure, reduced motion, forced colors, long text, 390px, 320px, champion, and early-elimination states are covered.
- [x] Component props never expose hidden traits, ratings, strengths, probabilities, or rolls.
- [x] Active-run storage contains public summaries only and reconstruction uses the existing deterministic gateway.
- [x] Production code changes stop after two deliberate integrated polish rounds.
- [x] No placeholder step, unspecified file, vague test command, backend work, account work, fabricated content, or unrelated feature remains.
