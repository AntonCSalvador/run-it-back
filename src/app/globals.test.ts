import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const stylesheet = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

function styleRules(rules: CSSRuleList): CSSStyleRule[] {
  return Array.from(rules).filter((rule): rule is CSSStyleRule => rule.type === CSSRule.STYLE_RULE);
}

function ruleFor(rules: CSSRuleList, selector: string): CSSStyleRule {
  const matches = styleRules(rules).filter(rule => rule.selectorText.split(",").map(value => value.trim()).includes(selector));
  expect(matches, `Expected one rule for ${selector} in this scope`).toHaveLength(1);
  return matches[0];
}

function mediaFor(rules: CSSRuleList, condition: string): CSSMediaRule {
  const matches = Array.from(rules).filter((rule): rule is CSSMediaRule =>
    rule.type === CSSRule.MEDIA_RULE && (rule as CSSMediaRule).conditionText.replaceAll(" ", "") === condition.replaceAll(" ", ""));
  expect(matches, `Expected one media block for ${condition}`).toHaveLength(1);
  return matches[0];
}

function keyframesFor(rules: CSSRuleList, name: string): CSSKeyframesRule {
  const matches = Array.from(rules).filter((rule): rule is CSSKeyframesRule => rule.type === CSSRule.KEYFRAMES_RULE && (rule as CSSKeyframesRule).name === name);
  expect(matches, `Expected one @keyframes ${name}`).toHaveLength(1);
  return matches[0];
}

function exactRuleFor(rules: CSSRuleList, selector: string): CSSStyleRule {
  const match = styleRules(rules).find(rule => rule.selectorText === selector);
  expect(match, `Expected an exact rule for ${selector} in this scope`).toBeDefined();
  return match!;
}

