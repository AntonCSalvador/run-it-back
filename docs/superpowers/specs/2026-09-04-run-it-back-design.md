# Run It Back: Product and Technical Design

Date: 2026-09-04
Status: Approved for implementation planning

## Summary

Run It Back is an unofficial fantasy roster game using players and teams from
VALORANT Champions 2021 through 2025. Each run drafts five event-specific player
cards, assigns the lineup's roles and IGL, then tests that roster in a condensed
Champions tournament against generated fantasy teams. Player ratings and the
simulation formula stay hidden in the interface so players learn card strength,
role fit, chemistry, and leadership through repeated play.

The MVP has two modes, Daily and Free Play, no accounts, local browser storage,
and static deployment to Vercel and GitHub Pages. The application is structured
so a future account and leaderboard release can move authoritative simulation to
a server without replacing the game UI or core domain model.

## Goals

- Deliver a short, replayable five-player draft built around historical Champions
  rosters.
- Reward knowledge of players, event form, roles, IGLs, and team chemistry.
- Permit probabilistic upsets. Higher strength improves odds but never guarantees
  a map or series.
- Make historical cards immersive through player portraits, team logos, event
  years, opponent lineups, map scores, and fictional match highlights.
- Provide a fair shared Daily run and unlimited Free Play runs.
- Work well on desktop and mobile and deploy as a static site for the MVP.
- Preserve a clean path to server-authoritative accounts and leaderboards.

## Non-Goals for MVP

- Accounts, cloud saves, matchmaking, and leaderboards.
- Live ingestion or scraping at runtime.
- Exact round-by-round tactical simulation.
- Public numeric ratings, power scores, chemistry values, or formula details.
- Registered players who did not play a map, coaches, analysts, or staff.
- Official Riot affiliation or reproduction of a Riot character as the mascot.

## Brand and Visual Direction

The product name is **Run It Back**.

The interface uses the approved Broadcast Tactical direction: charcoal and near-
black surfaces, warm off-white type, restrained red emphasis, and a secondary
gold heat color. Layout remains compact, competitive, and optimized for comparing
three options rather than resembling a marketing page.

Fire is an interaction accent and homage to comeback energy. It appears briefly
on rerolls, lock-ins, clutch highlights, and wins. Fire does not run continuously
or become background decoration. Reduced-motion preference replaces movement with
a static color/outline state. No Phoenix character art, ability icon, voice line,
or other copied character asset is used.

## Game Modes

### Daily

Daily uses a date-derived seed. The seed controls the team-option stream, reroll
stream, generated opponents, map rolls, and narration choices. Two users making
the same choices receive the same results. One completed Daily result per date is
stored locally, while replay viewing remains available.

### Free Play

Each run receives a fresh random seed. The same roster can therefore have a
different result in another Free Play run. Runs are unlimited and recent results
are stored locally.

## Core Draft Loop

1. Start Daily or Free Play.
2. Spin three distinct team-year cards.
3. Spend one of three run-wide rerolls to replace all three cards, or choose one
   team-year.
4. View all selectable players who played at least one map for that team at that
   Champions event.
5. Choose one player and assign the card to an eligible open slot.
6. Repeat until Smokes, Duelist, Initiator, Sentinel, and Flex are filled.
7. Assign the IGL tag to any one drafted player.
8. Review the roster and enter the tournament.

The same team-year may appear in later spins. An exact event card cannot be
drafted twice. Different event versions of the same person are separate cards and
may coexist, such as TenZ 2021 and TenZ 2024.

Team-option generation excludes a team-year when none of its undrafted cards can
fill any remaining slot. Compatible role assignments may be rearranged before
the tournament begins, but drafted cards and spent rerolls cannot be undone.

## Roles and IGL

The visible slots are:

- Smokes, backed by the Controller agent class
- Duelist
- Initiator
- Sentinel
- Flex

