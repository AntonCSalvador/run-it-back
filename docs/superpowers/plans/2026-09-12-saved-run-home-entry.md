# Saved Run Home Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Always show the welcome screen first, let players explicitly continue or discard a saved run, and make the in-game wordmark return home without losing progress.

**Architecture:** Keep restored `GameState` in memory and add one non-persisted `homeOpen` view flag in `GameAppCore`. `ModeSelection` renders either normal mode choices or one saved-run choice; `AppHeader` exposes a native wordmark button that opens home while active-state persistence continues unchanged.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest, Testing Library, Playwright, CSS

---

## File Map

- Modify `src/features/game/components/app-header.tsx`: expose wordmark home action.
- Modify `src/features/game/components/mode-selection.tsx`: render saved-run choice.
- Modify `src/features/game/components/game-app.tsx`: own home/game view state and connect actions.
- Modify `src/app/globals.css`: preserve wordmark styling for button and style saved-run panel.
- Modify `src/features/game/components/accessibility.test.tsx`: verify semantic wordmark action.
- Create `src/features/game/components/mode-selection.test.tsx`: isolate saved-run choice behavior.
- Modify `src/features/game/components/game-app.hydration.test.tsx`: verify saved runs stop at home.
- Modify `src/features/game/components/game-app.test.tsx`: verify wordmark round trip without progress loss.
- Modify `e2e/support/journey.ts`: provide explicit saved-run continuation helper.
- Modify `e2e/restoration.spec.ts`: cover deployed-browser restoration and home behavior.

### Task 1: Clickable Header Wordmark

**Files:**
- Modify: `src/features/game/components/app-header.tsx`
- Modify: `src/features/game/components/accessibility.test.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Write failing semantic interaction test**

Update the existing `AppHeader` accessibility test:

```tsx
it("exposes the selected game mode, home action, and draft progress semantically", async () => {
  const onHome = vi.fn();
  render(<>
    <AppHeader mode="daily" stage="draft" detail="Pick 2 of 5 · Choose a team to scout" onHome={onHome} onExit={vi.fn()} />
    <TeamOffer teams={teams} rerolls={2} canReroll onChoose={vi.fn()} onReroll={vi.fn()} />
  </>);
  expect(screen.getByLabelText("Current mode")).toHaveTextContent("Daily");
  expect(screen.getByText("Draft").closest("li")).toHaveAttribute("aria-current", "step");
  expect(screen.getByRole("button", { name: "Run It Back home" })).toBeVisible();
  await userEvent.setup().click(screen.getByRole("button", { name: "Run It Back home" }));
  expect(onHome).toHaveBeenCalledOnce();
  expect(screen.getByRole("button", { name: "Exit run" })).toBeVisible();
});
```

- [ ] **Step 2: Run test and verify RED**

Run:

```powershell
npx vitest run src/features/game/components/accessibility.test.tsx
```

Expected: FAIL because `AppHeader` has no `onHome` prop or wordmark button.

- [ ] **Step 3: Add minimal wordmark action**

Change `AppHeaderProps` and heading in `app-header.tsx`:

```tsx
export interface AppHeaderProps {
  mode: GameMode;
  stage: MacroStage;
  detail: string;
  onHome(): void;
  onExit?(): void;
}

export function AppHeader({ mode, stage, detail, onHome, onExit }: AppHeaderProps) {
  return <header className="app-banner">
    <h1><button className="app-banner__home" type="button" onClick={onHome} aria-label="Run It Back home">Run It Back</button></h1>
    <div className="app-banner__run">
      <p aria-label="Current mode">{mode === "daily" ? "Daily" : "Free Play"}</p>
      <RunProgress stage={stage} detail={detail} />
    </div>
    {onExit && <button className="app-banner__exit" type="button" onClick={onExit}>Exit run</button>}
  </header>;
}
```

Add CSS that inherits current heading typography without creating a second visual style:

```css
.app-banner__home {
  min-block-size: 0;
  border: 0;
  padding: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
}
.app-banner__home:hover { color: var(--rib-red); }
```

- [ ] **Step 4: Run test and verify GREEN**

Run:

```powershell
npx vitest run src/features/game/components/accessibility.test.tsx
```

Expected: PASS with no console warnings.

- [ ] **Step 5: Commit header behavior**

```powershell
git add src/features/game/components/app-header.tsx src/features/game/components/accessibility.test.tsx src/app/globals.css
git commit -m "feat(ui): link wordmark to home"
```

### Task 2: Saved-Run Welcome Choice

**Files:**
- Create: `src/features/game/components/mode-selection.test.tsx`
- Modify: `src/features/game/components/mode-selection.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Write failing saved-run panel tests**

