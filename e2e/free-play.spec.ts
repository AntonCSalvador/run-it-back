import { expect, test, type Page } from "@playwright/test";
import { assertNoPrivateModelData, firstSeriesOracle } from "./support/audit";
import { completeTournament, draftRoster, start } from "./support/journey";

async function captureJourneyScreenshot(page: Page, isMobile: boolean, name: string): Promise<void> {
  // Wait for real finite feedback to finish. Screenshot animation disabling
  // alone can restart a class whose animationend handler is still pending.
  await expect(page.locator(".fire-accent")).toHaveCount(0);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "auto" }));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  const captureTarget = page.locator("body");
  const capturedRegions = await captureTarget.evaluate(element => ({
    banner: Boolean(element.querySelector("header[role='banner'], header.app-banner")),
    main: element.matches("main") || Boolean(element.querySelector("main")),
  }));
  expect(capturedRegions, "the visual capture includes the complete banner and main shell").toEqual({ banner: true, main: true });
  const layout = await captureTarget.evaluate(async element => {
    const sample = () => {
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x, y, width, height };
    };
    const frames = [sample()];
    for (let frame = 0; frame < 2; frame += 1) {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      frames.push(sample());
    }
    const banner = document.querySelector("header[role='banner'], header.app-banner")?.getBoundingClientRect();
    const main = document.querySelector("main")?.getBoundingClientRect();
    return {
      frames,
      banner: banner ? { top: banner.top, bottom: banner.bottom } : null,
      main: main ? { top: main.top, bottom: main.bottom } : null,
      pageOverflows: document.documentElement.scrollWidth > innerWidth,
    };
  });
  const bounds = layout.frames;
  expect(layout.banner, "the banner remains outside main").not.toBeNull();
  expect(layout.main, "the main region remains in the full-shell capture").not.toBeNull();
  expect(layout.main!.top, "main begins at or below the banner without overlap").toBeGreaterThanOrEqual(layout.banner!.bottom);
  expect(layout.pageOverflows, "the shell does not create page-level horizontal overflow").toBe(false);
  expect(bounds[1]).toEqual(bounds[0]);
  expect(bounds[2]).toEqual(bounds[0]);
  await expect.soft(page).toHaveScreenshot(`${name}.png`, { fullPage: true, animations: "disabled", maxDiffPixelRatio: 0.01 });
  if (isMobile) expect(await page.evaluate(() => window.scrollY), "capture preserves document origin").toBe(0);
}

for (const [seed, expected, relation] of [["e2e-18", /Group stage Won 2–0/, "favorite"], ["e2e-4", /Group stage Won 2–1/, "underdog"]] as const) {
  test(`Free Play ${relation === "favorite" ? "favorite win" : "underdog upset"} completes without exposing ratings or probability`, async ({ page }) => {
    const oracle = firstSeriesOracle(seed);
    if (relation === "favorite") expect(oracle.userStrength).toBeGreaterThan(oracle.opponentStrength);
    else expect(oracle.userStrength).toBeLessThan(oracle.opponentStrength);
    expect(oracle.userWins).toBeGreaterThan(oracle.opponentWins);
    await page.goto(`/?e2e-seed=${seed}`);
    await assertNoPrivateModelData(page);
    await start(page, "Free Play");
    await assertNoPrivateModelData(page);
    const results = await completeTournament(page);
    expect(results).toMatch(expected);
    await assertNoPrivateModelData(page);
  });
}

test("privacy audit permits public clutch moment copy", async ({ page }) => {
  await page.setContent(`<main>
    <section class="highlight-feed" aria-label="SIMULATED HIGHLIGHTS">
      <article class="highlight-feed__moment">
        <span class="highlight-feed__tag">Clutch</span>
        <p>Player wins a simulated late-round clutch over Rival.</p>
      </article>
    </section>
    <section class="results-view__moments" aria-label="Key moments">
      <ol><li><p>Semifinal<!-- --> · <!-- -->Clutch<!-- --> · <!-- -->Pearl</p><p>Player wins a simulated late-round clutch over Rival.</p></li></ol>
    </section>
  </main>`);

  await assertNoPrivateModelData(page);
});