Eligibility belongs to a player-event card, not a player's career identity. It
is based on agents actually played at that Champions event. Automated agent/map
evidence produces a suggested classification, then every card is human-reviewed.
A non-Flex role normally requires at least two maps or 20 percent of the card's
maps in that class, whichever threshold is greater. A cited manual override is
allowed for short events or genuine composition-specific role changes. Flex
requires meaningful event play in at least two non-Flex classes.

IGL is separate from role. Any drafted card may receive the IGL tag, ensuring a
run can always finish. Cards with documented event-specific IGL experience carry
a stronger hidden leadership trait; assigning a non-IGL remains legal but usually
produces weaker leadership value.

## Data Model

The canonical MVP dataset is versioned, local JSON validated at build time.

### Player Identity

- Stable internal ID
- Current canonical handle
- Event-era display handle and aliases
- Portrait asset and fallback initials
- Asset source, retrieval date, credit, and license/permission note

### Team Identity

- Stable internal ID independent of rebrands
- Event-era display name and short name
- Champions year
- Logo asset and fallback mark
- Asset source, retrieval date, credit, and license/permission note

### Event Card

- Player ID, team ID, event year, and unique card ID
- Maps played and source evidence
- Eligible roles and role-evidence notes
- Historical IGL status
- Hidden role-normalized performance traits
- Tournament placement and consistency inputs
- Chemistry links or event-team membership used to derive them

Historical rosters use a one-time, human-reviewed snapshot. Liquipedia event pages
provide the practical roster baseline; Riot event articles cross-check teams and
event facts. VLR may be used only for manual QA, not scraping or runtime access.
Every snapshot records source URL and retrieval date. Assets are copied only when
their use is permitted; missing or unclear rights produce a designed initials or
team-mark fallback rather than hotlinking.

## Hidden Player Model

Each event card receives role-normalized traits on a 0-100 internal scale:

- Firepower: 35 percent of individual baseline
- Utility impact: 20 percent
- Survival and trade value: 15 percent
- Clutch impact: 15 percent
- Consistency: 15 percent

Tournament placement supplies a small event-impact adjustment rather than
overriding individual performance. Role normalization prevents support players
from being compared directly with duelists on raw fragging output. Human review
may adjust documented role or leadership traits, but not create arbitrary overall
tiers.

Team strength combines card baselines with:

- Role-fit modifier for each assigned slot
- Leadership modifier from the tagged player's hidden IGL trait
- Pairwise chemistry for cards from the same event-team
- Small composition modifier for balanced strengths and weaknesses
- Seeded map-level form variance

All internal values and weights are omitted from the user interface.

## Probabilistic Match Simulation

Ratings determine odds, not fixed winners. For each map, both lineups receive a
map strength. Their difference becomes a win probability through a logistic curve:

`p(user map win) = clamp(0.08, 0.92, 1 / (1 + exp(-strengthDelta / 12)))`

The 8 percent floor and 92 percent ceiling preserve upset chances. A seeded random
roll selects the winner. Map score margin is drawn from a second seeded roll
conditioned on strength difference and winner, allowing close wins, stomps,
overtime, reverse sweeps, and underdog runs. Calibration tests verify that stronger
ratings improve long-run win rate monotonically without eliminating variance.

Daily randomness is deterministic for fairness. Free Play receives a new seed per
run. Fictional narration describes the chosen result and never secretly changes
it.

## Opponent Generation and Tournament

Every opponent is a generated fantasy roster from the same 2021-2025 event-card
pool. It must fill the five roles and assign an IGL. Exact cards already drafted
by the user are excluded from that run's opponents, while different event versions
of the same person remain valid.

Opponent target-strength bands rise by stage:

- Group qualifier: middle of the valid-roster distribution
- Quarterfinal: above-average distribution
- Semifinal: upper-quartile distribution
- Grand Final: elite distribution

Generation samples valid rosters until one enters the stage band, with a bounded
attempt count and deterministic fallback to the closest valid roster. The user
sees each opponent's player cards and assigned roles but not ratings.

