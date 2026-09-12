# Complete player portrait coverage design

Date: 2026-09-09
Status: Approved
Amends: `2026-09-08-player-portraits-design.md`

## Goal

Give every one of the 239 canonical Champions player identities a real,
locally stored portrait. The existing player UI, initials fallback, and
provenance guarantees remain intact, but complete portrait coverage becomes a
validated dataset requirement instead of a best-effort outcome.

Success means:

- all 239 canonical player identities have a non-null portrait;
- every portrait resolves to a checked-in WebP asset in the static build;
- Riot/VALORANT Esports material is the preferred supplemental source and
  Liquipedia is used when needed;
- every asset records enough provenance to identify the player, original
  material, publisher or rights holder, and reuse basis;
- high-resolution source images are resized safely instead of becoming
  fallbacks; and
- the app remains a free, noncommercial fan project with Riot's required fan
  project notice.

The design supersedes the earlier statement that portrait coverage need not
include all 239 identities. It does not weaken runtime fallback behavior:
initials still protect the UI from a missing or corrupt file, even though
validation prevents that state from shipping.

## Current state

The checked-in catalog contains 153 portraits. The remaining 86 identities
currently fall into three groups:

- 55 candidates rejected because their recorded reuse terms do not authorize
  this project's reuse;
- 25 identities for which the Liquipedia import found no acceptable candidate;
- 6 otherwise acceptable portraits whose source images exceed Sharp's current
  40-megapixel input limit: stax, TenZ, Smoggy, Flashback, free1ng, and HYUNMIN.

FiNESSE (`player-817`, commonly called FNS) is in the no-candidate group. His
2021 Envy, 2022 OpTic Gaming, and 2023 NRG cards all resolve through that one
canonical identity, so one approved portrait covers every historical card.

## Source policy

Sources are considered in this order:

1. Preserve an existing, validated portrait unless a maintainer deliberately
   replaces it.
2. Use a standalone portrait published by Riot Games or VALORANT Esports.
3. Use an identifiable crop from an official Riot/VCT roster graphic, event
   photograph, or broadcast frame when no standalone portrait exists.
4. Use a Liquipedia-hosted image whose per-file metadata grants compatible
   reuse or identifies Riot as the owner and satisfies the Riot fan-project
   policy.

Official publication is not treated as proof that Riot owns third-party work.
If an official page names another photographer or owner, the record must use
that party's explicit license or permission instead of `riot-fan-policy`.
Liquipedia files marked fair use, unknown ownership, or permission for
Liquipedia only remain ineligible. Search-result thumbnails, VLR scraping,
unverified social-media copies, team-site images without reuse grounds, and
AI-generated player likenesses remain out of scope.

Use of Riot-owned material depends on the project remaining noncommercial and
retaining the conspicuous Legal Jibber Jabber notice. Provenance records must
make policy-based assets easy to identify and remove if Riot or another rights
holder requests it.

## Acquisition architecture

### Curated source manifest

Add a reviewed input manifest for portraits that automatic Liquipedia discovery
cannot supply. Each row contains:

- canonical `playerId`;
- source kind: `riot-portrait`, `vct-event-photo`, `vct-roster-graphic`,
  `vct-broadcast-frame`, or `liquipedia`;
- official source page URL;
- direct media URL, or official video URL plus timestamp for a captured frame;
- event and publication date when known;
- displayed credit and identified owner;
- reuse basis: `riot-fan-policy`, an approved open license, or explicit
  permission;
- reviewer confirmation that the image depicts the intended player; and
- optional crop focus coordinates when automatic attention cropping is poor.

This manifest is reviewed input, not generated output. It may not contain
checksums or final asset paths; those are derived by the importer. Its schema is
strict, source kinds and reuse bases are closed enums, URLs must be HTTPS, and
each player may appear at most once.

### Import flow

The importer processes all 239 canonical identities transactionally:

1. Retain the existing validated portrait when no approved replacement is
   requested.
2. Apply a reviewed curated source when one exists.
3. Otherwise run the current Liquipedia discovery and rights assessment.
4. Download or capture the source into a temporary staging directory.
5. Verify the file type, byte limit, decoded dimensions, and player identity
   review record.
6. Correct orientation, apply the recorded crop focus or attention crop,
   resize to 256 by 256 pixels, and encode WebP.
7. Derive the content-addressed filename and SHA-256 checksum.
8. Generate the portrait asset and source catalogs.
9. Publish the complete set only after every row, file, and source record
   validates.

