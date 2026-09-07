import { expect, test, type Locator, type Page } from "@playwright/test";
import { assertAllEnabledActionsReachableByTab, assertRenderedControlsFit } from "./support/audit";
import { draftRoster, start } from "./support/journey";

async function keyboardActivate(page: Page, control: Locator): Promise<void> {
  await control.focus();
  await page.keyboard.press(await control.evaluate(element => element instanceof HTMLInputElement && element.type === "radio") ? "Space" : "Enter");
}

async function auditPhase(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth === innerWidth)).toBe(true);
  await assertRenderedControlsFit(page);
  await assertAllEnabledActionsReachableByTab(page);
}

function contrastRatio(foreground: string, background: string): number {
  const channels = (value: string): number[] => value.match(/[\d.]+/g)!.slice(0, 3).map(Number);
  const luminance = (value: string): number => {
    const [red, green, blue] = channels(value).map(channel => {
      const normalized = channel / 255;
      return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    return (0.2126 * red) + (0.7152 * green) + (0.0722 * blue);
  };
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

test("skip link moves focus to the current decision", async ({ page }) => {
  await page.goto("/");

  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: "Skip to current decision" });
  await expect(skipLink).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main#game-content")).toBeFocused();
});

test("mobile tracked team focus ring remains fully visible", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "pixel-7", "Only the mobile layout clips direct-child track focus rings.");

  for (const width of [390, 412]) {
    await page.setViewportSize({ width, height: 840 });
    await page.goto("/");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");

    const teamCard = page.locator(".scroll-track > .team-card").first();
    for (let tabs = 0; tabs < 8 && !await teamCard.evaluate(element => document.activeElement === element); tabs += 1) {
      await page.keyboard.press("Tab");
    }
    await expect(teamCard).toBeFocused();

    const focus = await teamCard.evaluate(element => {
      const track = element.parentElement!;
      const cardRect = element.getBoundingClientRect();
      const trackRect = track.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        boxShadow: style.boxShadow,
        outlineColor: style.outlineColor,
        outlineOffset: style.outlineOffset,
        outlineWidth: style.outlineWidth,
        clipped: {
          blockEnd: cardRect.bottom > trackRect.bottom,
          blockStart: cardRect.top < trackRect.top,
          inlineEnd: cardRect.right > trackRect.right,
          inlineStart: cardRect.left < trackRect.left,
        },
        pageOverflows: document.documentElement.scrollWidth > innerWidth,
      };
    });
    expect(focus.outlineWidth, `${width}px warm-white ring width`).toBe("3px");
    expect(focus.outlineColor, `${width}px warm-white ring color`).toBe("rgb(242, 237, 227)");
    expect(focus.outlineOffset, `${width}px inset warm-white ring`).toBe("-6px");
    expect(focus.boxShadow, `${width}px inset red companion ring`).toContain("rgb(232, 75, 66) 0px 0px 0px 3px inset");
    for (const [edge, clipped] of Object.entries(focus.clipped)) {
      expect(clipped, `${width}px ${edge} clipping`).toBe(false);
    }
    expect(focus.pageOverflows, `${width}px page overflow`).toBe(false);
  }
});

