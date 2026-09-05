# Champions dataset methodology

Reviewed: 2026-09-05. The five snapshots cover the 16 appearances at each
VALORANT Champions event from 2021 through 2025. Team participation was first
checked against the event pages in Liquipedia and, where an official event
article is available, against Riot's published event guide/recap. The exact
event pages and official cross-checks are listed by ID in `src/data/sources.json`.

Liquipedia did not permit automated retrieval during this review (HTTP 403), so
the reproducible event-level player/map baseline is the VCT Reference DuckDB
download cited as `vct-reference-dataset`. It is an independent daily build of
public professional match pages, not a Riot-owned primary statistic source. Its
coverage and terms are recorded on the linked dataset page. This limitation is
intentional and should be resolved with a manual page review before changing a
historical record.

## Snapshot construction

Only completed, non-showmatch maps at event IDs 449, 1015, 1657, 2097, and 2283
are included. A card is emitted only when a player appears in at least one such
map; submitted substitutes with no event map are excluded. This notably keeps
the event-specific sixth players that actually played (six in 2021, EDward
Gaming's sixth in 2022, and Fnatic's sixth in 2025). IDs are stable slugs of the
observed handle, team appearance, and event year. Player identity uses the
VCT Reference stable player ID, so historical cards—including `tenz-sentinels-2021`
and `tenz-sentinels-2024`—are distinct cards but resolve to one identity.

The card sources contain both that year's Liquipedia event source ID and the
reproducible map source ID. Team records cite the year's event page plus the
applicable Riot article. Names retain the source record's historical name where
it differs from a current brand; short names are normalized for the UI.

## Role evidence working table

For every player/map, the observed agent was mapped to its class: Controller →
`smokes`, Duelist → `duelist`, Initiator → `initiator`, Sentinel → `sentinel`.
The following working totals are agent-class map selections, not player counts.

| Year | smokes | duelist | initiator | sentinel | cards | multi-role cards |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 2021 | 175 | 178 | 217 | 140 | 82 | 27 |
| 2022 | 211 | 154 | 305 | 190 | 81 | 39 |
| 2023 | 268 | 202 | 234 | 136 | 80 | 23 |
| 2024 | 255 | 173 | 283 | 149 | 80 | 27 |
| 2025 | 260 | 235 | 234 | 151 | 81 | 23 |

A non-Flex role is eligible when its class appears on at least the larger of
two maps or 20% of that card's maps (the percentage threshold is rounded up to
a whole map). `flex` is added only when at least two non-Flex classes meet that
rule. There are no composition-only role overrides in this snapshot. This
preserves actual event play rather than assigning a career role.

## Ratings and leadership

Traits are hidden game inputs, never presentation labels. Per event card, the
five non-leadership traits are percentile ranks within eligible non-Flex role
evidence plus a small 0-4 point adjustment for the furthest completed bracket
round reached by its team. The adjustment cannot replace map evidence:
firepower combines map rating (65%) and ACS (35% after scaling), utility is map
assists, survival is inverse map deaths, clutch is observed 1v1–1v5 clutch
events, and consistency is inverse within-event rating variation. These are
continuous relative values, not hand-authored tiers. The game applies its
published 0.35/0.20/0.15/0.15/0.15 weighting.

`historicalIgl` is independent of gameplay role. It is false for this import:
no card is asserted as an IGL without a card-specific, reviewable leadership
source. Leadership remains neutral (50) until such evidence is added. This is
preferable to inferring IGL status from team rosters or outcomes.

## Assets and corrections

All `logo` and `portrait` fields are `null`. No Riot, Liquipedia, VLR, or other
uncleared media is hotlinked or copied. A future local asset must have a stable
`/assets/players/...` or `/assets/teams/...` path and a corresponding `usage:
"asset"` source record with URL, retrieval date, credit, and permission/license
basis; the validator checks both metadata references and local paths.

Corrections should cite an event page or first-party match record, identify the
year/team/player/card ID affected, and state whether they change participation,
map count, agent class, identity alias, IGL evidence, or asset permission.
Re-run `npm run validate:data` and the dataset test after every correction.