for (const [name, content] of [
  ["metric copy", `<main><p>Clutch rating: 84</p></main>`],
  ["private attribute", `<main><p data-clutch="84">Player</p></main>`],
  ["serialized field", `<main><script type="application/json">{"clutch":84}</script></main>`],
] as const) {
  test(`privacy audit still rejects ${name}`, async ({ page }) => {
    await page.setContent(content);
    await expect(assertNoPrivateModelData(page)).rejects.toThrow(/private model term leaked/i);
  });
}

test("private model fields never enter serialized, hidden, or accessible content", async ({ page }) => {
  await page.goto("/?e2e-seed=e2e-164");
  await assertNoPrivateModelData(page);
  await start(page, "Free Play");
  await page.locator(".team-card").first().click();
  await assertNoPrivateModelData(page);
  await page.locator('[data-testid^="player-card-"]').first().getByRole("button").click();
  await assertNoPrivateModelData(page);
  await page.getByRole("group", { name: "Choose an open role" }).locator("button:not(:disabled)").first().click();
  await assertNoPrivateModelData(page);
  await page.getByRole("button", { name: "Exit run" }).click();
  await page.getByRole("button", { name: "Exit run and lose progress" }).click();
  await start(page, "Free Play");
  await completeTournament(page);
  await assertNoPrivateModelData(page);
  const share = page.getByRole("button", { name: "Share result" });
  if (await share.count()) { await share.click(); await assertNoPrivateModelData(page); }
});

test("the build-only seed query makes Free Play repeatable across isolated contexts", async ({ browser, page }) => {
  await page.goto("/?e2e-seed=e2e-164");
  await start(page, "Free Play");
  const first = await completeTournament(page);
  const context = await browser.newContext();
  const second = await context.newPage();
  await second.goto("/?e2e-seed=e2e-164");
  await start(second, "Free Play");
  await expect(await completeTournament(second)).toBe(first);
  await context.close();
});

test("captures the complete Free Play journey", async ({ page, isMobile }) => {
  const capture = (name: string) => captureJourneyScreenshot(page, isMobile, name);

  await page.goto("/?e2e-seed=e2e-164");
  await capture("mode-selection");
  await start(page, "Free Play");
  await capture("three-team-offer");
  await page.locator(".team-card").first().click();
  await expect(page.getByRole("heading", { name: /Choose from/ })).toBeVisible();
  await capture("player-picker");
  await page.getByRole("button", { name: "Back to teams" }).click();
  await draftRoster(page);
  await assertNoPrivateModelData(page);
  await capture("complete-roster");
  await page.getByRole("group", { name: "Choose your IGL" }).getByRole("radio").first().check();
  await page.getByRole("button", { name: "Start tournament" }).click();
  await assertNoPrivateModelData(page);
  for (const stage of ["group", "quarterfinal"]) {
    await page.getByRole("button", { name: /^Play / }).click();
    await expect(page.getByRole("heading", { name: /Series result:/ })).toBeVisible();
    await page.getByRole("button", { name: /^Continue to / }).click();
    const nextRound = stage === "group" ? /^Quarterfinal · Round 2 of 4$/ : /^Semifinal · Round 3 of 4$/;
    await expect(page.getByText(nextRound)).toBeVisible();
  }
  await page.getByRole("button", { name: /^Play / }).click();
  await expect(page.getByRole("region", { name: "SIMULATED HIGHLIGHTS" })).toBeVisible();
  await assertNoPrivateModelData(page);
  await capture("semifinal-highlights");
  await page.getByRole("button", { name: "Skip to result" }).click();
  await page.getByRole("button", { name: /^Continue to / }).click();
  await page.getByRole("button", { name: /^Play / }).click();
  await expect(page.getByRole("region", { name: "SIMULATED HIGHLIGHTS" })).toBeVisible();
  await page.getByRole("button", { name: "Skip to result" }).click();
  await page.getByRole("button", { name: /^Continue to / }).click();
  await expect(page.getByRole("region", { name: "Results", exact: true })).toBeVisible();
  await expect(page.getByText("6 additional simulated moments", { exact: true })).toBeVisible();
  await assertNoPrivateModelData(page);
  await capture("results-eliminated");
});

test("captures champion recap", async ({ page, isMobile }) => {
  await page.goto("/?e2e-seed=e2e-560");
  await start(page, "Free Play");
  const results = await completeTournament(page);
  expect(results).toContain("Tournament champion");
  await expect(page.getByText("9 additional simulated moments", { exact: true })).toBeVisible();
  await captureJourneyScreenshot(page, isMobile, "results-champion");
});
