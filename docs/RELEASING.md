# Release and Deployment Runbook

This guide is for Run It Back maintainers. Vercel is the primary production
deployment; GitHub Pages is the secondary mirror.

- Primary: <https://run-it-back-theta.vercel.app/>
- Mirror: <https://antoncsalvador.github.io/run-it-back/>
- Repository: <https://github.com/AntonCSalvador/run-it-back>
- GitHub Actions: <https://github.com/AntonCSalvador/run-it-back/actions>

## What triggers a deployment?

Yes: under the current repository and Vercel configuration, every push to
`main` launches both production deployment paths. It also launches the full CI
workflow.

| Change | CI | Vercel | GitHub Pages |
| --- | --- | --- | --- |
| Pull request | Full CI | Preview deployment while the Git integration is enabled | No deployment |
| Push to `main` | Full CI | Production deployment | Production deployment |
| Version tag | No tag-triggered workflow | No independent deployment | No deployment |
| Manual workflow | Runs the selected GitHub workflow | No effect | The Pages workflow can redeploy the selected ref |

These systems run independently:

- `.github/workflows/ci.yml` tests pull requests and pushes to `main`.
- `.github/workflows/pages.yml` builds and deploys Pages on pushes to `main`.
- Vercel watches the connected GitHub repository and treats `main` as its
  production branch.

A green CI run does not itself promote Vercel, and the Vercel Git integration
does not wait for this repository's CI workflow. GitHub Pages deploys only after
its own build and static smoke check pass. Verify all three checks separately.

## Release model

Run It Back uses continuous deployment from `main`:

1. Develop on a branch and open a pull request.
2. Review the Vercel preview and require CI to pass.
3. Merge the approved commit into `main`.
4. Let Vercel and GitHub Pages deploy that commit automatically.
5. Smoke-test both public URLs.
6. Add and push a version tag when the commit represents a named release.

The deployment is created by the `main` push, not by the tag. Tag only a commit
that is already integrated and verified live.

## Preflight

Start from a clean, current branch:

```sh
git fetch origin
git status --short --branch
npm ci
npm run verify
```

`npm run verify` runs lint, TypeScript, Vitest, the Python audit CLI regression
tests, offline data validation, and the production static build. It requires
Node.js 24 and Python 3.11 or newer on `PATH` as `python`.

For changes affecting layout, navigation, responsive behavior, accessibility,
storage, or the game flow, also run:

```sh
npx playwright install chromium
npm run test:e2e
```

The E2E command builds and serves the export automatically. To inspect an
already-built export without a browser journey:

```sh
npm run build
npm run smoke:static
```

The GitHub Pages workflow performs its own build with `GITHUB_PAGES=true` and
validates the `/run-it-back` base path before deployment.

## Merge and monitor

Merge through GitHub after review. Do not force-push or rewrite `main`. After the
merge, identify and watch the runs for the exact commit:

```sh
gh run list --branch main --limit 10
gh run watch RUN_ID
```

Expect a successful **CI** run and a successful **Deploy GitHub Pages** run.
Then inspect the Vercel project:

```sh
npx --yes vercel@latest ls run-it-back
```

Confirm that the production deployment is ready and references the same commit
as `origin/main`. The Vercel dashboard's deployment details are the source of
truth if the CLI display is abbreviated.

## Live smoke test

Check both URLs after deployment:

```powershell
(Invoke-WebRequest -UseBasicParsing 'https://run-it-back-theta.vercel.app/').StatusCode
(Invoke-WebRequest -UseBasicParsing 'https://antoncsalvador.github.io/run-it-back/').StatusCode
```

Both should return `200`. In a real browser, verify at minimum:

- the title and mode selection load without a blank screen;
- a Free Play draft can reach a terminal result;
- recent history survives a reload in the same browser;
- fallback portraits and team marks render;
- the Pixel 7 viewport has no horizontal overflow and supports snapping;
- reduced-motion mode remains usable;
- no hidden rating, chemistry, probability, or roll appears in player-visible
  content.

If one host is still deploying, wait for its status to settle before diagnosing
the application. Do not call the release complete while either public URL serves
the wrong commit.

## Version tags

Use annotated semantic-version tags after both deployments pass smoke testing:

```sh
git switch main
git pull --ff-only origin main
git tag -a vX.Y.Z -m "Run It Back vX.Y.Z"
git push origin vX.Y.Z
```

