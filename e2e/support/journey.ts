import { expect, type Page } from "@playwright/test";

export async function start(page: Page, mode: "Daily" | "Free Play"): Promise<void> {
  await page.getByRole("button", { name: mode, exact: true }).click();
  await expect(page.getByRole("heading", { name: "Choose a team" })).toBeVisible();
}

export async function draftRoster(page: Page): Promise<void> {
  for (let slot = 0; slot < 5; slot += 1) {
    await page.locator(".team-card").first().click();
    await expect(page.getByRole("heading", { name: /Choose from/ })).toBeVisible();
    await page.locator('[data-testid^="player-card-"]').first().getByRole("button").click();
    await page.getByRole("group", { name: "Choose an open role" }).getByRole("button").first().click();
  }
  await expect(page.getByRole("button", { name: "Start tournament" })).toBeDisabled();
}

export async function reachTournament(page: Page): Promise<void> {
  await draftRoster(page);
  await page.getByRole("radiogroup", { name: "Choose in-game leader" }).getByRole("radio").first().check();
  await expect(page.getByRole("button", { name: "Start tournament" })).toBeEnabled();
  await page.getByRole("button", { name: "Start tournament" }).click();
  await expect(page.getByRole("region", { name: "Tournament" })).toBeVisible();
}

export async function completeTournament(page: Page): Promise<string> {
  await reachTournament(page);
  while (await page.getByRole("button", { name: "Play series" }).count()) {
    await page.getByRole("button", { name: "Play series" }).click();
    await expect(page.getByRole("heading", { name: /Series result:/ })).toBeVisible();
    const skip = page.getByRole("button", { name: "Skip" });
    if (await skip.count()) await skip.click();
    await page.getByRole("button", { name: "Continue" }).click();
  }
  const results = page.getByRole("region", { name: "Results" });
  await expect(results).toBeVisible();
  return (await results.innerText()).replace(/\s+/g, " ");
}
