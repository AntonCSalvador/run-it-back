import { expect, test } from "@playwright/test";
import { championsDataset } from "../src/data/champions";
import { completeTournament, start } from "./support/journey";

test("Daily completion survives reload and repeatable choices produce the same result", async ({ browser, page }) => {
  await page.addInitScript(() => {
    Date = class extends Date { constructor(...args: ConstructorParameters<DateConstructor>) { super(args.length ? args[0] : "2026-02-15T12:00:00.000Z"); } static now() { return new Date("2026-02-15T12:00:00.000Z").valueOf(); } } as DateConstructor;
  });
  await page.goto("/");
  await start(page, "Daily");
  const first = await completeTournament(page);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("run-it-back:daily:v1") ?? "null"));
  expect(stored.version).toBe(1);
  expect(stored.completions).toHaveLength(1);
  expect(stored.streak).toBe(1);
  const completion = stored.completions[0];
  expect(completion).toMatchObject({ mode: "daily", utcDate: "2026-02-15", completedAtUtc: "2026-02-15", rerollsUsed: 0 });
  expect(completion.roster).toHaveLength(5);
  expect(new Set(completion.roster.map((slot: { role: string }) => slot.role)).size).toBe(5);
  expect(completion.roster.some((slot: { cardId: string }) => slot.cardId === completion.iglCardId)).toBe(true);
  const lineupItems = page.getByRole("region", { name: "Drafted lineup" }).getByRole("listitem");
  const visibleRoster = await lineupItems.evaluateAll(items => items.map(item => ({
    role: item.firstElementChild?.textContent?.toLowerCase(),
    handle: item.querySelector("strong")?.textContent,
    year: item.querySelector("strong + span")?.textContent,
  })));
  const expectedRoster = visibleRoster.map(({ role, handle, year }) => {
    const card = championsDataset.cards.find(candidate => candidate.displayHandle === handle && candidate.year === Number(year));
    expect(card, `visible Daily card resolves in audited dataset: ${handle} ${year}`).toBeDefined();
    return { role, cardId: card!.id };
  });
  expect(completion.roster).toEqual(expectedRoster);
  const iglMarker = page.getByRole("region", { name: "Drafted lineup" }).getByText("IGL", { exact: true });
  await expect(iglMarker).toBeVisible();
  const iglLineupItem = iglMarker.locator("..");
  await expect(iglLineupItem).toHaveRole("listitem");
  const visibleIglHandle = await iglLineupItem.locator("strong").textContent();
  expect(visibleIglHandle).toBe(championsDataset.cards.find(card => card.id === completion.iglCardId)?.displayHandle);
  expect(completion.series).toHaveLength(1);
  await page.getByText("Map-by-map scores").click();
  const visibleMapScores = await page.getByText("Map-by-map scores").locator("..").innerText();
  for (const series of completion.series) {
    expect(series.maps).toHaveLength(series.userWins + series.opponentWins);
    for (const map of series.maps) expect(visibleMapScores).toContain(`${map.map} ${map.userScore}–${map.opponentScore}`);
  }
  const terminal = completion.series.at(-1);
  expect(completion.stageReached).toBe(terminal.stage);
  expect(completion.outcome).toBe(terminal.stage === "final" && terminal.userWins === 3 ? "champion" : "eliminated");
  await page.reload();
  await expect(page.getByText("Completed today", { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("run-it-back:daily:v1") ?? "{}")?.completions?.length)).toBe(1);
  await expect(page.getByLabel("Daily streak")).toHaveText("Current streak: 1");
  await page.getByRole("button", { name: "Replay today's Daily", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Choose a team to scout" })).toBeVisible();
  await completeTournament(page);
  const replayed = await page.evaluate(() => JSON.parse(localStorage.getItem("run-it-back:daily:v1") ?? "null"));
  expect(replayed.completions).toHaveLength(1);
  expect(replayed.streak).toBe(stored.streak);
  expect(replayed.completions[0].series).toEqual(completion.series);

  const secondContext = await browser.newContext();
  const second = await secondContext.newPage();
  await second.addInitScript(() => {
    Date = class extends Date { constructor(...args: ConstructorParameters<DateConstructor>) { super(args.length ? args[0] : "2026-02-15T12:00:00.000Z"); } static now() { return new Date("2026-02-15T12:00:00.000Z").valueOf(); } } as DateConstructor;
  });
  await second.goto("/");
  await start(second, "Daily");
  await expect(await completeTournament(second)).toBe(first);
  const isolated = await second.evaluate(() => JSON.parse(localStorage.getItem("run-it-back:daily:v1") ?? "null"));
  expect(isolated.completions).toHaveLength(1);
  expect(isolated.completions[0].series).toEqual(completion.series);
  await secondContext.close();
});