Tournament sequence:

1. Group qualifier, best of three
2. Quarterfinal, best of three
3. Semifinal, best of three
4. Grand Final, best of five

A loss ends the run. Winning the final completes a championship run.

## Result Reveal and Narration

Group and quarterfinal series reveal map by map. Semifinal maps include four to
six slowly revealed pivotal events. The final uses the same highlight density but
draws out the decisive map with slightly longer timing. Controls for normal speed,
double speed, and skip remain available throughout.

Narration uses curated state-aware templates populated only with players in the
current series. Templates cover aces, clutches, ninja defuses, multikills, retakes,
failed clutches, eco wins, and throws. Role and trait weighting makes event choice
plausible. Copy clearly frames every event as simulation, never historical fact.

## Interface and Responsive Behavior

The first screen is the usable game. A compact header contains the Run It Back
wordmark, Daily/Free Play segmented control, and local streak. Draft view contains
the pick counter, reroll control, three team-year cards, and persistent five-slot
roster.

Desktop shows all three team choices side by side. Mobile keeps cards large enough
to inspect using horizontal touch tracks with momentum scrolling, CSS scroll snap,
smooth programmatic movement, keyboard controls, visible focus, and restrained
styled scrollbars. Roster slots use the same approach on narrow screens. Stable
card and slot dimensions prevent hover, images, or labels from shifting layout.

Player selection, role assignment, IGL assignment, opponent reveal, match feed,
and result summary each have explicit loading, empty, and invalid-state behavior.
Missing portraits and logos render branded fallbacks without resizing cards.

## Application Architecture

The MVP uses Next.js App Router and TypeScript as a static client-first app.
Domain logic remains independent from React:

- `data`: validated datasets, schemas, citations, and asset metadata
- `draft`: seeded spins, rerolls, availability, and role validation
- `rating`: card strength, role fit, leadership, and chemistry
- `simulation`: opponents, probability rolls, maps, and bracket progression
- `narration`: deterministic highlight selection and rendering data
- `storage`: versioned local history, Daily completion, streak, and settings
- `sharing`: spoiler-light Daily output and detailed Free Play output

The React layer follows an explicit state machine:

`mode -> spin -> team -> player -> role -> lineup/IGL -> tournament -> results`

Simulation is exposed behind a gateway interface. The MVP gateway calls the local
engine. A future server gateway can preserve the UI and domain contracts while
moving authoritative calculations off the client.

## Local Storage and Sharing

Stored data has a schema version and narrow records for settings, Daily state,
streak, and recent Free Play history. A migration failure resets only the affected
record and preserves unrelated valid data. Storage-unavailable mode keeps the
current run playable but explains that history cannot persist.

Daily sharing avoids revealing offered teams or hidden values. It includes date,
stage reached, series results, rerolls used, and a compact symbol grid. Free Play
may additionally include the final roster and opponent path.

## Deployment

The MVP configures Next.js static export. The production build emits `out/` and
uses only browser APIs and static assets.

- Vercel is the primary public deployment and preview environment.
- GitHub Pages is a secondary deployment through GitHub Actions.
- The GitHub Actions build applies the repository base path and trailing-slash
  behavior; the Vercel build serves from the root path.
- Both deployments receive a post-build smoke test for entry page, JavaScript,
  dataset, and key assets.

When accounts or leaderboards begin, static export is removed, Vercel becomes the
only authoritative deployment, and GitHub Pages is frozen as a demo or retired.

## Required README Security Note

The initial README must prominently state:

> MVP ratings, chemistry, and simulation run in the browser and can be inspected
> or modified by a determined user. Before adding accounts, competitive
> leaderboards, prizes, or trusted public scores, move authoritative ratings,
> random seeds, opponent generation, and match simulation to a server. Validate
> every submitted Daily run server-side; never trust a client-computed result.

## Error Handling

