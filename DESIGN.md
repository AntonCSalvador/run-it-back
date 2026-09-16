# Run It Back Design System

Date: 2026-09-06
Visual direction selected: 2026-09-07
Status: Implemented; integrated Win32 visual review complete

## Direction

**Broadcast Tactical** treats each run as a compact live sports production:
players make one clear decision at a time while the roster, stakes, and path
remain visible like a broadcast rundown. It borrows discipline from match
sheets, score strips, production cues, and editorial sports pages—not the logos,
assets, or distinctive trade dress of any real league or broadcaster.

The product is an operating interface, not a marketing page or generic
dashboard. Visual expression must increase comparison speed, state clarity, and
tournament tension.

## Direction contract

**THESIS:** A live tournament rundown turns every choice into the next broadcast
cue; refuse the generic dark grid of equal rounded cards.

**OWN-WORLD:** Near-black fields, warm paper-white type, thin graphite rules,
condensed display type, red live/lock rails, and gold only for champion or
decisive heat.

**STORY:** Understand the challenge, build a lineup with informed agency, commit
an IGL, survive a rising four-round path, read the recap, run it back.

**FIRST VIEWPORT:** Opening premise and Daily action dominate the left two-thirds;
Daily availability and compact run format occupy a right match-notes rail; Free
Play is a clearly secondary action below Daily.

**FORM:** Sports results desk / broadcast rundown, assigned grounded direction 4,
Impeccable seed `400dce8b`.

**SELECTED COMP:** `Live Results Desk`, chosen by the user from the Impeccable
direction board. The build is code-led: the comp establishes composition,
hierarchy, density, and visual ambition, but it is not a pixel-copy target. It
returns as a critique reference during integrated refinement.

**FINISH:** unreviewed and undocumented is unfinished; this build ends with the
finish review, the verdict, DESIGN.md, and every shipping raster carrying its
provenance

## Color tokens

| Token | Value | Purpose |
|---|---:|---|
| `--rib-canvas` | `#0B0D10` | Page ground |
| `--rib-canvas-raised` | `#101317` | Header and anchored rails |
| `--rib-surface-1` | `#171B20` | Primary interactive surfaces |
| `--rib-surface-2` | `#1D2228` | Selected/detail surfaces |
| `--rib-line-subtle` | `#30363D` | Dividers and passive boundaries |
| `--rib-line-strong` | `#626A74` | Control boundaries and disabled structure |
| `--rib-text-primary` | `#F2EDE3` | Main text |
| `--rib-text-secondary` | `#B9B4AA` | Supporting text |
| `--rib-text-dim` | `#8D8982` | Tertiary metadata after contrast validation |
| `--rib-red` | `#E84B42` | Primary action, current step, selection |
| `--rib-red-deep` | `#9F302B` | Pressed/quiet red state |
| `--rib-gold` | `#D8A84E` | Champion, achievement, decisive heat only |
| `--rib-danger` | `#FF756D` | Error text/icon on dark surfaces |

Rules:

- Red means live, current, actionable, or locked—not error by default.
- Gold never labels ordinary roles, navigation, or routine metadata.
- Error and disabled states include text/icon/structure, never hue alone.
- No gradient fills, blurred glass, neon bloom, or continuous glow.
- Canvas depth may use sparse one-pixel rules or coordinate marks at very low
  contrast; decoration must never compete with content.

## Typography

- **Display:** locally hosted Barlow Condensed, weights 600 and 700, with
  `"Arial Narrow"` and condensed system fallbacks.
- **UI/body:** locally hosted Barlow, weights 400, 500, and 600, with system
  sans-serif fallbacks.
- Font files and the SIL Open Font License must ship locally; runtime font
  requests are not allowed.
- Scores, years, counters, round numbers, and records use tabular numerals.
- Display type is reserved for premise, current decision, opponent/round,
  outcome, and score. Body type carries instructions and metadata.

| Role | Mobile | Desktop | Treatment |
|---|---:|---:|---|
| Outcome/display | 36/36 | 56/52 | condensed 700 |
| Screen title | 28/30 | 40/40 | condensed 700 |
| Section title | 20/24 | 24/28 | condensed 600 |
| Body/control | 16/24 | 16/24 | UI 400/600 |
| Metadata | 12/16 | 13/16 | UI 600, uppercase only when short |
| Caption | 12/18 | 12/18 | UI 400 |

