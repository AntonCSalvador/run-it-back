# Champions data methodology

Review date: 2026-09-05. Five snapshots cover VALORANT Champions 2021-2025,
with 16 team appearances per event and 404 players who appeared in at least one
completed, non-showmatch map. Liquipedia event pages and Riot event guides are
cited in `src/data/sources.json`; automated Liquipedia access returned 403, so
the pinned VCT Reference DuckDB is the reproducible player/map baseline.

## Reproducible audit

`docs/champions-provenance.json` pins the DuckDB retrieval date, SHA-256,
event IDs (449, 1015, 1657, 2097, 2283), SQL, and check command. Run
`PYTHONPATH=<duckdb install> python scripts/verify-champions-extraction.py
PATH/vct.duckdb --check` to verify the hash, 404 card rows, all class counts,
and 1,375 clutch events without a network request. The query is in
`docs/champions-extraction.sql`; the check compares committed artifacts rather
than silently accepting a new daily database.

## Roles and manual review

`src/data/champions/evidence.json` is the working table for every card. Each
row contains map count, agent-class map counts, threshold, suggested/final
roles, source IDs, clutch inputs, coverage, and any review override. Agent
classes are Controller=smokes, Duelist=duelist, Initiator=initiator, and
Sentinel=sentinel. Counts sum to maps played because one selected agent is
recorded per player/map.

A non-Flex role needs at least `max(2, ceil(20% of maps))` selections. Flex is
present exactly when two qualifying non-Flex roles exist. Lakia 2021 is the
sole exception: one observed Initiator map is retained as a cited short-event
review override (`liquipedia-champions-2021-player-information` and
`vct-reference-dataset`). Every multi-role card was checked against this rule;
there are no composition-only overrides.

## Ratings, clutches, and IGLs

Traits are hidden inputs. Firepower uses map rating (65%) plus ACS (35% after
scaling); utility uses assists; survival uses inverse deaths; consistency uses
inverse rating variation. Values are role-normalized continuous percentiles,
with only a small 0-4 bracket-progression adjustment. The game uses its
0.35/0.20/0.15/0.15/0.15 trait weighting.

Clutch wins are the pinned database's `notables` rows whose type is
`clutch_*`, not the nullable `player_map` clutch fields. A card gets a
role-normalized clutch percentile only if every event map has
`performance_available`; otherwise its clutch trait is neutral 50. Evidence
retains the raw wins and per-player coverage.

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