Create `mode-selection.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ModeSelection } from "./mode-selection";

const base = {
  dailyState: "available" as const,
  streak: 0,
  onStart: vi.fn(),
  onViewDailyResult: vi.fn(),
};

describe("ModeSelection saved run", () => {
  it("offers explicit continuation instead of fresh modes", () => {
    const onContinueSavedRun = vi.fn();
    const onStartOver = vi.fn();
    render(<ModeSelection {...base}
      savedRun={{ mode: "free-play", detail: "Pick 2 of 5 · Choose a player" }}
      onContinueSavedRun={onContinueSavedRun}
      onStartOver={onStartOver}
    />);

    expect(screen.getByRole("heading", { name: "Unfinished Free Play run" })).toBeVisible();
    expect(screen.getByText("Pick 2 of 5 · Choose a player")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Start Free Play" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue saved run" }));
    fireEvent.click(screen.getByRole("button", { name: "Start over" }));
    expect(onContinueSavedRun).toHaveBeenCalledOnce();
    expect(onStartOver).toHaveBeenCalledOnce();
  });

  it("keeps normal choices when no saved run exists", () => {
    render(<ModeSelection {...base} savedRun={null} onContinueSavedRun={vi.fn()} onStartOver={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Start today's Daily" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Start Free Play" })).toBeVisible();
  });
});
```

- [ ] **Step 2: Run test and verify RED**

Run:

```powershell
npx vitest run src/features/game/components/mode-selection.test.tsx
```

Expected: FAIL because saved-run props and panel do not exist.

- [ ] **Step 3: Implement saved-run choice**

Extend `ModeSelectionProps`:

```tsx
savedRun: { mode: GameMode; detail: string } | null;
onContinueSavedRun(): void;
onStartOver(): void;
```

Inside `.mode-selection__choices`, branch before existing Daily/Free Play markup:

```tsx
<div className="mode-selection__choices" aria-label="Choose how to play">
  {savedRun ? <section className="mode-selection__saved" aria-labelledby="saved-run-title">
    <h3 id="saved-run-title">Unfinished {savedRun.mode === "daily" ? "Daily" : "Free Play"} run</h3>
    <p>{savedRun.detail}</p>
    <div className="mode-selection__actions">
      <button className="action-button" type="button" onClick={onContinueSavedRun}>Continue saved run</button>
      <button type="button" onClick={onStartOver}>Start over</button>
    </div>
  </section> : <>
    <section className="mode-selection__daily" aria-labelledby="daily-mode-title">
      <div className="mode-selection__choice-heading">
        <h3 id="daily-mode-title">Daily</h3>
        <p className="mode-status" role="status">{completed ? "Completed today" : "Available today"}</p>
      </div>
      <p>One shared draft each UTC day.</p>
      <p aria-label="Daily streak">Current streak: {streak}</p>
      <div className="mode-selection__actions">
        {completed
          ? <>
              <button className="action-button" type="button" onClick={onViewDailyResult}>View today&apos;s result</button>
              <button type="button" onClick={() => onStart("daily")}>Replay today&apos;s Daily</button>
            </>
          : <button className="action-button" type="button" onClick={() => onStart("daily")}>Start today&apos;s Daily</button>}
      </div>
    </section>
    <section className="mode-selection__free" aria-labelledby="free-play-title">
      <h3 id="free-play-title">Free Play</h3>
      <p>Unlimited drafts with a fresh bracket each run.</p>
      <button type="button" onClick={() => onStart("free-play")}>Start Free Play</button>
    </section>
  </>}
</div>
```

Reuse existing card language in CSS:

```css
.mode-selection__saved {
  margin: 0;
  border: 1px solid var(--rib-line-strong);
  border-radius: var(--rib-radius-lg);
  padding: var(--rib-space-6);
  background: var(--rib-surface-1);
}
.mode-selection__saved h3 { margin-block-start: 0; }
.mode-selection__saved > p { color: var(--rib-text-secondary); }
```

- [ ] **Step 4: Run tests and verify GREEN**

Run:

