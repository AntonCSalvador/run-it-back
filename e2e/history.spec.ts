import { expect, test } from "@playwright/test";

const history = Array.from({ length: 7 }, (_, index) => ({
  mode: "free", completedAtUtc: `2026-09-${String(index + 1).padStart(2, "0")}`, stageReached: "group", rerollsUsed: 0,
  roster: ["smokes", "duelist", "initiator", "sentinel", "flex"].map((role, roleIndex) => ({ role, cardId: `history-card-${index}-${roleIndex}` })),
  iglCardId: `history-card-${index}-0`,
  series: [{ stage: "group", userWins: 0, opponentWins: 2, maps: [{ map: "Ascent", userScore: 7, opponentScore: 13 }, { map: "Bind", userScore: 8, opponentScore: 13 }] }],
}));

test("mobile saved history stays collapsed, bounded, and keyboard-accessible", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Mobile layout is covered by the Pixel 7 project.");
  await page.addInitScript(records => localStorage.setItem("run-it-back:history:v1", JSON.stringify({ version: 1, runs: records })), history);
  await page.goto("/?e2e-seed=e2e-history");
  const show = page.getByRole("button", { name: /Show saved results/ });
  await show.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: /View Free Play result/ })).toHaveCount(3);
  await page.getByRole("button", { name: "Hide saved results" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: /View Free Play result/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Free Play", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Choose a team" })).toBeVisible();
});
