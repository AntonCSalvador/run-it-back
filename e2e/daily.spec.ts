import { expect, test } from "@playwright/test";
import { completeTournament, start } from "./support/journey";

test("Daily completion survives reload and repeatable choices produce the same result", async ({ browser, page }) => {
  await page.addInitScript(() => {
    Date = class extends Date { constructor(...args: ConstructorParameters<DateConstructor>) { super(args.length ? args[0] : "2026-02-15T12:00:00.000Z"); } static now() { return new Date("2026-02-15T12:00:00.000Z").valueOf(); } } as DateConstructor;
  });
  await page.goto("/");
  await start(page, "Daily");
  const first = await completeTournament(page);
  await page.reload();
  await expect(page.getByLabel("Daily history")).toHaveText("Daily history: 1");

  const secondContext = await browser.newContext();
  const second = await secondContext.newPage();
  await second.addInitScript(() => {
    Date = class extends Date { constructor(...args: ConstructorParameters<DateConstructor>) { super(args.length ? args[0] : "2026-02-15T12:00:00.000Z"); } static now() { return new Date("2026-02-15T12:00:00.000Z").valueOf(); } } as DateConstructor;
  });
  await second.goto("/");
  await start(second, "Daily");
  await expect(await completeTournament(second)).toBe(first);
  await secondContext.close();
});
