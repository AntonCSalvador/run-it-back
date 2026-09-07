import { expect, type Page } from "@playwright/test";

export async function start(page: Page, mode: "Daily" | "Free Play"): Promise<void> {
  const label = mode === "Daily" ? "Start today's Daily" : "Start Free Play";
  await page.getByRole("button", { name: label, exact: true }).click();
  await expect(page.getByRole("heading", { name: "Choose a team to scout" })).toBeVisible();
}

export async function draftRoster(page: Page): Promise<void> {
  for (let slot = 0; slot < 5; slot += 1) {
    await page.locator(".team-card").first().click();
    await expect(page.getByRole("heading", { name: /Choose from/ })).toBeVisible();
    await page.locator('[data-testid^="player-card-"]').first().getByRole("button").click();
    await page.getByRole("group", { name: "Choose an open role" }).locator("button:not(:disabled)").first().click();
  }
  await expect(page.getByRole("button", { name: "Start tournament" })).toBeDisabled();
}

export async function reachTournament(page: Page): Promise<void> {
  await draftRoster(page);
  await page.getByRole("group", { name: "Choose your IGL" }).getByRole("radio").first().check();
  await expect(page.getByRole("button", { name: "Start tournament" })).toBeEnabled();
  await page.getByRole("button", { name: "Start tournament" }).click();
  await expect(page.getByRole("region", { name: "Tournament" })).toBeVisible();
}

export async function completeTournament(page: Page): Promise<string> {
  await reachTournament(page);
  const play = page.getByRole("button", { name: /^Play (?:group stage|quarterfinal|semifinal|final)$/ });
  while (await play.count()) {
    await play.click();
    const skip = page.getByRole("button", { name: "Skip to result" });
    if (await skip.count()) await skip.click();
    await expect(page.getByRole("heading", { name: /Series result:/ })).toBeVisible();
    await page.getByRole("button", { name: /^Continue to / }).click();
  }
  const results = page.getByRole("region", { name: "Results", exact: true });
  await expect(results).toBeVisible();
  return (await results.innerText()).replace(/\s+/g, " ");
}
