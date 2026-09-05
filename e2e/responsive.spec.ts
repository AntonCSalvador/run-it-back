import { expect, test, type Locator, type Page } from "@playwright/test";
import { assertAllEnabledActionsReachableByTab, assertRenderedControlsFit } from "./support/audit";
import { start } from "./support/journey";

async function keyboardActivate(page: Page, control: Locator): Promise<void> {
  await control.focus();
  await page.keyboard.press(await control.evaluate(element => element instanceof HTMLInputElement && element.type === "radio") ? "Space" : "Enter");
}

async function auditPhase(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth === innerWidth)).toBe(true);
  await assertRenderedControlsFit(page);
  await assertAllEnabledActionsReachableByTab(page);
}

test("every phase keeps rendered controls in the viewport and reachable by keyboard", async ({ page }) => {
  await page.goto("/?e2e-seed=e2e-164");
  await auditPhase(page);
  await keyboardActivate(page, page.getByRole("button", { name: "Free Play", exact: true }));
  await auditPhase(page);
  await keyboardActivate(page, page.getByRole("button", { name: "Reroll teams" }));
  await auditPhase(page);
  await keyboardActivate(page, page.locator(".team-card").first());
  await auditPhase(page);
  await keyboardActivate(page, page.getByRole("button", { name: "Back to teams" }));
  await auditPhase(page);
  await keyboardActivate(page, page.getByRole("button", { name: "Reset current run" }));
  await keyboardActivate(page, page.getByRole("button", { name: "Free Play", exact: true }));
  await auditPhase(page);
  for (let index = 0; index < 5; index += 1) {
    await keyboardActivate(page, page.locator(".team-card").first());
    await auditPhase(page);
    await keyboardActivate(page, page.locator('[data-testid^="player-card-"]').first().getByRole("button"));
    await auditPhase(page);
    await keyboardActivate(page, page.getByRole("group", { name: "Choose an open role" }).getByRole("button").first());
    await auditPhase(page);
  }
  await keyboardActivate(page, page.getByRole("radiogroup", { name: "Choose in-game leader" }).getByRole("radio").first());
  await auditPhase(page);
  await keyboardActivate(page, page.getByRole("button", { name: "Start tournament" }));
  await auditPhase(page);
  for (const stage of ["group", "quarterfinal"]) {
    await keyboardActivate(page, page.getByRole("button", { name: "Play series" }));
    await expect(page.getByRole("heading", { name: /Series result:/ })).toBeVisible();
    await auditPhase(page);
    await keyboardActivate(page, page.getByRole("button", { name: "Continue" }));
    await expect(page.getByText(stage === "group" ? "Quarterfinal" : "Semifinal", { exact: true })).toBeVisible();
    await auditPhase(page);
  }
  await keyboardActivate(page, page.getByRole("button", { name: "Play series" }));
  await expect(page.getByRole("region", { name: "SIMULATED HIGHLIGHTS" })).toBeVisible();
  await auditPhase(page);
  await keyboardActivate(page, page.getByRole("button", { name: "2x" }));
  await keyboardActivate(page, page.getByRole("button", { name: "Skip" }));
  await keyboardActivate(page, page.getByRole("button", { name: "Continue" }));
  const results = page.getByRole("region", { name: "Results", exact: true });
  if (!await results.count()) {
    await keyboardActivate(page, page.getByRole("button", { name: "Play series" }));
    await expect(page.getByRole("region", { name: "SIMULATED HIGHLIGHTS" })).toBeVisible();
    await keyboardActivate(page, page.getByRole("button", { name: "Skip" }));
    await keyboardActivate(page, page.getByRole("button", { name: "Continue" }));
  }
  await expect(results).toBeVisible();
  await auditPhase(page);
  await keyboardActivate(page, page.getByRole("button", { name: "Share" }));
  await expect(page.getByRole("textbox", { name: "Share result" })).toBeVisible();
  await page.getByRole("button", { name: "Run again" }).focus();
  await page.keyboard.press("Space");
  await expect(page.getByRole("heading", { name: "Choose a team" })).toBeVisible();
});

test("mobile tracks animate to a snap boundary and reduced motion suppresses visual motion", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "pixel-7", "The Desktop project has no horizontal mobile track; all-phase controls are covered separately.");
  await page.goto("/?e2e-seed=e2e-18");
  await start(page, "Free Play");
  const track = page.locator(".team-offer__cards");
  await expect(track).toHaveCSS("scroll-behavior", "smooth");
  const motion = await track.evaluate(async element => {
    const boundaries = Array.from(element.children, child => (child as HTMLElement).offsetLeft - (element as HTMLElement).offsetLeft);
    const target = boundaries[1];
    const samples: number[] = [];
    element.scrollTo({ left: target, behavior: "smooth" });
    for (let frame = 0; frame < 24; frame += 1) await new Promise<void>(resolve => requestAnimationFrame(() => { samples.push(element.scrollLeft); resolve(); }));
    return { target, samples, settled: element.scrollLeft, boundaries };
  });
  expect(motion.target).toBeGreaterThan(0);
  expect(motion.samples.some(value => value > 0 && value < motion.target), JSON.stringify(motion)).toBe(true);
  await expect.poll(() => track.evaluate(element => Array.from(element.children, child => (child as HTMLElement).offsetLeft - (element as HTMLElement).offsetLeft).some(boundary => Math.abs(element.scrollLeft - boundary) <= 3))).toBe(true);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(track).toHaveCSS("scroll-behavior", "auto");
  await page.getByRole("button", { name: "Reroll teams" }).click();
  const reduced = await page.locator(".game-shell").evaluate(element => {
    const accent = document.querySelector(".fire-accent") ?? element;
    const pseudo = getComputedStyle(accent, "::before");
    const style = getComputedStyle(accent);
    return { transition: style.transitionDuration, animation: pseudo.animationName, duration: pseudo.animationDuration };
  });
  expect(Number.parseFloat(reduced.transition)).toBeLessThanOrEqual(0.00001);
  expect(reduced.animation).toBe("none");
  expect(reduced.duration).toBe("0s");
});