No network request occurs during application builds. Importing is an explicit
maintainer operation; builds consume only checked-in manifests and assets.

### High-resolution inputs

Liquipedia imports request a bounded MediaWiki thumbnail, targeting 512 pixels,
when the API provides one. This avoids downloading or decoding oversized
originals and resolves the six current pixel-limit exclusions. Direct Riot/VCT
sources retain the 15 MiB download limit and permit at most 80 megapixels before
conversion. Anything above those bounds fails with a source-specific error and
must be replaced by a bounded official derivative rather than disabling image
safety globally.

### Generated provenance

The generated source record keeps the existing fields and adds structured
source kind and reuse basis. A broadcast-frame record also preserves the video
URL and timestamp. The source page remains the human-reviewable citation; the
direct URL remains an acquisition detail.

Generated catalogs remain deterministic apart from an explicitly supplied
retrieval date. Re-running an import with identical inputs produces identical
assets, paths, ordering, and provenance records.

## Coverage and validation

Complete coverage is a release invariant:

- the canonical dataset contains exactly 239 unique players;
- exactly 239 unique portrait rows refer to those players;
- every player has one portrait and one corresponding portrait source;
- every portrait path exists under `public/assets/players` and is a regular
  file, not a symbolic link;
- every file is a valid 256-by-256 WebP and matches its recorded SHA-256;
- every source row passes its source-kind and reuse-basis policy;
- no unused portrait file or provenance row remains; and
- the static export contains the same 239 portrait files.

Validation errors name the affected handle, player ID, source tier, and failed
condition. Import summaries report preserved, newly imported, replaced, and
uncovered counts. The importer must not delete the last known-good catalog when
a discovery, download, conversion, or validation step fails.

## User experience

No player-facing layout change is required. `PlayerPortrait` continues to use
the existing 68/64-pixel selection treatment and 36-pixel compact treatment.
Images remain decorative beside visible player handles. The same-sized initials
fallback remains for runtime load failures so a damaged cache or interrupted
request cannot shift layout or obscure player identity.

Complete data coverage means initials should not appear in a validated release
under normal operation. Their appearance becomes a useful signal of a missing
deployment asset or runtime image failure rather than expected dataset behavior.

## Failure handling and maintenance

- A missing curated URL, identity confirmation, owner, credit, or reuse basis
  fails validation.
- A third-party credit on Riot/VCT material requires compatible permission; it
  cannot be relabeled as Riot-owned.
- An unreachable source may reuse the checked-in last-known-good asset but
  cannot create or replace a catalog row.
- Conflicting candidate identities require manual review; the importer never
  guesses from handle similarity.
- A takedown is handled by replacing the affected source with another approved
  source before release. Runtime initials remain the emergency fallback.
- Maintainers rerun source-policy checks when Riot or source-license terms
  change.

## Testing

Unit tests cover strict curated-manifest parsing, source-tier precedence,
identity matching, policy decisions, duplicate rejection, crop-focus parsing,
MediaWiki thumbnail selection, pixel and byte bounds, and deterministic source
records.

Importer integration tests cover atomic success and rollback for curated URLs,
broadcast-frame inputs, network failures, conversion failures, and invalid
provenance. Regression fixtures specifically cover FiNESSE and the six existing
oversized sources.

Dataset and asset tests require 239 pictured players, 239 unique catalog rows,
valid checksums, exact WebP dimensions, and no orphaned files. UI tests retain
the initials error fallback test while adding a production-dataset assertion
that every canonical player resolves to a portrait. Static-build smoke tests
verify that all 239 assets are exported under both root and configured base-path
deployments.

## Documentation and operational changes

Update the README and data methodology to state 239-of-239 coverage, explain
the source hierarchy, link the generated credits, and preserve the fan-project
notice. The portrait import command prints unresolved players with suggested
next source tiers so future roster additions cannot silently reduce coverage.

## Alternatives rejected

- Accepting every Liquipedia image was rejected because Liquipedia-specific
  permission and fair-use claims do not automatically transfer to this project.
- Hotlinking was rejected because remote availability, referrer rules, and URL
  changes would make portraits nondeterministic.
- Relaxing provenance validation was rejected because it would hide ownership
  and make future replacement or takedown work harder.
- AI-generated likenesses were rejected because the goal is authentic player
  recognition and sourceable historical representation.

## Approval

The project owner approved Riot/VALORANT Esports as the preferred source and
Liquipedia as the supplemental source on 2026-09-09. Official VCT broadcast or
roster-image crops are acceptable when no standalone portrait exists.
