# VCT SME Review Guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a beginner-friendly guide that lets a VCT subject-matter expert audit player tags, traits, and simulation tuning and submit actionable, sourced corrections.

**Architecture:** Create one standalone Markdown guide at `docs/vct-sme-review-guide.md`. Keep factual VCT review separate from subjective game balancing, link every setting to its repository source, and make report-only review the safe default while still documenting a guarded local workflow.

**Tech Stack:** Markdown, GitHub relative links, PowerShell, npm scripts, Vitest

---

### Task 1: Create the guide foundation and source map

**Files:**
- Create: `docs/vct-sme-review-guide.md`
- Reference: `docs/data-methodology.md`
- Reference: `src/data/champions/index.ts`
- Reference: `src/data/champions/derivation.ts`
- Reference: `src/data/champions/validation.ts`
- Reference: `scripts/derive-champions.mts`
- Reference: `scripts/validate-data.mts`

- [ ] **Step 1: Confirm the deliverable does not already exist**

Run:

```powershell
Test-Path docs/vct-sme-review-guide.md
```

Expected: `False`.

- [ ] **Step 2: Write the audience, quick-start, glossary, and data-flow sections**

Create `docs/vct-sme-review-guide.md` with these explicit points:

- The SME may edit locally, send a change request to the owner, or paste the
  request into Codex.
- A player identity is different from a player-event card.
- Every review must name the event year and exact card ID.
- Role tags describe algorithmic draft eligibility, not necessarily a player's
  single colloquial roster position.
- The flow is raw extraction -> derivation -> generated yearly snapshots ->
  dataset -> lineup rating -> opponent generation -> map rolls.
- Generated yearly role and trait fields are not source-of-truth edit points.

Use repository-relative links such as:

```markdown
[data methodology](data-methodology.md)
[trait and role derivation](../src/data/champions/derivation.ts)
[dataset validation](../src/data/champions/validation.ts)
```

- [ ] **Step 3: Add a source-of-truth file table**

The table must include and label:

- `raw-extraction.json`: pinned source observations; do not casually edit.
- `reviewed-overlays.json`: reviewed teams, role exceptions, and IGL decisions.
- `evidence.json`: generated audit view; inspect but do not directly edit.
- `2021.json` through `2025.json`: generated runtime snapshots; inspect but do
  not directly edit derived fields.
- `derivation.ts`: global role and trait rules.
- `rating.ts`: trait weights, chemistry, IGL bonus, and map probability.
- `opponents.ts`: stage difficulty bands and opponent construction.
- `tournament.ts`: series format, advancement, maps, and display scores.
- `draft.ts`: offers, rerolls, uniqueness, and role assignment.
- `validation.ts`: integrity rules and pinned checksums.
- `player-picker.tsx` and `tournament-view.tsx`: displayed tags and percentages.

- [ ] **Step 4: Commit the foundation**

```powershell
git add -- docs/vct-sme-review-guide.md
git commit -m "docs: add VCT SME guide foundation"
```

Expected: one new documentation file committed.

### Task 2: Document the player-tag audit with the crashies/Victor example

**Files:**
- Modify: `docs/vct-sme-review-guide.md`
- Reference: `src/data/champions/evidence.json`
- Reference: `src/data/champions/raw-extraction.json`
- Reference: `src/data/champions/reviewed-overlays.json`
- Reference: `src/data/champions/derivation.ts:9-16`
- Reference: `src/data/champions/derivation.ts:65-71`

- [ ] **Step 1: Add exact lookup commands**

Include beginner-safe commands for locating all historical cards and evidence:

```powershell
rg -n -i 'crashies|victor' src/data/champions/evidence.json
rg -n -i 'crashies|victor' src/data/champions -g '20*.json'
```

Explain that a broad search must be narrowed to a year/card before deciding a
correction.

- [ ] **Step 2: Add the verified 2022 worked example**

Document the current evidence without declaring the SME's final judgment:

- `crashies-optic-gaming-2022`: 23 Initiator maps; threshold 5; Initiator tag.
- `victor-optic-gaming-2022`: 16 Duelist maps and 7 Initiator maps; threshold 5;
  Duelist, Initiator, and Flex tags.
- Both receive Initiator eligibility because the current rule is at least
  `max(2, ceil(20% of maps))`, not because the system asserts both had the same
  primary roster role.

Explain the SME decision:

- If the map/agent counts are wrong, report a factual source-data correction.
- If the counts are right but the tag meaning is wrong, request an algorithm
  change such as primary-role tags, a higher secondary-role threshold, or a
  separate primary/secondary role model.
- If one event card is exceptional, propose a reviewed card-specific override.

- [ ] **Step 3: Add the player-tag change-request template**

Include this complete template:

```markdown
## Player tag correction

- Card ID:
- Player / team / event year:
- Current tags:
- Proposed tags:
- Current agent-class map counts:
- Are those counts correct? Yes / No / Unsure
- Is this factual or a balance/modeling change?
- VCT reasoning:
- Supporting URLs:
- Does the same problem affect other cards?
```

Tell the SME that blank technical fields are acceptable, but card/year,
proposed result, VCT reasoning, and sources are required.

- [ ] **Step 4: Document how each type of role change is implemented**

State precisely:

- Global agent-to-class mapping or threshold: edit `derivation.ts`, regenerate,
  update derivation tests and methodology, then validate.
- Individual exception: edit reviewed overlays only with evidence; checksum and
  validation updates require owner/Codex review.
- Direct edit to `eligibleRoles` in a yearly JSON: temporary only, rejected by
  validation, and overwritten by derivation.

