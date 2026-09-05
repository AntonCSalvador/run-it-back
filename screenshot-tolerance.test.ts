import { describe, expect, it } from "vitest";
import { screenshotDiffRatio } from "./e2e/support/screenshot-tolerance";

describe("visual snapshot tolerance", () => {
  it("caps Linux font-rendering variance while keeping local baselines strict", () => {
    expect(screenshotDiffRatio("linux")).toBe(0.025);
    expect(screenshotDiffRatio("linux")).toBeLessThanOrEqual(0.025);
    expect(screenshotDiffRatio("win32")).toBe(0.01);
    expect(screenshotDiffRatio("darwin")).toBe(0.01);
  });
});
