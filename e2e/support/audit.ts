import { expect, type Page } from "@playwright/test";
import { championsDataset } from "../../src/data/champions";
import { assignPendingCard, chooseCard, chooseTeam, createDraft, selectableCards, tagIgl, toLineup } from "../../src/features/game/draft";
import { LocalSimulationGateway } from "../../src/features/game/gateway";
import { lineupStrength } from "../../src/features/game/rating";

const hiddenTerms = /\b(?:rating(?:s)?|probability|odds|chance|win\s*%|strength|firepower|utility|survival|clutch|consistency|leadership|traits?|roll)\b/i;

/**
 * This intentionally runs in Node, never the page. It proves that the fixed
 * test seeds exercise a genuinely stronger winner and a genuine upset without
 * making any private model data available to a browser build.
 */
export function firstSeriesOracle(seed: string): { userStrength: number; opponentStrength: number; userWins: number; opponentWins: number } {
  let draft = createDraft(seed, championsDataset);
  for (let index = 0; index < 5; index += 1) {
    draft = chooseTeam(draft, draft.offeredTeamIds[0]);
    const card = selectableCards(draft, championsDataset)[0];
    draft = chooseCard(draft, card.id, championsDataset);
    draft = assignPendingCard(draft, card.eligibleRoles.find(role => !draft.slots[role])!, championsDataset);
  }
  // IglPicker presents drafted cards in ROLES order, so the first visible radio
  // selected by the journey helper is the smokes slot.
  draft = tagIgl(draft, draft.slots.smokes!);
  const lineup = toLineup(draft);
  const gateway = new LocalSimulationGateway(championsDataset);
  const opponent = gateway.generateOpponent(seed, "group", lineup);
  const result = gateway.playSeries(seed, "group", lineup, opponent);
  return { userStrength: lineupStrength(lineup, championsDataset), opponentStrength: lineupStrength(opponent.lineup, championsDataset), userWins: result.userWins, opponentWins: result.opponentWins };
}

export async function assertNoPrivateModelData(page: Page): Promise<void> {
  const visibleAndSerialized = await page.evaluate(() => {
    const attributes = Array.from(document.querySelectorAll("*")).flatMap(element => Array.from(element.attributes, attribute => `${attribute.name}=${attribute.value}`));
    return [document.documentElement.outerHTML, document.documentElement.textContent ?? "", ...attributes];
  });
  for (const value of visibleAndSerialized) expect(value, "private model term leaked into DOM/text/attribute").not.toMatch(hiddenTerms);
  const accessible = await page.locator("button, input, textarea, [role]").evaluateAll(elements => elements.map(element => `${element.getAttribute("role") ?? ""} ${element.getAttribute("aria-label") ?? ""} ${(element as HTMLElement).innerText ?? ""} ${element.getAttribute("title") ?? ""} ${element.getAttribute("value") ?? ""}`));
  for (const value of accessible) expect(value, "private model term leaked into accessible control").not.toMatch(hiddenTerms);
  // Playwright's computed accessibility tree catches names/descriptions that
  // are not represented by a simple DOM attribute concatenation.
  const tree = await page.locator("main").ariaSnapshot();
  expect(tree, "private model term leaked into computed accessibility tree").not.toMatch(hiddenTerms);
}

export async function assertRenderedControlsFit(page: Page): Promise<void> {
  const controls = page.locator("button, input, textarea, select, [role=button]");
  const count = await controls.count();
  expect(count).toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) {
    const control = controls.nth(index);
    await control.evaluate(element => element.scrollIntoView({ block: "center", inline: "center", behavior: "auto" }));
    await expect(control).toBeVisible();
    const box = await control.boundingBox();
    const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    expect(box, `control ${index} has a bounding box`).not.toBeNull();
    expect(box!.x, `control ${index} left edge`).toBeGreaterThanOrEqual(-1);
    expect(box!.x + box!.width, `control ${index} right edge`).toBeLessThanOrEqual(viewport.width + 1);
    expect(box!.y, `control ${index} top edge`).toBeGreaterThanOrEqual(-1);
    expect(box!.y + box!.height, `control ${index} bottom edge`).toBeLessThanOrEqual(viewport.height + 1);
    expect(box!.width, `control ${index} width`).toBeLessThanOrEqual(viewport.width + 1);
    expect(box!.height, `control ${index} height`).toBeLessThanOrEqual(viewport.height + 1);
  }
}

export async function assertAllEnabledActionsReachableByTab(page: Page): Promise<void> {
  // A native radio group deliberately has one Tab stop; its individual options
  // are reached with arrow keys. Treat it as such instead of demanding a
  // non-standard five-stop tab sequence.
  const controls = page.locator("button:not([disabled]), input:not([disabled]):not([type=radio]), textarea:not([disabled])");
  const expected = await controls.evaluateAll(elements => elements.map((element, index) => {
    element.setAttribute("data-e2e-tab-index", String(index));
    return index;
  }));
  await page.evaluate(() => { document.body.tabIndex = -1; document.body.focus(); });
  const reached = new Set<number>();
  for (let index = 0; index < expected.length + 3; index += 1) {
    await page.keyboard.press("Tab");
    const marker = await page.evaluate(() => (document.activeElement as HTMLElement | null)?.getAttribute("data-e2e-tab-index"));
    if (marker !== null && /^\d+$/.test(marker)) reached.add(Number(marker));
  }
  expect([...reached].sort((a, b) => a - b), "every enabled action must be keyboard reachable").toEqual(expected);
  await controls.evaluateAll(elements => elements.forEach(element => element.removeAttribute("data-e2e-tab-index")));
  const radios = page.locator('input[type="radio"]:not([disabled])');
  if (await radios.count()) {
    await radios.evaluateAll(elements => elements.forEach((element, index) => element.setAttribute("data-e2e-radio-index", String(index))));
    await radios.first().focus();
    const reachedRadios = new Set<number>([0]);
    for (let index = 1; index < await radios.count(); index += 1) {
      await page.keyboard.press("ArrowDown");
      const marker = await page.evaluate(() => (document.activeElement as HTMLElement | null)?.getAttribute("data-e2e-radio-index"));
      if (marker !== null && /^\d+$/.test(marker)) reachedRadios.add(Number(marker));
    }
    expect([...reachedRadios].sort((a, b) => a - b), "each radio option is arrow-key reachable from its tab stop").toEqual(Array.from({ length: await radios.count() }, (_, index) => index));
    await radios.evaluateAll(elements => elements.forEach(element => element.removeAttribute("data-e2e-radio-index")));
  }
}