No user-facing text falls below 12px. Long handles and team names wrap without
shrinking type.

## Spacing and geometry

- Base scale: 4, 8, 12, 16, 24, 32, 48, 64px.
- Mobile gutter: 16px. Desktop gutter: 24–32px.
- Dense metadata uses 4–8px gaps; controls use 8–12px internal rhythm; screen
  zones use 24–32px; major journey transitions use 32–48px.
- Default corner radius is 2–4px. Use 6px only on large interactive cards and
  full pills only for compact tags/status.
- Prefer rules, spacing, and alignment over enclosing every group in a card.
- Elevation is near-flat. Sticky/overlapping controls may use one restrained
  shadow plus an opaque surface and visible border.

## Page shell

- A banner contains the compact wordmark and run status, outside exactly one
  main landmark.
- A skip link is the first focusable item.
- Mode selection uses an editorial opening composition; in-run screens use a
  compact progress/rundown header.
- Desktop content width is 1180–1240px. Draft screens use a decision field plus
  roster rail. Mobile becomes one column with a compact all-role summary.
- `Exit run` is subordinate and confirmed only when progress would be lost.
- Cancelling exit returns focus to its trigger. Confirming exit and error
  recovery move focus to the newly restored task heading.
- Recent results never appear above the current run result.

## Core component patterns

### Buttons

- One filled red primary action per decision zone.
- Filled red actions use near-black text so normal-size labels exceed 4.5:1.
- Secondary buttons use warm text, a strong graphite border, and surface fill.
- Tertiary actions are text/quiet-border controls, never low-contrast links.
- Minimum target: 44×44px; adjacent targets maintain at least 8px separation.
- Pressed state changes value and may compress by 1px when motion is allowed.
- Focus uses a 3px warm-white/red composite ring with 3:1 boundary contrast.
- Disabled buttons remain readable and have persistent explanatory text through
  `aria-describedby`.

### Status and progress

- Macro stages: Draft, IGL, Tournament, Recap.
- Detail status names current task and count: `Pick 2 of 5`, `Round 3 of 4`.
- Completed, current, and future states differ by icon/label/weight plus color.
- Screen-reader updates announce the detailed status once, politely.

### Team cards

- Entire card is the native button.
- Fixed zones: year eyebrow, 64px media/fallback, team name, `Scout roster` cue.
- Three equal desktop columns; 86–90% mobile card width with next-card peek,
  position text, and accessible previous/next support where necessary.

### Player cards

- Fixed zones: portrait/fallback, handle, event context, eligible open roles.
- Do not display ratings, tiers, placement, invented stats, or unsourced claims.
- Role tags are metadata, not separate floating cards.
- Selected/locked is explicit with a red rail/check and text state.

### Roster

- Always shows Smokes, Duelist, Initiator, Sentinel, and Flex together as an
  ordered list of slots.
- Every slot exposes role, `Open` or player/year, and IGL where applicable.
- Desktop uses a persistent vertical rail during the draft and five aligned
  lineup columns at review.
- Mobile uses a compact five-role status grid; detailed cards/swap actions expand
  without hiding overall composition.
- Compatible swaps are contextual actions, not permanent full-sentence buttons.

### IGL choices

- Native radio-card group with a visible legend and 44px minimum rows/tiles.
- Checked state uses radio/check, weight, border/rail, and `Selected` semantics.
- Guidance states that any drafted player is valid and the choice affects the
  simulation; it does not expose historical traits or ratings.

### Tournament

- Four-round stage rail is persistent.
- Matchup hierarchy: round and stakes, user/opponent identities, format, score or
  reveal state, primary action, then detailed lineups.
- Group and quarterfinal reveal maps sequentially. Semifinal/final reveal
  simulated moments before the terminal score unless Skip is chosen.
- Standard highlight rows are neutral. Current reveal uses red. Clutch/decisive
  moments may use gold plus a textual label/icon.
- Busy, retry, restored, and terminal states keep the same composition to avoid
  disorientation.

### Results

- Outcome is the largest element. Champion may use gold; elimination does not
  imitate a celebration.