- [ ] **Step 5: Commit the role workflow**

```powershell
git add -- docs/vct-sme-review-guide.md
git commit -m "docs: explain VCT role-tag review"
```

Expected: the guide contains a factual, year-specific crashies/Victor example.

### Task 3: Document traits, lineup strength, and win-rate tuning

**Files:**
- Modify: `docs/vct-sme-review-guide.md`
- Reference: `src/data/champions/derivation.ts:73-104`
- Reference: `src/features/game/rating.ts`
- Reference: `src/features/game/opponents.ts`
- Reference: `src/features/game/tournament.ts`
- Reference: `src/features/game/rng.ts`
- Reference: `src/features/game/rating.test.ts`
- Reference: `src/features/game/opponents.test.ts`
- Reference: `src/features/game/tournament.test.ts`

- [ ] **Step 1: Add the current trait formulas and review questions**

List firepower, utility, survival, clutch, consistency, leadership, missing-data
behavior, role/year percentile cohorts, multi-role averaging, and progression
bonuses. For each, ask the SME whether the input reflects VCT value and whether
the comparison cohort is fair across roles and years.

- [ ] **Step 2: Add the complete lineup formula and tuning effects**

Document:

```text
card baseline = 0.35 firepower + 0.20 utility + 0.15 survival
              + 0.15 clutch + 0.15 consistency

lineup strength = average of five baselines
                + 2 per same-team/year pair, capped at 8
                + (selected IGL leadership - 50) * 0.08
```

Explain that role assignment only validates eligibility and gives no direct
matchup modifier.

- [ ] **Step 3: Add map and series win-rate explanations**

Document:

```text
map win chance = clamp(0.08, 0.92,
  1 / (1 + exp(-(user strength - opponent strength) / 12)))
```

Explain that lowering 12 makes strength more decisive, raising 12 adds
randomness, and changing 0.08/0.92 adjusts the upset floor and favorite ceiling.
Include representative map, BO3, and BO5 probabilities for strength deltas
`-12`, `0`, `+6`, and `+12`.

- [ ] **Step 4: Add opponent and presentation knobs**

List stage bands `50-62`, `58-70`, `66-78`, and `74-90`; the 250-attempt
limit; BO3 before the final; BO5 final; and 12% overtime. State that scores are
generated after the winner and do not change win probability.

- [ ] **Step 5: Add a global algorithm request template**

Include:

```markdown
## Algorithm change

- Setting or formula:
- Current behavior:
- Proposed behavior:
- Is this VCT accuracy or game balance?
- Why the current behavior is inaccurate:
- Example players/series affected:
- Expected effect on weak, average, and strong lineups:
- Supporting URLs or calculations:
```

- [ ] **Step 6: Commit the algorithm workflow**

```powershell
git add -- docs/vct-sme-review-guide.md
git commit -m "docs: document simulation tuning"
```

Expected: every gameplay percentage has a source link and directional tuning
explanation.

### Task 4: Add local safety workflow and verify the guide

**Files:**
- Modify: `docs/vct-sme-review-guide.md`
- Test: `docs/vct-sme-review-guide.md`

- [ ] **Step 1: Add report-only and local-edit workflows**

Make report-only the default. For local work, document branch creation, `rg`
lookups, editing only the source file identified by the guide, regeneration only
when derivation changes, and stopping on checksum or validation failures instead
of bypassing them.

Add a troubleshooting table for the common validation messages `derived trait`,
`derived final roles`, `reviewed overlays checksum mismatch`, and `source catalog`.
For each message, identify the likely mistaken edit and tell the SME what evidence
to send the owner or Codex; do not instruct them to weaken the validator.

Include these commands:

```powershell
git switch -c review/vct-data-corrections
npm run derive:data
npm run validate:data
npx vitest run src/data/champions/derivation.test.ts src/features/game/rating.test.ts src/features/game/opponents.test.ts src/features/game/tournament.test.ts
git diff --check
```

Explain that `derive:data` should not be run merely to inspect data because it
rewrites generated files.

- [ ] **Step 2: Check all repository-relative links resolve**

Run this from the repository root:

```powershell
$doc = Get-Content -Raw docs/vct-sme-review-guide.md
$links = [regex]::Matches($doc, '\]\(([^)#]+)') | ForEach-Object { $_.Groups[1].Value }
$links | Where-Object { $_ -notmatch '^(https?://|#)' } | ForEach-Object {
  $target = Join-Path docs $_
  if (-not (Test-Path $target)) { throw "Broken documentation link: $_" }
}
```

Expected: no output and exit code 0.

- [ ] **Step 3: Scan for unfinished content**

Run:

```powershell
rg -n 'TBD|TODO|FIXME' docs/vct-sme-review-guide.md
```

Expected: no matches.

- [ ] **Step 4: Run data validation and focused tests**

Run:

```powershell
npm run validate:data
npx vitest run src/data/champions/derivation.test.ts src/features/game/rating.test.ts src/features/game/opponents.test.ts src/features/game/tournament.test.ts
```

Expected: dataset validation succeeds and all focused test files pass.

- [ ] **Step 5: Review the final diff**

Run:

```powershell
git diff --check
git diff -- docs/vct-sme-review-guide.md
```

Expected: no whitespace errors; the guide contains no unsupported factual claim,
no generated-file editing recommendation, and no missing file link.

- [ ] **Step 6: Commit the completed guide**

```powershell
git add -- docs/vct-sme-review-guide.md
git commit -m "docs: finish VCT SME review guide"
```

Expected: clean worktree after the documentation commit.
