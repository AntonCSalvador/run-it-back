# Run It Back Redesign Brief

Date: 2026-09-06
Visual direction selected: 2026-09-07
Status: Approved by the user on 2026-09-07

## Design intent

Turn Run It Back from a mechanically complete prototype into a polished,
accessible fantasy-esports draft. The experience should teach itself quickly,
keep strategy visible, pace each tournament round with truthful suspense, and
finish with a recap that makes another run feel irresistible rather than
obligatory.

The interface remains an **Operate** surface: expression serves comparison,
state, and task completion. Broadcast character comes from typography, score
composition, rules, rails, timing, and editorial hierarchy—not from decorative
gamer effects.

The selected visual form is **Live Results Desk**. Implementation is code-led,
using the decision comp as a final critique reference rather than a literal
template.

## End-to-end journey

### 1. Opening and mode selection

Primary message: **Draft five Champions cards. Choose your IGL. Survive four
fantasy series.**

- Daily is the primary path with today's UTC date, shared-challenge explanation,
  local streak, and `Available today` or `Completed today` state.
- Free Play is secondary and explains that every run is a fresh unlimited draw.
- Completed Daily preserves the existing same-seed replay behavior and labels it
  `Replay today's Daily`; `View today's result` and `Start Free Play` remain
  distinct actions.
- Recent results stay collapsed and subordinate to starting or resuming play.

### 2. Persistent run shell

After a mode starts, the shell changes from introduction to game control:

- compact Run It Back wordmark;
- mode badge and Daily status where relevant;
- journey rail: `Draft → IGL → Tournament → Recap`;
- current instruction plus detailed progress, such as `Pick 2 of 5` or
  `Semifinal · Round 3 of 4`;
- subordinate `Exit run` action with confirmation while a run is unfinished.

The shell exposes exactly one main task and keeps status ambient rather than
turning utilities into competing calls to action.

### 3. Team offer

Heading: **Choose a team to scout**
Instruction: **Open an event roster, then draft one eligible player.**

- Preserve three team-year options and the existing offer when returning.
- Team card order: year eyebrow, stable logo/fallback, team name, action cue.
- Reroll copy: `Replace all 3 teams · 3 left`.
- Exhausted state: `No rerolls left`.
- No-alternative state: `No other eligible team offers are available`.

### 4. Player selection

Heading: **Pick one DRX 2025 player** using the selected repository team.

- Preserve portrait fallback, display handle, year, and eligible roles.
- Prioritize roles that remain open; do not display ratings or invented facts.
- Explain filtering: `Only players who can fill an open role are shown.`
- Secondary action: `Back to team offers`.

### 5. Role assignment

Heading: **Where should BeYN 2025 play?** using the selected repository player.

- Keep all five roster positions visible.
- Eligible open roles are direct actions; unavailable roles remain visible and
  name why they cannot be chosen.
- Secondary action: `Back to DRX 2025 players`.
- Confirmation: `BeYN added as Initiator. 2 of 5 drafted.`
- Committed cards and spent rerolls remain irreversible, preserving mechanics.

### 6. Roster review and IGL

- Present the completed roster as the user's created lineup, not a form summary.
- Compatible role swaps remain possible but appear as contextual actions rather
  than permanent sentence-length buttons.
- Heading: **Choose your in-game leader**.
- Guidance: **Any drafted player can lead. Your choice affects the simulation.**
- Do not claim that a player was historically an IGL unless the interface is
  explicitly designed to expose existing sourced data; the redesign will not.
- Primary action: `Enter the tournament`.
- Disabled guidance: `Choose an IGL to enter the tournament.`

### 7. Tournament

- Show the four-round path with completed scores, current stage, and locked
  future stages.
- Matchup lockup communicates stage, format, opponent relationship, and stakes:
  `Semifinal · Best of 3 · Win to reach the Grand Final`.
- `Play Group Qualifier` becomes `Simulating series…` with `aria-busy`.
- Group and quarterfinal maps reveal sequentially and quickly.
- Semifinal/final moments reveal before the terminal score. `Skip to result`
  remains immediate, and Pause/Resume joins 1x/2x.
- Continue labels follow the branch: `Advance to Quarterfinal`, `Enter the Grand
  Final`, or `View run recap`.
