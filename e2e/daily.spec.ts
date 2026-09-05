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
  const visibleRoster = await page.getByRole("region", { name: "Drafted roster" }).locator("p").allTextContents();
  const expectedRoster = visibleRoster.map(line => {
    const [, role, handle, year] = line.match(/^(smokes|duelist|initiator|sentinel|flex):\s+(.+)\s+(\d{4})/) ?? [];
    const card = championsDataset.cards.find(candidate => candidate.displayHandle === handle && candidate.year === Number(year));
    expect(card, `visible Daily card resolves in audited dataset: ${line}`).toBeDefined();
    return { role, cardId: card!.id };
  });
  expect(completion.roster).toEqual(expectedRoster);
  expect(visibleRoster.find(line => line.includes("IGL"))).toContain(championsDataset.cards.find(card => card.id === completion.iglCardId)?.displayHandle);
  expect(completion.series).toHaveLength(1);
  for (const series of completion.series) {
    expect(series.maps).toHaveLength(series.userWins + series.opponentWins);
    for (const map of series.maps) expect(first).toContain(`${map.map} ${map.userScore}–${map.opponentScore}`);
  }
  const terminal = completion.series.at(-1);
  expect(completion.stageReached).toBe(terminal.stage);
  expect(completion.outcome).toBe(terminal.stage === "final" && terminal.userWins === 3 ? "champion" : "eliminated");
  await page.reload();
  await expect(page.getByLabel("Daily history")).toHaveText("Daily history: 1");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("run-it-back:daily:v1") ?? "{}")?.completions?.length)).toBe(1);
  await expect(page.getByText("Streak: 1", { exact: true })).toBeVisible();
  await start(page, "Daily");
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
