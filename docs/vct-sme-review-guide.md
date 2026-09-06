# VCT SME review guide

This guide helps a VALORANT Champions Tour (VCT) subject-matter expert review
the Champions 2021-2025 data used by Run It Back. It assumes VCT knowledge,
not development experience. For the complete collection and derivation policy,
read the [data methodology](data-methodology.md).

## Navigate this guide

- [Start a review](#start-a-review)
- [Glossary](#glossary)
- [Keep factual review separate from balance tuning](#keep-factual-review-separate-from-balance-tuning)
- [Review player role tags](#review-player-role-tags)
- [Player tag correction](#player-tag-correction)
- [Review traits and lineup strength](#review-traits-and-lineup-strength)
- [Tune opponents and map outcomes](#tune-opponents-and-map-outcomes)
- [Algorithm change](#algorithm-change)
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

## Review traits and lineup strength

Traits turn recorded event performance into game inputs. They are not a claim
that one player is universally better than another, especially across different
years, events, and roles. Start a trait review by identifying the exact
card/year, the source data that may be wrong, and whether the request is about
**VCT accuracy** (the inputs or the derivation model) or **game balance** (how
the game uses a correct trait).

### Trait derivation: factual/statistical modeling

The current formulas live in [derivation.ts](../src/data/champions/derivation.ts).
They first calculate a raw score for each player-event card, then compare that
score only with eligible cards from the **same event year** and role. This
avoids treating a 2021 number as directly comparable with a 2025 number.

| Trait | Current raw formula | What an SME should review |
| --- | --- | --- |
| Firepower | `0.65 * mean(rating) + 0.35 * mean(ACS) / 200` | Are the recorded ratings and ACS values complete and credible for this card? Raising either component raises the raw score; changing `0.65`, `0.35`, or `/ 200` changes the statistical model for every card. |
| Utility | `mean(assists)` | Are assists complete and represented appropriately? More assists raise the raw score. |
| Survival | `-mean(deaths)` | Are deaths complete? Fewer deaths produce a higher raw score because of the leading minus sign. |
| Clutch | `clutchWins / mapsPlayed` | Are the counted clutches and map count correct? More clutch wins per map raise the score. |
| Consistency | `-sqrt(mean((rating - mean(rating))^2))` | Are all map ratings present? Less spread in map ratings produces a higher score because of the leading minus sign. |
| Leadership | `75` for a reviewed historical IGL, otherwise `50` | Is the event-card IGL decision evidenced? This is an editorial event fact, not a performance percentile. |

The formulas and their exact weights, divisor, and signs are in
[the `scores` expression in derivation.ts](../src/data/champions/derivation.ts).
Changing a map statistic or an IGL decision is a factual/data review; changing
a formula, weight, divisor, cohort, or fallback is a statistical-modeling
decision. Either kind of derivation change requires `npm run derive:data`,
then `npm run validate:data`, updates to
[derivation tests](../src/data/champions/derivation.test.ts), and a review of
[the methodology](data-methodology.md). Update
[validator tests](../src/data/champions/validation.test.ts) too if the data
shape, evidence, or integrity rule changes. Never edit the generated yearly
snapshots or [evidence.json](../src/data/champions/evidence.json) to change a
trait: derivation overwrites them and validation can reject them.

#### Coverage, cohorts, and rounding

For a card to receive a performance-derived firepower, utility, survival,
clutch, or consistency score, performance data must be available for **every**
map and the formula's required numeric fields must be finite. The coverage rule
and `performanceAvailableMaps` count are in
[derivation.ts](../src/data/champions/derivation.ts). If coverage is incomplete,
the corresponding trait is set to the neutral fallback **50**, not inferred
from a partial sample. Raising or lowering this fallback affects only cards
with missing required performance data; changing the all-maps rule changes
which cards use it. Both are derivation-model changes, so regenerate, validate,
update derivation/validation tests, and review the methodology.

Before percentile comparisons, raw scores are quantized to **nine decimal
places** (`Math.round(value * 1e9) / 1e9`) in
[derivation.ts](../src/data/champions/derivation.ts). Equal quantized values
share the midpoint of their tied percentile positions; the percentile formula
is `100 * (count below + count equal / 2) / cohort size`. This makes ties
repeatable rather than dependent on tiny floating-point differences. Increasing
the precision makes fewer scores tie; decreasing it makes more scores tie.
This is a statistical-modeling adjustment and follows the same
regenerate/validate/tests/methodology path.

Each non-leadership trait is the mean of the card's percentiles across its
eligible non-`flex` roles, then its progression bonus is added, rounded to an
integer, and clamped to **0-100**. The role cohort is same-year cards eligible
for that role with a non-missing score; multi-role cards receive equal weight
from every qualifying non-Flex role. `flex` never creates its own percentile
cohort. This is implemented in [the percentile loop in
derivation.ts](../src/data/champions/derivation.ts). A change to eligible roles
can therefore alter a card's trait cohort, but assigned roles only validate
draft eligibility: there is **no direct role-versus-role matchup modifier** in
[rating.ts](../src/features/game/rating.ts).

Progression is a small editorial adjustment from recorded playoff rounds in
[the `progression` function in derivation.ts](../src/data/champions/derivation.ts):
any Playoffs appearance is **+1**; `Semifinals`, `Upper Semifinals`, `Upper
Final`, `Lower Round 3`, or `Lower Final` is **+2**; a Grand Final loss is
**+3**; and a Grand Final win is **+4**. Raising or lowering one of these
levels changes the final trait of every affected event-card and should be
treated as a statistical-modeling decision, with regeneration, data
validation, derivation tests, and methodology review.

### Trait review questions

For each requested card, answer these questions before asking for a change:

- Is the exact card ID and event year correct, and are all maps present?
- Are rating, ACS, assists, deaths, and clutch totals complete for every map?
- If a trait is 50, is that the intentional missing-data fallback rather than a
  claim of average play?
- Is the card's eligible-role evidence correct, including any reviewed role
  exception that determines its same-year percentile cohorts?
- If the card is multi-role, should each non-Flex role continue to have equal
  percentile weight?
- Did the team reach the recorded playoff level used by the +1/+2/+3/+4
  progression rule?
- Is a 75 leadership value supported by a reviewed historical-IGL decision?

A direct one-player trait edit in a yearly JSON snapshot is not an accepted
remedy: it is regenerated, can be rejected by validation, and will be
overwritten. Submit the evidence and requested outcome instead. A future
balance-override layer could support intentional per-card adjustments, but no
such layer exists now.

### Lineup strength: game-balance use of traits

Once traits are generated, the game uses the following balance formula in
[rating.ts](../src/features/game/rating.ts):

```text
card baseline = .35 firepower + .20 utility + .15 survival + .15 clutch + .15 consistency

lineup strength = average five baselines
                + 2 per same-team/year pair, capped at 8
                + (selected IGL leadership - 50) * .08
```

The five baseline weights are `0.35`, `0.20`, `0.15`, `0.15`, and `0.15` in
[`TRAIT_WEIGHTS`](../src/features/game/rating.ts). Raising a weight makes that
trait matter more to every card baseline; lowering it makes it matter less.
The weights currently total 1, so changing one without compensating elsewhere
also changes the baseline scale. This is game balance, not a correction to VCT
data: it does **not** need `npm run derive:data`, but does need focused
[rating tests](../src/features/game/rating.test.ts) and an update to this guide
or other player-facing documentation when the explanation changes.

For chemistry, each pair of selected cards sharing both `teamId` and `year`
adds **2**, and the total is capped at **8**, as implemented in
[the chemistry loop in rating.ts](../src/features/game/rating.ts). Increasing
the pair bonus rewards historical team cores more; lowering it weakens that
reward. Raising the cap lets more shared-team pairs matter; lowering it limits
their combined effect. These are balance constants, so no data regeneration is
needed; update focused rating tests and this guide if behavior changes.

Leadership is **75** for an evidenced historical IGL and neutral **50** for
every other card in [derivation.ts](../src/data/champions/derivation.ts). The
selected IGL adds `(leadership - 50) * 0.08` in
[rating.ts](../src/features/game/rating.ts), so selecting a historical IGL
currently gives a practical **+2** lineup-strength bonus: `(75 - 50) * .08`.
Changing who is an IGL is a factual overlay/derivation review and needs
regeneration, validation, derivation/validation tests, and methodology review.
Changing `50`, `75`, or `.08` changes the balance treatment; it needs focused
rating tests and documentation, but not data regeneration unless the
leadership derivation itself changes.

## Tune opponents and map outcomes

Opponent selection and tournament presentation are balance controls. They do
not revise recorded VCT history and do not need `npm run derive:data`. Changes
belong in the linked game files, need focused tests, and should update this
guide or other player-facing documentation when the player-visible behavior
changes.

### Opponent construction

[opponents.ts](../src/features/game/opponents.ts) tries at most **250** legal
lineups (`OPPONENT_ATTEMPT_LIMIT = 250`) for each stage. It excludes the exact
cards the user selected, requires the five draft roles and distinct cards, and
sets the opponent IGL to a randomly selected card among those with the highest
leadership in that opponent lineup. Raising 250 searches more candidate
lineups before accepting the closest fallback; lowering it makes a fallback
more likely. Changing the exclusion, role, uniqueness, or highest-leadership
IGL rule changes opponent construction. None require data regeneration, but
each needs focused [opponent tests](../src/features/game/opponents.test.ts) and
an updated explanation if player-visible behavior changes.

The fixed, not user-scaled, strength targets in
[`STAGE_TARGETS`](../src/features/game/opponents.ts) are:

| Stage | Target lineup strength |
| --- | --- |
| Group | 50-62 |
| Quarterfinal | 58-70 |
| Semifinal | 66-78 |
| Final | 74-90 |

Raising either end of a band tends to create stronger opponents at that stage;
lowering it tends to create weaker ones. Widening a band accepts more generated
lineups, while narrowing it makes the 250-attempt fallback more relevant.
These targets are deliberately not scaled to user strength, so a weaker or
stronger user lineup faces the same stage bands. Treat every target edit as
balance tuning: update opponent tests and this guide, with no regeneration.

### Map and series odds

For each map, [the map-roll expression in rating.ts](../src/features/game/rating.ts)
is exactly:

```text
clamp(.08,.92, 1/(1+exp(-(userStrength-opponentStrength)/12)))
```

The actual `Math.min(0.92, Math.max(0.08, raw))` code supplies the `.08` and
`.92` caps. A smaller **12** makes a strength gap more decisive; a larger 12
makes outcomes more random. Raising the `.08` floor creates more upsets by
underdogs; lowering it reduces that floor. Raising the `.92` ceiling makes
favorites more dominant; lowering it limits favorite certainty. All four
numbers are balance constants in [rating.ts](../src/features/game/rating.ts):
change them with focused [rating tests](../src/features/game/rating.test.ts)
and documentation updates, not data regeneration.

The table below applies that exact map formula. BO3 and BO5 values assume
identical, independent per-map probability `p` and a first-to-two or
first-to-three series, respectively.

| User strength minus opponent strength | Map win | BO3 win | BO5 win |
| ---: | ---: | ---: | ---: |
| -12 | 26.9% | 17.8% | 12.4% |
| 0 | 50.0% | 50.0% | 50.0% |
| +6 | 62.2% | 68.0% | 72.1% |
| +12 | 73.1% | 82.2% | 87.6% |

[tournament.ts](../src/features/game/tournament.ts) plays a **BO3** at group,
quarterfinal, and semifinal stages (first to two maps), then a **BO5** final
(first to three maps). Changing the stage series lengths or required wins is a
tournament-balance change: update focused
[tournament tests](../src/features/game/tournament.test.ts) and documentation,
with no data regeneration.

Scores are generated only after the map winner is chosen. In
[the `scoreMap` expression in tournament.ts](../src/features/game/tournament.ts),
the **12%** (`rng.next() < 0.12`) overtime branch produces 14-12, 15-13, or
16-14; otherwise the winner gets 13 and the losing score is based partly on
the absolute strength delta. Therefore scores never change the already rolled
winner. Raising 12% makes displayed overtime more common; lowering it makes
regulation scores more common. This is presentation/balance tuning, not data
work: update tournament tests and any displayed-score documentation without
running derivation.

The regulation losing-score expression in the same linked function is
`3 + floor(max(0, 1 - min(abs(delta), 30) / 30) * 4)`, followed by a random
value below **12**. The **3** is the minimum losing score for a very large
strength gap: raising it makes such displayed losses less lopsided. The **4**
adds up to four points for an even matchup: raising it makes close-match scores
look closer. The two **30** values set the strength-delta distance over which
that close-score adjustment falls away: raising them keeps close-looking scores
at larger gaps. The exclusive **12** produces regulation losing scores through
11; changing it also requires the matching score validator and focused
tournament tests to be updated. These are presentation constants in
[tournament.ts](../src/features/game/tournament.ts), not data inputs, so they
need no regeneration but do need documentation and focused tests.

## Algorithm change

Use this exact template for a request that changes a global derivation model or
a game-balance rule:

```markdown
## Algorithm change
- Setting or formula:
- Current behavior:
- Proposed behavior:
- Is this VCT accuracy or game balance?
- Why current behavior is inaccurate:
- Example players/series affected:
- Expected effect on weak, average, strong lineups:
- Supporting URLs or calculations:
```

For a VCT-accuracy or statistical-modeling request, include the event evidence
and expect derivation regeneration, data validation, derivation tests, and
methodology review. For a rating, opponent, or tournament-balance request,
include calculations or series examples and expect focused game tests plus the
relevant documentation update. The local workflow guide can provide the
repository commands when an owner or Codex is implementing an approved change.

## Review player role tags

Role tags are based on the agents selected on the maps recorded for one
player-event card. The [role derivation](../src/data/champions/derivation.ts)
maps each agent to a class, counts the classes, and assigns every non-Flex
class that reaches `max(2, ceil(20% of maps))`. When two or more non-Flex
classes qualify, it also assigns `flex`. This is an eligibility rule for the
game, not a declaration of a player's single primary roster role.

The **2-map** floor and **20%** share are derivation thresholds in the linked
expression. Raising either makes secondary eligibility rarer; lowering either
makes it more common. Changing the two-qualified-role rule similarly changes
how often `flex` is assigned. These are global VCT modeling rules, not
per-card fixes: regenerate with `npm run derive:data`, validate with
`npm run validate:data`, update the derivation and validator tests, and review
the [data methodology](data-methodology.md). They do not create a role matchup
bonus; role tags only decide whether a card can fill a draft slot.

### Find the exact card

From the repository root, these PowerShell-compatible searches are safe first
steps when an SME knows a player handle but not the card ID:

```powershell
rg -n -i 'crashies|victor' src/data/champions/evidence.json
rg -n -i 'crashies|victor' src/data/champions -g '20*.json'
```

The first command finds generated audit rows; the second searches the yearly
snapshots. Broad results can include different teams and event years, so narrow
them to one exact player-event card and year before drawing a conclusion. Then
print the complete matching audit record, rather than relying on lines around a
search result:

```powershell
$records = Get-Content -Raw 'src/data/champions/evidence.json' | ConvertFrom-Json
$record = for ($i = 0; $i -lt $records.Count; $i++) { if ($records[$i].cardId -eq 'crashies-optic-gaming-2022') { $records[$i] } }
$record | ConvertTo-Json -Depth 10
```

Use [evidence.json](../src/data/champions/evidence.json) for the factual
`mapsPlayed`, `agentClassMaps`, `threshold`, suggested roles, final roles, and
any override. If the class totals need explanation, inspect the matching card
in [raw-extraction.json](../src/data/champions/raw-extraction.json): each map
records the selected agent. Treat the counts and agents as evidence; whether
those tags best express an intended VCT role model is a separate interpretation.

### Verified 2022 example: OpTic Gaming

These audit facts illustrate the rule without deciding what an SME's final
judgment should be:

- `crashies-optic-gaming-2022` has 23 Initiator maps, a threshold of 5, and the
  `initiator` tag. The raw map entries are Sova (10), Skye (5), KAY/O (3), and
  Fade (5).
- `victor-optic-gaming-2022` has 16 Duelist maps and 7 Initiator maps, a
  threshold of 5, and the `duelist`, `initiator`, and `flex` tags. The raw
  entries behind the Duelist count are Jett (4), Raze (5), Neon (4), and
  Phoenix (3); KAY/O accounts for the seven Initiator maps.

Both cards receive Initiator eligibility because their Initiator counts meet
`max(2, ceil(20% of maps))`: `max(2, ceil(20% of 23)) = 5`. It is not because
the system says crashies and Victor held the same primary roster role. An SME
may use the evidence to recommend a different model or a documented exception,
but the evidence alone does not make that decision.

### Choose the remedy

- **Wrong map or agent counts:** make a factual source-data correction. Supply
  the event evidence showing which recorded map or agent is wrong; regenerate
  the derived outputs after the source correction.
- **Right counts, but the tag has the wrong meaning:** request an
  algorithm/model change. Examples include defining a primary role, requiring a
  higher secondary-role threshold, or adopting a primary/secondary role model.
  This is not a correction to the recorded map history.
- **A genuine one-event-card exception:** request a reviewed card-specific
  override. It needs VCT reasoning and sources for why this card should differ
  from the global rule.

## Player tag correction

- Card ID:
- Player / team / event year:
- Current tags:
- Proposed tags:
- Current agent-class map counts:
- Are those counts correct? Yes / No / Unsure
- Is this factual or a balance/modeling change?
- VCT reasoning:
- Supporting URLs:
- Does the same problem affect other cards?

Technical fields may be blank while an SME is gathering them, but the
card/year, proposed result, VCT reasoning, and supporting sources are required
before review.

### Implementation ownership

- **Global agent-class mapping or threshold:** edit
  [derivation.ts](../src/data/champions/derivation.ts), regenerate the outputs,
  and update both [derivation tests](../src/data/champions/derivation.test.ts)
  and [validator tests](../src/data/champions/validation.test.ts). Coordinate
  with the repository owner or Codex to change the matching threshold,
  suggested-role, and Flex rules in [validation.ts](../src/data/champions/validation.ts),
  then update the [methodology](data-methodology.md) and validate the dataset.
  Keep the validator aligned with the derivation; do not bypass it.
- **Individual exception:** add a reviewed, evidenced entry to
  [reviewed-overlays.json](../src/data/champions/reviewed-overlays.json).
  Checksum and validator coordination requires the repository owner or Codex.
- **Direct `eligibleRoles` edits in a yearly JSON snapshot:** do not use these
  as a fix. They are temporary, rejected by validation, and overwritten by
  derivation.

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
