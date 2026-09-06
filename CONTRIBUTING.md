# Contributing to Run It Back

Thanks for helping improve Run It Back. This guide covers local development,
tests, data changes, and pull-request expectations. Deployment and versioning
belong in the [maintainer release runbook](docs/RELEASING.md).

## Prerequisites

- Node.js 24, matching GitHub Actions
- npm, using the committed `package-lock.json`
- Python 3.11 or newer on `PATH` as `python` for `npm run verify`
- Chromium installed through Playwright for end-to-end tests

The external VCT Reference database and DuckDB package are required only for a
full data-provenance audit, not ordinary development or builds.

## Local setup

```sh
git clone https://github.com/AntonCSalvador/run-it-back.git
cd run-it-back
npm ci
npx playwright install chromium
npm run dev
```

Open <http://localhost:3000>. Use `npm ci`, not `npm install`, when you want the
exact locked dependency tree used by CI.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Next.js development server. |
| `npm run build` | Validate the dataset and create the static export in `out/`. |
| `npm run lint` | Run ESLint across the repository. |
| `npm run typecheck` | Run TypeScript without emitting files. |
| `npm test` | Run the Vitest suite once. |
| `npm run test:watch` | Run Vitest in watch mode. |
| `npm run test:audit-cli` | Run the Python audit CLI regression tests. |
| `npm run test:e2e` | Build, serve, and run the Playwright suite. |
| `npm run test:e2e:update` | Update visual snapshots for the current operating system. |
| `npm run serve:static` | Serve an existing `out/` export on port 4173. |
| `npm run smoke:static` | Check the static export's local references and dataset assets. |
| `npm run validate:data` | Validate the checked-in Champions dataset offline. |
| `npm run derive:data` | Regenerate derived cards and evidence from reviewed raw inputs. |
| `npm run audit:data -- PATH/vct.duckdb --check` | Verify reviewed data against the pinned VCT Reference database. |
| `npm run verify` | Run lint, typecheck, Vitest, the Python CLI tests, data validation, and a production build. |

On Linux CI, install the browser and its system dependencies with
`npx playwright install --with-deps chromium`.

## Repository map

| Path | Responsibility |
| --- | --- |
| `src/app/` | Next.js entry point, global styles, metadata, and route tests. |
| `src/features/game/` | Draft, tournament, simulation, storage, sharing, and game UI. |
| `src/data/champions/` | Reviewed event snapshots, schemas, evidence, derivation, and validation. |
| `scripts/` | Static-export smoke checks and reproducible data tooling. |
| `e2e/` | Playwright journeys and platform-specific visual baselines. |
| `.github/workflows/` | Full CI and GitHub Pages deployment definitions. |
| `docs/` | Data methodology, approved designs/plans, and maintainer documentation. |

The application is a Next.js static export. `next.config.ts` sets
`output: "export"`, and GitHub Pages builds add the `/run-it-back` base path.
The shipped app cannot use server-side rendering, API routes, server actions, or
private runtime secrets. A server-backed feature requires an explicit hosting
and architecture change; do not silently add it behind the static build.

## Product invariants

Preserve these rules unless an approved design changes them:

- Daily and Free Play are both first-class modes.
- A lineup has exactly one smokes, duelist, initiator, sentinel, and flex card.
- The player assigns exactly one drafted card as IGL.
- Each run begins with three team-offer rerolls.
- Historical event versions of the same person may coexist.
- Hidden hybrid ratings affect probability but never guarantee a result.
- Fantasy opponents are generated for the current stage and become more
  demanding as the run advances.
- Group, quarterfinal, and semifinal series are BO3; the final is BO5.
- Semifinal and final narration is fictional and supports 1x, 2x, and skip.
- Progress remains browser-local; there are no accounts in this version.
- Mobile interaction keeps smooth snapping and respects reduced-motion settings.
- The visual language remains broadcast-tactical with restrained fire accents.

Do not expose hidden traits, formulas, rolls, or opponent construction in the
player UI, share output, or player-facing README.

## Development workflow

1. Create a focused branch or worktree from current `main`.
2. Add or update the smallest test that describes the desired behavior.
3. Run it and confirm it fails for the intended reason.
4. Implement the minimum coherent change.
5. Run focused tests, then `npm run verify`.
6. Run `npm run test:e2e` for player-flow, responsive, accessibility, or visual
   changes.
7. Review the diff for unrelated generated files, secrets, and source-policy
   violations before committing.

Prefer small commits with conventional subjects such as `fix:`, `feat:`,
`test:`, or `docs:`. Do not add automated-tool attribution or `Co-authored-by`
trailers unless a real human co-author asks for one.

## End-to-end and visual tests

Playwright runs desktop and Pixel 7 projects serially. Normal test runs retain a
trace and screenshot on failure. Approved visual baselines are platform-specific:

```text
e2e/__screenshots__/win32/{desktop,pixel-7}/
e2e/__screenshots__/linux/{desktop,pixel-7}/
```

`npm run test:e2e:update` updates only the current platform. Never copy Windows
images over Linux baselines or loosen snapshot tolerance to hide a real visual
change.

For an intentional Linux visual update:

1. Push the branch so GitHub can build the exact commit.
2. Run the **CI** workflow manually with `snapshot_candidate` set to `true`.
3. Download the `linux-snapshot-candidate` artifact.
4. Inspect every changed desktop and Pixel 7 image before copying the approved
   Linux snapshots into `e2e/__screenshots__/linux/`.
5. Push the reviewed snapshots and require the normal pull-request CI run to
   pass.

The manual candidate job generates evidence; it does not approve a baseline by
itself.

## Data and assets

Read [docs/data-methodology.md](docs/data-methodology.md) before changing event
facts, identities, roles, traits, citations, or assets. The checked-in data is
designed for offline validation and reproducible audit.

- Never scrape VLR or add it as an automated dependency.
- Never hotlink an asset with uncertain reuse rights.
- New local assets need a stable `/assets/...` path plus source URL, retrieval
  date, credit, and license.
- Keep historical identity separate from event-specific player cards.
- Review checksum, provenance, and source-policy changes explicitly.
- Never commit the large VCT Reference DuckDB file.

For the pinned audit environment, install `duckdb==1.5.5`, retain the exact
SHA-matching database outside the repository, and follow the commands in the data
methodology.

## Pull-request checklist

- [ ] The change is focused and follows an approved issue/design when needed.
- [ ] New behavior has a focused test that failed before implementation.
- [ ] `npm run verify` passes.
- [ ] Relevant Playwright journeys pass.
- [ ] Visual changes include reviewed baselines for each affected platform.
- [ ] Data and asset changes include provenance and license review.
- [ ] Player-facing text does not expose hidden simulation internals.
- [ ] No secrets, generated reports, large databases, or unrelated files are
      committed.
- [ ] The pull-request description explains player impact and manual checks.

## Security boundary

Client state is not authoritative. Before adding accounts, competitive
leaderboards, prizes, or trusted public scores, move ratings, random seeds,
opponent generation, and match simulation to a server and validate every Daily
submission there. Never accept a browser-computed score as trusted.