- Stage reached and series record sit directly beneath outcome.
- The primary replay action appears before detailed recap on every viewport.
- Tournament path, roster/IGL, important simulated moments, and detailed maps are
  distinct sections with progressive disclosure where useful.
- Share and saved history are secondary.

## Interaction and motion

- Standard response: 120–180ms color/value change.
- Lock-in: one 160–240ms red rule sweep attached to the changed element.
- Score reveal: one restrained rule/number transition; no slot-machine motion.
- Champion/decisive heat: one finite gold treatment, never looping.
- Reduced motion removes transforms, smooth scrolling, and timed CSS reveal;
  immediate static border/icon/text states retain all meaning.
- Highlight timing remains user-controlled with Pause/Resume, 1x, 2x, and Skip.

## Responsive rules

- No page-level horizontal overflow at 390px, 320px reflow, or desktop zoom.
- Horizontal tracks must advertise themselves with a next-item edge and position;
  essential context such as the full roster cannot live only in a track.
- Mobile primary actions remain in the natural lower reading/thumb zone without
  a viewport-obstructing permanent bar.
- Desktop comparison stays visible: all three team offers and five roster roles
  fit without scrolling.
- Content tolerates at least 40% text expansion and repository-backed longest
  names without overlap or clipped controls.

## Accessibility

- Native semantics and DOM order match visual order.
- Focus moves to the new task heading after route-like state changes.
- Dialogs focus Cancel first, close with Escape, and return focus to their trigger.
- Roster/history use lists; radio groups use fieldset/legend where appropriate.
- Meaning is redundant across label, structure/icon, and color.
- Text contrast meets 4.5:1; large text, component boundaries, and focus meet 3:1.
- Forced colors retain selection, focus, disabled, error, and outcome states.
- Missing media preserves dimensions and descriptive context.
- All animations honor `prefers-reduced-motion`; auto-updating content can pause.

## Explicit anti-patterns

Do not introduce purple gradients, glassmorphism, glow-heavy neon, floating SaaS
tiles, excessive pills, ubiquitous rounded cards, decorative HUD clutter,
unlabeled icon actions, hover-only disclosure, copied broadcast/Riot assets,
fabricated statistics, punitive streak messaging, or delayed controls that hold
the player hostage.

## Implemented finish record

The integrated implementation keeps the selected **Live Results Desk** as a
composition and hierarchy reference rather than a pixel-copy. Its oversized
score-sheet typography became the opening premise, decision headings, matchup,
and result treatments; its dense production rundown became the persistent
four-stage rail and aligned roster/path sheets. Texture, copied iconography,
licensed marks, and decorative crosshairs were deliberately omitted because the
repository has no authorized source assets for them and the operating interface
must keep task state dominant.

Final refinements established these additional patterns:

- At 390px and below, the in-draft roster uses a compact two-column status grid;
  all five roles remain visible outside the horizontal team/player tracks.
- An empty tournament score container does not reserve a visual track while
  semifinal or final highlights are revealing.
- Results lead with at most four retained moments. Additional verbatim simulated
  moments remain available in a native, 44px-minimum disclosure so a long final
  does not bury map details, sharing, and saved history.
- Desktop moment leads use two editorial columns; narrow layouts return to one
  reading column without changing source order.

### Visual regression inventory

Current Win32 baselines cover the complete shell at desktop and Pixel 7 for:
`mode-selection.png`, `three-team-offer.png`, `player-picker.png`,
`complete-roster.png`, `semifinal-highlights.png`,
`results-eliminated.png` (`e2e-164`), and `results-champion.png` (`e2e-560`).
Captures are full-page with animations disabled. The former ambiguous
`results.png` baseline has been replaced by the two deterministic outcomes.

Linux baselines remain unchanged and retain the pre-redesign screenshot
inventory, including `results.png`; they were not captured or fabricated from
Win32 output. Ubuntu CI continues to run every nonvisual E2E journey and skips
only the two visual capture tests while the four native Linux outcome images
are absent. A manual Ubuntu candidate workflow captures and verifies both
visual journeys; normal CI automatically enables the full visual suite once
reviewed desktop and Pixel 7 `results-eliminated.png` and
`results-champion.png` baselines are committed. Current automated browser
coverage is Chromium; real-device, screen-reader, and multi-browser manual
validation remain release follow-ups rather than completed evidence.
