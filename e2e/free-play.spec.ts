import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { completeTournament, draftRoster, start } from "./support/journey";

for (const [seed, expected] of [["e2e-164", /semifinal: 2–0/], ["e2e-4", /group: 2–/]] as const) {
  test(`Free Play ${seed === "e2e-164" ? "favorite win" : "underdog upset"} completes without exposing ratings or probability`, async ({ page }) => {
    await page.goto(`/?e2e-seed=${seed}`);
    await start(page, "Free Play");
    const results = await completeTournament(page);
    expect(results).toMatch(expected);
    await expect(page.locator("body")).not.toContainText(/rating|probability|odds|chance|lineup strength|\broll\b/i);
  });
}

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

test("captures the complete Free Play journey", async ({ page }, testInfo) => {
  const device = testInfo.project.name === "Pixel 7" ? "pixel-7" : "desktop";
  const directory = join(process.cwd(), "e2e", "__screenshots__", device);
  await mkdir(directory, { recursive: true });
  const capture = async (name: string) => {
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "auto" }));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await page.locator("main").screenshot({ path: join(directory, `${name}.png`), animations: "disabled" });
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
  await capture("complete-roster");
  await page.getByRole("radiogroup", { name: "Choose in-game leader" }).getByRole("radio").first().check();
  await page.getByRole("button", { name: "Start tournament" }).click();
  for (const stage of ["group", "quarterfinal"]) {
    await page.getByRole("button", { name: "Play series" }).click();
    await expect(page.getByRole("heading", { name: /Series result:/ })).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText(stage === "group" ? "Quarterfinal" : "Semifinal", { exact: true })).toBeVisible();
  }
  await page.getByRole("button", { name: "Play series" }).click();
  await expect(page.getByRole("region", { name: "SIMULATED HIGHLIGHTS" })).toBeVisible();
  await capture("semifinal-highlights");
  await page.getByRole("button", { name: "Skip" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Play series" }).click();
  await expect(page.getByRole("region", { name: "SIMULATED HIGHLIGHTS" })).toBeVisible();
  await page.getByRole("button", { name: "Skip" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("region", { name: "Results" })).toBeVisible();
  await capture("results");
});