```powershell
npx vitest run src/features/game/components/mode-selection.test.tsx src/app/globals.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit saved-run choice**

```powershell
git add src/features/game/components/mode-selection.tsx src/features/game/components/mode-selection.test.tsx src/app/globals.css
git commit -m "feat(ui): add saved-run home choice"
```

### Task 3: Home Overlay State and Restoration Gate

**Files:**
- Modify: `src/features/game/components/game-app.hydration.test.tsx`
- Modify: `src/features/game/components/game-app.test.tsx`
- Modify: `src/features/game/components/game-app.tsx`

- [ ] **Step 1: Change hydration test to require explicit continuation**

Replace the current direct-restoration expectation with:

```tsx
it("lands on home with an explicit choice before opening a saved decision", async () => {
  const dataset = parseDataset(minimalDataset);
  const draft = createDraft("restore-player", dataset);
  const state = { phase: "player", mode: "free-play", draft: { ...draft, selectedTeamId: draft.offeredTeamIds[0] } } as const;
  const storage = memoryStorage();
  writeRecord(storage, ACTIVE_RECORD, { run: { phase: state.phase, mode: state.mode, draft: state.draft } });

  render(<GameApp dataset={dataset} storage={storage} />);

  const home = await screen.findByRole("heading", { name: "Draft history. Rewrite the bracket." });
  expect(home).toHaveFocus();
  expect(screen.getByRole("button", { name: "Continue saved run" })).toBeVisible();
  expect(screen.queryByRole("heading", { name: new RegExp(dataset.teams.find(team => team.id === state.draft.selectedTeamId)!.name) })).not.toBeInTheDocument();

  await userEvent.setup().click(screen.getByRole("button", { name: "Continue saved run" }));
  const decision = screen.getByRole("heading", { name: new RegExp(dataset.teams.find(team => team.id === state.draft.selectedTeamId)!.name) });
  expect(decision).toBeVisible();
  expect(storage.getItem(STORAGE_KEYS.active)).not.toBeNull();
});
```

- [ ] **Step 2: Add wordmark round-trip test**

In `game-app.test.tsx`, use an active player-phase fixture and assert:

```tsx
it("opens home from the wordmark and continues the same decision", async () => {
  const draft = createDraft("home-round-trip", dataset);
  const selectedTeamId = draft.offeredTeamIds[0];
  const active = { phase: "player", mode: "free-play", draft: { ...draft, selectedTeamId } } as const;
  const storage = memoryStorage();
  const user = userEvent.setup();
  render(<GameApp dataset={dataset} storage={storage} initialState={active} />);
  const decisionName = dataset.teams.find(team => team.id === selectedTeamId)!.name;

  await user.click(screen.getByRole("button", { name: "Run It Back home" }));
  expect(screen.getByRole("heading", { name: "Draft history. Rewrite the bracket." })).toHaveFocus();
  expect(screen.queryByRole("heading", { name: new RegExp(decisionName) })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Continue saved run" }));
  expect(screen.getByRole("heading", { name: new RegExp(decisionName) })).toBeVisible();
});
```

- [ ] **Step 3: Run focused tests and verify RED**

Run:

```powershell
npx vitest run src/features/game/components/game-app.hydration.test.tsx src/features/game/components/game-app.test.tsx
```

Expected: FAIL because restored state renders immediately and `AppHeader` is not wired.

- [ ] **Step 4: Implement one home view flag**

In `GameAppCore`, add:

```tsx
const [homeOpen, setHomeOpen] = useState(initialState.phase === "mode");
const [focusHome, setFocusHome] = useState(false);
```

After successful active-run restoration, keep `homeOpen` true, focus home, and change notice:

```tsx
dispatch({ type: "restore-active", state: restored.state });
setHomeOpen(true);
setFocusHome(true);
setRestoreNotice("Saved run found. Choose whether to continue or start over.");
```

Derive view and saved summary:

```tsx
const showHome = homeOpen || state.phase === "mode";
const savedRun = showHome && state.phase !== "mode" && state.phase !== "results"
  ? { mode: state.mode, detail: progress!.detail }
  : null;
```

Render the entry header and `ModeSelection` when `showHome`. Pass:

```tsx
savedRun={savedRun}
focusOnMount={focusModeOnMount || focusModeAfterExit || focusHome}
onContinueSavedRun={() => { setHomeOpen(false); setFocusHome(false); }}
onStartOver={() => setExitDialogOpen(true)}
```

Wire gameplay header:

```tsx
<AppHeader
  mode={state.mode}
  stage={progress!.stage}
  detail={progress!.detail}
  onHome={() => { setHomeOpen(true); setFocusHome(true); }}
  onExit={state.phase === "results" ? undefined : () => setExitDialogOpen(true)}
/>
```

Change each phase renderer condition so active decisions render only outside
home. Make these six exact prefix replacements and leave everything following
each prefix unchanged:

```text
{state.phase === "team" &&                 -> {!showHome && state.phase === "team" &&
{state.phase === "player" &&               -> {!showHome && state.phase === "player" &&
{state.phase === "role" &&                 -> {!showHome && state.phase === "role" &&
{state.phase === "lineup" &&               -> {!showHome && state.phase === "lineup" &&
{state.phase === "tournament" &&           -> {!showHome && state.phase === "tournament" &&
{state.phase === "results" && terminalResult -> {!showHome && state.phase === "results" && terminalResult
```

On confirmed exit, keep home open before reset:

```tsx
setExitDialogOpen(false);
setHomeOpen(true);
setFocusModeAfterExit(true);
resetState();
```

When `showHome` comes from a terminal result, allow `startMode` to call `beginAnotherRun(value)`; active saved runs never expose fresh-mode buttons.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```powershell
npx vitest run src/features/game/components/accessibility.test.tsx src/features/game/components/mode-selection.test.tsx src/features/game/components/game-app.hydration.test.tsx src/features/game/components/game-app.test.tsx
```

Expected: PASS with no React warnings.

- [ ] **Step 6: Commit application behavior**

```powershell
git add src/features/game/components/game-app.tsx src/features/game/components/game-app.hydration.test.tsx src/features/game/components/game-app.test.tsx
git commit -m "fix(app): gate saved-run restoration"
```

### Task 4: Browser Journey and Regression Verification

**Files:**
- Modify: `e2e/support/journey.ts`
- Modify: `e2e/restoration.spec.ts`

- [ ] **Step 1: Add browser helper and failing deployed-flow test**

Add to `e2e/support/journey.ts`:

```ts
export async function continueSavedRun(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Continue saved run" }).click();
}
```

Update reload cases in `restoration.spec.ts` to assert welcome first, then call `continueSavedRun(page)` before existing restored-decision assertions. Add:

```ts
test("wordmark returns home without clearing active progress", async ({ page }) => {
  await page.goto("/?e2e-seed=home-round-trip-e2e");
  await start(page, "Free Play");
  await chooseFirstTeam(page);
  const heading = await page.getByRole("heading", { name: /Choose from/ }).textContent();
  const checkpoint = await page.evaluate(key => localStorage.getItem(key), STORAGE_KEYS.active);

  await page.getByRole("button", { name: "Run It Back home" }).click();
  await expect(page.getByRole("heading", { name: "Draft history. Rewrite the bracket." })).toBeFocused();
  expect(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEYS.active)).toBe(checkpoint);
  await continueSavedRun(page);
  await expect(page.getByRole("heading", { name: heading! })).toBeVisible();
});
```

- [ ] **Step 2: Run browser test and verify RED if not already covered by Task 3**

Run:

```powershell
npx playwright test e2e/restoration.spec.ts --project=desktop
```

Expected before Task 3 implementation: FAIL at welcome/wordmark expectations.

- [ ] **Step 3: Update all restoration reload expectations**

Import `continueSavedRun`. In these three tests, immediately after `page.reload()`
assert the welcome heading, call `continueSavedRun(page)`, then retain the
existing restored-decision assertions:

```text
reload restores a committed player decision deterministically
reload during semifinal presentation restarts that deterministic stage
reload at the Final rebuilds retained semifinal moments exactly once in the recap
```

In `error recovery restores the saved task and focuses its heading`, keep the
explicit recovery-button flow unchanged because it is not a page-entry restore.
In `corrupt active data is isolated and storage failure keeps the run playable`,
assert there is no **Continue saved run** button after malformed storage recovery.
Preserve every existing `STORAGE_KEYS.active` null/non-null assertion.

- [ ] **Step 4: Run browser and unit suites**

Run:

```powershell
npx vitest run src/features/game/components
npx playwright test e2e/restoration.spec.ts
```

Expected: all tests PASS on desktop and Pixel 7.

- [ ] **Step 5: Run static checks and production build**

Run:

```powershell
npm run lint
npm run typecheck
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 6: Run Impeccable detector once**

Run:

```powershell
& 'C:\Users\anton\.codex\skills\impeccable\scripts\impeccable.cmd' detect --json src/features/game/components/app-header.tsx src/features/game/components/mode-selection.tsx src/features/game/components/game-app.tsx src/app/globals.css
```

Expected: no blocking findings. Fix any concrete accessibility or design-system violations, then rerun affected tests once.

- [ ] **Step 7: Commit browser coverage and final adjustments**

```powershell
git add e2e/support/journey.ts e2e/restoration.spec.ts src/features/game/components src/app/globals.css
git commit -m "test(e2e): cover saved-run home entry"
```

- [ ] **Step 8: Verify clean worktree and commit range**

```powershell
git status --short
git log --oneline origin/feature/run-it-back-ux-redesign..HEAD
```

Expected: clean status and only saved-run design/implementation commits.
