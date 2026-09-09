# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary user is a VALORANT or VCT fan who recognizes teams, players, and
competitive roles but may be new to fantasy drafting. They want a short,
repeatable way to test roster ideas against historical Champions appearances.

The experience must also remain understandable to an esports fan who does not
already know Run It Back's rules. That secondary audience needs plain-language
orientation for event-specific cards, role eligibility, rerolls, IGL selection,
and the difference between Daily and Free Play.

This audience ordering is inferred from the existing dataset and product brief;
it has not yet been validated through direct user research.

## Product Purpose

Run It Back is an unofficial, browser-based fantasy VALORANT drafting game. A
player drafts five event-specific Champions player cards, fills Smokes, Duelist,
Initiator, Sentinel, and Flex, chooses an in-game leader, and takes the roster
through a four-series fictional tournament.

Success means a first-time player can understand the premise quickly, complete a
valid run without external instructions, follow why each decision matters, feel
the tournament's rising stakes, understand the result, and want to draft again.

## Positioning

The product combines historically grounded, event-specific Champions cards with
a short role-constrained draft and a seeded, probabilistic fantasy tournament.
It does not present itself as a statistics database, official Riot product, or
deterministic roster-ranking tool.

## Operating Context

- Runs are completed in a single responsive web experience on desktop or mobile.
- Daily provides a shared UTC-date seed, local completion history, and a streak.
- Free Play provides unlimited runs with a fresh seed and local recent history.
- Players compare three team-year offers, scout one eligible player, assign an
  open role, repeat for five picks, choose an IGL, then play four possible series.
- Semifinal and final series include fictional, participant-correct highlights.
- The experience is static-deployable and continues without accounts or a
  network service after its local assets load.

## Capabilities and Constraints

- Preserve all existing drafting, reroll, role, IGL, opponent, rating,
  simulation, narration, sharing, and Daily/Free Play mechanics.
- Preserve hidden ratings and probabilities; never expose internal traits,
  strength, rolls, or formula details in rendered or accessible content.
- Preserve the versioned localStorage architecture, record-level recovery, and
  in-memory degradation when storage is unavailable.
- Add a versioned active-run record within that architecture so committed draft
  and tournament progress can recover after refresh without changing mechanics.
- Preserve static export for Vercel and GitHub Pages, existing valid E2E
  journeys, stable semantic names, and useful test hooks.
- Use only repository-backed team, player, role, year, map, series, and source
  information. Do not invent ratings, statistics, placements, or historical
  claims.
- Do not add accounts, cloud saves, backend services, leaderboards, prizes, or
  unrelated features.
- Do not use unauthorized Riot, VALORANT, VCT, Phoenix, team, or player assets.
  Local initials and team-mark fallbacks remain first-class presentation states.

## Brand Commitments

The product name is **Run It Back**. It is an unofficial fan project and must not
imply Riot Games or VALORANT Champions Tour endorsement.

The user-pinned visual world is **Broadcast Tactical**: charcoal and near-black
surfaces, warm off-white typography, disciplined red action accents, and gold
reserved for achievement or decisive heat. The composition should feel like an
editorial sports broadcast built for comparison and suspense.

The design explicitly rejects purple gradients, glassmorphism, generic SaaS
dashboard styling, excessive rounded cards, decorative clutter, generic neon
gamer effects, and copied brand assets.

## Evidence on Hand

- Canonical Champions 2021–2025 data: `src/data/champions/`
- Data provenance and methodology: `src/data/sources.json`,
  `docs/data-methodology.md`, and `docs/champions-provenance.json`
- Approved mechanics and technical design:
  `docs/superpowers/specs/2026-09-04-run-it-back-design.md`
- Current production components: `src/features/game/components/`
- Domain, simulation, narration, and storage tests: `src/features/game/`
- Daily, Free Play, history, static-path, keyboard, responsive, and screenshot
  journeys: `e2e/`
- Desktop and Pixel 7 visual baselines: `e2e/__screenshots__/`
- There is no direct user research, behavioral analytics, licensed portrait/logo
  library, or evidence supporting public player ratings. Future work must not
  fabricate substitutes for those absences.

## Product Principles

1. **Make the next decision legible.** Every screen states where the player is,
   what they are deciding, what remains, and what the action will do.
2. **Keep strategy visible.** The five-role roster, open needs, and IGL remain
   recognizable without relying on memory, hover, or hidden horizontal content.
3. **Protect the run.** Refreshes, recoverable errors, and accidental mode/reset
   actions must not silently erase meaningful progress.
4. **Build suspense from truthful state.** Presentation may pace a deterministic
   result, but it never changes, obscures permanently, or fabricates game data.
5. **End with a reason to return.** Results prioritize outcome, path, roster, and
   a decisive replay action before secondary history and sharing.

## Accessibility & Inclusion

The complete Daily and Free Play journeys must work with keyboard, touch,
screen-reader, voice-control-compatible native controls, 390px mobile layouts,
zoom and text expansion, reduced motion, forced colors, missing media, and
unavailable localStorage. WCAG 2.2 AA is the minimum implementation target.

Motion is never required to understand selection, progress, highlights, or
outcomes. Dynamic updates use intentional focus and restrained live-region
announcements. Primary controls target at least 44 by 44 CSS pixels, and state is
never communicated through color alone.