function contrastRatio(foreground: string, background: string): number {
  const luminance = (hex: string): number => {
    const channels = hex.slice(1).match(/.{2}/g)!.map(channel => Number.parseInt(channel, 16) / 255);
    const [red, green, blue] = channels.map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
    return (0.2126 * red) + (0.7152 * green) + (0.0722 * blue);
  };
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

describe("parsed broadcast stylesheet", () => {
  // CSSOM checks declaration ownership; Task 15 covers viewport layout and media evaluation in a browser.
  let element: HTMLStyleElement;
  let rules: CSSRuleList;

  beforeEach(() => {
    element = document.createElement("style");
    element.textContent = stylesheet;
    document.head.append(element);
    expect(element.sheet, "The complete application stylesheet must parse").not.toBeNull();
    rules = element.sheet!.cssRules;
    expect(rules.length).toBeGreaterThan(0);
  });

  afterEach(() => element.remove());

  it("defines the Broadcast Tactical palette, minimum controls, and accessibility media contracts", () => {
    const root = ruleFor(rules, ":root").style;
    expect(Object.fromEntries([
      "--rib-canvas",
      "--rib-canvas-raised",
      "--rib-surface-1",
      "--rib-surface-2",
      "--rib-line-subtle",
      "--rib-line-strong",
      "--rib-text-primary",
      "--rib-text-secondary",
      "--rib-text-dim",
      "--rib-red",
      "--rib-red-deep",
      "--rib-gold",
      "--rib-danger",
    ].map(token => [token, root.getPropertyValue(token)]))).toEqual({
      "--rib-canvas": "#0B0D10",
      "--rib-canvas-raised": "#101317",
      "--rib-surface-1": "#171B20",
      "--rib-surface-2": "#1D2228",
      "--rib-line-subtle": "#30363D",
      "--rib-line-strong": "#626A74",
      "--rib-text-primary": "#F2EDE3",
      "--rib-text-secondary": "#B9B4AA",
      "--rib-text-dim": "#8D8982",
      "--rib-red": "#E84B42",
      "--rib-red-deep": "#9F302B",
      "--rib-gold": "#D8A84E",
      "--rib-danger": "#FF756D",
    });

    const buttonRule = styleRules(rules).find(rule => rule.selectorText === "button");
    expect(buttonRule).toBeDefined();
    const button = buttonRule!.style;
    expect(button.getPropertyValue("min-height")).toBe("44px");
    expect(button.getPropertyValue("min-inline-size")).toBe("44px");
    expect(mediaFor(rules, "(prefers-reduced-motion: reduce)")).toBeDefined();
    expect(mediaFor(rules, "(forced-colors: active)")).toBeDefined();
  });

  it("defines and consumes the documented spacing, radius, type, and timing families", () => {
    const root = ruleFor(rules, ":root").style;
    expect(Object.fromEntries([
      "--rib-space-1", "--rib-space-2", "--rib-space-3", "--rib-space-4",
      "--rib-space-6", "--rib-space-8", "--rib-space-12", "--rib-space-16",
      "--rib-radius-sm", "--rib-radius-md", "--rib-radius-lg",
      "--rib-type-caption-size", "--rib-type-caption-leading",
      "--rib-type-meta-size", "--rib-type-meta-leading",
      "--rib-type-body-size", "--rib-type-body-leading",
      "--rib-type-section-size", "--rib-type-section-leading",
      "--rib-type-screen-size", "--rib-type-screen-leading",
      "--rib-type-outcome-size", "--rib-type-outcome-leading",
      "--rib-motion-response", "--rib-motion-lock", "--rib-ease-out",
    ].map(token => [token, root.getPropertyValue(token)]))).toEqual({
      "--rib-space-1": "4px", "--rib-space-2": "8px", "--rib-space-3": "12px", "--rib-space-4": "16px",
      "--rib-space-6": "24px", "--rib-space-8": "32px", "--rib-space-12": "48px", "--rib-space-16": "64px",
      "--rib-radius-sm": "2px", "--rib-radius-md": "4px", "--rib-radius-lg": "6px",
      "--rib-type-caption-size": "12px", "--rib-type-caption-leading": "18px",
      "--rib-type-meta-size": "13px", "--rib-type-meta-leading": "16px",
      "--rib-type-body-size": "16px", "--rib-type-body-leading": "24px",
      "--rib-type-section-size": "clamp(20px,2vw,24px)", "--rib-type-section-leading": "clamp(24px,2vw,28px)",
      "--rib-type-screen-size": "clamp(28px,3vw,40px)", "--rib-type-screen-leading": "clamp(30px,3vw,40px)",
      "--rib-type-outcome-size": "clamp(36px,4vw,56px)", "--rib-type-outcome-leading": "clamp(36px,4vw,52px)",
      "--rib-motion-response": "160ms", "--rib-motion-lock": "200ms", "--rib-ease-out": "cubic-bezier(0.16,1,0.3,1)",
    });

    const body = exactRuleFor(rules, "body").style;
    expect(body.getPropertyValue("font-size")).toBe("var(--rib-type-body-size)");
    expect(body.getPropertyValue("line-height")).toBe("var(--rib-type-body-leading)");
    const button = exactRuleFor(rules, "button").style;
    expect(button.getPropertyValue("border-radius")).toBe("var(--rib-radius-md)");
    expect(button.getPropertyValue("padding")).toBe("var(--rib-space-2) var(--rib-space-3)");
    expect(button.getPropertyValue("transition")).toContain("var(--rib-motion-response)");
    expect(exactRuleFor(rules, "main").style.getPropertyValue("padding")).toBe("var(--rib-space-6)");
    expect(exactRuleFor(rules, "h2").style.getPropertyValue("font-size")).toBe("var(--rib-type-screen-size)");
    expect(exactRuleFor(rules, "h3").style.getPropertyValue("font-size")).toBe("var(--rib-type-section-size)");
  });

  it("keeps text, state, focus, and action pairings at WCAG contrast", () => {
    const root = ruleFor(rules, ":root").style;
    const color = (token: string): string => root.getPropertyValue(token);
    const textTokens = ["--rib-text-primary", "--rib-text-secondary", "--rib-text-dim", "--rib-danger"] as const;
    const surfaceTokens = ["--rib-canvas", "--rib-surface-1", "--rib-surface-2"] as const;
    for (const [foreground, background] of textTokens.flatMap(textToken => surfaceTokens.map(surfaceToken => [textToken, surfaceToken] as const))) {
      expect(contrastRatio(color(foreground), color(background)), `${foreground} on ${background}`).toBeGreaterThanOrEqual(4.5);
    }

    const nonTextPairs = [
      ["--rib-red", "--rib-surface-2", "red selection"],
      ["--rib-line-strong", "--rib-canvas", "strong boundary"],
      ["--rib-text-primary", "--rib-canvas", "focus"],
      ["--rib-gold", "--rib-surface-1", "gold outcome"],
    ] as const;
    for (const [foreground, background, purpose] of nonTextPairs) {
      expect(contrastRatio(color(foreground), color(background)), purpose).toBeGreaterThanOrEqual(3);
    }
    expect(contrastRatio(color("--rib-canvas"), color("--rib-red")), "near-black action text on red").toBeGreaterThanOrEqual(4.5);

    const action = ruleFor(rules, ".action-button").style;
    expect(action.getPropertyValue("background")).toBe("var(--rib-red)");
    expect(action.getPropertyValue("color")).toBe("var(--rib-canvas)");
  });

  it("keeps disabled controls explicit and contrast-safe without whole-control opacity", () => {
    const root = ruleFor(rules, ":root").style;
    const disabled = ruleFor(rules, "button:disabled").style;
    const resolvedColor = (property: "background" | "border-color" | "color"): string => {
      const token = disabled.getPropertyValue(property).match(/var\((--[^)]+)\)/)?.[1];
      expect(token, `Expected ${property} to use an explicit design token`).toBeDefined();
      return root.getPropertyValue(token!);
    };

    expect(disabled.getPropertyValue("opacity")).toBe("");
    expect(disabled.getPropertyValue("background")).toBe("var(--rib-surface-1)");
    expect(disabled.getPropertyValue("color")).toBe("var(--rib-text-dim)");
    expect(disabled.getPropertyValue("border-color")).toBe("var(--rib-line-strong)");
    expect(disabled.getPropertyValue("border-style")).toBe("dashed");
    expect(disabled.getPropertyValue("cursor")).toBe("not-allowed");
    expect(contrastRatio(resolvedColor("color"), resolvedColor("background"))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(resolvedColor("border-color"), resolvedColor("background"))).toBeGreaterThanOrEqual(3);
  });

  it("keeps routine fallback and roster labels neutral instead of spending gold", () => {
    expect(ruleFor(rules, ".media-mark__fallback").style.getPropertyValue("color")).toBe("var(--rib-text-secondary)");
    expect(ruleFor(rules, ".roster-bar strong").style.getPropertyValue("color")).toBe("var(--rib-text-primary)");
  });

  it("keeps desktop player cards in a bounded grid without mobile-width columns", () => {
    const track = ruleFor(rules, ".scroll-track").style;
    const picker = ruleFor(rules, ".player-picker__cards").style;
    expect(track.getPropertyValue("display")).toBe("grid");
    expect(track.getPropertyValue("grid-auto-flow")).toBe("row");
    expect(track.getPropertyValue("overflow")).toBe("visible");
    expect(picker.getPropertyValue("grid-template-columns")).toBe("repeat(auto-fit,minmax(12rem,1fr))");
    for (const rule of styleRules(rules)) {
      expect(rule.style.getPropertyValue("grid-auto-columns"), rule.selectorText).not.toContain("82vw");
    }
  });

  it("styles player cards through their production class instead of a test hook", () => {
    const card = ruleFor(rules, ".player-card").style;
    expect(card.getPropertyValue("border")).toBe("1px solid var(--rib-line-strong)");
    expect(card.getPropertyValue("background")).toBe("var(--rib-surface-1)");
    const button = ruleFor(rules, ".player-card button").style;
    expect(button.getPropertyValue("width")).toBe("100%");
    expect(button.getPropertyValue("display")).toBe("flex");
    expect(stylesheet).not.toMatch(/\[data-testid[^\]]*player-card/);
  });

  it("lets long repository handles wrap without widening player decisions", () => {
    const identity = ruleFor(rules, ".player-card__identity").style;
    expect(identity.getPropertyValue("min-width")).toBe("0px");
    const handle = ruleFor(rules, ".player-card__handle").style;
    expect(handle.getPropertyValue("overflow-wrap")).toBe("anywhere");
    expect(handle.getPropertyValue("word-break")).toBe("break-word");
  });

  it("anchors roster context beside desktop draft decisions and stacks it on mobile", () => {
    const layout = ruleFor(rules, ".draft-layout").style;
    expect(layout.getPropertyValue("display")).toBe("grid");
    expect(layout.getPropertyValue("grid-template-columns")).toBe("minmax(0,1fr) minmax(16rem,20rem)");
    const roster = ruleFor(rules, ".draft-layout > .roster-bar").style;
    expect(roster.getPropertyValue("position")).toBe("sticky");
    expect(roster.getPropertyValue("align-self")).toBe("start");
    const mobile = mediaFor(rules, "(max-width:44rem)");
    expect(ruleFor(mobile.cssRules, ".draft-layout").style.getPropertyValue("grid-template-columns")).toBe("minmax(0,1fr)");
    expect(ruleFor(mobile.cssRules, ".draft-layout > .roster-bar").style.getPropertyValue("position")).toBe("static");
  });

  it("keeps draft actions and roster states visibly distinct without hover disclosure", () => {
    expect(ruleFor(rules, ".team-card__cue").style.getPropertyValue("color")).toBe("var(--rib-red)");
    expect(ruleFor(rules, '.roster-bar__slots > li[data-state="open"]').style.getPropertyValue("border-style")).toBe("dashed");
    expect(ruleFor(rules, '.roster-bar__slots > li[data-state="filled"]').style.getPropertyValue("border-color")).toBe("var(--rib-red)");
    const choice = ruleFor(rules, ".player-card__choice").style;
    expect(choice.getPropertyValue("border")).toBe("0px");
    expect(choice.getPropertyValue("background")).toBe("transparent");
    expect(stylesheet).not.toMatch(/\.team-card:hover[^}]+(?:display|visibility|opacity)\s*:/);
  });

  it("styles role decisions, roster swaps, and IGL radios as persistent touch-safe controls", () => {
    const roleOptions = ruleFor(rules, ".role-picker__options").style;
    expect(roleOptions.getPropertyValue("display")).toBe("grid");
    expect(roleOptions.getPropertyValue("list-style")).toBe("none");
    expect(ruleFor(rules, '.role-picker__options > li[data-state="unavailable"] p').style.getPropertyValue("display")).not.toBe("none");
    expect(ruleFor(rules, ".roster-bar__swaps").style.getPropertyValue("display")).toBe("grid");
    expect(ruleFor(rules, ".roster-bar__igl").style.getPropertyValue("color")).toBe("var(--rib-text-primary)");
    const iglChoice = ruleFor(rules, ".igl-picker__choice").style;
    expect(iglChoice.getPropertyValue("display")).toBe("grid");
    expect(iglChoice.getPropertyValue("min-height")).toBe("44px");
    expect(ruleFor(rules, '.igl-picker__choice[data-selected="true"]').style.getPropertyValue("border-color")).toBe("var(--rib-red)");
    expect(ruleFor(rules, ".sr-only").style.getPropertyValue("position")).toBe("absolute");
    expect(stylesheet).not.toMatch(/(?:role-picker|igl-picker|roster-bar)[^}]*:hover[^}]+(?:display|visibility|opacity)\s*:/);
  });

  it("composes the tournament as a responsive broadcast rundown with touch-safe playback", () => {
    const rail = ruleFor(rules, ".tournament-stage-rail ol").style;
    expect(rail.getPropertyValue("display")).toBe("grid");
    expect(rail.getPropertyValue("grid-template-columns")).toBe("repeat(4,minmax(0,1fr))");
    expect(ruleFor(rules, '.tournament-stage-rail li[data-state="current"]').style.getPropertyValue("border-color")).toBe("var(--rib-red)");
    expect(ruleFor(rules, '.tournament-stage-rail li[data-state="future"]').style.getPropertyValue("color")).toBe("var(--rib-text-dim)");
    expect(ruleFor(rules, '.tournament-stage-rail li[data-state="locked"]').style.getPropertyValue("color")).toBe("var(--rib-text-dim)");
    expect(ruleFor(rules, ".tournament-view__rosters").style.getPropertyValue("grid-template-columns")).toBe("repeat(2,minmax(0,1fr))");
    expect(ruleFor(rules, ".highlight-feed__controls").style.getPropertyValue("gap")).toBe("var(--rib-space-2)");
    const heatTag = ruleFor(rules, ".highlight-feed__tag").style;
    expect(heatTag.getPropertyValue("display")).toBe("inline-block");
    expect(heatTag.getPropertyValue("color")).toBe("var(--rib-gold)");

    const mobile = mediaFor(rules, "(max-width:44rem)");
    expect(ruleFor(mobile.cssRules, ".tournament-view__rosters").style.getPropertyValue("grid-template-columns")).toBe("minmax(0,1fr)");
    expect(ruleFor(mobile.cssRules, ".highlight-feed__controls > button").style.getPropertyValue("flex")).toBe("1 1 9rem");
  });

  it("composes the recap as an outcome-first broadcast sheet with achievement-only gold", () => {
    expect(ruleFor(rules, ".results-view").style.getPropertyValue("display")).toBe("grid");
    const outcome = ruleFor(rules, ".results-view__outcome").style;
    expect(outcome.getPropertyValue("border-block-end")).toBe("1px solid var(--rib-line-strong)");
    expect(ruleFor(rules, ".results-view__outcome h2").style.getPropertyValue("font-size")).toBe("var(--rib-type-outcome-size)");
    expect(ruleFor(rules, ".results-view--champion .results-view__outcome h2").style.getPropertyValue("color")).toBe("var(--rib-gold)");
    expect(ruleFor(rules, ".results-view--eliminated .results-view__outcome h2").style.getPropertyValue("color")).toBe("var(--rib-text-primary)");
    expect(exactRuleFor(rules, ".results-view__path ol").style.getPropertyValue("grid-template-columns")).toBe("repeat(4,minmax(0,1fr))");
    expect(ruleFor(rules, '.results-view__path li[data-result="lost"]').style.getPropertyValue("border-color")).toBe("var(--rib-red)");
    expect(exactRuleFor(rules, ".results-view__lineup ol").style.getPropertyValue("grid-template-columns")).toBe("repeat(5,minmax(0,1fr))");
    expect(ruleFor(rules, ".results-view__moments li[data-heat=\"true\"]").style.getPropertyValue("border-color")).toBe("var(--rib-gold)");
    expect(ruleFor(rules, ".results-view__maps summary").style.getPropertyValue("min-height")).toBe("44px");
    expect(ruleFor(rules, ".results-view__secondary-actions").style.getPropertyValue("display")).toBe("flex");

    const mobile = mediaFor(rules, "(max-width:44rem)");
    expect(ruleFor(mobile.cssRules, ".results-view__path ol").style.getPropertyValue("grid-template-columns")).toBe("repeat(2,minmax(0,1fr))");
    expect(ruleFor(mobile.cssRules, ".results-view__lineup ol").style.getPropertyValue("grid-template-columns")).toBe("minmax(0,1fr)");
    expect(ruleFor(mobile.cssRules, ".results-view__secondary-actions > *").style.getPropertyValue("width")).toBe("100%");
  });

  it("keeps page scrolling immediate while mobile decision tracks reveal the next option", () => {
    expect(exactRuleFor(rules, "html").style.getPropertyValue("scroll-behavior")).toBe("");
    const mobile = mediaFor(rules, "(max-width:44rem)");
    const track = ruleFor(mobile.cssRules, ".scroll-track").style;
    expect(track.getPropertyValue("grid-auto-flow")).toBe("column");
    expect(track.getPropertyValue("grid-auto-columns")).toBe("");
    expect(track.getPropertyValue("overflow-x")).toBe("auto");
    expect(track.getPropertyValue("scroll-behavior")).toBe("smooth");
    expect(track.getPropertyValue("scroll-snap-type")).toBe("x mandatory");
    expect(track.getPropertyValue("overscroll-behavior-inline")).toBe("contain");
    expect(ruleFor(mobile.cssRules, ".scroll-track > *").style.getPropertyValue("scroll-snap-align")).toBe("start");
    for (const selector of [".team-offer__cards", ".player-picker__cards"]) {
      expect(ruleFor(mobile.cssRules, selector).style.getPropertyValue("grid-template-columns")).toBe("none");
      expect(ruleFor(mobile.cssRules, selector).style.getPropertyValue("grid-auto-columns")).toBe("88%");
    }
    const roster = ruleFor(mobile.cssRules, ".roster-bar__slots").style;
    expect(roster.getPropertyValue("grid-template-columns")).toBe("repeat(2,minmax(0,1fr))");
    expect(roster.getPropertyValue("overflow-x")).toBe("visible");
    const reduced = mediaFor(rules, "(prefers-reduced-motion: reduce)");
    expect(ruleFor(reduced.cssRules, "*").style.getPropertyValue("scroll-behavior")).toBe("auto");
    expect(ruleFor(reduced.cssRules, "*").style.getPropertyPriority("scroll-behavior")).toBe("important");
  });

  it("attaches the keyboard focus ring to the focus-visible selector", () => {
    const focus = ruleFor(rules, ":focus-visible");
    expect(focus.selectorText).toBe(":focus-visible");
    expect(focus.style.getPropertyValue("outline")).toBe("3px solid var(--rib-text-primary)");
    expect(focus.style.getPropertyValue("outline-offset")).toBe("3px");
    expect(focus.style.getPropertyValue("box-shadow")).toBe("0 0 0 3px var(--rib-red)");
    const mainFocus = exactRuleFor(rules, "main:focus-visible").style;
    expect(mainFocus.getPropertyValue("outline-offset")).toBe("-6px");
    expect(mainFocus.getPropertyValue("box-shadow")).toBe("inset 0 0 0 3px var(--rib-red)");
  });

  it("applies local typography, shell geometry, and designed browser surfaces", () => {
    const body = exactRuleFor(rules, "body").style;
    expect(body.getPropertyValue("font-family")).toContain("var(--font-rib-ui)");
    for (const selector of ["h1", "h2", "h3"]) {
      const typeRule = styleRules(rules).find(rule => rule.selectorText.split(",").map(value => value.trim()).includes(selector) && rule.style.getPropertyValue("font-family"));
      expect(typeRule?.style.getPropertyValue("font-family")).toContain("var(--font-rib-display)");
    }
    expect(stylesheet).toMatch(/main\s*\{[^}]*width:\s*min\(100%,76rem\)/);
    expect(ruleFor(rules, "::selection").style.getPropertyValue("background")).toBe("var(--rib-red)");
    expect(ruleFor(rules, "::selection").style.getPropertyValue("color")).toBe("var(--rib-canvas)");
    const caretRule = styleRules(rules).find(rule => rule.selectorText.split(",").map(value => value.trim()).includes("input") && rule.style.getPropertyValue("caret-color"));
    expect(caretRule?.style.getPropertyValue("caret-color")).toBe("var(--rib-red)");
    const universal = exactRuleFor(rules, "*").style;
    expect(universal.getPropertyValue("scrollbar-color")).toBe("var(--rib-line-strong) var(--rib-canvas-raised)");
    expect(universal.getPropertyValue("scrollbar-width")).toBe("thin");
    expect(ruleFor(rules, ".skip-link:focus-visible").style.getPropertyValue("position")).toBe("fixed");
    expect(stylesheet).not.toMatch(/(?:linear|radial)-gradient|backdrop-filter|text-shadow|box-shadow\s*:\s*0\s+0\s+(?!0(?:px)?(?:\s|;))/i);
  });

  it("limits routine lock feedback to the 200ms red rule treatment", () => {
    for (const selector of [".fire-accent::before", ".fire-accent::after"]) {
      const animationRule = styleRules(rules).find(rule => rule.selectorText.split(",").map(value => value.trim()).includes(selector) && rule.style.getPropertyValue("animation"));
      expect(animationRule).toBeDefined();
      const style = animationRule!.style;
      expect(style.getPropertyValue("animation")).toContain("var(--rib-motion-lock)");
      expect(style.getPropertyValue("animation")).toContain("var(--rib-ease-out)");
      expect(style.getPropertyValue("transform-origin")).toBe("left center");
      expect(style.cssText).not.toContain("650ms");
      expect(style.cssText).not.toContain("var(--rib-gold)");
    }
    expect(exactRuleFor(rules, ".fire-accent::after").style.getPropertyValue("background")).toBe("var(--rib-red)");
    for (const name of ["ignite-a", "ignite-b"]) {
      const start = Array.from(keyframesFor(rules, name).cssRules).find(rule => (rule as CSSKeyframeRule).keyText === "0%") as CSSKeyframeRule;
      expect(start.style.getPropertyValue("transform")).toBe("scaleX(0.15)");
    }
  });

  it("keeps static fire feedback and disables animation and smooth scrolling for reduced motion", () => {
    const reduced = mediaFor(rules, "(prefers-reduced-motion: reduce)");
    for (const selector of ["*", "*::before", "*::after"]) {
      const style = ruleFor(reduced.cssRules, selector).style;
      expect(style.getPropertyValue("scroll-behavior")).toBe("auto");
      expect(style.getPropertyPriority("scroll-behavior")).toBe("important");
      expect(style.getPropertyValue("animation")).toBe("none");
      expect(style.getPropertyPriority("animation")).toBe("important");
      expect(style.getPropertyValue("transition")).toBe("none");
      expect(style.getPropertyPriority("transition")).toBe("important");
      expect(style.getPropertyValue("transform")).toBe("");
    }
    const activeButton = ruleFor(reduced.cssRules, "button:active:not(:disabled)").style;
    expect(activeButton.getPropertyValue("transform")).toBe("none");
    expect(activeButton.getPropertyPriority("transform")).toBe("important");
    const fire = ruleFor(reduced.cssRules, ".fire-accent").style;
    expect(fire.getPropertyValue("outline")).toBe("3px solid var(--rib-red)");
    expect(fire.getPropertyValue("outline-offset")).toBe("3px");
    expect(fire.getPropertyValue("color")).toBe("");
    expect(fire.getPropertyValue("display")).not.toBe("none");
    expect(fire.getPropertyValue("opacity")).not.toBe("0");
    for (const selector of [".fire-accent::before", ".fire-accent::after"]) {
      const style = ruleFor(reduced.cssRules, selector).style;
      expect(style.getPropertyValue("animation")).toBe("none");
      expect(style.getPropertyPriority("animation")).toBe("important");
      expect(style.getPropertyValue("transform")).toBe("none");
      expect(style.getPropertyPriority("transform")).toBe("important");
      expect(style.getPropertyValue("opacity")).toBe("1");
      expect(style.getPropertyValue("display")).not.toBe("none");
    }
  });

  it("preserves focus, action, disabled, and state boundaries in forced colors", () => {
    const forced = mediaFor(rules, "(forced-colors: active)");
    const focus = ruleFor(forced.cssRules, ":focus-visible").style;
    expect(focus.getPropertyValue("outline")).toBe("3px solid Highlight");
    expect(focus.getPropertyValue("outline-offset")).toBe("3px");
    expect(focus.getPropertyValue("box-shadow")).toBe("none");
    const mainFocus = exactRuleFor(forced.cssRules, "main:focus-visible").style;
    expect(mainFocus.getPropertyValue("outline")).toBe("3px solid Highlight");
    expect(mainFocus.getPropertyValue("outline-offset")).toBe("-6px");
    expect(mainFocus.getPropertyValue("box-shadow")).toBe("none");
    const action = ruleFor(forced.cssRules, ".action-button").style;
    expect(action.getPropertyValue("forced-color-adjust")).toBe("none");
    expect(action.getPropertyValue("border-color")).toBe("highlight");
    expect(action.getPropertyValue("background")).toBe("highlight");
    expect(action.getPropertyValue("color")).toBe("highlighttext");
    expect(action.getPropertyValue("transition")).toBe("none");
    const selected = ruleFor(forced.cssRules, 'button[aria-pressed="true"]').style;
    expect(selected.getPropertyValue("forced-color-adjust")).toBe("none");
    expect(selected.getPropertyValue("border-color")).toBe("highlight");
    expect(selected.getPropertyValue("background")).toBe("highlight");
    expect(selected.getPropertyValue("color")).toBe("highlighttext");
    expect(selected.getPropertyValue("transition")).toBe("none");
    const disabled = ruleFor(forced.cssRules, "button:disabled").style;
    expect(disabled.getPropertyValue("opacity")).toBe("");
    expect(disabled.getPropertyValue("border-color")).toBe("graytext");
    expect(disabled.getPropertyValue("background")).toBe("canvas");
    expect(disabled.getPropertyValue("color")).toBe("graytext");
    expect(disabled.getPropertyValue("forced-color-adjust")).toBe("none");
    expect(disabled.getPropertyValue("transition")).toBe("none");
    expect(styleRules(forced.cssRules).some(rule => rule.selectorText.split(",").map(selector => selector.trim()).includes(".action-button:disabled"))).toBe(false);
    const disabledRule = disabled.parentRule!;
    expect(Array.from(forced.cssRules).indexOf(disabledRule)).toBeGreaterThan(Array.from(forced.cssRules).indexOf(action.parentRule!));
    expect(Array.from(forced.cssRules).indexOf(disabledRule)).toBeGreaterThan(Array.from(forced.cssRules).indexOf(ruleFor(forced.cssRules, ".fire-accent").parentRule!));
  });
});
