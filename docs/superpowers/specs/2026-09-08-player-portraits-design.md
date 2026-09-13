# Player portraits design

Date: 2026-09-08
Status: Approved

## Goal

Make real player portraits visible anywhere a drafted or selectable player
appears, while preserving the fast, accessible draft flow. Use only locally
cached images with recorded reuse grounds. Missing, rejected, ambiguous, or
broken portraits continue to use the existing initials fallback.

Success means:

- every player surface can resolve a portrait from the canonical player
  identity;
- the player picker gives portraits visual prominence without making later
  roster views slow to scan;
- builds remain offline and reject broken asset paths or incomplete
  provenance;
- no VLR scraping or third-party hotlinking is introduced;
- the project remains a free, noncommercial fan project and displays Riot's
  required fan-project notice.

The feature does not promise a portrait for all 239 identities. It imports all
portraits that pass the source policy and retains initials for the rest.

## User experience

This is an Operate surface. During player selection, recognition is the main
task; after selection, compact comparison and tournament progress are the main
tasks. Portrait size follows that change in intent.

- Player picker: a 68-pixel rounded-square portrait, with handle,
  historical team/year context, and role chips beside it.
- Roster bar, IGL picker, tournament rosters, final results, and saved-result
  details: a 36-pixel circular portrait beside the existing text.
- Initials occupy exactly the same bounds as a portrait so loading failure or
  missing coverage cannot shift layout.
- The visible handle remains the accessible name. Images next to repeated text
  use empty alternative text to avoid duplicate screen-reader announcements.
- Portraits never replace role, year, IGL, result, or team information.
- Mobile keeps the existing horizontal draft/roster interaction and minimum
  44-pixel controls. Picker portraits use 64 pixels below the existing
  44-rem breakpoint; compact portraits remain 36 pixels. Text and touch targets
  do not shrink.

The approved visual direction is the responsive hybrid shown in the visual
companion: large portraits at the identity decision, compact portraits during
scanning. A uniform compact treatment made real photos too weak; large photos
everywhere created unnecessary height and mobile scrolling.

## Asset acquisition and rights policy

An explicit import command queries the Liquipedia MediaWiki APIs. It follows
the published API rules: custom identifying user agent, local response cache,
gzip support, and no more than one request every two seconds. It does not
automate access to generated HTML pages.

For each canonical identity, the importer:

1. Queries the exact canonical handle. Handles are unique in the current 239
   identity dataset.
2. Discovers image filenames from the player page.
3. Reads each candidate's Commons `FileInfo` wikitext and direct file URL.
4. Confirms the file identifies the expected player and records its author,
   copyright owner, source URL, source page, date, and license marker.
5. Accepts an open license that permits redistribution, or a Riot-owned image
   used under Riot's noncommercial fan-project policy.
6. Rejects fair-use files, unknown ownership, missing metadata, permission
   granted only to Liquipedia, and permission owned only by another team,
   photographer, or organization.
7. Downloads the accepted file once, converts it to a bounded WebP portrait,
   and records the output checksum.

When several acceptable images remain, prefer the most recent dated portrait.
An undated tie, identity mismatch, redirect ambiguity, or conflicting metadata
is not guessed: the identity stays on initials and appears in the review
report. Import results are staged in a temporary directory and replace the
checked-in manifest/assets only after the complete run validates.

The importer's output includes coverage counts and categorized exclusions so a
maintainer can distinguish missing photos from rejected rights or ambiguous
identity matches.

References:

- Liquipedia API terms: https://liquipedia.net/api-terms-of-use
- Liquipedia media reuse guidance:
  https://liquipedia.net/commons/Help%3AReusing_and_remixing_Liquipedia_content
- Riot fan-project policy: https://www.riotgames.com/en/legal
- VLR terms, which prohibit automated extraction and therefore exclude VLR
  from this pipeline: https://www.vlr.gg/terms

## Data architecture

Portrait data is an overlay on the deduplicated player identity, not a field
copied into five yearly snapshots.

- `src/data/champions/portrait-assets.json` maps `playerId` to its local
  `/assets/players/<player-id>.webp` path and asset-source ID.
