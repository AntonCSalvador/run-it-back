# Run It Back UX Audit

Date: 2026-09-06  
Scope: mode selection through results, desktop and Pixel 7 baselines  
Method: parallel `/evaluate` + `/journey`, Impeccable visual critique, and
`/include` + `/fortify` reviews, reconciled against source and tests

## Executive assessment

Run It Back has a reliable game engine, valid semantic controls, deterministic
Daily behavior, robust domain constraints, static deployment coverage, and
useful desktop/mobile E2E journeys. Its current interface is nevertheless a
functional prototype rather than a complete fantasy-esports experience.

The main failure arc is not task completion. A user can finish. The failure is
that curiosity receives almost no orientation, strategic choices feel like form
completion, mobile hides the roster context needed to decide, the tournament
reveals results before building suspense, and the final recap becomes a raw data
ledger. Refreshing or changing modes can also erase an unfinished run.

- UX health: **61/100**
- Visual health: **15/40 — Poor**
- Anti-pattern verdict: **Clean**; no deception, coercion, fabricated scarcity,
  or unauthorized-data pressure was found.
- Baseline verification: `npm run verify` passed with 354 tests passing and 2
  skipped; `npm run test:e2e` passed with 17 tests passing and 3 skipped.

## Findings by priority

### P0 — Protect unfinished runs

1. **Refresh loses the active run.** `GameState` lives only in the reducer while
   storage covers settings and completed results. A refresh can discard several
   minutes of drafting or tournament progress. Add a versioned active-run record
   that restores mode, seed, draft, IGL, stage, and completed series. A reveal
   in progress may safely restart from its deterministic pre-reveal state.
2. **Mode switching and reset discard progress in one activation.** Persistent
   `Daily`, `Free Play`, and `Reset current run` controls immediately abandon an
   unfinished run. Replace them with a subordinate Exit action and an accessible
   confirmation dialog. Preserve the existing confirmed behavior.

### P1 — Make the experience legible and emotionally complete

1. **The opening does not explain the game.** `app-header.tsx` gives equal weight
   to two mode buttons, counters, and reset; `mode-selection.png` is mostly empty.
   The premise and mode distinction live only in README. Daily needs a clear
   primary path, local availability/completion state, and a concise explanation.
2. **Progress language exposes implementation state.** `game-app.tsx` renders
   `Current phase: player` and similar enum values. Replace this with an explicit
   journey rail and instructions such as `Draft 2 of 5 · Choose a player`.
3. **Mobile roster context is effectively hidden.** At narrow widths, the roster
   becomes a one-card-wide track with no position cue. Keep all five role states
   visible in a compact summary at 390px; detailed cards and swap controls may
   expand separately.
4. **Draft choices lack consequence framing.** Team cards do not explain that
   they open an event roster. Player cards do not prioritize open-role fit. The
   role step lacks a valid Back action, and the IGL step has no heading or reason.
5. **Decision states are visually undifferentiated.** Buttons, cards, articles,
   chips, and roster slots share the same border and surface treatment. Define
   default, hover-capable, focus, pressed, selected/locked, disabled,
   unavailable, and achievement states without color-only meaning.
6. **Tournament suspense is spoiled.** The full series score and map list render
   before the delayed semifinal/final highlight feed. Reveal maps progressively;
   withhold the terminal score until highlights finish or Skip is activated.
7. **Tournament state and recovery are incomplete.** `Play series` only disables
   while resolving. Add an honest busy label/status, associated explanation for
   disabled Continue, retry that cannot apply a result twice, and deterministic
   restoration after interruption.
8. **Results flatten the emotional peak.** Recent history precedes the current
   result, while the outcome, series, roster, and actions are plain lists of
   similar weight. Put outcome and replay first, followed by path, roster/IGL,
   highlights, detailed maps, then secondary share/history.
9. **Most phase transitions do not manage focus.** Tournament focus handling is
   strong; extend intentional heading focus and single coherent announcements to
   every forward, back, error, restoration, and results transition.
10. **Daily completion is not a usable state.** Show `Available today` or
    `Completed today` visibly and programmatically. Preserve same-day replay and
    distinguish it from starting Free Play.

### P2 — Complete the system

- Use authored display and UI typography with tabular numerals instead of Arial.
- Move routine role labels from gold to neutral; reserve gold for champion and
  decisive heat states.
- Replace the literal glowing fire fragment with a finite red lock-in sweep or
  rule flash; reduced motion receives an immediate static state.
- Explain every disabled primary control: zero rerolls, no alternate offers,
  missing IGL, and highlights still running.
- Make IGL choices full 44px radio-card targets with a non-color checked state.
- Add pause/resume for timed highlights; 1x, 2x, and Skip remain available.
- Improve storage-recovery copy: unreadable data is reset, not “recovered.”
- Use lists and landmarks for rosters and history; add a skip link when the
  persistent banner is present.
- Expand responsive coverage to exact 390px, 320px reflow, zoom/text expansion,
  forced colors, and long repository-backed names.

### P3 — Polish

- Title-case user-facing roles and stages while preserving domain keys.
- Expand BO3/BO5 on first use.
- Give empty slots an explicit `Open` state.
- Add dates/outcomes to saved-result control names.
- Normalize spacing rhythm, alignment, and transition timing across screens.

## Heuristic evidence

| Heuristic | Severity | Evidence summary |
|---|---:|---|
| System status | 2 | Pick/reroll/live result feedback exists; macro progress and busy states do not. |
| Match with real world | 3 | Raw phases, lowercase keys, and generic actions expose system language. |
| Control and freedom | 3 | Back and Skip exist; valid role selection and destructive exit are weak. |
| Consistency | 2 | Native controls are predictable; modes, reset, replay, and card hierarchy overlap. |
| Error prevention | 2 | Domain constraints are strong; destructive abandonment is under-signaled. |
| Recognition over recall | 3 | Mobile hides roster composition and unavailable-choice reasoning. |
| Efficiency | 1 | Keyboard, 2x, Skip, and replay support repeat users. |
| Minimalist design | 3 | Entry is sparse without essentials; results are dense without priority. |
| Error recovery | 2 | Basic recovery exists, but several messages and actions do not match capability. |
| Help and documentation | 3 | README is clear; in-product, just-in-time guidance is missing. |

## Positive patterns to protect

- Native buttons, radio inputs, labels, headings, regions, and polite live logs.
- Visible 3px focus styling and a 44px global button target floor.
- Tournament result/next-stage focus management with direct tests.
- Three distinct offers, exact-card uniqueness, role eligibility, legal swaps,
  exhausted rerolls, and required IGL enforcement.
- Deterministic Daily and seeded E2E paths separated from presentation.
- Ratings, probabilities, traits, and formula leakage tests.
- 1x, 2x, and Skip controls that respect the player's time.
- Fixed-size initials/media fallback without layout shift.
- Exception-safe localStorage with record-level corruption isolation and
  in-memory degradation.
- Share pending, cancel, clipboard, and selectable fallback states.
- Reduced-motion, keyboard reachability, no-overflow, screenshots, and static
  deployment coverage.

## Research gaps

- No direct usability sessions, behavioral analytics, or abandonment data exist.
- Audience role literacy and preferred run length are inferred, not measured.
- The relative value of replay, history, and sharing is not measured.
- Production use of licensed media versus fallbacks is unknown.

Validate the redesign with five first-use sessions, including at least one
keyboard-only user and one mobile session. Expert-review targets below are
hypotheses until that evidence exists.
