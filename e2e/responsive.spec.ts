import { expect, test } from "@playwright/test";
import { start } from "./support/journey";

test("responsive controls fit, snap, remain keyboard reachable, and respect reduced motion", async ({ page }) => {
  await page.goto("/");
  await start(page, "Daily");
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth === innerWidth)).toBe(true);
  const controls = page.locator("button:visible, input:visible");
  const inViewport = await controls.evaluateAll(elements => elements.filter(element => {
    const box = element.getBoundingClientRect();
    return box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight;
  }).length);
  expect(inViewport).toBeGreaterThan(0);
  for (let index = 0; index < await controls.count(); index += 1) {
    const box = await controls.nth(index).boundingBox();
    if (!box || box.x < 0 || box.x + box.width > await page.evaluate(() => innerWidth) || box.y < 0 || box.y + box.height > await page.evaluate(() => innerHeight)) continue;
    expect(box, `visible control ${index} has a box`).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual((await page.evaluate(() => innerWidth)) + 1);
  }
  const track = page.locator(".team-offer__cards");
  if (await track.evaluate(element => getComputedStyle(element).overflowX === "auto")) {
    await track.evaluate(element => element.scrollTo({ left: element.clientWidth, behavior: "smooth" }));
    await expect.poll(() => track.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
    await expect.poll(() => track.evaluate(element => {
      const card = element.firstElementChild as HTMLElement;
      return card ? Math.abs(element.scrollLeft - (card.offsetWidth + Number.parseFloat(getComputedStyle(element).gap))) < 48 : false;
    })).toBe(true);
  }
  await page.locator("body").click({ position: { x: 1, y: 1 } });
  const actions = await page.locator("button:visible, input:visible").evaluateAll(elements => elements.map(element => ({ tag: element.tagName, label: (element as HTMLElement).innerText || element.getAttribute("aria-label") || "" })));
  const reached: string[] = [];
  for (let index = 0; index < actions.length; index += 1) { await page.keyboard.press("Tab"); reached.push(await page.evaluate(() => (document.activeElement as HTMLElement)?.innerText || document.activeElement?.getAttribute("aria-label") || "")); }
  expect(reached.filter(Boolean).length).toBe(actions.length);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(() => page.locator(".team-card").first().evaluate(element => getComputedStyle(element).scrollBehavior)).toBe("auto");
});
