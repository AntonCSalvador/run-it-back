import { describe, expect, it } from "vitest";
import { normalizedMobileClipHeight, screenshotDiffRatio } from "./e2e/support/screenshot-tolerance";

describe("visual snapshot tolerance", () => {
  it("caps Linux font-rendering variance while keeping local baselines strict", () => {
    expect(screenshotDiffRatio("linux")).toBe(0.025);
    expect(screenshotDiffRatio("linux")).toBeLessThanOrEqual(0.025);
    expect(screenshotDiffRatio("win32")).toBe(0.01);
    expect(screenshotDiffRatio("darwin")).toBe(0.01);
  });

  it("normalizes only the three-team offer clip without cropping taller content", () => {
    expect(normalizedMobileClipHeight("three-team-offer", 579)).toBe(580);
    expect(normalizedMobileClipHeight("three-team-offer", 580)).toBe(580);
    expect(normalizedMobileClipHeight("three-team-offer", 581)).toBe(581);
    expect(normalizedMobileClipHeight("player-picker", 579)).toBe(579);
  });
});
