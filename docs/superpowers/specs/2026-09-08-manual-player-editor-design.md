# Manual Player Editor Design

Date: 2026-09-08

## Purpose

Give the repository owner complete manual control over every Champions
player-event card through a local browser editor. The owner must be able to
review and change eligible positions, all six rating values, historical IGL
status, and review progress without editing generated JSON by hand.

The finalized manual catalog ships with the production game. The editor and its
filesystem-saving server remain development-only tools and never appear in the
static production export.

## Goals

- Provide one searchable editor for all 404 player-event cards.
- Let the owner manually set every game-facing role and rating value.
- Preserve generated historical data as read-only evidence for comparison.
- Save directly to a version-controlled repository file from localhost.
- Make incomplete, invalid, conflicting, or interrupted saves safe.
- Preserve current production behavior until the owner intentionally changes a
  manual value.
- Keep the existing static Vercel and GitHub Pages deployment architecture.

## Non-goals

- Editing raw match observations, team identities, player identities, or source
  citations in the browser.
- Deploying changes directly from the editor.
- Exposing the editor on the production website.
- Adding authentication, accounts, a database, or a hosted administrative API.
- Moving global trait weights, chemistry constants, opponent bands, or win-rate
  formulas into this player editor.

## Chosen architecture

The editor will be a separate local React/Vite tool under
`tools/player-editor/`. Running `npm run edit:players` will bind the tool to
`127.0.0.1`, open it in the default browser, serve the editor assets, and expose
a narrowly scoped local API for reading and saving the manual catalog.

This architecture is independent of the Next.js application. The editor is not
an application route, is not copied into `out/`, and does not require changing
the static-export deployment model. Only the saved manual catalog is imported
by the production application.

The local API may read the generated cards, derivation evidence, and manual
catalog. It may write only
`src/data/champions/manual-player-data.json`. It will not accept a path from the
browser or expose a general filesystem operation.

## Manual catalog

Create `src/data/champions/manual-player-data.json` with a version number and
exactly one entry for each of the 404 current player-event card IDs. The initial
file will be seeded from the existing generated values so introducing the
manual layer does not change gameplay.

Each entry contains:

```json
{
  "cardId": "boaster-fnatic-2023",
  "eligibleRoles": ["smokes"],
  "historicalIgl": true,
  "traits": {
    "firepower": 47,
    "utility": 69,
    "survival": 97,
    "clutch": 94,
    "consistency": 13,
    "leadership": 75
  },
  "reviewed": false
}
```

Ratings are whole numbers from 0 through 100. `eligibleRoles` must contain at
least one distinct role from `smokes`, `duelist`, `initiator`, `sentinel`, and
`flex`. `historicalIgl` and the numeric `leadership` score are deliberately
independent: the first records the owner's factual classification and the
second controls gameplay strength. `reviewed` is editor-only audit metadata and
does not enter the runtime `PlayerCard` model.

The catalog stores entries in stable card-ID order. This keeps diffs predictable
and makes manual changes easy to review in Git.

## Runtime data flow

The generated yearly snapshots remain the source for player and team identity,
event year, map count, source references, and the latest calculated comparison
values. Dataset assembly will apply the manual catalog to each generated card,
replacing only:

- `eligibleRoles`
- `historicalIgl`
- `traits.firepower`
- `traits.utility`
- `traits.survival`
- `traits.clutch`
- `traits.consistency`
- `traits.leadership`

The merged result is parsed and frozen as the game dataset. Draft eligibility,
lineup strength, opponent generation, and simulations therefore consume the
manual values automatically without changes to their public interfaces.

`npm run derive:data` continues to refresh calculated snapshot fields and
evidence from the pinned historical inputs. It never creates, modifies, or
deletes the manual catalog. The editor displays those refreshed derived values
beside the independent manual values.

## Editor experience

The approved layout uses a master-detail workspace.

### Header

The header shows overall review progress, the number of unsaved changes, the
last save state, and a primary **Save all changes** action. Save is disabled
while any entry is invalid or while a save is already running.

### Player list

The left pane contains:

- Search by player handle, card ID, or team.
- Filters for year, team, eligible role, and audit status.
- Audit-status choices for all, needs review, reviewed, and changed.
- A result count.
- Event-specific list rows showing handle, team, year, roles, IGL status, review
  status, and unsaved-change status.

A person with several Champions appearances has one row per event card. The
exact card ID remains visible in the detail pane.

### Detail editor

The right pane contains:

- Player handle, team, event year, exact card ID, and maps played.
- Independent checkboxes for all five eligible positions.
- Manual number inputs for firepower, utility, survival, clutch, consistency,
  and leadership.
- The current global gameplay weight beside each non-leadership trait as
  read-only context.
- The latest derived value and manual-versus-derived delta beside every rating.
- A historical-IGL checkbox independent of leadership points.
- A reviewed checkbox used to track the audit.
- An expandable read-only evidence section with map count, performance
  coverage, agent-class map counts, calculated threshold, suggested roles,
  derived ratings, and any reviewed derivation override.
- **Undo changes** for the selected card.
- **Reset to derived** for the selected card. Reset changes the unsaved manual
  draft only; it does not save automatically.

