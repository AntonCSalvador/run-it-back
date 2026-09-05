import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("workflow action versions", () => {
  it("uses the approved current action majors and CI prebuilt mode", () => {
    const ci = readFileSync(".github/workflows/ci.yml", "utf8");
    const pages = readFileSync(".github/workflows/pages.yml", "utf8");
    for (const action of ["actions/checkout@v7", "actions/setup-node@v7", "actions/cache@v5", "actions/upload-artifact@v7"]) expect(ci).toContain(action);
    for (const action of ["actions/checkout@v7", "actions/setup-node@v7", "actions/configure-pages@v6", "actions/upload-pages-artifact@v5", "actions/deploy-pages@v5"]) expect(pages).toContain(action);
    expect(ci).toContain('PLAYWRIGHT_TEST_BUILD: "1"');
    expect(ci).toContain("PLAYWRIGHT_PREBUILT=1 npm run test:e2e");
  });
});