test("390px player choice keeps its complete focus treatment inside the clipped card", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "pixel-7", "The player decision track clips card media only on mobile.");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?e2e-seed=e2e-player-focus");
  await start(page, "Free Play");
  await keyboardActivate(page, page.locator(".team-card").first());
  await expect(page.locator(".fire-accent")).toHaveCount(0);

  const playerChoice = page.locator('[data-testid^="player-card-"]').first().getByRole("button");
  for (let tabs = 0; tabs < 8 && !await playerChoice.evaluate(element => document.activeElement === element); tabs += 1) {
    await page.keyboard.press("Tab");
  }
  await expect(playerChoice).toBeFocused();

  const focus = await playerChoice.evaluate(element => {
    const card = element.parentElement!;
    const choiceRect = element.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const style = getComputedStyle(element);
    const outlineWidth = Number.parseFloat(style.outlineWidth);
    const outlineOffset = Number.parseFloat(style.outlineOffset);
    const outwardExtent = Math.max(0, outlineWidth + outlineOffset);
    return {
      boxShadow: style.boxShadow,
      outlineColor: style.outlineColor,
      outlineOffset: style.outlineOffset,
      outlineWidth: style.outlineWidth,
      clipped: {
        blockEnd: choiceRect.bottom + outwardExtent > cardRect.bottom,
        blockStart: choiceRect.top - outwardExtent < cardRect.top,
        inlineEnd: choiceRect.right + outwardExtent > cardRect.right,
        inlineStart: choiceRect.left - outwardExtent < cardRect.left,
      },
      pageOverflows: document.documentElement.scrollWidth > innerWidth,
    };
  });
  expect(focus.outlineWidth).toBe("3px");
  expect(focus.outlineColor).toBe("rgb(242, 237, 227)");
  expect(focus.outlineOffset).toBe("-6px");
  expect(focus.boxShadow).toContain("rgb(232, 75, 66) 0px 0px 0px 3px inset");
  for (const [edge, clipped] of Object.entries(focus.clipped)) expect(clipped, `${edge} clipping`).toBe(false);
  expect(focus.pageOverflows).toBe(false);
});

test("390px team track shows position, a next-card edge, and the full roster outside it", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "pixel-7", "The horizontal decision track is a mobile composition.");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?e2e-seed=e2e-team-track");
  await start(page, "Free Play");

  const track = page.locator(".team-offer__cards");
  const cards = track.locator(".team-card");
  await expect(cards).toHaveCount(3);
  await expect(cards.first()).toContainText("Team 1 of 3");
  await expect(cards.nth(1)).toContainText("Team 2 of 3");
  const geometry = await page.evaluate(() => {
    const track = document.querySelector<HTMLElement>(".team-offer__cards")!;
    const first = track.querySelector<HTMLElement>(".team-card")!;
    const second = track.querySelectorAll<HTMLElement>(".team-card")[1];
    const roster = document.querySelector<HTMLElement>(".roster-bar")!;
    const trackRect = track.getBoundingClientRect();
    const firstRect = first.getBoundingClientRect();
    const secondRect = second.getBoundingClientRect();
    return {
      ratio: firstRect.width / trackRect.width,
      nextEdgeVisible: secondRect.left < trackRect.right && secondRect.right > trackRect.right,
      snap: getComputedStyle(first).scrollSnapAlign,
      rosterInTrack: Boolean(roster.closest(".scroll-track")),
      pageOverflows: document.documentElement.scrollWidth > innerWidth,
    };
  });
  expect(geometry.ratio).toBeGreaterThanOrEqual(0.86);
  expect(geometry.ratio).toBeLessThanOrEqual(0.9);
  expect(geometry.nextEdgeVisible).toBe(true);
  expect(geometry.snap).toBe("start");
  expect(geometry.rosterInTrack).toBe(false);
  expect(geometry.pageOverflows).toBe(false);
});

