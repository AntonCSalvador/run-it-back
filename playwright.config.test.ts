import { describe, expect, it } from "vitest";
import config from "./playwright.config";

describe("Playwright reporting", () => {
  it("writes a deterministic HTML report while retaining line output", () => {
    expect(config.reporter).toEqual([
      ["line"],
      ["html", { open: "never", outputFolder: "playwright-report" }],
    ]);
  });
});