- `src/data/champions/portrait-sources.json` stores one asset `SourceRef` per
  accepted portrait, including the direct Commons description URL, retrieval
  date, author/copyright credit, and license basis.
- `src/data/champions/index.ts` merges the overlay into deduplicated players and
  appends portrait sources to the factual source catalog before schema parsing
  and freezing.
- Factual source cardinality remains pinned. Source validation treats portrait
  sources as a separate, strictly validated asset catalog instead of weakening
  the existing twelve-source audit.
- Each accepted portrait must have exactly one existing local file, one overlay
  record, and one matching asset source. Orphans, duplicate players, remote
  asset paths, missing credits, and missing license grounds fail validation.

The existing public `PlayerIdentity.portrait` contract remains unchanged, so
stored runs and gameplay state need no migration.

## Component architecture

Add a player-specific presentation component around `MediaMark`. It resolves
portrait sizing, crop behavior, and initials consistently while leaving team
logos on `object-fit: contain`.

- `PlayerPortrait` receives a player identity or portrait path, visible-label
  context, and `choice` or `compact` variant.
- Player portraits use `object-fit: cover`; logos retain `contain`.
- The app builds the existing player index once and passes a small portrait
  resolver to child views.
- `PlayerPicker`, `RosterBar`, `IglPicker`, `TournamentView`, `ResultsView`, and
  `RecentResults` render `PlayerPortrait` without changing their gameplay
  callbacks or state ownership.
- Shared player-row classes express the portrait/text hierarchy without
  duplicating inline sizing across components.

Native image elements remain appropriate for validated local assets and their
same-sized `onError` fallback. Add intrinsic dimensions, lazy loading where an
image can be off-screen, and asynchronous decoding. Images visible in the
first player-choice viewport may load eagerly; compact history details load
lazily.

## Legal notice

The persistent application footer and README include Riot's required notice:

> Run It Back was created under Riot Games' "Legal Jibber Jabber" policy using
> assets owned by Riot Games. Riot Games does not endorse or sponsor this
> project.

Per-image credits and source/license details remain in the machine-readable
portrait source catalog. The project must remove Riot-policy images if it
becomes commercial or Riot withdraws permission.

## Failure handling

- Missing or rejected source: keep `portrait: null`; render initials.
- Network, timeout, or rate-limit failure: preserve the last valid generated
  files and print a resumable error using the local cache.
- Ambiguous player/file mapping: reject automatically and include candidates in
  the review report.
- Corrupt or unsupported download: reject before manifest replacement.
- Missing local file, unsafe path, bad checksum, or incomplete provenance:
  fail data validation and the production build.
- Browser decode/load failure: switch to initials in the same dimensions.

No failure in portrait acquisition blocks gameplay.

## Testing and verification

Implementation follows test-driven development.

- Importer unit tests use checked-in API fixtures, never live network calls.
  They cover accepted open licenses, accepted Riot-owned fan-policy images,
  rejected fair use, rejected Liquipedia-only/team-only permission, ambiguity,
  deterministic ranking, cache reuse, and failure-safe output replacement.
- Dataset tests cover overlay joins, source separation, complete provenance,
  local asset containment, checksums, duplicates, and orphan records.
- Component tests assert portrait URLs and fixed variants on every player
  surface, decorative alt behavior beside visible handles, and initials after
  missing or failed loads.
- Existing keyboard, touch-target, reduced-motion, hydration, storage, and game
  flow tests remain green.
- Desktop and Pixel 7 visual snapshots cover player selection, complete roster,
  tournament rosters, results, and initials mixed with real portraits.
- Final verification runs lint, typecheck, unit tests, data validation, build,
  and relevant Playwright journeys. Impeccable's mechanical detector runs once
  over changed UI files after visual inspection.

## Scope boundaries

Included: reusable Liquipedia/Riot portrait acquisition, local optimization,
provenance, data overlay, all player-facing surfaces, fallback behavior,
responsive styling, legal notice, and automated tests.

Excluded: VLR scraping, hotlinks, guessing identities, replacing team logos,
player statistics or ratings in the UI, gameplay changes, account/storage
migrations, commercial licensing, and guaranteed 100 percent portrait
coverage.
