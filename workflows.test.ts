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

  it("keeps CI cache shell-free and report upload nonfatal before E2E starts", () => {
    const ci = readFileSync(".github/workflows/ci.yml", "utf8");
    expect(ci).not.toContain("playwright-version");
    expect(ci).toContain("key: ${{ runner.os }}-playwright-${{ hashFiles('package-lock.json') }}");
    expect(ci).toMatch(/if: failure\(\)[\s\S]*?if-no-files-found: ignore/);
  });

  it("pins CI and makes Linux snapshot candidates manual-only", () => {
    const ci = readFileSync(".github/workflows/ci.yml", "utf8");
    expect(ci).toContain("runs-on: ubuntu-24.04");
    expect(ci).toMatch(/workflow_dispatch:[\s\S]*?snapshot_candidate:[\s\S]*?type: boolean/);
    const [normalCi, candidate] = ci.split("  snapshot-candidate:");
    expect(normalCi).toMatch(/test:\s*\n\s*if: github\.event_name != 'workflow_dispatch' \|\| inputs\.snapshot_candidate != true/);
    expect(normalCi).not.toContain("--update-snapshots");
    expect(candidate).toMatch(/github\.event_name == 'workflow_dispatch'[\s\S]*?inputs\.snapshot_candidate == true/);
    expect(candidate).toMatch(/test e2e\/free-play\.spec\.ts --grep "captures the complete Free Play journey" --update-snapshots[\s\S]*?test e2e\/free-play\.spec\.ts --grep "captures the complete Free Play journey"/);
    expect(candidate).toMatch(/e2e\/__screenshots__\/linux\/\*\*/);
    expect(candidate).not.toContain("git commit");
  });
});