- Build fails on malformed IDs, missing years, invalid roles, impossible opponent
  constraints, out-of-range ratings, broken local asset references, or absent
  source metadata.
- Runtime missing assets fall back without blocking play.
- Invalid local state resets only its namespaced record.
- An impossible draft or opponent state records diagnostics and regenerates from
  the same seed using the deterministic fallback path.
- React error boundaries provide a restart-current-run action without deleting
  unrelated history.

## Verification Strategy

Unit and property tests cover:

- Reproducible seeded spins, rerolls, opponents, maps, and narration
- Three distinct team choices and exact-card uniqueness
- Role and IGL validity for user and opponent rosters
- No dead-end team offers for remaining slots
- Probability bounds, possible upsets, and monotonic strength-to-win-rate behavior
- Increasing opponent-strength distribution by stage
- Narration participants and outcomes matching simulation state
- Storage migrations and record-level recovery

Component and end-to-end tests cover:

- Complete Daily and Free Play journeys
- Reroll, reassignment, IGL, loss, and championship paths
- Normal, double-speed, skip, and reduced-motion reveal modes
- Keyboard, pointer, and touch interaction
- Desktop and mobile layouts with no overlap or clipped labels
- Smooth scrolling, snap behavior, and stable card dimensions
- Vercel-root and GitHub-project-path static builds

Visual verification uses desktop and mobile Playwright screenshots before release.

## Repository and Delivery

The public repository exists at
`https://github.com/AntonCSalvador/run-it-back`, and local `main` tracks
`origin/main`. Implementation setup will create the Next.js application, README,
tests, and GitHub Actions workflow on a feature branch. After reviewed work is
integrated into `main`, enable Pages and connect the repository to Vercel.

## MVP Acceptance Criteria

- User can complete seeded Daily and random Free Play drafts on desktop and mobile.
- Dataset covers Champions 2021-2025 players who played at least one map.
- Draft enforces five roles, three rerolls, exact-card uniqueness, and one IGL tag.
- Historical versions of one player may coexist.
- Tournament generates four increasingly strong, valid fantasy opponents.
- Ratings influence probabilistic map results and preserve upset chances.
- Semis and final show deterministic, participant-correct fictional highlights.
- Ratings and formula never appear in the interface.
- Local history, Daily completion, streak, and sharing work without accounts.
- Accent fire motion respects reduced-motion settings.
- Missing assets degrade cleanly.
- Automated tests and static deployment checks pass for Vercel and GitHub Pages.
- README contains the required server-authority warning.

## Research References

- Next.js static export: https://nextjs.org/docs/pages/guides/static-exports
- Vercel Next.js deployment: https://vercel.com/docs/frameworks/full-stack/nextjs
- GitHub Pages Actions: https://docs.github.com/en/get-started/start-your-journey/deploying-your-website-automatically
- Riot VALORANT API and community policy: https://developer.riotgames.com/docs/valorant
- Riot IGL article: https://valorantesports.com/en-US/news/the-experience-of-being-an-in-game-leader
- Riot 2025 VCT awards methodology: https://valorantesports.com/en-US/news/valorant-champions-tour-season-awards
- Liquipedia API: https://liquipedia.net/api
- Liquipedia Champions 2021: https://liquipedia.net/valorant/VALORANT_Champions_Tour/2021/Champions
- Liquipedia Champions 2022: https://liquipedia.net/valorant/VCT/2022/Champions
- Liquipedia Champions 2023: https://liquipedia.net/valorant/VCT/2023/Champions
- Liquipedia Champions 2024: https://liquipedia.net/valorant/VCT/2024/Champions
- Liquipedia Champions 2025: https://liquipedia.net/valorant/VCT/2025/Champions
- VLR terms: https://www.vlr.gg/terms
- Hoopcade rules: https://hoopcade.com/how-to-play
- LoLdle Worlds Mayhem: https://loldle.net/worldsMayhem
