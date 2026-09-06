# Player-First Documentation Design

**Date:** 2026-09-05
**Status:** Approved

## Goal

Replace the short developer-oriented README with a spoiler-light entry point for
players, while moving contributor and release operations guidance into documents
written for those audiences.

## Audience and document structure

### `README.md` — players first

The repository landing page should help a player understand the fantasy without
exposing hidden simulation details. It will contain:

- a concise, unofficial-project disclaimer and links to both live deployments;
- a spoiler-light description of Daily and Free Play;
- the visible draft loop: build five event-specific roles, choose an IGL, and use
  up to three team-offer rerolls;
- a short explanation of tournament progression without rating formulas,
  opponent scaling rules, probabilities, or deterministic seed internals;
- browser-storage and privacy expectations, including how clearing site data
  affects saved results;
- a short player FAQ and links to contributor/maintainer documentation;
- compact credits, asset policy, and the security boundary required before any
  competitive or trusted-score feature is introduced.

The README must not reveal hidden ratings, chemistry formulas, simulation odds,
generated-opponent construction, or detailed data derivation.

### `CONTRIBUTING.md` — contributors

The conventional root-level contributor guide will contain:

- prerequisites and local installation;
- the main development, validation, unit, end-to-end, data, static-build, and
  smoke-test commands, each described accurately from `package.json`;
- a concise architecture map and static-export constraints;
- product invariants contributors must preserve;
- data provenance and third-party asset requirements;
- test-driven change expectations, platform-specific visual snapshot handling,
  and pull-request readiness guidance.

### `docs/RELEASING.md` — maintainers

The maintainer runbook will explicitly distinguish deployment triggers:

- pull requests run CI and may receive Vercel preview deployments;
- pushes to `main` start CI, GitHub Pages deployment, and a Vercel production
  deployment through the connected Git integration;
- manual Pages and CI workflow dispatches are operational tools;
- Git tags are version markers and do not independently deploy under the current
  configuration.

It will also cover preflight verification, merge/release sequencing, semantic
version tags, deployment monitoring, smoke tests for both public URLs, rollback
options, static-export limitations, visual-baseline maintenance, and the client
security boundary.

## Accuracy sources

Documentation claims will be checked against:

- `package.json` for commands;
- `.github/workflows/ci.yml` and `.github/workflows/pages.yml` for GitHub trigger
  behavior;
- `next.config.ts` for export and Pages base-path behavior;
- the implemented game flow and storage modules for player-visible behavior;
- the verified Vercel Git connection for automatic production and preview
  deployments.

Vercel behavior will be described as repository configuration, while GitHub
workflow behavior will be described from version-controlled files.

## Validation

The change is documentation-only. Validation will include:

- checking all repository-relative links and documented script names;
- searching for the required unofficial-project, asset-policy, and client-scoring
  warnings;
- running `npm run verify` from the isolated worktree;
- reviewing the final diff for player spoilers and operational ambiguity.
