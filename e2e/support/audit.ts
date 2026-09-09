import { expect, type Locator, type Page } from "@playwright/test";
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
  const auditRoot = page.locator("[data-private-model-audit-root]");
  const audited = await page.evaluate(() => {
    const attributes = Array.from(document.querySelectorAll("*")).flatMap(element => Array.from(element.attributes, attribute => `${attribute.name}=${attribute.value}`));
    const isPublicClutchCopy = (node: Text, text: string) => {
      const parent = node.parentElement;
      if (!parent) return false;
      if (parent.matches(".highlight-feed__tag") && text.trim() === "Clutch") return true;
      if (parent.matches(".results-view__moments li > p") && /^(?:Group stage|Quarterfinal|Semifinal|Final) · (?:Clutch|Failed Clutch) · [A-Za-z]+$/.test(parent.textContent?.trim() ?? "")) return true;
      if (parent.matches(".highlight-feed__moment > p, .results-view__moments li > p") && /^(?:.+ wins a simulated late-round clutch over .+\.|.+['’]s simulated clutch attempt falls short against .+\.)$/.test(text.trim())) return true;
      return false;
    };
    const clone = document.documentElement.cloneNode(true) as HTMLElement;
    const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node as Text);
    for (const node of nodes) if (/\bclutch\b/i.test(node.data) && isPublicClutchCopy(node, node.data)) node.data = node.data.replace(/\bclutch\b/gi, "moment");
    const accessible = Array.from(clone.querySelectorAll("button, input, textarea, [role]"), element => `${element.getAttribute("role") ?? ""} ${element.getAttribute("aria-label") ?? ""} ${(element as HTMLElement).textContent ?? ""} ${element.getAttribute("title") ?? ""} ${element.getAttribute("value") ?? ""}`);
    const main = clone.querySelector("main")?.cloneNode(true) as HTMLElement | undefined;
    if (!main) throw new Error("Main region required for private-model audit");
    main.querySelectorAll("[id]").forEach(descendant => descendant.removeAttribute("id"));
    main.setAttribute("data-private-model-audit-root", "");
    main.setAttribute("style", "position:fixed;left:-100000px;top:0;width:1px;height:1px;overflow:hidden");
    document.body.append(main);
    return { visibleAndSerialized: [clone.outerHTML, clone.textContent ?? "", ...attributes], accessible };
  });
  try {
    for (const value of audited.visibleAndSerialized) expect(value, "private model term leaked into DOM/text/attribute").not.toMatch(hiddenTerms);
    for (const value of audited.accessible) expect(value, "private model term leaked into accessible control").not.toMatch(hiddenTerms);
    // Playwright's computed accessibility tree catches names/descriptions that
    // are not represented by a simple DOM attribute concatenation.
    const tree = await auditRoot.ariaSnapshot();
    expect(tree, "private model term leaked into computed accessibility tree").not.toMatch(hiddenTerms);
  } finally {
    await auditRoot.evaluate(element => element.remove());
  }
}

export async function assertRenderedControlsFit(page: Page): Promise<void> {
  const controls = page.locator("button:visible, input:visible, textarea:visible, select:visible, [role=button]:visible");
  const count = await controls.count();
  expect(count).toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) {
    const control = controls.nth(index);
    await control.evaluate(element => element.scrollIntoView({ block: "center", inline: "center", behavior: "auto" }));
    await expect(control).toBeVisible();
    await expect.poll(async () => {
      const box = await control.boundingBox();
      const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
      return Boolean(box && box.x >= -1 && box.x + box.width <= viewport.width + 1 && box.y >= -1 && box.y + box.height <= viewport.height + 1);
    }, { message: `control ${index} settles inside the viewport` }).toBe(true);
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

export async function assertMinimumPointerTargets(page: Page, minimum = 44): Promise<void> {
  const controls = page.locator("button:visible, input:visible, textarea:visible, select:visible, summary:visible, [role=button]:visible");
  const matrix = await controls.evaluateAll(elements => elements.map((element, index) => {
    const target = element instanceof HTMLInputElement && (element.type === "radio" || element.type === "checkbox")
      ? element.closest("label") ?? element
      : element;
    const rect = target.getBoundingClientRect();
    return { index, name: element.getAttribute("aria-label") ?? element.textContent?.trim().replace(/\s+/g, " ").slice(0, 80) ?? element.tagName, width: rect.width, height: rect.height };
  }));
  const undersized = matrix.filter(item => item.width < minimum || item.height < minimum);
  expect(undersized, `pointer target matrix:\n${JSON.stringify(matrix, null, 2)}`).toEqual([]);
}

export interface ContrastProbe {
  readonly name: string;
  readonly locator: Locator;
  readonly foreground?: "color" | "backgroundColor" | "borderTopColor" | "outlineColor";
  readonly minimum: number;
}

interface RgbaColor {
  readonly red: number;
  readonly green: number;
  readonly blue: number;
  readonly alpha: number;
}

const opaqueWhite: RgbaColor = { red: 255, green: 255, blue: 255, alpha: 1 };

function parseChannel(value: string): number {
  return value.endsWith("%") ? (Number.parseFloat(value) / 100) * 255 : Number.parseFloat(value);
}

function parseAlpha(value: string | undefined): number {
  if (value === undefined) return 1;
  return value.endsWith("%") ? Number.parseFloat(value) / 100 : Number.parseFloat(value);
}

function parseColor(value: string): RgbaColor {
  const normalized = value.trim().toLowerCase();
  if (normalized === "transparent") return { red: 0, green: 0, blue: 0, alpha: 0 };

  const hex = normalized.match(/^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i)?.[1];
  if (hex) {
    const expanded = hex.length <= 4 ? [...hex].map(character => `${character}${character}`).join("") : hex;
    return {
      red: Number.parseInt(expanded.slice(0, 2), 16),
      green: Number.parseInt(expanded.slice(2, 4), 16),
      blue: Number.parseInt(expanded.slice(4, 6), 16),
      alpha: expanded.length === 8 ? Number.parseInt(expanded.slice(6, 8), 16) / 255 : 1,
    };
  }

  const rgb = normalized.match(/^rgba?\((.*)\)$/)?.[1];
  if (rgb) {
    const [channels, slashAlpha] = rgb.split("/").map(part => part.trim());
    const values = channels.includes(",")
      ? channels.split(",").map(part => part.trim())
      : channels.split(/\s+/);
    const alpha = slashAlpha ?? (values.length === 4 ? values.pop() : undefined);
    if (values.length === 3 && values.every(item => /^-?[\d.]+%?$/.test(item)) && (!alpha || /^-?[\d.]+%?$/.test(alpha))) {
      return {
        red: parseChannel(values[0]),
        green: parseChannel(values[1]),
        blue: parseChannel(values[2]),
        alpha: parseAlpha(alpha),
      };
    }
  }

  throw new Error(`Unsupported computed color: ${value}`);
}

function composite(foreground: RgbaColor, background: RgbaColor): RgbaColor {
  const alpha = foreground.alpha + (background.alpha * (1 - foreground.alpha));
  if (alpha === 0) return { red: 0, green: 0, blue: 0, alpha: 0 };
  const channel = (foregroundChannel: number, backgroundChannel: number) => (
    ((foregroundChannel * foreground.alpha) + (backgroundChannel * background.alpha * (1 - foreground.alpha))) / alpha
  );
  return {
    red: channel(foreground.red, background.red),
    green: channel(foreground.green, background.green),
    blue: channel(foreground.blue, background.blue),
    alpha,
  };
}

function resolvePaint(layers: readonly string[], canvas = opaqueWhite): RgbaColor {
  return layers.reduceRight((paint, layer) => composite(parseColor(layer), paint), canvas);
}

function colorLuminance(color: RgbaColor): number {
  const [red, green, blue] = [color.red, color.green, color.blue].map(channel => {
    const normalized = channel / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return (0.2126 * red) + (0.7152 * green) + (0.0722 * blue);
}

function ratioBetween(foreground: RgbaColor, background: RgbaColor): number {
  const lighter = Math.max(colorLuminance(foreground), colorLuminance(background));
  const darker = Math.min(colorLuminance(foreground), colorLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function describeColor(color: RgbaColor): string {
  return `rgba(${color.red.toFixed(2)}, ${color.green.toFixed(2)}, ${color.blue.toFixed(2)}, ${color.alpha.toFixed(3)})`;
}

export function contrastRatio(foreground: string, background: string, outside = "rgb(255, 255, 255)"): number {
  const resolvedOutside = resolvePaint([outside]);
  const resolvedBackground = composite(parseColor(background), resolvedOutside);
  return ratioBetween(composite(parseColor(foreground), resolvedBackground), resolvedBackground);
}

export function assertSolidBackgroundImages(backgroundImages: readonly string[]): void {
  const nonSolid = backgroundImages.find(image => image.trim() !== "" && image.trim().toLowerCase() !== "none");
  if (nonSolid) throw new Error(`Non-solid background image cannot be audited as one color: ${nonSolid}`);
}

interface ContrastMatrixRow {
  readonly name: string;
  readonly pair: string;
  readonly side: "content" | "inside" | "outside";
  readonly foreground: string;
  readonly background: string;
  readonly ratio: number;
  readonly threshold: number;
}

export async function assertComputedContrastMatrix(probes: readonly ContrastProbe[]): Promise<void> {
  const matrix: ContrastMatrixRow[] = [];
  for (const probe of probes) {
    const foregroundProperty = probe.foreground ?? "color";
    const colors = await probe.locator.evaluate((element, property) => {
      const paintLayers: { backgroundColor: string; backgroundImage: string }[] = [];
      let current: Element | null = element;
      while (current) {
        const style = getComputedStyle(current);
        paintLayers.push({ backgroundColor: style.backgroundColor, backgroundImage: style.backgroundImage });
        current = current.parentElement;
      }
      const own = getComputedStyle(element);
      return {
        foreground: own[property as keyof CSSStyleDeclaration] as string,
        paintLayers,
      };
    }, foregroundProperty);

    assertSolidBackgroundImages(colors.paintLayers.map(layer => layer.backgroundImage));
    const outside = resolvePaint(colors.paintLayers.slice(1).map(layer => layer.backgroundColor));
    const own = parseColor(colors.paintLayers[0].backgroundColor);
    const ownFill = composite(own, outside);
    const indicator = parseColor(colors.foreground);

    if (foregroundProperty === "color") {
      const paintedForeground = composite(indicator, ownFill);
      matrix.push({
        name: probe.name,
        pair: "text / resolved control fill",
        side: "content",
        foreground: describeColor(paintedForeground),
        background: describeColor(ownFill),
        ratio: ratioBetween(paintedForeground, ownFill),
        threshold: probe.minimum,
      });
    } else if (foregroundProperty === "backgroundColor") {
      matrix.push({
        name: probe.name,
        pair: "resolved control fill / outside adjacent background",
        side: "outside",
        foreground: describeColor(ownFill),
        background: describeColor(outside),
        ratio: ratioBetween(ownFill, outside),
        threshold: probe.minimum,
      });
    } else {
      const paintedInside = composite(indicator, ownFill);
      const paintedOutside = composite(indicator, outside);
      matrix.push({
        name: probe.name,
        pair: `${foregroundProperty} / resolved control fill`,
        side: "inside",
        foreground: describeColor(paintedInside),
        background: describeColor(ownFill),
        ratio: ratioBetween(paintedInside, ownFill),
        threshold: probe.minimum,
      }, {
        name: probe.name,
        pair: `${foregroundProperty} / outside adjacent background`,
        side: "outside",
        foreground: describeColor(paintedOutside),
        background: describeColor(outside),
        ratio: ratioBetween(paintedOutside, outside),
        threshold: probe.minimum,
      });
    }
  }
  expect(matrix.filter(item => item.ratio + 0.005 < item.threshold), `computed contrast matrix:\n${JSON.stringify(matrix, null, 2)}`).toEqual([]);
}

export async function assertAllEnabledActionsReachableByTab(page: Page): Promise<void> {
  // A native radio group deliberately has one Tab stop; its individual options
  // are reached with arrow keys. Treat it as such instead of demanding a
  // non-standard five-stop tab sequence.
  const controls = page.locator("button:not([disabled]):visible, input:not([disabled]):not([type=radio]):visible, textarea:not([disabled]):visible, summary:visible");
  const expected = await controls.evaluateAll(elements => elements.map((element, index) => {
    element.setAttribute("data-e2e-tab-index", String(index));
    return index;
  }));
  await page.evaluate(() => { document.body.tabIndex = -1; document.body.focus(); });
  const reached = new Set<number>();
  for (let index = 0; index < expected.length + 3; index += 1) {
    await page.keyboard.press("Tab");
    const marker = await page.evaluate(() => (document.activeElement as HTMLElement | null)?.getAttribute("data-e2e-tab-index"));
    if (typeof marker === "string" && /^\d+$/.test(marker)) reached.add(Number(marker));
  }
  expect([...reached].sort((a, b) => a - b), "every enabled action must be keyboard reachable").toEqual(expected);
  await controls.evaluateAll(elements => elements.forEach(element => element.removeAttribute("data-e2e-tab-index")));
  const radios = page.locator('input[type="radio"]:not([disabled]):visible');
  if (await radios.count()) {
    await radios.evaluateAll(elements => elements.forEach((element, index) => element.setAttribute("data-e2e-radio-index", String(index))));
    await page.evaluate(() => { document.body.tabIndex = -1; document.body.focus(); });
    let firstRadio: number | null = null;
    for (let index = 0; index < await controls.count() + 3; index += 1) {
      await page.keyboard.press("Tab");
      const marker = await page.evaluate(() => (document.activeElement as HTMLElement | null)?.getAttribute("data-e2e-radio-index"));
      if (typeof marker === "string" && /^\d+$/.test(marker)) { firstRadio = Number(marker); break; }
    }
    expect(firstRadio, "radio group has a genuine Tab stop").not.toBeNull();
    const reachedRadios = new Set<number>([firstRadio!]);
    for (let index = 1; index < await radios.count(); index += 1) {
      await page.keyboard.press("ArrowDown");
      const marker = await page.evaluate(() => (document.activeElement as HTMLElement | null)?.getAttribute("data-e2e-radio-index"));
      if (typeof marker === "string" && /^\d+$/.test(marker)) reachedRadios.add(Number(marker));
    }
    expect([...reachedRadios].sort((a, b) => a - b), "each radio option is arrow-key reachable from its tab stop").toEqual(Array.from({ length: await radios.count() }, (_, index) => index));
    await radios.evaluateAll(elements => elements.forEach(element => element.removeAttribute("data-e2e-radio-index")));
  }
}
