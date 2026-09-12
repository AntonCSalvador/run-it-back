# Saved Run Home Entry Design

## Goal

Always land on the welcome screen. A valid unfinished run remains available, but
the app never opens it without the player's choice. Clicking the **Run It Back**
wordmark during a run returns to the welcome screen without losing progress.

## Experience

- A visit or reload shows the existing welcome screen after storage hydration.
- When no unfinished run exists, the welcome screen behaves as it does today.
- When an unfinished run exists, the welcome screen adds a compact saved-run
  panel with its mode and current decision.
- **Continue saved run** returns to the exact restored decision.
- **Start over** uses the existing destructive confirmation. Confirming clears
  only the active run and restores the normal Daily and Free Play choices.
- While playing, the **Run It Back** wordmark is an accessible button that opens
  the welcome screen. It does not clear or replace the active run.
- Continuing from that screen returns to the same in-memory decision without a
  reload or second restoration pass.

## Architecture

`GameAppCore` keeps the restored `GameState` as it does today and adds one local
view flag for whether home is open. Hydration restores and validates an active
run, then leaves home open. The game phase and persisted checkpoint remain
unchanged while home is displayed.

The welcome renderer keys from the home flag rather than only `state.phase`.
`ModeSelection` receives optional saved-run summary data plus continue and
start-over callbacks. `AppHeader` receives an `onHome` callback and renders the
wordmark as a button. No new route, storage record, or dependency is needed.

Starting a fresh mode remains unavailable until the player explicitly discards
the saved run. This prevents an accidental click from overwriting progress.

## State and Failure Handling

- Invalid saved records keep existing recovery behavior: clear the bad active
  record, show the recovery notice, and expose normal mode choices.
- Storage-unavailable behavior remains unchanged.
- Completing or confirming exit still removes the active checkpoint.
- Dataset validation and deterministic tournament restoration remain unchanged.
- The home flag is view state only and is never persisted.

## Accessibility

- Wordmark uses a real button with an accessible name, visible keyboard focus,
  and existing heading text retained for page structure.
- Home entry moves focus to the welcome heading.
- Saved-run actions use explicit labels. Destructive start-over retains the
  modal dialog, focus trap, cancel behavior, and focus restoration.
- Restoration and recovery notices remain live-region announcements.

## Tests

Component and browser tests cover:

1. A valid saved run lands on welcome instead of inside the game.
2. **Continue saved run** opens the restored decision.
3. Clicking the wordmark during play opens welcome and preserves the checkpoint.
4. Continuing after wordmark navigation returns to the same decision.
5. Confirmed **Start over** clears only active progress.
6. No saved run retains current welcome behavior.
7. Keyboard focus moves correctly for home, continue, cancel, and discard flows.

