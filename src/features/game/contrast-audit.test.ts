import { describe, expect, it } from "vitest";
import { assertSolidBackgroundImages, contrastRatio } from "../../../e2e/support/audit";

describe("computed contrast audit color composition", () => {
  it("treats a transparent foreground as the painted background instead of black", () => {
    expect(contrastRatio("transparent", "rgb(255, 255, 255)")).toBe(1);
  });

  it("composites a 50%-alpha foreground before measuring contrast", () => {
    const ratio = contrastRatio("rgba(0, 0, 0, 0.5)", "rgb(255, 255, 255)");
    expect(ratio).toBeCloseTo(3.95, 1);
    expect(ratio).toBeLessThan(4.5);
  });

  it("composites a 50%-alpha background through its painted ancestor", () => {
    const ratio = contrastRatio("rgb(0, 0, 0)", "rgba(255, 255, 255, 0.5)", "rgb(0, 0, 0)");
    expect(ratio).toBeCloseTo(5.28, 1);
    expect(ratio).toBeLessThan(7);
  });

  it("reports a boundary matching its own fill as a 1:1 failure", () => {
    const ratio = contrastRatio("rgb(232, 75, 66)", "rgb(232, 75, 66)", "rgb(11, 13, 16)");
    expect(ratio).toBe(1);
    expect(ratio).toBeLessThan(3);
  });

  it("rejects gradients instead of treating them as a solid background", () => {
    expect(() => assertSolidBackgroundImages(["none", "linear-gradient(rgb(0, 0, 0), rgb(255, 255, 255))"])).toThrow(/non-solid background/i);
  });
});
