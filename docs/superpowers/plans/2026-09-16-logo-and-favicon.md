# Logo and Favicon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the supplied horizontal wordmark to the app header and the supplied square mark as the site favicon.

**Architecture:** Copy only the selected transparent PNGs into descriptive public asset paths. Render the wordmark with a native image inside the existing accessible Home button, style its contrast plate responsively, and declare the favicon through Next.js metadata.

**Tech Stack:** Next.js 16, React 19, TypeScript, CSS, Vitest, Testing Library

---

### Task 1: Brand assets, header, and favicon

**Files:**
- Create: `public/assets/brand/run-it-back-wordmark.png`
- Create: `public/assets/brand/run-it-back-icon.png`
- Modify: `src/features/game/components/app-header.tsx`
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`
- Test: `src/features/game/components/game-app.test.tsx`
- Test: `src/app/layout.test.tsx`
- Test: `src/app/globals.test.ts`

- [ ] **Step 1: Write failing assertions**

Assert that the Home button contains an image with an empty alternative, that `metadata.icons.icon` points to `/assets/brand/run-it-back-icon.png`, and that `.app-banner__wordmark` uses `object-fit: contain` with responsive dimensions.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm test -- --run src/features/game/components/game-app.test.tsx src/app/layout.test.tsx src/app/globals.test.ts`

Expected: FAIL because the image, icon metadata, and wordmark CSS do not exist.

- [ ] **Step 3: Copy the two selected PNG assets**

Copy the supplied horizontal PNG to `public/assets/brand/run-it-back-wordmark.png` and the crisp gold/red square PNG to `public/assets/brand/run-it-back-icon.png`. Do not copy the unused variants.

- [ ] **Step 4: Implement the header image and favicon metadata**

Render the wordmark as a native `<img className="app-banner__wordmark" src={assetUrl("/assets/brand/run-it-back-wordmark.png") ?? undefined} alt="" />` inside the existing `aria-label="Run It Back home"` button. Add `icons: { icon: "/assets/brand/run-it-back-icon.png" }` to `metadata`. Style the Home button as the warm-white plate and size the image with `object-fit: contain`, retaining focus and hover behavior.

- [ ] **Step 5: Run focused tests and verify success**

Run: `npm test -- --run src/features/game/components/game-app.test.tsx src/app/layout.test.tsx src/app/globals.test.ts`

Expected: PASS.

- [ ] **Step 6: Run repository verification**

Run: `npm run lint && npm run typecheck && npm run build`

Expected: all commands exit 0.

- [ ] **Step 7: Inspect responsive output**

Capture the header at desktop and Pixel 7 widths with Playwright. Confirm that the wordmark is legible, uncropped, keyboard-focusable, and does not collide with status or Exit run controls. Apply at most one correction pass and rerun the focused tests if CSS changes.

- [ ] **Step 8: Commit implementation**

Run: `git add public/assets/brand/run-it-back-wordmark.png public/assets/brand/run-it-back-icon.png src/features/game/components/app-header.tsx src/app/globals.css src/app/layout.tsx src/features/game/components/game-app.test.tsx src/app/layout.test.tsx src/app/globals.test.ts docs/superpowers/plans/2026-09-16-logo-and-favicon.md && git commit -m "feat: add branded header and favicon"`