- Failure preserves the roster/opponent/stage and offers `Retry series` before
  the subordinate `Restart run`.

### 8. Results and replay

- First viewport: `Champion` or `Eliminated`, stage reached, compact series
  record, and one decisive replay action.
- Free Play primary: `Draft a new roster`.
- Completed Daily primary after result: `Try Free Play`; `Replay today's Daily`
  remains secondary.
- Then show tournament path, drafted roster and IGL, important simulated
  highlights already produced during the run, and detailed map scores.
- `Share result` and saved history remain useful but subordinate.

Emotional curve: **curiosity → informed agency → strategic tension → commitment
→ rising suspense → catharsis → one more run**.

## Screen inventory

| Screen/state | Primary job | Persistent context |
|---|---|---|
| Mode selection | Explain premise and start/resume a mode | Wordmark, Daily state, compact history |
| Team offer | Choose one event roster to inspect | Draft progress, five-role roster summary, rerolls |
| Player picker | Choose one eligible event card | Selected team, open roles, roster summary |
| Role assignment | Commit the card to one eligible open role | Pending card, all five roles, draft count |
| Roster review | Validate composition and make legal swaps | Full lineup, mode, progress |
| IGL selection | Choose leader and commit lineup | Full roster and selected leader |
| Tournament ready | Understand matchup and start current series | Four-round path, both lineups, stakes |
| Series resolving | Confirm work is in progress | Same matchup and path, busy state |
| Map/highlight reveal | Follow result without premature spoilers | Live score state, controls, stage path |
| Series outcome | Understand result and next destination | Maps, path, branch-specific CTA |
| Run results | Understand outcome and start another run | Path, roster/IGL, highlights, maps |
| Saved result detail | Recall an earlier local result | Date/mode/outcome, return action |
| Exit confirmation | Prevent accidental abandonment | Consequence, cancel-first focus |
| Recovery state | Explain failure and preserve progress | Current valid run context, retry/back action |

## Information architecture

Run It Back is a sequential task with a persistent status layer, not a dashboard.

1. **Global identity:** wordmark and unofficial-project context.
2. **Run status:** mode, progress, Daily state, and safe exit.
3. **Current decision:** the one action the player must take now.
4. **Strategic context:** roster, open roles, matchup, or completed path.
5. **Utilities:** reroll, back, speed, skip, share, and history—placed near the
   task they modify, never collected as equal global actions.

History is a secondary branch from opening/results. Mode selection is an entry
decision, not persistent primary navigation during a run.

## Structural layout

### Desktop

- 1180–1240px content frame with 24–32px gutters.
- Draft screens use a 70–75% decision field plus 25–30% persistent roster rail.
- Team offers remain three equal columns; player cards use a 2–3-column grid.
- Tournament uses a stage rail, central score/reveal field, and aligned lineup
  sheets rather than ten identical full-width rows.
- Results separate outcome/replay, tournament path, roster, highlights, and
  details into distinct hierarchy bands.

### Mobile at 390px

- 16px page gutter and one clear reading column.
- Team/player tracks show roughly 86–90% of one card plus a next-card edge and
  `1 of N` position.
- A compact five-role summary shows every filled/open role simultaneously;
  detailed player/swap controls expand below.
- Tournament score and primary action precede full lineup detail.
- Result and replay precede long recap lists.
- No essential interaction depends on hover, drag, or discovering unmarked
  horizontal overflow.

## State inventory

