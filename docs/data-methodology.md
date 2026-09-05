# Champions data methodology

Review date: 2026-09-05. Five snapshots cover VALORANT Champions 2021-2025,
with 16 team appearances per event and 404 player-event cards representing 239
deduplicated identities who appeared in at least one completed, non-showmatch
map (4,150 player-map rows). Liquipedia event pages and Riot event guides are
cited in `src/data/sources.json`; automated Liquipedia access returned 403, so
the pinned VCT Reference DuckDB is the reproducible player/map baseline.

## Reproducible audit

`docs/champions-provenance.json` pins the DuckDB retrieval date, SHA-256,
event IDs (449, 1015, 1657, 2097, 2283), SQL, and artifact checksums.
The executable extractor is `scripts/verify-champions-extraction.py`; the SQL
document is a readable query reference. Development audit dependencies are
Python 3.11+ with `duckdb==1.5.5` (`python -m pip install duckdb==1.5.5`) and
the project's Node dependencies (`npm ci`). These Python dependencies and the
database are not needed for ordinary offline builds.

Run `npm run audit:data -- PATH/vct.duckdb --check`. The command first checks
the database SHA-256, then extracts all participation rows, player IDs/names,
teams, map counts, team-index assignments, selected agents, raw metric values,
performance coverage, clutch wins, and match stage/round/final-score inputs.
It compares the exact UTF-8 raw artifact, then runs the same offline semantic
validator used by `npm run validate:data` and every build. This recomputes all
404 cards' thresholds, suggested/final roles, reviewed overrides, and all six
traits. It rejects plausible edits to evidence or ratings, not just bad ranges.
The pinned daily DB is available at the provenance URL; if that URL later
serves different bytes, the audit deliberately fails. Preserve the original
SHA-matching DB outside the repository; never commit its large binary.

