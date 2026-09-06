# VCT SME review guide

This guide helps a VALORANT Champions Tour (VCT) subject-matter expert review
the Champions 2021-2025 data used by Run It Back. It assumes VCT knowledge,
not development experience. For the complete collection and derivation policy,
read the [data methodology](data-methodology.md).

## Navigate this guide

- [Start a review](#start-a-review)
- [Glossary](#glossary)
- [Keep factual review separate from balance tuning](#keep-factual-review-separate-from-balance-tuning)
- [How data reaches a map roll](#how-data-reaches-a-map-roll)
- [Source-of-truth map](#source-of-truth-map)

## Start a review

You can take any of these routes:

1. Edit locally if you are comfortable working in the repository.
2. Send a change request to the repository owner.
3. Paste the request into Codex and ask it to prepare the change.

For every player or team review, name both the **event year** and the exact
**card ID**. A player name alone is not enough: the same person can have more
than one event card. Include the source or VCT reasoning for a factual change,
and say whether the request is a factual correction or a balance preference.

Before requesting a change, inspect the relevant row in
[evidence.json](../src/data/champions/evidence.json), the event snapshot, and
the [data methodology](data-methodology.md). Do not directly edit generated
role or trait values in a yearly snapshot; they are regenerated from the raw
data and reviewed overlays.

## Glossary

- **Player identity:** the canonical person record, shared across appearances.
  It is different from a **player-event card**, which represents that person
  with one team at one Champions event year.
- **Card ID:** the exact identifier for a player-event card. Use it with the
  event year in every review request.
- **Role tag:** an eligible draft role such as `smokes`, `duelist`,
  `initiator`, `sentinel`, or `flex`. Tags describe algorithmic draft
  eligibility from observed agent classes; they do not necessarily claim one
  fixed, colloquial roster position.
- **Trait:** a simulation input such as firepower, utility, or leadership.
  Traits are generated/editorial inputs, not an objective ranking of a player.
- **IGL:** an in-game leader decision recorded for an event card. It is a
  reviewed leadership decision, separate from the player identity.
- **Snapshot:** one generated runtime file for a Champions year. Snapshots are
  loaded into the dataset the game uses.

## Keep factual review separate from balance tuning

Factual VCT review asks whether the recorded event information is correct:
the event team, player-event card, observed role evidence, a documented role
exception, or an IGL decision. It should point to source evidence and normally
belongs in the raw observations or reviewed overlays.

Balance tuning asks whether the simulator should play differently. Examples
include trait weights, team chemistry, the IGL bonus, stage strength bands, or
the chance that a lineup wins a map. These are subjective product decisions;
they should not be presented as corrections to VCT history. Keep factual and
balance requests separate, even when they concern the same card.

## How data reaches a map roll

The game follows this path:

`raw extraction -> derivation -> generated yearly snapshots -> dataset -> lineup rating -> opponent generation -> map rolls`

1. Pinned raw observations are transformed by [trait and role derivation](../src/data/champions/derivation.ts), using reviewed exceptions where applicable.
2. [The derivation script](../scripts/derive-champions.mts) writes generated fields into the 2021-2025 snapshots and the audit evidence view.
3. [The dataset entry point](../src/data/champions/index.ts) combines those yearly snapshots into the runtime dataset.
4. [Rating](../src/features/game/rating.ts) calculates each lineup's strength, then computes the user's map-win probability from user strength minus opponent strength.
5. [Opponent generation](../src/features/game/opponents.ts) builds stage-banded opposing lineups.
6. [Tournament simulation](../src/features/game/tournament.ts) rolls maps, series, and advancement from those inputs.

Generated yearly role and trait fields are outputs of this flow, not
source-of-truth edit points. After a factual change, regeneration and
[dataset validation](../src/data/champions/validation.ts) confirm that the
snapshots still agree with their inputs.

## Source-of-truth map

Overlay or checksum-protected data changes require coordinated review with the
repository owner or Codex. Do not change a checksum merely to make validation
pass; the underlying factual change, its source, and its generated output must
be reviewed together.

| File | Purpose and edit guidance |
| --- | --- |
| [raw-extraction.json](../src/data/champions/raw-extraction.json) | Pinned source observations. Do not casually edit it; use the documented extraction and review process. |
| [reviewed-overlays.json](../src/data/champions/reviewed-overlays.json) | Reviewed teams, role exceptions, and IGL decisions. Propose factual changes with evidence; make overlay/checksum changes only through coordinated owner/Codex review. |
| [evidence.json](../src/data/champions/evidence.json) | Generated audit view. Inspect it, but do not edit it directly. |
| [2021.json](../src/data/champions/2021.json) through [2025.json](../src/data/champions/2025.json) | Generated runtime snapshots. Inspect them, but do not edit derived role or trait fields; regenerate them after approved input changes. |
| [derivation.ts](../src/data/champions/derivation.ts) | Global role and trait derivation rules. Request an owner/Codex change only when the global algorithm needs revision, then regenerate and validate the snapshots. |
| [rating.ts](../src/features/game/rating.ts) | Trait weights, chemistry, IGL bonus, and map-win probability. Treat edits as balance tuning; ask the owner or Codex to make and test them. |
| [opponents.ts](../src/features/game/opponents.ts) | Stage bands and opponent construction. Treat edits as balance tuning; ask the owner or Codex to make and test them. |
| [tournament.ts](../src/features/game/tournament.ts) | Series, advancement, maps, and displayed scores. Ask the owner or Codex to change these game rules and test the resulting behavior. |
| [draft.ts](../src/features/game/draft.ts) | Team offers, rerolls, card uniqueness, and role assignment. Ask the owner or Codex to change these draft rules and test the resulting behavior. |
| [validation.ts](../src/data/champions/validation.ts) | Integrity rules and checksums for the Champions data. Do not weaken or update checksums alone; use coordinated owner/Codex review for any validation change. |
| [player-picker.tsx](../src/features/game/components/player-picker.tsx) and [tournament-view.tsx](../src/features/game/components/tournament-view.tsx) | User-facing displayed role tags and tournament scores; calculated map probabilities are not currently displayed as percentages. Ask the owner or Codex to make and test display changes. |

Use [the data validation script](../scripts/validate-data.mts) after a data
change. It loads the dataset and runs the integrity checks before the game uses
the information.
