import { describe, expect, it } from "vitest";
import config, { webServerFor } from "./playwright.config";

describe("Playwright reporting", () => {
  it("writes a deterministic HTML report while retaining line output", () => {
    expect(config.reporter).toEqual([
      ["line"],
      ["html", { open: "never", outputFolder: "playwright-report" }],
    ]);
  });
});

describe("Playwright web server modes", () => {
  it("builds locally but serves the already-smoked export in prebuilt mode", () => {
    expect(webServerFor(false).command).toBe("npm run build && npx serve out -l 4173");
    expect(webServerFor(true).command).toBe("node -e \"require('node:fs').accessSync('out/index.html')\" && npx serve out -l 4173");
    expect(config.webServer).toMatchObject({ command: "npm run build && npx serve out -l 4173", env: expect.objectContaining({ PLAYWRIGHT_TEST_BUILD: "1" }) });
  });
});
