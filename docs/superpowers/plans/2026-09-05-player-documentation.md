# Player-First Documentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a spoiler-light player README with separate contributor and maintainer guides.

**Architecture:** Keep the repository landing page focused on playing the game, place development workflow in the conventional root `CONTRIBUTING.md`, and place deployment/release operations in `docs/RELEASING.md`. Treat `package.json`, GitHub workflow files, `next.config.ts`, and the implemented game/storage flow as the sources of truth.

**Tech Stack:** Markdown, Next.js 16 static export, npm, Vitest, Playwright, GitHub Actions, Vercel, GitHub Pages

---

### Task 1: Write the player README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Record the documentation contract**

Check the existing game flow and require the README to contain both live URLs,
the Daily and Free Play modes, five roles, one user-selected IGL, three rerolls,
local browser storage, the unofficial-project disclaimer, and links to both
developer documents. Require it to omit rating formulas, odds, and opponent
generation details.

- [ ] **Step 2: Write the spoiler-light README**

Use this section order:

```markdown
# Run It Back
play links and unofficial disclaimer
## What is Run It Back?
## Play your way
## How a run works
## Your data and privacy
## Frequently asked questions
## Project documentation
## Credits and fair-use policy
## Security boundary
```

Describe only player-visible mechanics. State that browser site-data deletion,
private browsing, or a different device/browser can remove or isolate history.
Keep the full warning that trusted scoring must move server-side before accounts,
leaderboards, prizes, or trusted public scores.

- [ ] **Step 3: Check the player contract**

Run:

```powershell
rg -n "run-it-back-theta.vercel.app|antoncsalvador.github.io/run-it-back|Daily|Free Play|smokes|duelist|initiator|sentinel|flex|IGL|three rerolls|localStorage|CONTRIBUTING.md|RELEASING.md|leaderboards" README.md
```

Expected: every required player, navigation, storage, and security term is found.

### Task 2: Write contributor and maintainer guides

**Files:**
- Create: `CONTRIBUTING.md`
- Create: `docs/RELEASING.md`

- [ ] **Step 1: Write `CONTRIBUTING.md`**

Include Node.js 24, npm, Python 3, and Chromium/Playwright prerequisites; clone,
install, and development instructions; a command table matching every script in
`package.json`; a short `src/app`, `src/features/game`, `src/data/champions`,
`scripts`, `e2e`, and workflow architecture map; static-export limitations;
product invariants; test-driven workflow; data/asset policy; Windows/Linux visual
snapshot handling; and a pull-request checklist.

- [ ] **Step 2: Write `docs/RELEASING.md`**

Include an exact trigger matrix:

| Change | CI | Vercel | GitHub Pages |
| --- | --- | --- | --- |
| Pull request | Full CI | Preview deployment when integration is enabled | No deployment |
| Push to `main` | Full CI | Production deployment | Production deployment |
| Version tag | No tag-triggered workflow | No independent deployment | No deployment |
| Manual workflow | Selected GitHub workflow | No effect | Pages can be redeployed |

Document the preflight command `npm run verify`, optional local static smoke and
E2E commands, normal merge-first release flow, annotated semantic-version tag
commands, GitHub Actions and Vercel monitoring, live smoke checks for both URLs,
rollback choices, visual candidate workflow, static-export constraints, and the
full client-scoring security warning.

- [ ] **Step 3: Validate commands and links**

Run a PowerShell check that parses `package.json`, extracts every documented
`npm run` command, and fails if a command is absent. Then check that all relative
Markdown links resolve to files and that both live URLs return HTTP 200.

Expected: no missing script, file, or live endpoint.

### Task 3: Verify and publish the documentation change

**Files:**
- Modify: `README.md`
- Create: `CONTRIBUTING.md`
- Create: `docs/RELEASING.md`

- [ ] **Step 1: Review for spoilers and ambiguity**

Read the final diff. Confirm it never publishes hidden ratings, chemistry
formulas, simulation probabilities, deterministic seed internals, or opponent
construction details. Confirm it plainly answers that a push to `main` launches
both production deployments.

- [ ] **Step 2: Run repository verification**

Run:

```powershell
npm run verify
```

Expected: lint, typecheck, 354 tests with two intentional skips, Python audit CLI,
data validation, and production build all pass.

- [ ] **Step 3: Commit the implementation**

```powershell
git add README.md CONTRIBUTING.md docs/RELEASING.md
git commit -m "docs: add player and release guides"
```

- [ ] **Step 4: Review branch readiness**

Run `git status --short --branch`, inspect `git diff main...HEAD`, and use the
verification-before-completion and finishing-a-development-branch workflows
before integrating or publishing.