`src/data/champions/raw-extraction.json` contains source observations, not
copied evidence or traits. Each card's map tuple is `[matchId, gameId,
teamIndex, agent, performanceAvailable, rating, ACS, assists, deaths]`.
Its raw-byte checksum is recorded in provenance; `.gitattributes` preserves
LF. Offline validation also pins the SHA-256 of its `JSON.stringify` encoding
(UTF-8, no newline) so edits to raw inputs cannot silently legitimize edits
to evidence. `reviewed-overlays.json` is separately checksum-pinned: 80
sourced event team names/IDs/abbreviations, one role exception, six leadership
decisions. No raw metrics or trait numbers are manually overlaid.

For deliberate regeneration, `npm run audit:data -- PATH/vct.duckdb --extract`
rewrites only the raw artifact after checking the DB hash. `npm run derive:data`
then mechanically regenerates card roles/traits and evidence using the pure
`src/data/champions/derivation.ts` transform. Re-run the complete audit and
review any checksum or overlay change explicitly. Repeated derivation is
byte-stable. The normal build performs no downloads or database access.

## Roles and manual review

`src/data/champions/evidence.json` is the working table for every card. Each
row contains map count, agent-class map counts, threshold, suggested/final
roles, source IDs, clutch inputs, exact player-card performance coverage,
and any review override. Agent
classes are Controller=smokes, Duelist=duelist, Initiator=initiator, and
Sentinel=sentinel. Counts sum to maps played because one selected agent is
recorded per player/map.

A non-Flex role needs at least `max(2, ceil(20% of maps))` selections. Flex is
present exactly when at least two qualifying non-Flex roles exist. Roles are
ordered smokes, duelist, initiator, sentinel, then Flex. Lakia 2021 is the
sole exception: one observed Initiator map is retained as a cited short-event
review override (`liquipedia-champions-2021-player-information` and
`vct-reference-dataset`). Every multi-role card was checked against this rule;
there are no composition-only overrides. Every non-null override must match
the reviewed overlay exactly, change suggested roles, name only observed
agent classes, and have a nonblank reason and existing nonempty source IDs.
An override on an already identical, qualifying role set is rejected.

## Ratings, clutches, and IGLs

Traits are hidden, editorial simulation inputs, not objective player grades.
All five non-leadership traits use this exact derivation:

1. Coverage is **per player-event card**, not event-wide. Count the card's
   maps with `performance_available=true`. If this differs from maps played,
   all five performance traits are neutral 50 and excluded from the respective
   reference cohorts. If coverage is complete but a required numeric metric
   is null on any map, only traits requiring that metric are neutral 50.
   No missing metric is imputed or replaced with zero. Thus complete-coverage
   cards in 2021-2023 legitimately have non-50 traits even when other cards in
   that event have incomplete coverage. Leadership is independent of coverage.
2. For a fully observed metric, calculate these raw scores with equal map
   weights: firepower = `0.65 * mean(rating_all) + 0.35 * mean(acs_all) / 200`;
   utility = `mean(assists_all)`; survival = `-mean(deaths_all)`;
   consistency = `-sqrt(mean((rating_all - mean(rating_all))^2))` (population
   standard deviation, one map gives zero); clutch = `clutchWins / mapsPlayed`.
   Clutch wins count `notables` rows with `stat_type LIKE 'clutch_%'` joined
   to completed, non-showmatch event matches and verified player-map
   participation. They do not use nullable `player_map` clutch columns.
   The artifact has 1,375 such events; Ade 2021 has exactly two in four maps.
3. Quantize each raw score to nine decimal places using
   `Math.round(score * 1e9) / 1e9` before comparing scores. For each eligible
   non-Flex role, use the cohort of all cards in the **same year** eligible
   for that role with an available score for that trait, including the card
   itself. Midrank percentile is `100 * (countLess + countEqual / 2) / N`.
   Ties share rank; a singleton/all-equal cohort gives 50. Multi-role cards
   appear in each of their eligible cohorts and receive the equal-weight
   mean of their non-Flex role percentiles. Flex is not a separate cohort.
4. Add a small team progression bonus, taking the maximum across recorded
   matches: group-only=0; any Playoffs round=1; Semifinals, Upper Semifinals,
   Upper Final, Lower Round 3, or Lower Final=2; Grand Final loser=3;
   Grand Final winner=4 (from team index and final series scores). This is
   a bracket-progression adjustment, not an inferred exact placement for
   tied lower finishes. It is applied to each available performance trait,
   never to a missing/neutral metric or leadership.
5. Round the percentile mean plus bonus with JavaScript `Math.round`
   (nearest integer; exact half toward positive infinity), then clamp to
   `[0,100]`. Calculations use IEEE-754 double precision with no intermediate
   rounding except the explicit nine-decimal score quantization.

Example audit golden: Ade 2021 has mean rating 0.56, mean ACS 101.75,
assists 6.25, deaths 15.75, rating population variance 0.00855, and clutch
score 0.5. His final traits are firepower=3, utility=48, survival=23,
clutch=70, consistency=98, leadership=50. These are regenerated values,
not hand-authored exceptions. The game retains its separate
0.35/0.20/0.15/0.15/0.15 trait weighting and probabilistic match simulation.

Leadership is categorical, not derived from award points: a documented event
IGL gets 75, unknown leadership stays false/50. The cited 2023 cards are
Boaster (Fnatic), d4v41 (Paper Rex), FiNESSE (NRG), Redgar (Liquid), saadhak
(LOUD), and stax (DRX), all using `riot-vct-2023-awards`.

## Identities, names, assets, and corrections

Player identity uses the VCT Reference stable ID; card IDs use the normalized
event display handle, team appearance, and year. Handles are Unicode-normalized,
trimmed, control-safe, and case-preserving for display; punctuation/whitespace
are slugged only for card IDs. Canonical identity remains separate from event
display (for example TenZ has distinct 2021 and 2024 Sentinels cards). A handle
collision is never automatically merged; it needs a sourced correction. Team
names use event-time DRX and Bilibili Gaming rather than later sponsor labels.

All portraits/logos are null until a local asset has a stable `/assets/...`
path and an asset source containing URL, retrieval date, credit, and license.
Corrections must name the affected card/identity, cite a replacement source,
update its evidence row, and rerun the validator and extraction check.
