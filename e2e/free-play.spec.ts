import { expect, test } from "@playwright/test";
import { assertNoPrivateModelData, firstSeriesOracle } from "./support/audit";
import { completeTournament, draftRoster, start } from "./support/journey";

for (const [seed, expected, relation] of [["e2e-18", /group: 2–0/, "favorite"], ["e2e-4", /group: 2–1/, "underdog"]] as const) {
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

test("private model fields never enter serialized, hidden, or accessible content", async ({ page }) => {
  await page.goto("/?e2e-seed=e2e-164");
  await assertNoPrivateModelData(page);
  await start(page, "Free Play");
  await page.locator(".team-card").first().click();
  await assertNoPrivateModelData(page);
  await page.locator('[data-testid^="player-card-"]').first().getByRole("button").click();
  await assertNoPrivateModelData(page);
  await page.getByRole("group", { name: "Choose an open role" }).getByRole("button").first().click();
  await assertNoPrivateModelData(page);
  await page.getByRole("button", { name: "Reset current run" }).click();
  await start(page, "Free Play");
  await completeTournament(page);
  await assertNoPrivateModelData(page);
  const share = page.getByRole("button", { name: "Share" });
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
  const capture = async (name: string) => {
    // Wait for real finite feedback to finish. Screenshot animation disabling
    // alone can restart a class whose animationend handler is still pending.
    await expect(page.locator(".fire-accent")).toHaveCount(0);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "auto" }));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    const bounds = await page.locator("main").evaluate(async element => {
      const sample = () => {
        const { x, y, width, height } = element.getBoundingClientRect();
        return { x, y, width, height };
      };
      const frames = [sample()];
      for (let frame = 0; frame < 2; frame += 1) {
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        frames.push(sample());
      }
      return frames;
    });
    expect(bounds[0].y, "main starts at document top before capture").toBe(0);
    expect(bounds[1]).toEqual(bounds[0]);
    expect(bounds[2]).toEqual(bounds[0]);
    if (isMobile) {
      // Use document coordinates; locator screenshots scroll the element again,
      // introducing fractional crop offsets in Chromium's mobile emulation.
      const { x, y, width, height } = bounds[0];
      const clip = { x: Math.floor(x), y: 0, width: Math.ceil(x + width) - Math.floor(x), height: Math.ceil(y + height) };
      await expect(page).toHaveScreenshot(`${name}.png`, { fullPage: true, clip, animations: "disabled", maxDiffPixelRatio: 0.01 });
      expect(await page.evaluate(() => window.scrollY), "capture preserves document origin").toBe(0);
    } else {
      await expect(page.locator("main")).toHaveScreenshot(`${name}.png`, { animations: "disabled", maxDiffPixelRatio: 0.01 });
    }
  };

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
  await page.getByRole("radiogroup", { name: "Choose in-game leader" }).getByRole("radio").first().check();
  await page.getByRole("button", { name: "Start tournament" }).click();
  await assertNoPrivateModelData(page);
  for (const stage of ["group", "quarterfinal"]) {
    await page.getByRole("button", { name: "Play series" }).click();
    await expect(page.getByRole("heading", { name: /Series result:/ })).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText(stage === "group" ? "Quarterfinal" : "Semifinal", { exact: true })).toBeVisible();
  }
  await page.getByRole("button", { name: "Play series" }).click();
  await expect(page.getByRole("region", { name: "SIMULATED HIGHLIGHTS" })).toBeVisible();
  await assertNoPrivateModelData(page);
  await capture("semifinal-highlights");
  await page.getByRole("button", { name: "Skip" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Play series" }).click();
  await expect(page.getByRole("region", { name: "SIMULATED HIGHLIGHTS" })).toBeVisible();
  await page.getByRole("button", { name: "Skip" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("region", { name: "Results", exact: true })).toBeVisible();
  await assertNoPrivateModelData(page);
  await capture("results");
});
