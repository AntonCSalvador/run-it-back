# Run It Back

Draft a dream VALORANT Champions roster and see how far it can go.

[Play on Vercel](https://run-it-back-theta.vercel.app/) | [GitHub Pages mirror](https://antoncsalvador.github.io/run-it-back/)

Run It Back is an unofficial fan project. It is not affiliated with, endorsed
by, or sponsored by Riot Games or the VALORANT Champions Tour.

## What is Run It Back?

Run It Back is a browser-based fantasy draft built around historical VALORANT
Champions appearances. Assemble a five-player roster, choose its in-game leader
(IGL), and take the lineup through a tournament run.

Player cards represent a player at a specific event. A player who appeared at
multiple Champions events can therefore have multiple historical cards, and two
versions of the same person may coexist in one fantasy lineup.

## Play your way

- **Daily** offers a shared date-based challenge and keeps a local completion
  history and streak.
- **Free Play** creates a fresh run whenever you want to draft again.

Both modes use the same core rules. Results are intentionally uncertain: a
great-looking roster can still lose, and no lineup is guaranteed to win.

## How a run works

1. Choose Daily or Free Play.
2. Pick from the offered Champions teams. You have up to three rerolls if the
   offer does not fit your plan.
3. Draft one card into each role: **smokes**, **duelist**, **initiator**,
   **sentinel**, and **flex**.
4. Assign one drafted player as the lineup's IGL.
5. Enter the bracket. Group, quarterfinal, and semifinal series are best-of-three;
   the final is best-of-five.
6. Follow the fictional highlight feed in the later rounds at 1x or 2x speed, or
   skip it and go directly to the result.

The game tells you which roles each event-specific card can fill. Everything
else is part of the draft: balance the roster, trust your read, and run it back.

## Your data and privacy

Run It Back has no accounts or cloud saves. Settings, Daily completions, streaks,
and recent Free Play results are stored only in your browser's `localStorage`.

That means:

- another browser or device will have separate history;
- private-browsing sessions may discard history when the session closes;
- clearing site data removes saved Run It Back progress;
- reinstalling or redeploying the app does not create a cloud backup.

Sharing a result copies a compact, spoiler-safe summary for you to paste
elsewhere. It does not publish a score to a Run It Back account.

## Frequently asked questions

### Is the Vercel link the main version?

Yes. Vercel is the primary deployment. The GitHub Pages link is a secondary
mirror built from the same `main` branch.

### Why do some cards use fallback portraits or logos?

The project uses local fallbacks unless an image has clear reuse terms and
recorded attribution. It does not hotlink uncertain third-party assets.

### Can the same player appear twice?

Yes, when the cards come from different historical Champions appearances. Each
card represents that event version of the player.

### Does the strongest roster always win?

No. Team construction matters, but tournament results remain probabilistic.

### Where did the event information come from?

The dataset is compiled from Riot Games / VALORANT Champions Tour coverage,
Liquipedia, and VCT Reference. The reproducible process and source policy are in
the [data methodology](docs/data-methodology.md).

## Project documentation

- Want to work on the game? Read [CONTRIBUTING.md](CONTRIBUTING.md).
- Maintaining deployments or publishing a version? Read the
  [release runbook](docs/RELEASING.md).

## Credits and source policy

Champions facts are compiled from the sources described above. Team logos and
player portraits currently use local fallbacks rather than claiming rights to
third-party assets. Contributions must use original assets or sources that
permit reuse, record the source and license, and never imply official
affiliation.

VALORANT and related marks belong to Riot Games and their respective owners.

## Security boundary

The current ratings, chemistry, and simulation run in the browser and can be
inspected or modified by a determined user. Before adding accounts, competitive
leaderboards, prizes, or trusted public scores, move authoritative ratings,
random seeds, opponent generation, and match simulation to a server. Validate
every submitted Daily run server-side; never trust a client-computed result.