Selecting another card preserves valid unsaved edits in browser memory. The
browser warns before reloading or closing while edits remain unsaved.

## Saving and concurrency

The browser validates the complete draft before sending it. The local server
parses and validates the complete catalog again rather than trusting the client.
It rejects:

- A missing, unknown, or duplicate card ID.
- A catalog that does not cover exactly the current generated card set.
- Missing, duplicate, or unknown roles.
- An empty role list.
- A missing, non-integer, non-finite, or out-of-range rating.
- Invalid boolean fields or unexpected object properties.

The initial read response includes a content revision derived from the manual
file. A save must include that revision. If the file changed after the editor
loaded it, the server returns a conflict and leaves both versions untouched.
The user must reload before saving again.

After successful validation, the server writes formatted JSON with a trailing
newline to a temporary sibling file and replaces the target as one save
operation. If writing or replacement fails, the prior target remains the last
accepted catalog and the UI reports the failure. Temporary artifacts are
cleaned up when safe.

Successful save responses return the new revision. The browser then marks the
draft clean and updates its baseline without reloading.

## Validation boundaries

The regular dataset validator continues to verify pinned raw extraction,
reviewed overlays, identities, team appearances, map counts, evidence coverage,
source references, and derived calculations. Generated values remain auditable
even though they are no longer authoritative for game-facing roles and traits.

Manual-catalog validation separately guarantees:

- Schema correctness.
- Exact coverage of all current generated cards.
- Stable and unique card IDs.
- Valid roles and trait ranges.
- Correct merge behavior.

The validator no longer requires runtime `eligibleRoles`, `historicalIgl`, or
traits to equal derived suggestions. Instead, it requires them to equal the
validated manual entry. Existing checks that assume leadership must be exactly
50 or 75 based on the reviewed historical overlay will apply to derived
evidence only, not to the manual runtime value.

## Error handling

- Invalid controls show an inline message and identify the affected card in the
  list.
- Save remains unavailable until all validation errors are resolved.
- Network or filesystem failures preserve the dirty draft and show a retryable
  error.
- Stale-file conflicts never overwrite the newer repository file.
- No matching search results show a clear empty state without discarding edits.
- Failure to load the manual catalog or evidence shows a blocking error rather
  than an empty editor.
- The local server binds only to loopback and exposes no arbitrary path input.

## Production and release flow

The owner runs:

```powershell
npm run edit:players
```

After editing and saving, the version-controlled manual catalog contains the
new production values. Saving does not deploy by itself. The owner verifies and
ships the change through the normal repository workflow:

```powershell
npm run validate:data
npm test
npm run build
git diff
```

The catalog is committed on a branch, pushed, reviewed in the Vercel preview,
and merged into `main`. The existing Vercel integration and GitHub Pages
workflow deploy every push to `main`. Production builds bundle the merged
manual values but contain no player-editor page or saving endpoint.

## Testing strategy

### Manual-data unit tests

- Accept a complete catalog with valid roles, booleans, and integer ratings.
- Reject missing, unknown, and duplicate card IDs.
- Reject empty, duplicate, and unknown roles.
- Reject missing, fractional, non-finite, and out-of-range ratings.
- Apply every editable field over a generated card.
- Preserve non-editable identity, year, map, and source fields.
- Prove the initially seeded catalog produces the same game-facing values as
  the current dataset.

### Local server tests

- Return the manual catalog, derived values, evidence, and revision.
- Save a valid complete catalog to an isolated temporary workspace.
- Reject invalid payloads without changing the target.
- Reject a stale revision without changing the target.
- Preserve the prior file when a write or replacement fails.
- Serve only the editor assets and fixed catalog operations.

### Editor component tests

- Search and filter event-specific cards.
- Edit roles, every rating, historical IGL, and review status.
- Display derived values and deltas.
- Track dirty cards and overall review progress.
- Undo the selected card to its saved state.
- Reset the selected card to derived values without automatically saving.
- Block invalid saves and identify invalid cards.
- Handle successful saves, save failures, and revision conflicts.
- Warn on page exit when unsaved changes exist.

### Regression and build checks

- Run focused manual-data, server, and editor tests during development.
- Run `npm run validate:data`, `npm test`, and `npm run build` before handoff.
- Verify existing draft, rating, opponent, and tournament behavior consumes the
  manual merged dataset.
- Verify the production `out/` directory contains neither the editor nor a save
  endpoint.

## Acceptance criteria

The feature is complete when the owner can:

1. Run one npm command and open the editor locally.
2. Find any of the 404 player-event cards by handle, team, year, role, ID, or
   review status.
3. Compare manual roles and ratings with generated evidence.
4. Change all roles, six ratings, historical IGL status, and review status.
5. Undo a card or reset it to derived values.
6. Save a complete valid catalog directly to the repository.
7. Receive actionable feedback for invalid data, failed saves, and stale-file
   conflicts without losing the draft.
8. Run normal validation and build commands successfully.
9. Commit and merge the saved catalog so the new values appear in both
   production deployments.
10. Confirm that no editor or filesystem-writing capability ships in the static
    production artifact.