test("every phase keeps rendered controls in the viewport and reachable by keyboard", async ({ page }) => {
  await page.goto("/?e2e-seed=e2e-164");
  await auditPhase(page);
  await keyboardActivate(page, page.getByRole("button", { name: "Start Free Play", exact: true }));
  await auditPhase(page);
  await keyboardActivate(page, page.getByRole("button", { name: /Replace all 3 teams/ }));
  await auditPhase(page);
  await keyboardActivate(page, page.locator(".team-card").first());
  await auditPhase(page);
  await keyboardActivate(page, page.getByRole("button", { name: "Back to teams" }));
  await auditPhase(page);
  const exitRun = page.getByRole("button", { name: "Exit run" });
  await keyboardActivate(page, exitRun);
  await expect(page.getByRole("button", { name: "Keep this run" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Exit this run?" })).toBeHidden();
  await expect(exitRun).toBeFocused();
  await expect(page.getByRole("button", { name: /Replace all 3 teams/ })).toBeVisible();
  await keyboardActivate(page, exitRun);
  await keyboardActivate(page, page.getByRole("button", { name: "Exit run and lose progress" }));
  await keyboardActivate(page, page.getByRole("button", { name: "Start Free Play", exact: true }));
  await auditPhase(page);
  for (let index = 0; index < 5; index += 1) {
    await keyboardActivate(page, page.locator(".team-card").first());
    await auditPhase(page);
    await keyboardActivate(page, page.locator('[data-testid^="player-card-"]').first().getByRole("button"));
    await auditPhase(page);
    await keyboardActivate(page, page.getByRole("group", { name: "Choose an open role" }).locator("button:not(:disabled)").first());
    await auditPhase(page);
  }
  await keyboardActivate(page, page.getByRole("group", { name: "Choose your IGL" }).getByRole("radio").first());
  await auditPhase(page);
  await keyboardActivate(page, page.getByRole("button", { name: "Start tournament" }));
  await auditPhase(page);
  for (const stage of ["group", "quarterfinal"]) {
    await keyboardActivate(page, page.getByRole("button", { name: /^Play / }));
    await expect(page.getByRole("heading", { name: /Series result:/ })).toBeVisible();
    await auditPhase(page);
    await keyboardActivate(page, page.getByRole("button", { name: /^Continue to / }));
    await expect(page.getByText(new RegExp(`^${stage === "group" ? "Quarterfinal" : "Semifinal"} · Round`))).toBeVisible();
    await auditPhase(page);
  }
  await keyboardActivate(page, page.getByRole("button", { name: /^Play / }));
  await expect(page.getByRole("region", { name: "SIMULATED HIGHLIGHTS" })).toBeVisible();
  const highlightDecisionPrecedesRoster = await page.getByRole("button", { name: "Skip to result" }).evaluate(action => {
    const roster = document.querySelector<HTMLElement>('section[aria-label="Your roster"]');
    return Boolean(roster && (action.compareDocumentPosition(roster) & Node.DOCUMENT_POSITION_FOLLOWING));
  });
  expect(highlightDecisionPrecedesRoster).toBe(true);
  await auditPhase(page);
  await keyboardActivate(page, page.getByRole("button", { name: "2x" }));
  await keyboardActivate(page, page.getByRole("button", { name: "Skip to result" }));
  await keyboardActivate(page, page.getByRole("button", { name: /^Continue to / }));
  const results = page.getByRole("region", { name: "Results", exact: true });
  if (!await results.count()) {
    await keyboardActivate(page, page.getByRole("button", { name: /^Play / }));
    await expect(page.getByRole("region", { name: "SIMULATED HIGHLIGHTS" })).toBeVisible();
    await keyboardActivate(page, page.getByRole("button", { name: "Skip to result" }));
    await keyboardActivate(page, page.getByRole("button", { name: /^Continue to / }));
  }
  await expect(results).toBeVisible();
  await auditPhase(page);
  await keyboardActivate(page, page.getByRole("button", { name: "Share result" }));
  await expect(page.getByRole("textbox", { name: "Share result" })).toBeVisible();
  await page.getByRole("button", { name: "Run another Free Play" }).focus();
  await page.keyboard.press("Space");
  await expect(page.getByRole("heading", { name: "Choose a team to scout" })).toBeVisible();
});

test("tournament transitions restore natural focus after controls leave the page", async ({ page }) => {
  await page.goto("/?e2e-seed=e2e-164");
  await start(page, "Free Play");
  await draftRoster(page);
  await page.getByRole("group", { name: "Choose your IGL" }).getByRole("radio").first().check();
  await page.getByRole("button", { name: "Start tournament" }).click();
  await expect(page.getByRole("heading", { name: "Your roster vs. Challenger roster" })).toBeFocused();

  for (const [playLabel, nextRound] of [
    ["Play group stage", /^Quarterfinal · Round 2 of 4$/],
    ["Play quarterfinal", /^Semifinal · Round 3 of 4$/],
  ] as const) {
    await page.getByRole("button", { name: playLabel }).click();
    await expect(page.getByRole("heading", { name: /^Series result: Win, \d–\d$/ })).toBeFocused();
    await page.getByRole("button", { name: /^Continue to / }).click();
    await expect(page.getByText(nextRound)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your roster vs. Challenger roster" })).toBeFocused();
  }

  await page.getByRole("button", { name: "Play semifinal" }).click();
  await expect(page.getByRole("heading", { name: "SIMULATED HIGHLIGHTS" })).toBeFocused();
  const speed = page.getByRole("button", { name: "2x" });
  await speed.click();
  await expect(page.getByRole("log", { name: "Simulated series moments" }).getByRole("article")).toHaveCount(2);
  await expect(speed).toBeFocused();
  await page.getByRole("button", { name: "Skip to result" }).click();
  await expect(page.getByRole("heading", { name: /^Series result: Win, \d–\d$/ })).toBeFocused();
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
  await page.getByRole("button", { name: /Replace all 3 teams/ }).click();
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

test("the opening reflows at 390px with keyboard-reachable mode actions", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?e2e-seed=e2e-onboarding");

  await expect(page.getByRole("heading", { name: "Draft history. Rewrite the bracket." })).toBeVisible();
  await expect(page.getByText("One shared draft each UTC day.")).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth === innerWidth)).toBe(true);

  for (const label of ["Start today's Daily", "Start Free Play"]) {
    const action = page.getByRole("button", { name: label, exact: true });
    await action.focus();
    await expect(action).toBeFocused();
    const box = await action.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
    expect(box?.x).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(390);
  }
});

test("forced colors pair primary and exhausted actions with internally consistent system colors", async ({ page }, testInfo) => {
  await page.emulateMedia({ forcedColors: "active" });
  await page.goto("/?e2e-seed=e2e-forced-colors");

  const daily = page.getByRole("button", { name: "Start today's Daily", exact: true });
  const primary = await daily.evaluate(element => {
    const style = getComputedStyle(element);
    return { backgroundColor: style.backgroundColor, borderTopColor: style.borderTopColor, color: style.color, forcedColorAdjust: style.forcedColorAdjust };
  });
  const secondary = await page.getByRole("button", { name: "Start Free Play", exact: true }).evaluate(element => {
    const style = getComputedStyle(element);
    return { backgroundColor: style.backgroundColor, borderTopColor: style.borderTopColor, color: style.color, forcedColorAdjust: style.forcedColorAdjust };
  });
  await daily.click();
  for (let rerolls = 3; rerolls > 0; rerolls -= 1) await page.getByRole("button", { name: `Replace all 3 teams · ${rerolls} left` }).click();
  const reroll = page.getByRole("button", { name: "Replace all 3 teams · 0 left" });
  await expect(reroll).toBeDisabled();

  const disabledStates = await page.evaluate(() => {
    const read = (element: Element) => {
      const style = getComputedStyle(element);
      return {
        backgroundColor: style.backgroundColor,
        borderTopColor: style.borderTopColor,
        color: style.color,
        forcedColorAdjust: style.forcedColorAdjust,
      };
    };
    const probe = (cssText: string) => {
      const element = document.createElement("button");
      element.style.cssText = `position:fixed;${cssText}`;
      document.body.append(element);
      const style = read(element);
      element.remove();
      return style;
    };
    const disabledElement = document.querySelector("button:disabled")!;
    return {
      disabled: read(disabledElement),
      reference: {
        selected: probe("forced-color-adjust:none;color:HighlightText;background:Highlight;border:1px solid Highlight"),
        disabled: probe("forced-color-adjust:none;color:GrayText;background:Canvas;border:1px solid GrayText"),
      },
    };
  });
  const states = { selected: primary, unselected: secondary, ...disabledStates };
  await testInfo.attach("forced-color-computed-states", {
    body: JSON.stringify(states, null, 2),
    contentType: "application/json",
  });

  expect(states.selected, JSON.stringify(states)).toEqual(states.reference.selected);
  expect(states.disabled, JSON.stringify(states)).toEqual(states.reference.disabled);
  expect(contrastRatio(states.selected.color, states.selected.backgroundColor)).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio(states.selected.backgroundColor, states.unselected.backgroundColor)).toBeGreaterThanOrEqual(3);
  expect(contrastRatio(states.disabled.color, states.disabled.backgroundColor)).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio(states.disabled.borderTopColor, states.disabled.backgroundColor)).toBeGreaterThanOrEqual(3);
});
