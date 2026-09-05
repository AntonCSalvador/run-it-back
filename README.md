# Run It Back

Run It Back is an unofficial project for drafting Champions players and running a bracket. It is not affiliated with or endorsed by Riot Games.

## Setup

```sh
npm install
npm run dev
```

Run checks with `npm run lint`, `npm run typecheck`, and `npm test`.

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