| State | What the player sees | Available action/recovery |
|---|---|---|
| First visit | Premise, Daily availability, Free Play explanation | Start either mode |
| Empty history | No history module competing with onboarding | Start a run |
| Daily available | `Available today` with date | Start Daily |
| Daily complete | `Completed today` with outcome access | View/replay Daily or Free Play |
| Active run restored | Resume notice plus exact step and roster | Continue or exit safely |
| Storage unavailable | Current run remains playable; local progress/history may not survive closing | Continue in session |
| Invalid stored result | Affected record was reset; unrelated history preserved | Dismiss and continue |
| Invalid active run | Active run was reset; completed history preserved | Start a new run |
| Offer ready | Three valid team-year cards | Inspect or replace all three |
| Rerolls exhausted | Count is zero and control explains why | Choose a shown team |
| No alternate offer | Remaining count retained; alternate unavailable | Choose a shown team |
| Missing media | Stable initials/team fallback | Continue normally |
| No eligible players | Specific explanation with Back and Restart | Return to team offers |
| Invalid role state | Specific explanation with Back before Restart | Repair selection |
| Start disabled | Visible IGL instruction associated to control | Choose IGL |
| Series resolving | Busy label/status; duplicate activation locked | Wait; exit remains protected |
| Highlights running | Live log, Pause, 1x, 2x, Skip; Continue reason | Control pace or skip |
| Simulation failed | Current stage and lineups remain | Retry series or restart |
| Opponent unavailable | Current run remains | Retry generation or restart |
| Sharing pending | `Sharing…`; Share locked | Wait or complete native sheet |
| Share cancelled/copied | Polite outcome message | Retry or continue |
| Share APIs unavailable | Exact selectable text focused | Copy manually |
| Champion | Gold achievement state, path, roster, replay | Draft again/share/history |
| Eliminated | Immediate honest outcome, progress earned, replay | Draft again/share/history |

## Copy direction

Voice is **confident, concise, and match-aware—not macho, cute, or cryptic**.

- Use active verbs: `Choose`, `Draft`, `Assign`, `Enter`, `Play`, `Advance`,
  `Replay`, `Retry`.
- Name consequences before irreversible actions: `Replace all 3 teams` and
  `Exit this run? Your current draft will be cleared.`
- Translate system keys for display: `Group Qualifier`, `Quarterfinal`,
  `Semifinal`, `Grand Final`; `Smokes`, `Duelist`, `Initiator`, `Sentinel`,
  `Flex`.
- Explain jargon once in context: `Best of 3 · first to 2 map wins` and
  `IGL · in-game leader`.
- Call all narration `simulated` without making the disclaimer the headline.
- Never invent confidence, performance, historical, or statistical claims.
- Error copy follows: what happened, what remains safe, what to do next.

## Accessibility rules

- Exactly one main landmark; a banner outside it and a first-focusable skip link.
- Logical headings with one page H1 and no skipped structural levels.
- Native controls first; radio groups use `fieldset` and `legend` where suitable.
- Focus moves to the new task heading after every route-like state transition,
  and returns to the trigger when a dialog is cancelled.
- One polite phase announcement; outcome/error announcements occur exactly once.
- All five roster slots use list semantics and programmatic filled/open labels.
- Primary targets are at least 44×44px with at least 8px separation.
- Focus indicators and component boundaries meet 3:1; normal text meets 4.5:1.
- Selection, disabled, unavailable, win/loss, and heat never rely on color alone.
- Reduced motion removes spatial movement and timed CSS transitions while
  preserving an immediate static state.
- Timed highlight insertion is pausable; no flashing exceeds three per second.
- Reflow works at 320px and 400% zoom except for intentionally two-dimensional
  data, which receives an accessible alternate reading order.
- Forced-colors mode retains focus, selection, disabled, and outcome meaning.

## Success criteria

### Automated

- Existing unit, integration, static-path, privacy, Daily, Free Play, history,
  responsive, and screenshot journeys remain valid.
- Tests cover active-run persistence and invalid-record isolation.
- Tests cover confirm/cancel/Escape/focus return for unfinished-run exit.
- Tests assert focus after every phase transition and once-only announcements.
- Exact 390px and 320px checks show no page-level horizontal overflow.
- Tests cover long labels, missing media, exhausted/no-alternative rerolls,
  disabled explanations, retry, double activation, Pause/Resume, reduced motion,
  and champion/eliminated results.

### Evaluative

- In five first-use sessions, at least 4/5 users can state the premise, explain
  Daily versus Free Play, and identify the next action after ten seconds.
- At least 90% complete a first run without README assistance.
- At least 90% identify every filled/open role at 390px during the draft.
- At least 90% explain that an IGL is required and affects the simulation.
- At least 90% identify outcome, stage reached, and replay action within five
  seconds on results.
- Zero observed accidental resets or mode switches in the validation sessions.

## Scope boundaries

No accounts, backend services, leaderboards, new game mechanics, public ratings,
fabricated statistics, unsourced claims, unauthorized assets, or unrelated
features. Domain and simulation code change only when necessary to support safe
UI state persistence or presentation; formulas and outcomes remain unchanged.
