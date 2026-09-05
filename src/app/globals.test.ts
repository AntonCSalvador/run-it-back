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

  it("scopes horizontal scrolling and snapping to the mobile media block", () => {
    const mobile = mediaFor(rules, "(max-width:44rem)");
    const track = ruleFor(mobile.cssRules, ".scroll-track").style;
    expect(track.getPropertyValue("grid-auto-flow")).toBe("column");
    expect(track.getPropertyValue("grid-auto-columns")).toBe("100%");
    expect(track.getPropertyValue("overflow-x")).toBe("auto");
    expect(track.getPropertyValue("scroll-behavior")).toBe("smooth");
    expect(track.getPropertyValue("scroll-snap-type")).toBe("x mandatory");
    expect(track.getPropertyValue("overscroll-behavior-inline")).toBe("contain");
    expect(ruleFor(mobile.cssRules, ".scroll-track > *").style.getPropertyValue("scroll-snap-align")).toBe("start");
    for (const selector of [".team-offer__cards", ".roster-bar", ".player-picker__cards"]) {
      expect(ruleFor(mobile.cssRules, selector).style.getPropertyValue("grid-template-columns")).toBe("none");
    }
  });

  it("attaches the keyboard focus ring to the focus-visible selector", () => {
    const focus = ruleFor(rules, ":focus-visible");
    expect(focus.selectorText).toBe(":focus-visible");
    expect(focus.style.getPropertyValue("outline")).toBe("3px solid var(--action)");
    expect(focus.style.getPropertyValue("outline-offset")).toBe("3px");
  });

  it("keeps static fire feedback and disables animation and smooth scrolling for reduced motion", () => {
    const reduced = mediaFor(rules, "(prefers-reduced-motion: reduce)");
    for (const selector of ["*", "*::before", "*::after"]) {
      const style = ruleFor(reduced.cssRules, selector).style;
      expect(style.getPropertyValue("scroll-behavior")).toBe("auto");
      expect(style.getPropertyPriority("scroll-behavior")).toBe("important");
      expect(style.getPropertyValue("transition-duration")).toBe("0.01ms");
      expect(style.getPropertyPriority("transition-duration")).toBe("important");
    }
    const fire = ruleFor(reduced.cssRules, ".fire-accent").style;
    expect(fire.getPropertyValue("outline")).toBe("3px solid var(--heat)");
    expect(fire.getPropertyValue("outline-offset")).toBe("3px");
    expect(fire.getPropertyValue("color")).toBe("var(--heat)");
    expect(fire.getPropertyValue("display")).not.toBe("none");
    expect(fire.getPropertyValue("opacity")).not.toBe("0");
    for (const selector of [".fire-accent::before", ".fire-accent::after"]) {
      const style = ruleFor(reduced.cssRules, selector).style;
      expect(style.getPropertyValue("animation")).toBe("none");
      expect(style.getPropertyPriority("animation")).toBe("important");
      expect(style.getPropertyValue("opacity")).toBe("1");
      expect(style.getPropertyValue("display")).not.toBe("none");
    }
  });
});
