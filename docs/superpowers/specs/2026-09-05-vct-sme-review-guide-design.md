# VCT SME Review Guide Design

Date: 2026-09-05

## Purpose

Create a beginner-friendly maintainer document for a VCT subject-matter expert
who may work locally, send requested changes to the repository owner, or ask
Codex to implement them. The guide must let the SME audit player classifications,
ratings, and simulation rules without requiring them to understand the entire
TypeScript application.

## Audience and responsibilities

The SME has strong VCT knowledge and beginner-level development experience. The
guide will treat VCT facts and game-balance decisions as separate responsibilities:

- The SME verifies event rosters, player role tags, IGL status, and whether the
  statistical model reflects VCT performance appropriately.
- The repository owner or Codex handles changes that affect generated-data
  validation, checksums, schemas, or several modules at once.
- The SME may make small local edits when the guide labels them safe and provides
  an exact validation procedure.

## Deliverable

Add `docs/vct-sme-review-guide.md`. It will use repository-relative Markdown
links so every referenced source file opens correctly both in a local Markdown
viewer and on GitHub's `main` branch.

The guide will contain:

1. A plain-language overview of the full data and simulation flow.
2. A glossary distinguishing player identity, player-event card, agent class,
   eligible role tag, Flex, historical IGL, trait, lineup strength, map chance,
   and series chance.
3. A file map labeling every file as source input, reviewed override, generated
   output, gameplay configuration, validator, UI, test, or methodology reference.
4. A detailed role-tag audit workflow.
5. A detailed trait/statistical-model audit workflow.
6. A detailed lineup, opponent, and win-rate audit workflow.
7. Safe local-edit and report-only workflows.
8. Fill-in templates for player-specific and global-algorithm change requests.
9. Validation commands and an explanation of common failures.

## Role-tag workflow

The role section will be the primary worked example. It will explain that tags
come from event-specific agent selections, not a broad roster label such as
"the team's initiator." It will show how two teammates can be incorrectly or
over-broadly tagged if the threshold or agent-class mapping does not reflect
their actual roles.

The guide will use the crashies/Victor concern as a review scenario without
asserting a correction before the SME verifies the relevant event card and map
data. The SME will be instructed to record:

- Exact card ID, player handle, team, and event year.
- Current tags and proposed tags.
- Agent/map evidence supporting each tag.
- Whether the issue is one card or evidence of a faulty global threshold.
- Supporting VCT source links and a short rationale.

The guide will distinguish three remedies:

- Correct raw or mapped agent evidence when the source data is factually wrong.
- Add a reviewed card-specific override for a genuine exceptional case.
- Change the global role threshold only when the existing rule is systematically
  wrong across many cards.

It will warn that current overrides are checksum-pinned and deliberately reject
unsupported roles, so beginner users should normally submit the completed
change template instead of modifying checksum or validator code themselves.

## Player ratings and algorithm review

The guide will reproduce the current raw trait formulas, percentile grouping,
missing-data behavior, progression bonuses, lineup weights, chemistry bonus,
and IGL adjustment. For every setting it will identify:

- What the setting means in VCT terms.
- The exact source file and constant or expression.
- The expected effect of raising or lowering it.
- Whether regeneration is required.
- Which tests or documentation need review afterward.

Individual factual corrections will be separated from subjective balance
overrides. The guide will explain that direct edits to yearly snapshot traits or
roles are overwritten by derivation and rejected by validation. It will recommend
an explicit balance-override layer as future work if frequent manual tuning is
desired, while documenting the current supported workflow accurately.

## Win-rate explanation

The simulation section will explain the strength-delta logistic curve, its
divisor, minimum and maximum map probability, BO3/BO5 aggregation, fixed stage
opponent bands, seeded randomness, chemistry, and IGL effects. A small table
will demonstrate how changing each value changes gameplay.

It will state clearly that displayed map scores are generated after the winner
and do not affect the result. It will also identify which values are factual
modeling judgments and which are purely game-design choices.

## SME workflows

### Report-only workflow

The default path will ask the SME to copy a structured template, complete every
field they can verify, cite sources, and send it to the owner or Codex. Missing
technical details will not prevent the SME from reporting a factual issue.

### Local workflow

The guide will show how to create a branch, locate a card by ID or handle with
`rg`, inspect evidence and raw observations, make only the edits permitted by
the relevant section, run derivation when applicable, and execute focused and
full validation. It will tell the SME to stop and report the error rather than
disable validation or update a checksum merely to make a check pass.

## Safety and accuracy rules

- Never edit generated yearly roles or traits as the source of truth.
- Never change pinned raw evidence solely to produce a preferred rating.
- Never update a checksum without reviewing the underlying data change.
- Cite the event year because one person can have several historical cards.
- Separate "factually incorrect" from "I would balance this differently."
- Preserve reproducibility: the same source data and rules must regenerate the
  same cards.
- Run the documented checks before handing off a local change.

## Acceptance criteria

The completed guide is successful when a beginner SME can:

1. Find the current tags and traits for a specific player-event card.
2. Explain why those tags were assigned from the evidence row.
3. Report a crashies/Victor-style role overlap with the exact year and evidence.
4. Identify whether a proposed change is player-specific or algorithm-wide.
5. Predict the direction of a win-rate change before requesting it.
6. Avoid editing generated files or bypassing validation.
7. Send the owner or Codex a complete, actionable change request.

