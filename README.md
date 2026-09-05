# Run It Back

Run It Back is an unofficial project for drafting Champions players and running a bracket. It is not affiliated with or endorsed by Riot Games.

## Setup

```sh
npm install
npm run dev
```

Run checks with `npm run lint`, `npm run typecheck`, and `npm test`.

## Deployment

Vercel is the primary deployment target: import this repository and use the
default build settings. The app is a static export, so it can also be deployed
with GitHub Pages by enabling the included Actions workflow. GitHub Pages is a
secondary option for this repository; it builds with the repository base path.

Static exports cannot provide server-side rendering, API routes, server actions,
or private runtime secrets. Before adding server-backed features, remove
`output: "export"` from `next.config.ts` and deploy to a server-capable host.

For a local production check, run `npm run build` followed by
`npm run smoke:static`; use `npm run smoke:static -- out --base-path /run-it-back`
to validate the GitHub Pages path layout.

## Data credits

Champions facts are compiled from Riot Games / VALORANT Champions Tour coverage,
Liquipedia, and VCT Reference. This is an unofficial fantasy project and is not
affiliated with Riot Games; team logos and player portraits currently use local
fallbacks rather than claiming rights to third-party assets.

## Source policy

Use original data and assets or sources that permit reuse. Do not redistribute proprietary game assets or imply official affiliation.

## Security boundary

MVP ratings, chemistry, and simulation run in the browser and can be inspected
or modified by a determined user. Before adding accounts, competitive
leaderboards, prizes, or trusted public scores, move authoritative ratings,
random seeds, opponent generation, and match simulation to a server. Validate
every submitted Daily run server-side; never trust a client-computed result.

## Audit notes

Dependency installation completed with no reported vulnerabilities or engine warnings on the supported Node runtime.