Choose the version deliberately:

- **Patch** (`v0.1.1`): fixes and documentation with no new player-facing mode
  or incompatible saved-data change.
- **Minor** (`v0.2.0`): backward-compatible player-facing features or meaningful
  new content.
- **Major** (`v1.0.0`): an intentionally incompatible contract after the project
  reaches a stable public version.

Do not move an existing public tag. If a tagged release is bad, revert it and
publish a new patch version.

## Rollback

First identify the last known-good commit and determine which host is affected.

### Application rollback

Create a normal revert commit on a branch, review it, and merge it to `main`:

```sh
git switch -c revert/bad-release origin/main
git revert BAD_COMMIT_SHA
npm ci
npm run verify
git push -u origin revert/bad-release
```

Merging the revert starts fresh Vercel and Pages deployments and preserves an
auditable history. This is the preferred rollback for a bad application change.

### Vercel-only rollback

If the code on `main` is good but Vercel alone is unhealthy, use the Vercel
dashboard to inspect logs and promote or redeploy the last known-good production
deployment. Follow with a live smoke test. Reconcile Vercel back to `main` once
the incident is understood; do not leave an undocumented commit mismatch.

### GitHub Pages-only rollback

Inspect the **Deploy GitHub Pages** workflow logs. Re-run the failed job if the
failure was transient. If the shipped code is wrong, use the normal revert flow;
Pages has no separate long-lived release branch in this repository.

Never rewrite `main`, delete release history, or move tags as a shortcut.

## Visual baseline maintenance

Visual baselines are intentionally separated by platform. Windows development
updates `e2e/__screenshots__/win32/`; Ubuntu CI compares
`e2e/__screenshots__/linux/`.

For an intentional Linux change, open the **CI** workflow's manual run form and
set `snapshot_candidate` to `true`. The candidate job builds the requested ref,
updates and immediately rechecks the complete Free Play journey, then uploads a
`linux-snapshot-candidate` artifact. Inspect all affected desktop and Pixel 7
images before committing them. A generated artifact is evidence, not approval.

## Static-export constraints

`next.config.ts` uses `output: "export"`. Production artifacts contain only
static files, and GitHub Pages adds a repository base path at build time.

The current deployment model cannot safely provide server-side rendering, API
routes, server actions, private runtime secrets, authoritative randomness, or
trusted scoring. Before adding server-backed features, remove the static-export
assumption deliberately, choose a server-capable deployment architecture, and
update CI, smoke tests, and this runbook together.

## Troubleshooting

### Vercel did not deploy a `main` push

- Confirm the project is still linked to `AntonCSalvador/run-it-back`.
- Confirm the production branch is `main` and Git deployments are enabled.
- Check whether an ignored-build rule skipped the commit.
- Inspect build logs before retrying; do not request or paste access tokens in
  chat or issue comments.

### GitHub Pages failed

- Open the failed **Deploy GitHub Pages** run and identify whether install,
  build, base-path smoke, artifact upload, or deployment failed.
- Reproduce with `npm ci`, `npm run build`, and `npm run smoke:static` first.
- For a Pages-only path issue, compare the workflow's `GITHUB_PAGES` and
  `GITHUB_REPOSITORY` environment with `next.config.ts`.

### CI failed on a visual snapshot

- Download the Playwright report and inspect the actual, expected, and diff
  images.
- Reproduce behavior locally before changing a baseline.
- If Linux rendering changed intentionally, use the audited snapshot-candidate
  workflow; never copy a Windows baseline into the Linux directory.

## Security boundary

MVP ratings, chemistry, simulation, random seeds, and generated opponents live
in client code and can be inspected or modified by a determined user. Before
adding accounts, competitive leaderboards, prizes, or trusted public scores,
move authoritative ratings, random seeds, opponent generation, and match
simulation to a server. Validate every submitted Daily run server-side; never
trust a client-computed result.

## Release checklist

- [ ] Pull-request review is complete and CI is green.
- [ ] The Vercel preview was checked for player-facing changes.
- [ ] The approved commit is on `main`.
- [ ] CI and Deploy GitHub Pages succeeded for the exact `main` commit.
- [ ] Vercel production is ready on the same commit.
- [ ] Both live URLs passed HTTP and browser smoke tests.
- [ ] Any annotated version tag points to the verified commit.
- [ ] Rollback target and notable operational changes are recorded.
