import { readdirSync, readFileSync } from "node:fs";
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
    expect(candidate).toMatch(/test e2e\/free-play\.spec\.ts --grep "captures the complete Free Play journey\|captures champion recap" --update-snapshots=all[\s\S]*?test e2e\/free-play\.spec\.ts --grep "captures the complete Free Play journey\|captures champion recap"/);
    expect(candidate).toMatch(/e2e\/__screenshots__\/linux\/\*\*/);
    expect(candidate).toContain("test-results");
    expect(candidate).not.toContain("git commit");
  });

  it("documents the local editor while keeping it outside the static production app", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as { scripts?: Record<string, string> };
    expect(packageJson.scripts?.["edit:players"]).toBe("vite --config tools/player-editor/vite.config.ts");

    const nextConfig = readFileSync("next.config.ts", "utf8");
    expect(nextConfig).toMatch(/output:\s*["']export["']/);

    const appPaths = readdirSync("src/app", { recursive: true }).map(String);
    expect(appPaths.some(path => /player-editor/i.test(path))).toBe(false);

    const quickGuide = readFileSync("docs/vct-algorithm-quick-guide.md", "utf8");
    expect(quickGuide).toContain("npm run edit:players");
    expect(quickGuide).toContain("manual-player-data.json");
  });

  it("runs all functional E2E journeys until every redesigned Linux outcome baseline exists", () => {
    const ci = readFileSync(".github/workflows/ci.yml", "utf8");
    const [normalCi] = ci.split("  snapshot-candidate:");
    for (const path of [
      "e2e/__screenshots__/linux/desktop/results-eliminated.png",
      "e2e/__screenshots__/linux/desktop/results-champion.png",
      "e2e/__screenshots__/linux/pixel-7/results-eliminated.png",
      "e2e/__screenshots__/linux/pixel-7/results-champion.png",
    ]) expect(normalCi).toContain(path);
    expect(normalCi).toContain('VISUAL_TESTS="captures the complete Free Play journey|captures champion recap"');
    expect(normalCi).toContain('npm run test:e2e -- --grep-invert "$VISUAL_TESTS"');
    expect(normalCi).toContain("npm run test:e2e\n");
    expect(normalCi).not.toContain("--update-snapshots");
  });
});
