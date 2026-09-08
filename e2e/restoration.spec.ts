import { expect, test, type Page } from "@playwright/test";
import { STORAGE_KEYS } from "../src/features/game/storage";
import { draftRoster, start } from "./support/journey";

async function chooseFirstTeam(page: Page): Promise<void> {
  await page.locator(".team-card").first().click();
  await expect(page.getByRole("heading", { name: /Choose from/ })).toBeVisible();
}

test("reload restores a committed player decision deterministically", async ({ page }) => {
  await page.goto("/?e2e-seed=restore-player-e2e");
  await start(page, "Free Play");
  await chooseFirstTeam(page);
  const heading = await page.getByRole("heading", { name: /Choose from/ }).textContent();
  const playerNames = await page.locator('[data-testid^="player-card-"] button').allTextContents();

  await page.reload();

  await expect(page.getByRole("heading", { name: heading! })).toBeFocused();
  await expect(page.getByRole("status", { name: "Active run restoration status" })).toContainText("Saved run restored");
  expect(await page.locator('[data-testid^="player-card-"] button').allTextContents()).toEqual(playerNames);
});

test("reload during semifinal presentation restarts that deterministic stage", async ({ page }) => {
  await page.goto("/?e2e-seed=e2e-164");
  await start(page, "Free Play");
  await draftRoster(page);
  await page.getByRole("group", { name: "Choose your IGL" }).getByRole("radio").first().check();
  await page.getByRole("button", { name: "Start tournament" }).click();
  for (const label of ["Play group stage", "Play quarterfinal"] as const) {
    await page.getByRole("button", { name: label }).click();
    await page.getByRole("button", { name: /^Continue to / }).click();
  }
  await page.getByRole("button", { name: "Play semifinal" }).click();
  await expect(page.getByRole("region", { name: "SIMULATED HIGHLIGHTS" })).toBeVisible();

  await page.reload();

  await expect(page.getByText(/^Semifinal · Round 3 of 4$/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Play semifinal" })).toBeVisible();
  await page.getByRole("button", { name: "Play semifinal" }).click();
  await expect(page.getByRole("region", { name: "SIMULATED HIGHLIGHTS" })).toBeVisible();
});

test("reload at the Final rebuilds retained semifinal moments exactly once in the recap", async ({ page }) => {
  await page.goto("/?e2e-seed=e2e-560");
  await start(page, "Free Play");
  await draftRoster(page);
  await page.getByRole("group", { name: "Choose your IGL" }).getByRole("radio").first().check();
  await page.getByRole("button", { name: "Start tournament" }).click();
  for (const label of ["Play group stage", "Play quarterfinal"] as const) {
    await page.getByRole("button", { name: label }).click();
    const skip = page.getByRole("button", { name: "Skip to result" });
    if (await skip.count()) await skip.click();
    await page.getByRole("button", { name: /^Continue to / }).click();
  }
  await page.getByRole("button", { name: "Play semifinal" }).click();
  await page.getByRole("button", { name: "Skip to result" }).click();
  const retainedMoments = await page.locator(".highlight-feed__moment[data-heat] p").allTextContents();
  expect(retainedMoments.length).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Continue to final" }).click();
  await expect(page.getByText(/^Final .* Round 4 of 4$/)).toBeVisible();

  await page.reload();

  await expect(page.getByRole("heading", { name: "Your roster vs. Challenger roster" })).toBeFocused();
  await expect(page.getByRole("button", { name: "Play final" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Series result:/ })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "SIMULATED HIGHLIGHTS" })).toHaveCount(0);
  await page.getByRole("button", { name: "Play final" }).click();
  const skipFinal = page.getByRole("button", { name: "Skip to result" });
  if (await skipFinal.count()) await skipFinal.click();
  await page.getByRole("button", { name: /^Continue to / }).click();
  await expect(page.getByRole("heading", { name: "Tournament champion" })).toBeVisible();
  const recap = page.locator(".results-view__moments");
  for (const moment of retainedMoments) await expect(recap.getByText(moment, { exact: true })).toHaveCount(1);
});

test("confirmed exit clears only the active run", async ({ page }) => {
  await page.goto("/?e2e-seed=restore-exit-e2e");
  await start(page, "Free Play");
  await chooseFirstTeam(page);
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), STORAGE_KEYS.active)).not.toBeNull();
  await page.getByRole("button", { name: "Exit run" }).click();
  await page.getByRole("button", { name: "Exit run and lose progress" }).click();
  await expect(page.getByRole("heading", { name: "Draft history. Rewrite the bracket." })).toBeFocused();
  expect(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEYS.active)).toBeNull();
});

test("error recovery restores the saved task and focuses its heading", async ({ page }) => {
  await page.goto("/?e2e-seed=restore-boundary-e2e");
  await start(page, "Free Play");
  await expect(page.getByRole("heading", { name: "Choose a team to scout" })).toBeFocused();

  await page.goto("/?e2e-seed=restore-boundary-e2e&e2e-error-boundary=once");
  await expect(page.getByRole("alert").filter({ hasText: "Something went wrong with this run" })).toBeVisible();
  await page.getByRole("button", { name: "Recover run" }).click();

  await expect(page.getByRole("heading", { name: "Choose a team to scout" })).toBeFocused();
  await expect(page.getByRole("status", { name: "Active run restoration status" })).toContainText("Saved run restored");
});

test("corrupt active data is isolated and storage failure keeps the run playable", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Draft history. Rewrite the bracket." })).toBeVisible();
  await page.evaluate(key => localStorage.setItem(key, "{not-json"), STORAGE_KEYS.active);
  await page.reload();
  await expect(page.getByRole("status", { name: "Active run restoration status" })).toContainText("could not be restored");
  await start(page, "Free Play");

  await page.context().clearCookies();
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new Error("blocked"); };
    Storage.prototype.setItem = () => { throw new Error("blocked"); };
    Storage.prototype.removeItem = () => { throw new Error("blocked"); };
  });
  await page.goto("/?e2e-seed=restore-blocked-e2e");
  await expect(page.getByRole("alert").filter({ hasText: "Local progress" })).toContainText("keep playing");
  await start(page, "Free Play");
  await chooseFirstTeam(page);
});
